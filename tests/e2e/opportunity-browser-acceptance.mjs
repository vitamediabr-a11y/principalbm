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
if (!customerId || !ownerMembershipId) throw new Error("Opportunity browser fixture identifiers are required.");

const report = { generatedAt: new Date().toISOString(), widths, pages: [], filters: [], mutations: {}, marketing: {}, refresh: {}, failures: [], pageErrors: [] };
function fail(kind, details = {}) { report.failures.push({ kind, ...details }); }

async function authenticate(page, width) {
  await page.goto(base + "/login", { waitUntil: "networkidle" });
  await page.getByLabel("E-mail").fill(process.env.BOOTSTRAP_OWNER_EMAIL);
  await page.getByLabel("Senha").fill(process.env.BOOTSTRAP_OWNER_PASSWORD);
  await page.getByRole("button", { name: "Entrar" }).click();
  try { await page.waitForURL("**/clientes", { timeout: 15000 }); }
  catch { fail("authentication_failure", { width, url: page.url() }); }
}

async function inspect(page, width, label, requiredTexts = []) {
  const result = await page.evaluate(() => {
    const root = document.documentElement;
    const visible = (el) => { const r = el.getBoundingClientRect(); const s = getComputedStyle(el); return r.width > 0 && r.height > 0 && s.display !== "none" && s.visibility !== "hidden"; };
    const interactive = [...document.querySelectorAll('button,a[href],input,select,textarea,summary,[role="button"]')].filter(visible).map((el) => {
      const r = el.getBoundingClientRect();
      return { tag: el.tagName, name: (el.getAttribute("aria-label") || el.textContent || el.getAttribute("placeholder") || "").trim().replace(/\s+/g, " ").slice(0, 120), width: Math.round(r.width), height: Math.round(r.height), primary: el.getAttribute("data-qa-hit-target") === "primary" };
    });
    const enforced = interactive.filter((x) => ["BUTTON","INPUT","SELECT","TEXTAREA","SUMMARY"].includes(x.tag) || x.primary);
    const nav = document.querySelector("[data-qa-mobile-nav]");
    const navRect = nav && visible(nav) ? nav.getBoundingClientRect() : null;
    const navStyle = nav && visible(nav) ? getComputedStyle(nav) : null;
    const english = [...new Set((document.body.innerText.match(/\b(Save|Cancel|Edit|Search|Customer|Customers|Children|Pregnancy|Birth|Loading|Submit|Delete|Clear|Next|Previous|No results|Opportunity|Opportunities)\b/g) || []))];
    return { overflowX: root.scrollWidth > innerWidth + 1, scrollWidth: root.scrollWidth, english, small: enforced.filter((x) => x.width < 44 || x.height < 44), nav: navRect ? { present: true, position: navStyle.position, top: navRect.top, height: navRect.height } : { present: false } };
  });
  const body = await page.locator("body").innerText();
  if (result.overflowX) fail("horizontal_overflow", { width, label, scrollWidth: result.scrollWidth });
  if (result.english.length) fail("english_leakage", { width, label, tokens: result.english });
  for (const text of requiredTexts) if (!body.includes(text)) fail("required_text_missing", { width, label, text });
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
    const actions = [...document.querySelectorAll("main button,main input,main select,main textarea,main summary,main a[href]")].filter((el) => { const r=el.getBoundingClientRect(); const s=getComputedStyle(el); return r.width>0&&r.height>0&&s.display!=="none"&&s.visibility!=="hidden"; }).map((el) => { const r=el.getBoundingClientRect(); return { bottom:r.bottom, docBottom:r.bottom+scrollY, name:(el.textContent||el.getAttribute("aria-label")||"").trim().slice(0,80) }; }).sort((a,b)=>a.docBottom-b.docBottom);
    const last = actions.at(-1) || null;
    return { navMissing:false, navTop, last, covered:Boolean(last && last.bottom > navTop + 1) };
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
  const search = page.getByRole("searchbox", { name: "Cliente" });
  const filterResult = { width, semantic: await search.count() === 1, empty: false, restored: false, selects: 0 };
  filterResult.selects = await page.locator("form[role=search] select").count();
  if (!filterResult.semantic || filterResult.selects < 5) fail("filters_missing", { width, ...filterResult });
  await search.fill("ZZZ OPORTUNIDADE INEXISTENTE ZZZ");
  await search.press("Enter");
  await page.waitForLoadState("networkidle");
  filterResult.empty = await page.getByRole("heading", { name: "Nenhuma oportunidade no momento" }).isVisible().catch(() => false);
  if (!filterResult.empty) fail("opportunity_filter_empty_state_failed", { width });
  const refreshedSearch = page.getByRole("searchbox", { name: "Cliente" });
  await refreshedSearch.fill("");
  await refreshedSearch.press("Enter");
  await page.waitForLoadState("networkidle");
  filterResult.restored = (await page.locator("body").innerText()).includes(customerName);
  if (!filterResult.restored) fail("opportunity_filter_restore_failed", { width });
  report.filters.push(filterResult);
}

