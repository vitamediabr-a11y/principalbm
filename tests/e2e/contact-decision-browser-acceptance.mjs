import { chromium } from "playwright";
import pg from "pg";
import fs from "node:fs";

const { Pool } = pg;
const base = "http://127.0.0.1:3000";
const widths = [320, 375, 390, 430, 1280];
const primaryCustomerId = process.env.CONTACT_DECISION_PRIMARY_CUSTOMER_ID;
const futureCustomerId = process.env.CONTACT_DECISION_FUTURE_CUSTOMER_ID;
const missingConsentCustomerId = process.env.CONTACT_DECISION_MISSING_CONSENT_CUSTOMER_ID;
const dncCustomerId = process.env.CONTACT_DECISION_DNC_CUSTOMER_ID;
const ownerMembershipId = process.env.CONTACT_DECISION_OWNER_MEMBERSHIP_ID;
const primaryCustomerName = "Helena Rodrigues de Albuquerque — Cliente QA com múltiplas oportunidades e nome longo";
const futureCustomerName = "Cliente QA — Aguardar momento recomendado";
const missingConsentName = "Cliente QA — Consentimento WhatsApp ausente";
const dncName = "Cliente QA — Não contatar";

if (!primaryCustomerId || !futureCustomerId || !missingConsentCustomerId || !dncCustomerId || !ownerMembershipId) {
  throw new Error("Contact Decision browser fixture identifiers are required.");
}

const report = {
  generatedAt: new Date().toISOString(),
  widths,
  authentication: { attempted: false, success: false, signIns: 0 },
  precondition: {},
  readPurity: {},
  preEvaluationMatrix: { widths: [], before: null, after: null, unchanged: false },
  evaluation: {},
  generatedStates: {},
  visualMatrix: { widths: [] },
  filters: [],
  marketing: {},
  pages: [],
  failures: [],
  pageErrors: []
};

function fail(kind, details = {}) {
  report.failures.push({ kind, ...details });
}

function contextOptions(width, storageState) {
  return {
    viewport: { width, height: width === 1280 ? 800 : 844 },
    isMobile: width < 600,
    hasTouch: width < 600,
    storageState
  };
}

async function readDbState(pool) {
  const result = await pool.query(`SELECT
    (SELECT count(*)::int FROM principal.contact_decisions) AS decisions,
    (SELECT count(*)::int FROM principal.audit_logs WHERE action LIKE 'contact_decision.%') AS audits`);
  return result.rows[0];
}

function sameState(left, right) {
  return left.decisions === right.decisions && left.audits === right.audits;
}

async function waitForDecisions(pool, timeoutMs = 15000) {
  const started = Date.now();
  let state = await readDbState(pool);
  while (state.decisions === 0) {
    if (Date.now() - started >= timeoutMs) return state;
    await new Promise((resolve) => setTimeout(resolve, 200));
    state = await readDbState(pool);
  }
  return state;
}

async function readFixtureDecisions(pool) {
  const result = await pool.query(`SELECT
      cd.id,
      cd.status::text AS status,
      cd."primaryReasonCode",
      cd."suppressedByOpportunityId",
      cd."opportunityId",
      c.id AS "customerId",
      c.name AS "customerName"
    FROM principal.contact_decisions cd
    JOIN principal.customers c ON c.id = cd."customerId"
    WHERE c.id = ANY($1::uuid[])
    ORDER BY c.name, cd.status::text, cd."opportunityId"`, [[primaryCustomerId, futureCustomerId, missingConsentCustomerId, dncCustomerId]]);
  return result.rows;
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
    fail("authentication_failure", { url: page.url() });
  }
  const storageState = report.authentication.success ? await context.storageState() : null;
  await context.close();
  return storageState;
}

async function inspect(page, width, label, requiredTexts = []) {
  const metrics = await page.evaluate(() => {
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
    const english = [...new Set((document.body.innerText.match(/\b(Save|Cancel|Edit|Search|Customer|Customers|Children|Pregnancy|Birth|Loading|Submit|Delete|Clear|Next|Previous|No results|Contact Decision|Proceed|Blocked|Suppressed)\b/g) || []))];
    const nav = document.querySelector("[data-qa-mobile-nav]");
    const navRect = nav && visible(nav) ? nav.getBoundingClientRect() : null;
    const navStyle = nav && visible(nav) ? getComputedStyle(nav) : null;
    return {
      overflowX: root.scrollWidth > innerWidth + 1,
      scrollWidth: root.scrollWidth,
      english,
      small: enforced.filter((x) => x.width < 44 || x.height < 44),
      nav: navRect ? { present: true, position: navStyle.position, top: navRect.top } : { present: false }
    };
  });
  const body = await page.locator("body").innerText();
  if (metrics.overflowX) fail("horizontal_overflow", { width, label, scrollWidth: metrics.scrollWidth });
  if (metrics.english.length) fail("english_leakage", { width, label, tokens: metrics.english });
  for (const text of requiredTexts) {
    if (!body.includes(text)) fail("required_text_missing", { width, label, text });
  }
  if (width < 600) {
    if (!metrics.nav.present || metrics.nav.position !== "fixed") fail("mobile_navigation_missing", { width, label, nav: metrics.nav });
    if (metrics.small.length) fail("touch_target", { width, label, controls: metrics.small });
  }
  return metrics;
}

