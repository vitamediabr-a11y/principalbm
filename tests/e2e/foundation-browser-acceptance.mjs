import { chromium } from "playwright";
import fs from "node:fs";

const base = "http://127.0.0.1:3000";
const widths = [320, 375, 390, 430, 1280];
const customerName = "Maria da Conceição Albuquerque de Souza — Cliente com nome propositalmente longo";
const report = {
  generatedAt: new Date().toISOString(),
  widths,
  pages: [],
  auth: {},
  search: { tested: false, widths: [] },
  failures: [],
  pageErrors: []
};

function fail(kind, details = {}) {
  report.failures.push({ kind, ...details });
}

function expectedPrimary(label) {
  const names = ["PRINCIPAL BM", "Sair", "Clientes"];
  if (["cliente-360", "jornada", "criancas", "jornada-editar-gestacao", "jornada-confirmar-nascimento", "criancas-editar"].includes(label)) {
    names.push("Visão geral", "Jornada", "Crianças");
  }
  if (label === "cliente-360") names.push("Ver jornada");
  return names;
}

async function readMetrics(page, width, label) {
  const metrics = await page.evaluate(() => {
    const root = document.documentElement;
    const visible = (el) => {
      const r = el.getBoundingClientRect();
      const s = getComputedStyle(el);
      return r.width > 0 && r.height > 0 && s.display !== "none" && s.visibility !== "hidden";
    };

    const allInteractive = [...document.querySelectorAll('button,a[href],input,select,textarea,summary,[role="button"]')]
      .filter(visible)
      .map((el) => {
        const r = el.getBoundingClientRect();
        return {
          tag: el.tagName,
          name: (el.getAttribute("aria-label") || el.textContent || el.getAttribute("placeholder") || "").trim().replace(/\s+/g, " ").slice(0, 100),
          width: Math.round(r.width),
          height: Math.round(r.height),
          uiButton: el.getAttribute("data-ui-button") === "true",
          primaryLink: el.getAttribute("data-qa-hit-target") === "primary"
        };
      });

    const enforced = allInteractive.filter((x) => ["BUTTON", "INPUT", "SELECT", "TEXTAREA", "SUMMARY"].includes(x.tag) || x.uiButton || x.primaryLink);
    const english = [...new Set((document.body.innerText.match(/\b(Save|Cancel|Edit|Search|Customer|Customers|Children|Pregnancy|Birth|Loading|Submit|Delete|Clear|Next|Previous|No results)\b/g) || []))];
    const primaryNames = allInteractive.filter((x) => x.primaryLink || x.uiButton || x.tag === "BUTTON").map((x) => x.name);
    const nav = document.querySelector("[data-qa-mobile-nav]");
    const navRect = nav && visible(nav) ? nav.getBoundingClientRect() : null;
    const navStyle = nav && visible(nav) ? getComputedStyle(nav) : null;

    return {
      viewport: innerWidth,
      scrollWidth: root.scrollWidth,
      overflowX: root.scrollWidth > innerWidth + 1,
      english,
      allSmall: allInteractive.filter((x) => x.width < 44 || x.height < 44),
      enforcedSmall: enforced.filter((x) => x.width < 44 || x.height < 44),
      primaryNames,
      h1: document.querySelector("h1")?.textContent?.trim() || null,
      nav: navRect ? {
        present: true,
        top: Math.round(navRect.top),
        bottom: Math.round(navRect.bottom),
        height: Math.round(navRect.height),
        position: navStyle.position,
        paddingBottom: navStyle.paddingBottom
      } : { present: false }
    };
  });

  if (metrics.overflowX) fail("horizontal_overflow", { width, label, scrollWidth: metrics.scrollWidth });
  if (metrics.english.length) fail("english_leakage", { width, label, tokens: metrics.english });

  if (width < 600 && label !== "login") {
    if (!metrics.nav.present || metrics.nav.position !== "fixed") fail("mobile_navigation_missing", { width, label, nav: metrics.nav });
    if (metrics.enforcedSmall.length) fail("touch_target", { width, label, controls: metrics.enforcedSmall });
    const missing = expectedPrimary(label).filter((name) => !metrics.primaryNames.includes(name));
    if (missing.length) fail("primary_control_missing", { width, label, missing, found: metrics.primaryNames });
  }

  return metrics;
}

