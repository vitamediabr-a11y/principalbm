import { chromium } from "playwright";
import pg from "pg";
import fs from "node:fs";

const { Pool } = pg;
const base = "http://127.0.0.1:3000";
const widths = [320, 375, 390, 430, 1280];
const customerId = process.env.OPPORTUNITY_CUSTOMER_ID;
const ownerMembershipId = process.env.OPPORTUNITY_OWNER_MEMBERSHIP_ID;
const customerName = "Mariana de Almeida Vasconcelos — Cliente de oportunidade com nome propositalmente muito longo";
const longChildName = "Laura Beatriz com nome infantil comprido para testar quebra de linha";
const secondChildName = "Pedro";

if (!customerId || !ownerMembershipId) {
  throw new Error("Opportunity browser fixture identifiers are required.");
}

const report = {
  generatedAt: new Date().toISOString(),
  widths,
  authentication: { attempted: false, success: false, signIns: 0 },
  precondition: {},
  readPurity: {},
  refresh: {},
  generatedSources: {},
  visualMatrix: { widths: [], before: null, after: null, unchanged: false },
  pages: [],
  filters: [],
  mutations: {},
  marketing: {},
  failures: [],
  pageErrors: []
};

function fail(kind, details = {}) {
  report.failures.push({ kind, ...details });
}

function sameState(left, right) {
  return left.journeyEvents === right.journeyEvents &&
    left.opportunities === right.opportunities &&
    left.opportunityAudits === right.opportunityAudits;
}

async function readDbState(pool) {
  const result = await pool.query(
    `SELECT
      (SELECT count(*)::int FROM principal.journey_events WHERE "customerId" = $1) AS "journeyEvents",
      (SELECT count(*)::int FROM principal.opportunities WHERE "customerId" = $1) AS "opportunities",
      (SELECT count(*)::int FROM principal.audit_logs WHERE "customerId" = $1 AND action LIKE 'opportunity.%') AS "opportunityAudits"`,
    [customerId],
  );
  return result.rows[0];
}

async function readDiagnosticRows(pool) {
  const result = await pool.query(
    `SELECT
      je.id AS "journeyEventId",
      je.type::text AS type,
      je.status::text AS "journeyEventStatus",
      je."pregnancyId",
      je."childId",
      o.id AS "opportunityId",
      o.status::text AS "opportunityStatus"
    FROM principal.journey_events je
    LEFT JOIN principal.opportunities o ON o."journeyEventId" = je.id
    WHERE je."customerId" = $1
    ORDER BY je."effectiveAt", je.type::text`,
    [customerId],
  );
  return result.rows;
}

async function readGeneratedSources(pool) {
  const result = await pool.query(
    `SELECT
      o.id AS "opportunityId",
      o.status::text AS "opportunityStatus",
      je.type::text AS type,
      je.status::text AS "journeyEventStatus",
      je."pregnancyId",
      je."childId",
      c.name AS "childName"
    FROM principal.opportunities o
    JOIN principal.journey_events je ON je.id = o."journeyEventId"
    LEFT JOIN principal.children c ON c.id = je."childId"
    WHERE o."customerId" = $1
    ORDER BY je."effectiveAt", je.type::text`,
    [customerId],
  );
  return result.rows;
}

async function waitForDb(pool, predicate, timeoutMs = 15000) {
  const started = Date.now();
  let state = await readDbState(pool);
  while (!predicate(state)) {
    if (Date.now() - started >= timeoutMs) return state;
    await new Promise((resolve) => setTimeout(resolve, 200));
    state = await readDbState(pool);
  }
  return state;
}

async function readOpportunity(pool, opportunityId) {
  const result = await pool.query(
    `SELECT id, status::text AS status, "snoozedUntil"
     FROM principal.opportunities
     WHERE id = $1 AND "customerId" = $2`,
    [opportunityId, customerId],
  );
  return result.rows[0] ?? null;
}

async function waitForOpportunity(pool, opportunityId, predicate, timeoutMs = 15000) {
  const started = Date.now();
  let row = await readOpportunity(pool, opportunityId);
  while (!predicate(row)) {
    if (Date.now() - started >= timeoutMs) return row;
    await new Promise((resolve) => setTimeout(resolve, 200));
    row = await readOpportunity(pool, opportunityId);
  }
  return row;
}