async function reachability(page, width, label) {
  if (width >= 600) return;
  await page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight));
  await page.waitForTimeout(50);
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
        return { bottom: r.bottom, docBottom: r.bottom + scrollY, name: (el.textContent || el.getAttribute("aria-label") || "").trim().slice(0, 80) };
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
  fs.mkdirSync("ui-artifacts/contact-decision-screenshots", { recursive: true });
  const file = `ui-artifacts/contact-decision-screenshots/${width}-${label}.png`;
  await page.screenshot({ path: file, fullPage: true });
  await reachability(page, width, label);
  report.pages.push({ width, label, route, status: response?.status() ?? null, file, metrics });
}

async function verifyDecisionFilter(page, width) {
  await page.goto(base + "/oportunidades", { waitUntil: "networkidle" });
  const select = page.locator('select[name="decision"]');
  const result = { width, present: await select.count() === 1, suppressed: false, restored: false };
  if (!result.present) {
    fail("decision_filter_missing", { width });
    report.filters.push(result);
    return;
  }
  await select.selectOption("SUPPRESSED");
  await page.getByRole("button", { name: "Aplicar filtros" }).click();
  await page.waitForLoadState("networkidle");
  result.suppressed = (await page.locator("body").innerText()).includes("Suprimido");
  if (!result.suppressed) fail("decision_filter_suppressed_failed", { width });
  await page.getByRole("link", { name: "Limpar" }).click();
  await page.waitForLoadState("networkidle");
  result.restored = (await page.locator("body").innerText()).includes(primaryCustomerName);
  if (!result.restored) fail("decision_filter_restore_failed", { width });
  report.filters.push(result);
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
  if (report.precondition.decisions !== 0 || report.precondition.audits !== 0) {
    fail("contact_decision_precondition_dirty", { state: report.precondition });
    throw new Error("ContactDecision precondition was not empty.");
  }

  const readContext = await browser.newContext(contextOptions(320, storageState));
  const readPage = await readContext.newPage();
  readPage.on("pageerror", (error) => report.pageErrors.push({ phase: "read_purity", message: error.message }));
  report.readPurity.before = await readDbState(pool);
  await readPage.goto(base + "/oportunidades", { waitUntil: "networkidle" });
  report.readPurity.notEvaluatedVisible = (await readPage.locator("body").innerText()).includes("Decisão ainda não avaliada.");
  report.readPurity.after = await readDbState(pool);
  report.readPurity.unchanged = sameState(report.readPurity.before, report.readPurity.after);
  if (!report.readPurity.notEvaluatedVisible || !report.readPurity.unchanged) {
    fail("contact_decision_read_path_not_pure", { readPurity: report.readPurity });
    throw new Error("Opening /oportunidades did not preserve an unevaluated ContactDecision state.");
  }
  await readContext.close();

  report.preEvaluationMatrix.before = await readDbState(pool);
  for (const width of widths) {
    const context = await browser.newContext(contextOptions(width, storageState));
    const page = await context.newPage();
    page.on("pageerror", (error) => report.pageErrors.push({ phase: "pre_evaluation", width, message: error.message }));
    await capture(page, width, "contato-nao-avaliado", "/oportunidades", ["Decisão ainda não avaliada.", "Nenhuma mensagem foi enviada nesta etapa."]);
    report.preEvaluationMatrix.widths.push(width);
    await context.close();
  }
  report.preEvaluationMatrix.after = await readDbState(pool);
  report.preEvaluationMatrix.unchanged = sameState(report.preEvaluationMatrix.before, report.preEvaluationMatrix.after);
  if (!report.preEvaluationMatrix.unchanged) fail("pre_evaluation_matrix_mutated_database", { matrix: report.preEvaluationMatrix });

  const evaluationContext = await browser.newContext(contextOptions(320, storageState));
  const evaluationPage = await evaluationContext.newPage();
  evaluationPage.on("pageerror", (error) => report.pageErrors.push({ phase: "evaluation", message: error.message }));
  await evaluationPage.goto(base + "/oportunidades", { waitUntil: "networkidle" });
  const button = evaluationPage.getByRole("button", { name: "Avaliar contatos" });
  report.evaluation = { attempted: false, controlVisible: await button.count() === 1, before: await readDbState(pool), after: null, success: false };
  if (!report.evaluation.controlVisible) throw new Error("Owner ContactDecision evaluation control was not visible.");
  report.evaluation.attempted = true;
  await button.click();
  report.evaluation.after = await waitForDecisions(pool);
  report.evaluation.success = report.evaluation.after.decisions > report.evaluation.before.decisions;
  if (!report.evaluation.success) {
    fail("contact_decision_evaluation_failed", { evaluation: report.evaluation });
    throw new Error("Explicit ContactDecision evaluation created no decisions.");
  }
  await evaluationContext.close();

  const rows = await readFixtureDecisions(pool);
  report.generatedStates.rows = rows;
  const primaryRows = rows.filter((row) => row.customerId === primaryCustomerId);
  report.generatedStates.primaryProceed = primaryRows.filter((row) => row.status === "PROCEED").length === 1;
  report.generatedStates.primarySuppressed = primaryRows.filter((row) => row.status === "SUPPRESSED").length >= 1;
  report.generatedStates.futureWait = rows.some((row) => row.customerId === futureCustomerId && row.status === "WAIT" && row.primaryReasonCode === "OPPORTUNITY_NOT_READY");
  report.generatedStates.missingConsentBlocked = rows.some((row) => row.customerId === missingConsentCustomerId && row.status === "BLOCKED" && row.primaryReasonCode === "WHATSAPP_CONSENT_MISSING");
  report.generatedStates.dncBlocked = rows.some((row) => row.customerId === dncCustomerId && row.status === "BLOCKED" && row.primaryReasonCode === "CUSTOMER_DO_NOT_CONTACT");
  if (!report.generatedStates.primaryProceed || !report.generatedStates.primarySuppressed || !report.generatedStates.futureWait || !report.generatedStates.missingConsentBlocked || !report.generatedStates.dncBlocked) {
    fail("contact_decision_fixture_states_missing", { generatedStates: report.generatedStates });
  }

  for (const width of widths) {
    const context = await browser.newContext(contextOptions(width, storageState));
    const page = await context.newPage();
    page.on("pageerror", (error) => report.pageErrors.push({ phase: "visual_matrix", width, message: error.message }));
    await capture(page, width, "decisoes-contato", "/oportunidades", [
      primaryCustomerName,
      futureCustomerName,
      missingConsentName,
      dncName,
      "Decisão de contato",
      "Pode avançar",
      "Aguardar",
      "Bloqueado",
      "Suprimido",
      "Consentimento de WhatsApp não encontrado.",
      "Cliente marcou não contatar.",
      "Nenhuma mensagem foi enviada nesta etapa."
    ]);
    await verifyDecisionFilter(page, width);
    await capture(page, width, "cliente-360-decisao-contato", `/clientes/${primaryCustomerId}`, [
      "Próxima oportunidade",
      "Decisão de contato",
      "Pode avançar",
      "Consentimento WhatsApp",
      "Concedido",
      "WhatsApp cadastrado",
      "Nenhuma mensagem foi enviada nesta etapa."
    ]);
    report.visualMatrix.widths.push(width);
    await context.close();
  }

  report.marketing.before = await readDbState(pool);
  await pool.query('UPDATE principal.memberships SET role = $1 WHERE id = $2', ["MARKETING", ownerMembershipId]);
  const marketingContext = await browser.newContext(contextOptions(320, storageState));
  const marketingPage = await marketingContext.newPage();
  marketingPage.on("pageerror", (error) => report.pageErrors.push({ phase: "marketing", message: error.message }));
  const response = await marketingPage.goto(base + "/oportunidades", { waitUntil: "networkidle" });
  const body = await marketingPage.locator("body").innerText();
  report.marketing.sessionValid = Boolean(response && response.status() < 400 && new URL(marketingPage.url()).pathname !== "/login");
  report.marketing.roleReloaded = body.includes("Marketing / CRM");
  report.marketing.queueReadable = body.includes(primaryCustomerName) && body.includes("Decisão de contato");
  report.marketing.evaluateHidden = await marketingPage.getByRole("button", { name: "Avaliar contatos" }).count() === 0;
  report.marketing.opportunityRefreshHidden = await marketingPage.getByRole("button", { name: "Atualizar oportunidades" }).count() === 0;
  report.marketing.readOnlyCopy = body.includes("Seu perfil pode consultar decisões de contato, sem avaliá-las.");
  report.marketing.after = await readDbState(pool);
  report.marketing.databasePure = sameState(report.marketing.before, report.marketing.after);
  if (!report.marketing.sessionValid || !report.marketing.roleReloaded || !report.marketing.queueReadable || !report.marketing.evaluateHidden || !report.marketing.opportunityRefreshHidden || !report.marketing.readOnlyCopy || !report.marketing.databasePure) {
    fail("marketing_contact_decision_read_only_failed", { marketing: report.marketing });
  }
  await capture(marketingPage, 320, "decisoes-contato-marketing", "/oportunidades", [primaryCustomerName, "Decisão de contato", "Seu perfil pode consultar decisões de contato, sem avaliá-las."]);
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
fs.writeFileSync("ui-artifacts/contact-decision-report.json", JSON.stringify(report, null, 2));
console.log(JSON.stringify({
  authentication: report.authentication,
  precondition: report.precondition,
  readPurity: report.readPurity,
  preEvaluationMatrix: report.preEvaluationMatrix,
  evaluation: report.evaluation,
  generatedStates: report.generatedStates,
  visualMatrix: report.visualMatrix,
  filters: report.filters,
  marketing: report.marketing,
  pages: report.pages.length,
  failures: report.failures,
  pageErrors: report.pageErrors
}, null, 2));

if (report.failures.length || fatal) {
  throw new Error(`Contact Decision browser acceptance failed with ${report.failures.length} regression(s).`);
}