async function checkBottomReachability(page, width, label) {
  if (width >= 600 || label === "login") return { tested: false };
  await page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight));
  await page.waitForTimeout(40);
  const result = await page.evaluate(() => {
    const nav = document.querySelector("[data-qa-mobile-nav]");
    if (!nav) return { tested: true, navMissing: true };
    const navRect = nav.getBoundingClientRect();
    const candidates = [...document.querySelectorAll("main button,main input,main select,main textarea,main summary,main a[href]")]
      .filter((el) => {
        const r = el.getBoundingClientRect();
        const s = getComputedStyle(el);
        return r.width > 0 && r.height > 0 && s.display !== "none" && s.visibility !== "hidden";
      })
      .map((el) => {
        const r = el.getBoundingClientRect();
        return {
          name: (el.getAttribute("aria-label") || el.textContent || "").trim().replace(/\s+/g, " ").slice(0, 90),
          bottom: r.bottom,
          docBottom: r.bottom + scrollY
        };
      })
      .sort((a, b) => a.docBottom - b.docBottom);
    const last = candidates.at(-1) || null;
    return {
      tested: true,
      navMissing: false,
      navTop: Math.round(navRect.top),
      last,
      covered: Boolean(last && last.bottom > navRect.top + 1)
    };
  });
  if (result.navMissing || result.covered) fail("mobile_navigation_covers_action", { width, label, ...result });
  await page.evaluate(() => window.scrollTo(0, 0));
  return result;
}

async function capture(page, width, label, route, navigate = true) {
  let response = null;
  if (navigate) {
    response = await page.goto(base + route, { waitUntil: "networkidle" });
    if (!response || response.status() >= 400) fail("missing_core_route", { width, label, route, status: response?.status() ?? null });
    if (route !== "/login" && new URL(page.url()).pathname === "/login") fail("authentication_failure", { width, label, route });
  }
  await page.evaluate(() => window.scrollTo(0, 0));
  const metrics = await readMetrics(page, width, label);
  const file = `ui-artifacts/screenshots/${width}-${label}.png`;
  await page.screenshot({ path: file, fullPage: true });
  const reachability = await checkBottomReachability(page, width, label);
  report.pages.push({ width, label, route, url: page.url(), status: response?.status() ?? null, screenshot: file, metrics, reachability });
}

async function authenticate(page, width) {
  await page.goto(base + "/login", { waitUntil: "networkidle" });
  const email = page.getByLabel("E-mail");
  const password = page.getByLabel("Senha");
  await email.focus();
  const input = await email.evaluate((el) => ({ type: el.type, inputMode: el.inputMode, autocomplete: el.autocomplete, focused: document.activeElement === el }));
  await email.fill(process.env.BOOTSTRAP_OWNER_EMAIL);
  await password.fill(process.env.BOOTSTRAP_OWNER_PASSWORD);
  await page.getByRole("button", { name: "Entrar" }).click();
  try {
    await page.waitForURL("**/clientes", { timeout: 15000 });
    report.auth[width] = { success: true, input };
  } catch {
    report.auth[width] = { success: false, input, url: page.url() };
    fail("authentication_failure", { width, url: page.url() });
  }
}