async function auditExists(pool, action, opportunityId) {
  const result = await pool.query(
    `SELECT count(*)::int AS count
     FROM principal.audit_logs
     WHERE "customerId" = $1 AND action = $2 AND "entityType" = 'Opportunity' AND "entityId" = $3`,
    [customerId, action, opportunityId],
  );
  return result.rows[0].count > 0;
}

async function authenticateOwnerOnce(browser) {
  report.authentication.attempted = true;
  report.authentication.signIns += 1;
  const context = await browser.newContext({ viewport: { width: 320, height: 844 }, isMobile: true, hasTouch: true });
  const page = await context.newPage();
  await page.goto(base + "/login", { waitUntil: "networkidle" });
  await page.getByLabel("E-mail").fill(process.env.BOOTSTRAP_OWNER_EMAIL);
  await page.getByLabel("Senha").fill(process.env.BOOTSTRAP_OWNER_PASSWORD);
  await page.getByRole("button", { name: "Entrar" }).click();
  try {
    await page.waitForURL("**/clientes", { timeout: 15000 });
    report.authentication.success = true;
  } catch {
    fail("authentication_failure", { phase: "owner_bootstrap", url: page.url() });
  }
  const storageState = report.authentication.success ? await context.storageState() : null;
  await context.close();
  return storageState;
}

function contextOptions(width, storageState) {
  return {
    viewport: { width, height: width === 1280 ? 800 : 844 },
    isMobile: width < 600,
    hasTouch: width < 600,
    storageState
  };
}

async function inspect(page, width, label, requiredTexts = []) {
  const result = await page.evaluate(() => {
    const root = document.documentElement;
    const visible = (el) => {
      const r = el.getBoundingClientRect();
      const s = getComputedStyle(el);
      return r.width > 0 && r.height > 0 && s.display !== "none" && s.visibility !== "hidden";
    };
    const interactive = [...document.querySelectorAll('button,a[href],input,select,textarea,summary,[role="button"]')]
      .filter(visible)
      .map((el) => {
        const r = el.getBoundingClientRect();
        return {
          tag: el.tagName,
          name: (el.getAttribute("aria-label") || el.textContent || el.getAttribute("placeholder") || "").trim().replace(/\s+/g, " ").slice(0, 120),
          width: Math.round(r.width),
          height: Math.round(r.height),
          primary: el.getAttribute("data-qa-hit-target") === "primary"
        };
      });
    const enforced = interactive.filter((x) => ["BUTTON", "INPUT", "SELECT", "TEXTAREA", "SUMMARY"].includes(x.tag) || x.primary);
    const nav = document.querySelector("[data-qa-mobile-nav]");
    const navRect = nav && visible(nav) ? nav.getBoundingClientRect() : null;
    const navStyle = nav && visible(nav) ? getComputedStyle(nav) : null;
    const english = [...new Set((document.body.innerText.match(/\b(Save|Cancel|Edit|Search|Customer|Customers|Children|Pregnancy|Birth|Loading|Submit|Delete|Clear|Next|Previous|No results|Opportunity|Opportunities)\b/g) || []))];
    return {
      overflowX: root.scrollWidth > innerWidth + 1,
      scrollWidth: root.scrollWidth,
      english,
      small: enforced.filter((x) => x.width < 44 || x.height < 44),
      nav: navRect ? { present: true, position: navStyle.position, top: navRect.top, height: navRect.height } : { present: false }
    };
  });

  const semanticText = await page.locator("body").textContent() ?? "";
  if (result.overflowX) fail("horizontal_overflow", { width, label, scrollWidth: result.scrollWidth });
  if (result.english.length) fail("english_leakage", { width, label, tokens: result.english });
  for (const text of requiredTexts) {
    if (!semanticText.includes(text)) fail("required_text_missing", { width, label, text });
  }
  if (width < 600) {
    if (!result.nav.present || result.nav.position !== "fixed") fail("mobile_navigation_missing", { width, label, nav: result.nav });
    if (result.small.length) fail("touch_target", { width, label, controls: result.small });
  }
  return result;
}