fs.mkdirSync("ui-artifacts", { recursive: true });
const browser = await chromium.launch({ headless: true });
const rolePool = new Pool({ connectionString: process.env.DATABASE_URL, max: 1 });
try {
  let refreshed = false;
  for (const width of widths) {
    const page = await browser.newPage({ viewport: { width, height: 844 } });
    page.on("pageerror", (error) => report.pageErrors.push({ width, message: error.message }));
    await authenticate(page, width);

    if (!refreshed) {
      await page.goto(base + "/oportunidades", { waitUntil: "networkidle" });
      report.refresh.emptyBefore = await page.getByRole("heading", { name: "Nenhuma oportunidade no momento" }).isVisible().catch(() => false);
      const refresh = page.getByRole("button", { name: "Atualizar oportunidades" });
      report.refresh.ownerControlVisible = await refresh.count() === 1;
      if (!report.refresh.emptyBefore) fail("read_queue_not_empty_before_explicit_refresh");
      if (!report.refresh.ownerControlVisible) fail("refresh_action_missing_for_manage_role");
      else {
        await refresh.click();
        await page.waitForLoadState("networkidle");
        refreshed = (await page.locator("body").innerText()).includes(customerName);
        report.refresh.generated = refreshed;
        if (!refreshed) fail("explicit_refresh_failed");
      }
    }

    await capture(page, width, "oportunidades", "/oportunidades", [customerName, longChildName, "Pedro", "Gestação", "Por que agora?", "Momento recomendado", "Pontuação", "Ver cliente", "Por que esta pontuação?", "Canal de contato ainda não foi validado nesta etapa."]);
    if (width === 320) {
      const scoreDetails = page.locator("summary").filter({ hasText: "Por que esta pontuação?" }).first();
      if (await scoreDetails.count()) {
        await scoreDetails.click();
        if (!(await page.locator("body").innerText()).includes("Momento ideal")) fail("score_explanation_missing");
      }
    }
    await verifyFilters(page, width);
    await capture(page, width, "cliente-360-oportunidade", `/clientes/${customerId}`, ["Próxima oportunidade", "Ver oportunidades"]);
    await capture(page, width, "cliente-oportunidades", `/clientes/${customerId}/oportunidades`, ["Oportunidades desta cliente", customerName]);
    await capture(page, width, "jornada-eventos-importantes", `/clientes/${customerId}/jornada`, ["Eventos importantes da jornada", "Esta área não decide canal nem envia mensagens.", "Linha do tempo factual"]);
    await page.close();
  }

  const mutationPage = await browser.newPage({ viewport: { width: 320, height: 844 } });
  await authenticate(mutationPage, "mutation-320");
  await mutationPage.goto(base + "/oportunidades", { waitUntil: "networkidle" });
  report.mutations.initialCards = await mutationPage.locator("[data-qa-opportunity-card]").count();
  const snooze = mutationPage.getByRole("button", { name: "Adiar 7 dias" }).first();
  if (!(await snooze.count())) fail("snooze_action_missing");
  else { await snooze.click(); await mutationPage.waitForLoadState("networkidle"); }
  await mutationPage.goto(base + "/oportunidades?status=SNOOZED", { waitUntil: "networkidle" });
  report.mutations.snoozedVisible = (await mutationPage.locator("body").innerText()).includes("Adiada até");
  if (!report.mutations.snoozedVisible) fail("snooze_failed");

  await mutationPage.goto(base + "/oportunidades", { waitUntil: "networkidle" });
  const dismiss = mutationPage.getByRole("button", { name: "Ignorar" }).first();
  if (!(await dismiss.count())) fail("dismiss_action_missing");
  else { await dismiss.click(); await mutationPage.waitForLoadState("networkidle"); }
  await mutationPage.goto(base + "/oportunidades?status=DISMISSED", { waitUntil: "networkidle" });
  report.mutations.dismissedVisible = (await mutationPage.locator("body").innerText()).includes("Ignorada");
  if (!report.mutations.dismissedVisible) fail("dismiss_failed");
  await mutationPage.close();

  await rolePool.query('UPDATE principal.memberships SET role = $1 WHERE id = $2', ["MARKETING", ownerMembershipId]);
  const marketingPage = await browser.newPage({ viewport: { width: 320, height: 844 } });
  await authenticate(marketingPage, "marketing-320");
  await marketingPage.goto(base + "/oportunidades", { waitUntil: "networkidle" });
  const marketingBody = await marketingPage.locator("body").innerText();
  report.marketing.queueVisible = marketingBody.includes(customerName);
  report.marketing.refreshHidden = await marketingPage.getByRole("button", { name: "Atualizar oportunidades" }).count() === 0;
  report.marketing.snoozeHidden = await marketingPage.getByRole("button", { name: "Adiar 7 dias" }).count() === 0;
  report.marketing.dismissHidden = await marketingPage.getByRole("button", { name: "Ignorar" }).count() === 0;
  report.marketing.readOnlyCopy = marketingBody.includes("Seu perfil possui acesso de leitura");
  if (!Object.values(report.marketing).every(Boolean)) fail("marketing_read_only_ui_failed", { marketing: report.marketing });
  await capture(marketingPage, 320, "oportunidades-marketing-leitura", "/oportunidades", [customerName, "Seu perfil possui acesso de leitura"]);
  await marketingPage.close();
} finally {
  await rolePool.query('UPDATE principal.memberships SET role = $1 WHERE id = $2', ["OWNER", ownerMembershipId]).catch(() => {});
  await rolePool.end();
  await browser.close();
}

if (report.pageErrors.length) fail("page_error", { errors: report.pageErrors });
fs.writeFileSync("ui-artifacts/opportunity-report.json", JSON.stringify(report, null, 2));
if (report.failures.length) {
  console.error(JSON.stringify(report, null, 2));
  process.exit(1);
}
console.log(JSON.stringify({ pages: report.pages.length, widths, filters: report.filters, mutations: report.mutations, marketing: report.marketing, refresh: report.refresh, failures: 0 }, null, 2));