async function verifySearch(page, width) {
  const result = { width, existing: false, empty: false, restored: false, semantic: false };
  await page.goto(base + "/clientes", { waitUntil: "networkidle" });
  let search = page.getByRole("searchbox", { name: "Buscar clientes" });
  result.semantic = await search.count() === 1;
  if (!result.semantic) {
    fail("search_not_tested", { width, reason: "accessible searchbox not found" });
    report.search.widths.push(result);
    return;
  }

  await search.fill("Maria da Conceição");
  await search.press("Enter");
  await page.waitForLoadState("networkidle");
  result.existing = (await page.locator("body").innerText()).includes(customerName);
  if (!result.existing) fail("search_existing_customer_failed", { width, url: page.url() });
  await capture(page, width, "clientes-busca-existente", "/clientes", false);

  search = page.getByRole("searchbox", { name: "Buscar clientes" });
  await search.fill("ZZZ CLIENTE INEXISTENTE ZZZ");
  await search.press("Enter");
  await page.waitForLoadState("networkidle");
  result.empty = await page.getByRole("heading", { name: "Nenhum cliente encontrado" }).isVisible().catch(() => false);
  if (!result.empty) fail("search_empty_state_failed", { width, url: page.url() });
  await capture(page, width, "clientes-busca-vazia", "/clientes", false);

  search = page.getByRole("searchbox", { name: "Buscar clientes" });
  await search.fill("");
  await search.press("Enter");
  await page.waitForLoadState("networkidle");
  const restoredBody = await page.locator("body").innerText();
  const emptyStateVisible = await page.getByRole("heading", { name: "Nenhum cliente encontrado" }).isVisible().catch(() => false);
  result.restored = restoredBody.includes(customerName) && !emptyStateVisible;
  if (!result.restored) fail("search_clear_restore_failed", { width, url: page.url() });
  await capture(page, width, "clientes-busca-restaurada", "/clientes", false);

  report.search.widths.push(result);
}

async function captureExpanded(page, width, route, summaryName, label) {
  const response = await page.goto(base + route, { waitUntil: "networkidle" });
  if (!response || response.status() >= 400) {
    fail("missing_core_route", { width, label, route, status: response?.status() ?? null });
    return;
  }
  const summary = page.locator("summary").filter({ hasText: summaryName }).first();
  if (!(await summary.count())) {
    fail("expanded_state_missing", { width, label, route, summaryName });
    return;
  }
  await summary.click();
  await page.waitForTimeout(100);
  await capture(page, width, label, route, false);
}

fs.mkdirSync("ui-artifacts/screenshots", { recursive: true });
const browser = await chromium.launch({ headless: true });
try {
  for (const width of widths) {
    const context = await browser.newContext({ viewport: { width, height: width === 1280 ? 800 : 844 }, isMobile: width < 600, hasTouch: width < 600 });
    const page = await context.newPage();
    page.on("pageerror", (error) => report.pageErrors.push({ width, message: error.message }));

    await capture(page, width, "login", "/login");
    await authenticate(page, width);
    if (!report.auth[width]?.success) {
      await context.close();
      continue;
    }

    const id = process.env.CUSTOMER_ID;
    const routes = [
      ["clientes", "/clientes"],
      ["novo-cliente", "/clientes/novo"],
      ["cliente-360", `/clientes/${id}`],
      ["editar-cliente", `/clientes/${id}/editar`],
      ["jornada", `/clientes/${id}/jornada`],
      ["criancas", `/clientes/${id}/criancas`]
    ];
    for (const [label, route] of routes) await capture(page, width, label, route);

    await verifySearch(page, width);
    await captureExpanded(page, width, `/clientes/${id}/jornada`, "Editar dados da gestação", "jornada-editar-gestacao");
    await captureExpanded(page, width, `/clientes/${id}/jornada`, "Confirmar nascimento", "jornada-confirmar-nascimento");
    await captureExpanded(page, width, `/clientes/${id}/criancas`, "Editar", "criancas-editar");

    await context.close();
  }
} finally {
  await browser.close();
}

report.search.tested = report.search.widths.length === widths.length && report.search.widths.every((x) => x.semantic && x.existing && x.empty && x.restored);
if (!report.search.tested) fail("search_not_tested", { widths: report.search.widths });
if (Object.values(report.auth).some((x) => !x.success) || Object.keys(report.auth).length !== widths.length) fail("authentication_failure", { auth: report.auth });
if (report.pageErrors.length) fail("browser_page_error", { errors: report.pageErrors });

fs.writeFileSync("ui-artifacts/report.json", JSON.stringify(report, null, 2));
console.log(JSON.stringify({
  pages: report.pages.length,
  widths: report.widths,
  search: report.search,
  failures: report.failures,
  pageErrors: report.pageErrors,
  informationalSmallControls: report.pages.reduce((count, page) => count + page.metrics.allSmall.length, 0)
}, null, 2));

if (report.failures.length) {
  throw new Error(`Foundation browser acceptance failed with ${report.failures.length} regression(s).`);
}