async function reachability(page, width, label) {
  if (width >= 600) return;
  await page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight));
  await page.waitForTimeout(40);
  const data = await page.evaluate(() => {
    const nav = document.querySelector("[data-qa-mobile-nav]");
    if (!nav) return { navMissing: true };
    const navTop = nav.getBoundingClientRect().top;
    const actions = [...document.querySelectorAll("main button,main input,main select,main textarea,main summary,main a[href]")]
      .filter((el) => {
        const r = el.getBoundingClientRect();
        const s = getComputedStyle(el);
        return r.width > 0 && r.height > 0 && s.display !== "none" && s.visibility !== "hidden";
      })
      .map((el) => {
        const r = el.getBoundingClientRect();
        return {
          bottom: r.bottom,
          docBottom: r.bottom + scrollY,
          name: (el.textContent || el.getAttribute("aria-label") || "").trim().slice(0, 80)
        };
      })
      .sort((a, b) => a.docBottom - b.docBottom);
    const last = actions.at(-1) || null;
    return { navMissing: false, navTop, last, covered: Boolean(last && last.bottom > navTop + 1) };
  });
  if (data.navMissing || data.covered) fail("mobile_navigation_covers_action", { width, label, ...data });
  await page.evaluate(() => window.scrollTo(0, 0));
}

async function capture(page, width, label, route, requiredTexts = []) {
  const response = await page.goto(base + route, { waitUntil: "networkidle" });
  if (!response || response.status() >= 400) fail("missing_core_route", { width, label, route, status: response?.status() ?? null });
  if (new URL(page.url()).pathname === "/login") fail("authentication_failure", { width, label, route });
  const metrics = await inspect(page, width, label, requiredTexts);
  fs.mkdirSync("ui-artifacts/opportunity-screenshots", { recursive: true });
  const file = `ui-artifacts/opportunity-screenshots/${width}-${label}.png`;
  await page.screenshot({ path: file, fullPage: true });
  await reachability(page, width, label);
  report.pages.push({ width, label, route, status: response?.status() ?? null, file, metrics });
}

async function verifyFilters(page, width) {
  await page.goto(base + "/oportunidades", { waitUntil: "networkidle" });
  let search = page.getByRole("searchbox", { name: "Cliente" });
  const filterResult = { width, semantic: await search.count() === 1, empty: false, restored: false, selects: 0 };
  filterResult.selects = await page.locator("form[role=search] select").count();
  if (!filterResult.semantic || filterResult.selects < 5) fail("filters_missing", { width, ...filterResult });

  await search.fill("ZZZ OPORTUNIDADE INEXISTENTE ZZZ");
  await search.press("Enter");
  await page.waitForLoadState("networkidle");
  filterResult.empty = await page.getByRole("heading", { name: "Nenhuma oportunidade no momento" }).isVisible().catch(() => false);
  if (!filterResult.empty) fail("opportunity_filter_empty_state_failed", { width });

  search = page.getByRole("searchbox", { name: "Cliente" });
  await search.fill("");
  await search.press("Enter");
  await page.waitForLoadState("networkidle");
  const restoredBody = await page.locator("body").innerText();
  filterResult.restored = restoredBody.includes(customerName);
  if (!filterResult.restored) fail("opportunity_filter_restore_failed", { width });
  report.filters.push(filterResult);
}

async function opportunityIdForButton(button) {
  return button.locator("xpath=ancestor::form[1]//input[@name='opportunityId']").getAttribute("value");
}

fs.mkdirSync("ui-artifacts", { recursive: true });
const browser = await chromium.launch({ headless: true });
const pool = new Pool({ connectionString: process.env.DATABASE_URL, max: 1 });
let storageState = null;
let fatal = null;

try {
  storageState = await authenticateOwnerOnce(browser);
  if (!storageState) throw new Error("Owner authentication did not produce reusable storage state.");

  report.precondition = await readDbState(pool);
  if (report.precondition.journeyEvents !== 0 || report.precondition.opportunities !== 0) {
    const rows = await readDiagnosticRows(pool);
    fail("database_precondition_dirty", { state: report.precondition, rows });
    throw new Error("Opportunity QA customer was not clean before the read-path proof.");
  }

  const readContext = await browser.newContext(contextOptions(320, storageState));
  const readPage = await readContext.newPage();
  readPage.on("pageerror", (error) => report.pageErrors.push({ phase: "read_purity", message: error.message }));
  report.readPurity.before = await readDbState(pool);
  const readResponse = await readPage.goto(base + "/oportunidades", { waitUntil: "networkidle" });
  report.readPurity.emptyStateVisible = await readPage.getByRole("heading", { name: "Nenhuma oportunidade no momento" }).isVisible().catch(() => false);
  report.readPurity.after = await readDbState(pool);
  report.readPurity.unchanged = sameState(report.readPurity.before, report.readPurity.after);
  report.readPurity.status = readResponse?.status() ?? null;
  if (!report.readPurity.unchanged) {
    const rows = await readDiagnosticRows(pool);
    fail("read_path_mutated_database", { readPurity: report.readPurity, rows });
    throw new Error("Opening /oportunidades mutated JourneyEvent, Opportunity or opportunity audit state.");
  }
  if (!report.readPurity.emptyStateVisible) {
    fail("read_empty_state_missing", { state: report.readPurity.after, body: (await readPage.locator("body").innerText()).slice(0, 1200) });
    throw new Error("Pure empty read did not render the expected empty state.");
  }
  await readContext.close();

  const refreshContext = await browser.newContext(contextOptions(320, storageState));
  const refreshPage = await refreshContext.newPage();
  refreshPage.on("pageerror", (error) => report.pageErrors.push({ phase: "refresh", message: error.message }));
  await refreshPage.goto(base + "/oportunidades", { waitUntil: "networkidle" });
  const refreshButton = refreshPage.getByRole("button", { name: "Atualizar oportunidades" });
  report.refresh = {
    attempted: false,
    ownerControlVisible: await refreshButton.count() === 1,
    before: await readDbState(pool),
    after: null,
    journeyEventsCreated: 0,
    opportunitiesCreated: 0,
    success: false
  };
  if (!report.refresh.ownerControlVisible) {
    fail("refresh_action_missing_for_manage_role");
    throw new Error("Owner refresh control was not available.");
  }

  report.refresh.attempted = true;
  await refreshButton.click();
  report.refresh.after = await waitForDb(
    pool,
    (state) => state.journeyEvents > report.refresh.before.journeyEvents && state.opportunities > report.refresh.before.opportunities,
  );
  report.refresh.journeyEventsCreated = report.refresh.after.journeyEvents - report.refresh.before.journeyEvents;
  report.refresh.opportunitiesCreated = report.refresh.after.opportunities - report.refresh.before.opportunities;

  let customerVisible = true;
  try {
    await refreshPage.getByText(customerName, { exact: true }).first().waitFor({ state: "visible", timeout: 15000 });
  } catch {
    customerVisible = false;
  }

  report.generatedSources.rows = await readGeneratedSources(pool);
  report.generatedSources.pregnancy = report.generatedSources.rows.some((row) => row.pregnancyId && row.type === "DPP_MINUS_30");
  report.generatedSources.laura = report.generatedSources.rows.some((row) => row.childName === longChildName && row.type === "CHILD_3_MONTHS");
  report.generatedSources.pedro = report.generatedSources.rows.some((row) => row.childName === secondChildName && row.type === "CHILD_2_YEARS");
  report.refresh.success = customerVisible &&
    report.refresh.journeyEventsCreated > 0 &&
    report.refresh.opportunitiesCreated > 0 &&
    report.generatedSources.pregnancy &&
    report.generatedSources.laura &&
    report.generatedSources.pedro;

  if (!report.refresh.success) {
    fail("explicit_refresh_failed", {
      refresh: report.refresh,
      generatedSources: report.generatedSources,
      body: (await refreshPage.locator("body").innerText()).slice(0, 2000)
    });
    throw new Error("The single explicit refresh did not generate the intended actionable journey sources.");
  }
  await refreshContext.close();

  report.visualMatrix.before = await readDbState(pool);
  for (const width of widths) {
    const context = await browser.newContext(contextOptions(width, storageState));
    const page = await context.newPage();
    page.on("pageerror", (error) => report.pageErrors.push({ phase: "visual_matrix", width, message: error.message }));

    await capture(page, width, "oportunidades", "/oportunidades", [
      customerName,
      longChildName,
      secondChildName,
      "Gestação",
      "Por que agora?",
      "Momento recomendado",
      "Pontuação",
      "Ver cliente",
      "Por que esta pontuação?",
      "Canal de contato ainda não foi validado nesta etapa."
    ]);

    if (width === 320) {
      const scoreDetails = page.locator("summary").filter({ hasText: "Por que esta pontuação?" }).first();
      if (!(await scoreDetails.count())) {
        fail("score_explanation_missing", { width });
      } else {
        await scoreDetails.click();
        if (!(await page.locator("body").innerText()).includes("Momento ideal")) fail("score_explanation_factor_missing", { width });
      }
    }

    await verifyFilters(page, width);
    await capture(page, width, "cliente-360-oportunidade", `/clientes/${customerId}`, ["Próxima oportunidade", "Ver oportunidades"]);
    await capture(page, width, "cliente-oportunidades", `/clientes/${customerId}/oportunidades`, ["Oportunidades desta cliente", customerName]);
    await capture(page, width, "jornada-eventos-importantes", `/clientes/${customerId}/jornada`, ["Eventos importantes da jornada", "Esta área não decide canal nem envia mensagens.", "Linha do tempo factual"]);
    report.visualMatrix.widths.push(width);
    await context.close();
  }
  report.visualMatrix.after = await readDbState(pool);
  report.visualMatrix.unchanged = sameState(report.visualMatrix.before, report.visualMatrix.after);
  if (!report.visualMatrix.unchanged) fail("visual_matrix_mutated_database", { visualMatrix: report.visualMatrix });

  const mutationContext = await browser.newContext(contextOptions(320, storageState));
  const mutationPage = await mutationContext.newPage();
  mutationPage.on("pageerror", (error) => report.pageErrors.push({ phase: "mutations", message: error.message }));
  await mutationPage.goto(base + "/oportunidades", { waitUntil: "networkidle" });
  report.mutations.initialCards = await mutationPage.locator("[data-qa-opportunity-card]").count();

  const snoozeButton = mutationPage.getByRole("button", { name: "Adiar 7 dias" }).first();
  if (!(await snoozeButton.count())) {
    fail("snooze_action_missing");
  } else {
    const snoozeId = await opportunityIdForButton(snoozeButton);
    report.mutations.snooze = { opportunityId: snoozeId, persisted: false, uiVisible: false, audit: false };
    if (!snoozeId) {
      fail("snooze_opportunity_id_missing");
    } else {
      await snoozeButton.click();
      const snoozed = await waitForOpportunity(pool, snoozeId, (row) => row?.status === "SNOOZED" && Boolean(row.snoozedUntil));
      report.mutations.snooze.persisted = Boolean(snoozed?.status === "SNOOZED" && snoozed.snoozedUntil);
      report.mutations.snooze.snoozedUntil = snoozed?.snoozedUntil ?? null;
      report.mutations.snooze.audit = await auditExists(pool, "opportunity.snoozed", snoozeId);
      await mutationPage.goto(base + "/oportunidades?status=SNOOZED", { waitUntil: "networkidle" });
      report.mutations.snooze.uiVisible = (await mutationPage.locator("body").innerText()).includes("Adiada até");
      if (!report.mutations.snooze.persisted || !report.mutations.snooze.uiVisible || !report.mutations.snooze.audit) {
        fail("snooze_failed", { snooze: report.mutations.snooze });
      }
    }
  }

  await mutationPage.goto(base + "/oportunidades", { waitUntil: "networkidle" });
  const dismissButton = mutationPage.getByRole("button", { name: "Ignorar" }).first();
  if (!(await dismissButton.count())) {
    fail("dismiss_action_missing");
  } else {
    const dismissId = await opportunityIdForButton(dismissButton);
    report.mutations.dismiss = { opportunityId: dismissId, persisted: false, uiVisible: false, audit: false };
    if (!dismissId) {
      fail("dismiss_opportunity_id_missing");
    } else {
      await dismissButton.click();
      const dismissed = await waitForOpportunity(pool, dismissId, (row) => row?.status === "DISMISSED");
      report.mutations.dismiss.persisted = dismissed?.status === "DISMISSED";
      report.mutations.dismiss.audit = await auditExists(pool, "opportunity.dismissed", dismissId);
      await mutationPage.goto(base + "/oportunidades?status=DISMISSED", { waitUntil: "networkidle" });
      report.mutations.dismiss.uiVisible = (await mutationPage.locator("body").innerText()).includes("Ignorada");
      if (!report.mutations.dismiss.persisted || !report.mutations.dismiss.uiVisible || !report.mutations.dismiss.audit) {
        fail("dismiss_failed", { dismiss: report.mutations.dismiss });
      }
    }
  }
  await mutationContext.close();

  report.marketing.before = await readDbState(pool);
  await pool.query('UPDATE principal.memberships SET role = $1 WHERE id = $2', ["MARKETING", ownerMembershipId]);
  const roleCheck = await pool.query('SELECT role::text AS role FROM principal.memberships WHERE id = $1', [ownerMembershipId]);
  report.marketing.databaseRole = roleCheck.rows[0]?.role ?? null;

  const marketingContext = await browser.newContext(contextOptions(320, storageState));
  const marketingPage = await marketingContext.newPage();
  marketingPage.on("pageerror", (error) => report.pageErrors.push({ phase: "marketing", message: error.message }));
  const marketingResponse = await marketingPage.goto(base + "/oportunidades", { waitUntil: "networkidle" });
  const marketingBody = await marketingPage.locator("body").innerText();

  report.marketing.sessionStillValid = Boolean(marketingResponse && marketingResponse.status() < 400 && new URL(marketingPage.url()).pathname !== "/login");
  report.marketing.queueVisible = marketingBody.includes(customerName);
  report.marketing.refreshHidden = await marketingPage.getByRole("button", { name: "Atualizar oportunidades" }).count() === 0;
  report.marketing.snoozeHidden = await marketingPage.getByRole("button", { name: "Adiar 7 dias" }).count() === 0;
  report.marketing.dismissHidden = await marketingPage.getByRole("button", { name: "Ignorar" }).count() === 0;
  report.marketing.readOnlyCopy = marketingBody.includes("Seu perfil possui acesso de leitura");
  report.marketing.after = await readDbState(pool);
  report.marketing.readOnlyDatabase = sameState(report.marketing.before, report.marketing.after);

  if (
    report.marketing.databaseRole !== "MARKETING" ||
    !report.marketing.sessionStillValid ||
    !report.marketing.queueVisible ||
    !report.marketing.refreshHidden ||
    !report.marketing.snoozeHidden ||
    !report.marketing.dismissHidden ||
    !report.marketing.readOnlyCopy ||
    !report.marketing.readOnlyDatabase
  ) {
    fail("marketing_read_only_ui_failed", { marketing: report.marketing });
  }

  await capture(marketingPage, 320, "oportunidades-marketing-leitura", "/oportunidades", [customerName, "Seu perfil possui acesso de leitura"]);
  await marketingContext.close();
} catch (error) {
  fatal = error;
  if (!report.failures.length) fail("harness_exception", { message: error instanceof Error ? error.message : String(error) });
} finally {
  await pool.query('UPDATE principal.memberships SET role = $1 WHERE id = $2', ["OWNER", ownerMembershipId]).catch(() => {});
  await pool.end();
  await browser.close();
}

if (report.pageErrors.length) fail("page_error", { errors: report.pageErrors });
fs.writeFileSync("ui-artifacts/opportunity-report.json", JSON.stringify(report, null, 2));
console.log(JSON.stringify({
  authentication: report.authentication,
  precondition: report.precondition,
  readPurity: report.readPurity,
  refresh: report.refresh,
  generatedSources: report.generatedSources,
  visualMatrix: report.visualMatrix,
  filters: report.filters,
  mutations: report.mutations,
  marketing: report.marketing,
  pages: report.pages.length,
  widths: report.widths,
  failures: report.failures,
  pageErrors: report.pageErrors
}, null, 2));

if (report.failures.length || fatal) {
  throw new Error(`Opportunity browser acceptance failed with ${report.failures.length} regression(s).`);
}
