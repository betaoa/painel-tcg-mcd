import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import XLSX from "xlsx";
import { chromium } from "playwright";

const ROOT = process.cwd();
const DATA = path.join(ROOT, "app", "data");
const RUN = path.join(ROOT, "work", "daily-sync");
const TCG_BI_URL = process.env.TCG_BI_URL;
const MCD_BI_URL = process.env.MCD_BI_URL || "https://app.powerbi.com/home";
const STOCK_URL = process.env.STOCK_XLSX_URL;
const INVOLVES_URL = "https://mondelez.involves.com/login/#/";
const SHAREPOINT = {
  tcg: process.env.SHAREPOINT_TCG_URL,
  mcd: process.env.SHAREPOINT_MCD_URL,
  top: process.env.TOP_RETAIL_URL,
};
const SYNC_SCOPE = process.env.SYNC_SCOPE || "all";

fs.mkdirSync(RUN, { recursive: true });
const results = [];
const now = new Date();
const updatedAt = new Intl.DateTimeFormat("pt-BR", { timeZone: "America/Cuiaba" }).format(now);
const currentYear = Number(new Intl.DateTimeFormat("en", { year: "numeric", timeZone: "America/Cuiaba" }).format(now));

function required(...names) {
  for (const name of names) if (!process.env[name]) throw new Error(`Secret ausente: ${name}`);
}
function digits(value) { return String(value ?? "").replace(/\D/g, ""); }
function cnpj(value) { const d = digits(value); return d.length >= 14 ? d.slice(-14) : ""; }
function cnpjFormatted(d) { return d.replace(/^(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})$/, "$1.$2.$3/$4-$5"); }
function norm(value) { return String(value ?? "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").trim().toUpperCase(); }
function number(value) {
  if (typeof value === "number") return Number.isFinite(value) ? value : 0;
  const raw = String(value ?? "").replace(/R\$/gi, "").replace(/\s/g, "");
  if (!raw) return 0;
  const normalized = raw.includes(",") ? raw.replace(/\./g, "").replace(",", ".") : raw;
  const parsed = Number(normalized);
  return Number.isFinite(parsed) ? parsed : 0;
}
function json(file) { return JSON.parse(fs.readFileSync(path.join(DATA, file), "utf8")); }
function atomic(file, value) {
  const target = path.join(DATA, file);
  const temp = `${target}.tmp`;
  fs.writeFileSync(temp, `${JSON.stringify(value, null, 2)}\n`);
  fs.renameSync(temp, target);
}
function hash(file) { return crypto.createHash("sha256").update(fs.readFileSync(file)).digest("hex"); }
function workbookRows(file) {
  const wb = XLSX.readFile(file, { cellDates: false });
  return wb.SheetNames.flatMap((sheet) => XLSX.utils.sheet_to_json(wb.Sheets[sheet], { defval: "", raw: false }));
}
function field(row, patterns) {
  const key = Object.keys(row).find((candidate) => patterns.some((p) => norm(candidate).includes(p)));
  return key ? row[key] : "";
}
function bestSheet(file, requiredGroups) {
  const wb = XLSX.readFile(file, { cellDates: false });
  const candidates = wb.SheetNames.map((sheet) => ({ rows: XLSX.utils.sheet_to_json(wb.Sheets[sheet], { defval: "", raw: false }) }));
  candidates.sort((a, b) => {
    const score = (item) => item.rows.filter((row) => requiredGroups.every((group) => field(row, group) !== "")).length;
    return score(b) - score(a);
  });
  return candidates[0]?.rows || [];
}
async function step(name, fn) {
  try {
    const detail = await fn();
    results.push({ name, ok: true, detail });
    console.log(`✅ ${name}: ${detail}`);
  } catch (error) {
    results.push({ name, ok: false, detail: error.message });
    console.log(`❌ ${name}: ${error.message}`);
  }
}
async function download(url, file) {
  const response = await fetch(url, { redirect: "follow" });
  if (!response.ok) throw new Error(`download HTTP ${response.status}`);
  fs.writeFileSync(file, Buffer.from(await response.arrayBuffer()));
  return file;
}

function importRoute(file, output, branch) {
  const rows = bestSheet(file, [["CNPJ"], ["CIDADE", "MUNICIPIO"], ["PROMOTOR"]]);
  const clean = rows.map((row, index) => {
    const idCnpj = cnpj(field(row, ["CNPJ"]));
    const city = field(row, ["CIDADE", "MUNICIPIO"]);
    if (!idCnpj || !city) return null;
    const days = String(field(row, ["DIA VISITA", "DIAS VISITA", "ROTEIRO"])).split(/[;,/|]+/).map((v) => v.trim()).filter(Boolean);
    const store = field(row, ["FANTASIA", "LOJA", "PDV"]);
    const legal = field(row, ["RAZAO SOCIAL", "RAZAO"]);
    return {
      id: `${idCnpj}-${norm(city)}-${index}`, ...(branch === "MCD" ? { filial: "MCD" } : {}),
      cidade: String(city).trim(), promotor: String(field(row, ["PROMOTOR"])).trim(),
      vendedor: String(field(row, ["VENDEDOR"])).trim(), loja: String(store || legal).trim(),
      razaoSocial: String(legal || store).trim(), enderecoComercial: String(field(row, ["ENDERECO"])).trim(),
      cnpj: idCnpj, cnpjFormatado: cnpjFormatted(idCnpj), diasVisita: days,
      diaVisita: days.join(" • ") || String(field(row, ["DIA"])).trim(), frequencia: days.length || 1,
      rede: String(field(row, ["REDE", "BANDEIRA"])).trim() || "REDE NÃO IDENTIFICADA",
      abril: 0, maio: 0, junho: 0, media: 0, fonteFaturamento: "Somente Power BI",
    };
  }).filter(Boolean);
  if (clean.length < 20) throw new Error(`roteiro inválido: somente ${clean.length} CNPJs reconhecidos`);
  atomic(output, { meta: { source: path.basename(file), branch, generatedAt: now.toISOString().slice(0, 10), rows: clean.length, privacy: "Dados pessoais e de RH excluídos.", revenueSource: "Exclusivamente Power BI por CNPJ completo." }, rows: clean });
  return `${clean.length} lojas`;
}

function importStock(file) {
  const rows = workbookRows(file).map((row) => ({
    cnpj: cnpj(field(row, ["CNPJ"])), loja: String(field(row, ["LOJA", "PDV", "FANTASIA"])).trim(),
    cidade: String(field(row, ["CIDADE", "MUNICIPIO"])).trim(), produto: String(field(row, ["PRODUTO", "ITEM", "SKU"])).trim(),
    estoque: number(field(row, ["ESTOQUE", "SALDO", "QUANTIDADE"])), data: String(field(row, ["DATA", "ATUALIZACAO"])).trim(),
  })).filter((row) => row.cnpj || row.loja || row.produto);
  if (!rows.length) throw new Error("nenhuma linha de estoque reconhecida");
  atomic("stock-control.json", { meta: { source: "Google Sheets - Controle de estoque", updatedAt, status: "atualizado", rows: rows.length }, rows });
  return `${rows.length} linhas`;
}

function importTopRetail(file) {
  const rows = bestSheet(file, [["CNPJ"], ["RAZAO", "FANTASIA", "LOJA"]]);
  const stores = rows.map((row) => {
    const id = cnpj(field(row, ["CNPJ"]));
    if (!id) return null;
    const rawStatus = norm(field(row, ["STATUS", "SITUACAO"]));
    const statusGroup = rawStatus.includes("APROV") ? "approved" : rawStatus.includes("PEND") ? "pending" : "unread";
    return {
      cnpj: id, razaoSocial: String(field(row, ["RAZAO SOCIAL", "RAZAO"])).trim(),
      fantasia: String(field(row, ["FANTASIA", "LOJA", "PDV"])).trim(), rede: String(field(row, ["REDE", "BANDEIRA"])).trim(),
      tier: String(field(row, ["TIER", "CLASSIFICACAO", "OURO", "PRATA"])).trim(), owner: String(field(row, ["RESPONSAVEL", "OWNER"])).trim(),
      cidade: String(field(row, ["CIDADE", "MUNICIPIO"])).trim(), bairro: String(field(row, ["BAIRRO"])).trim(),
      equipe: String(field(row, ["EQUIPE"])).trim(), setor: String(field(row, ["SETOR"])).trim(),
      statusCode: number(field(row, ["CODIGO STATUS", "STATUS CODE"])), status: String(field(row, ["STATUS", "SITUACAO"])).trim(),
      statusGroup, observations: String(field(row, ["OBSERVACAO"])).trim(),
    };
  }).filter(Boolean);
  if (stores.length < 5) throw new Error(`Top Varejista inválido: somente ${stores.length} CNPJs reconhecidos`);
  const count = (value) => stores.filter((store) => store.statusGroup === value).length;
  atomic("top-varejista.json", { meta: { source: path.basename(file), branch: "MCD MS", updatedAt, privacy: "Somente dados operacionais e comerciais." }, summary: { stores: stores.length, approved: count("approved"), pending: count("pending"), unread: count("unread") }, stores });
  return `${stores.length} lojas`;
}

async function microsoftLogin(page, user, password) {
  await page.locator('input[type="email"], input[name="loginfmt"]').waitFor({ timeout: 45000 });
  await page.locator('input[type="email"], input[name="loginfmt"]').fill(user);
  await page.locator("#idSIButton9").or(page.getByRole("button", { name: /next|avançar|próximo|continuar/i })).first().click();
  await page.locator('input[type="password"]').waitFor({ timeout: 30000 });
  await page.locator('input[type="password"]').fill(password);
  await page.locator("#idSIButton9").or(page.getByRole("button", { name: /sign in|entrar|conectar/i })).first().click();
  const stay = page.getByRole("button", { name: /yes|sim/i });
  if (await stay.isVisible({ timeout: 8000 }).catch(() => false)) await stay.click();
}
async function waitForPowerBiReport(page, branch) {
  try {
    await page.getByText(/Tabela Dados/i).first().waitFor({ timeout: 120000 });
  } catch {
    const signals = [];
    const known = [
      [/approve sign in request|aprovar solicitação de entrada|código de verificação/i, "MFA pendente"],
      [/more information required|mais informações necessárias/i, "cadastro de segurança pendente"],
      [/segurança em nível de linha|\bRLS\b/i, "sem permissão RLS"],
      [/access denied|acesso negado|you don't have access|você não tem acesso/i, "acesso negado"],
      [/incorrect|incorreta|não conseguimos entrar|couldn't sign you in/i, "login recusado"],
    ];
    for (const [pattern, label] of known) if (await page.getByText(pattern).first().isVisible({ timeout: 1000 }).catch(() => false)) signals.push(label);
    if (await page.locator('#email, input[placeholder*="email" i]').first().isVisible().catch(() => false)) signals.push("ainda no primeiro email do Power BI");
    if (await page.locator('input[type="email"], input[name="loginfmt"]').first().isVisible().catch(() => false)) signals.push("ainda na tela de usuário");
    if (await page.locator('input[type="password"]').first().isVisible({ timeout: 1000 }).catch(() => false)) signals.push("ainda na tela de senha");
    const host = new URL(page.url()).hostname;
    const title = (await page.title()).replace(/[\r\n]+/g, " ").slice(0, 100);
    throw new Error(`${branch}: relatório não abriu (${signals.join(", ") || "estado não reconhecido"}; página ${host}; título ${title})`);
  }
}
async function sharePointDownload(context, url, file) {
  const page = await context.newPage();
  await page.goto(url, { waitUntil: "domcontentloaded", timeout: 60000 });
  if (await page.locator('input[type="email"]').isVisible().catch(() => false)) {
    required("SHAREPOINT_USER", "SHAREPOINT_PASSWORD");
    await microsoftLogin(page, process.env.SHAREPOINT_USER, process.env.SHAREPOINT_PASSWORD);
  }
  const direct = new URL(url);
  direct.searchParams.set("action", "download");
  direct.searchParams.set("download", "1");
  const response = await context.request.get(direct.toString(), { timeout: 60000 });
  if (!response.ok()) throw new Error(`download HTTP ${response.status()}`);
  const body = await response.body();
  if (body.length < 1024 || body[0] !== 0x50 || body[1] !== 0x4b) throw new Error("SharePoint não devolveu um arquivo Excel");
  fs.writeFileSync(file, body);
  await page.close();
  return file;
}

function previousThreeMonths() {
  const labels = ["janeiro", "fevereiro", "março", "abril", "maio", "junho", "julho", "agosto", "setembro", "outubro", "novembro", "dezembro"];
  return [3, 2, 1].map((back) => { const d = new Date(now.getFullYear(), now.getMonth() - back, 1); return { label: labels[d.getMonth()], month: d.getMonth() + 1, year: d.getFullYear() }; });
}
async function clickText(page, pattern) {
  const target = page.getByText(pattern, { exact: false }).first(); await target.waitFor({ timeout: 30000 }); await target.click({ force: true });
}
async function selectSlicer(page, title, value) {
  const visual = page.locator('[class*="visual-container"]').filter({ hasText: new RegExp(title, "i") }).first();
  await visual.click();
  const escaped = String(value).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const option = page.getByText(new RegExp(`^${escaped}$`, "i")).last(); await option.waitFor({ timeout: 15000 }); await option.click();
  await page.waitForTimeout(2500);
}
async function exportPowerBiTable(page, target) {
  const visual = page.locator('[class*="visual-container"]').filter({ hasText: /CNPJ/i }).filter({ hasText: /FATUR|VALOR/i }).first();
  await visual.waitFor({ timeout: 60000 });
  await visual.hover(); await visual.getByRole("button", { name: /more options|mais opções/i }).click();
  await clickText(page, /export data|exportar dados/i);
  const pending = page.waitForEvent("download", { timeout: 60000 });
  await page.getByRole("dialog").getByRole("button", { name: /^exportar$|^export$/i }).click();
  const item = await pending; await item.saveAs(target);
}
function parseRevenue(files, routeFile, branch) {
  const allowed = new Set(json(routeFile).rows.map((row) => row.cnpj));
  const keys = ["junho", "julho", "agosto"];
  const out = { meta: { branch, supplier: "MONDELEZ", updatedAt, source: `Power BI ${branch} MS`, status: "validated", period: files.map((f) => `${f.period.label}/${f.period.year}`).join(" • "), method: "Exportação mensal completa, conciliada pelo CNPJ completo do roteiro." }, totals: {}, unclassified: {}, networks: {}, cnpjs: {} };
  files.forEach(({ file, period }, index) => {
    const rows = workbookRows(file); const values = {};
    for (const row of rows) { const id = cnpj(field(row, ["CNPJ"])); if (!id || !allowed.has(id)) continue; values[id] = (values[id] || 0) + number(field(row, ["FATURADO", "FATURAMENTO", "VALOR"])); }
    if (!Object.keys(values).length) throw new Error(`${period.label}: nenhum CNPJ do roteiro encontrado`);
    const key = keys[index]; out.cnpjs[key] = values; out.totals[key] = Object.values(values).reduce((a, b) => a + b, 0);
    out.unclassified[key] = 0; out.networks[key] = {}; out.meta[key] = { month: period.month, year: period.year, rows: rows.length, sha256: hash(file) };
  });
  atomic(branch === "TCG" ? "power-bi-revenue.json" : "mcd-power-bi-revenue.json", out);
  return `${Object.values(out.cnpjs).reduce((n, group) => n + Object.keys(group).length, 0)} vínculos CNPJ/mês`;
}
async function powerBi(browser, branch, user, password, url, routeFile) {
  required(user, password);
  const isolated = await browser.newContext({ acceptDownloads: true, locale: "pt-BR", timezoneId: "America/Cuiaba" });
  try {
    const page = await isolated.newPage();
    await page.goto(url, { waitUntil: "domcontentloaded", timeout: 60000 });
    const email = page.locator('input[type="email"], input[name="loginfmt"]').first();
    const powerBiEmail = page.locator('#email, input[placeholder*="email" i]').first();
    await powerBiEmail.or(email).waitFor({ state: "visible", timeout: 30000 }).catch(() => {});
    if (await powerBiEmail.isVisible().catch(() => false)) {
      await powerBiEmail.fill(process.env[user]);
      await page.getByRole("button", { name: /Enviar|Submit/i }).first().click();
      await email.waitFor({ state: "visible", timeout: 45000 }).catch(() => {});
    } else if (!(await email.isVisible().catch(() => false))) {
      const signIn = page.getByRole('link', { name: /^Entrar$|^Sign in$/i }).or(page.getByRole('button', { name: /^Entrar$|^Sign in$/i })).first();
      if (await signIn.isVisible().catch(() => false)) await signIn.click();
      await email.waitFor({ state: "visible", timeout: 45000 }).catch(() => {});
    }
    if (await email.isVisible().catch(() => false)) {
      await microsoftLogin(page, process.env[user], process.env[password]);
    }
    if (branch === "MCD" && !process.env.MCD_BI_URL) await clickText(page, /BI MCD MS/i);
    await waitForPowerBiReport(page, branch);
    if (await page.getByText(/segurança em nível de linha|\bRLS\b/i).isVisible({ timeout: 5000 }).catch(() => false)) throw new Error(`a conta ${branch} abriu o relatório sem permissão RLS`);
    if (process.env.PROBE_ONLY === "true") return `${branch}: relatório aberto sem exportação`;
    const exports = [];
    for (const period of previousThreeMonths()) {
      await selectSlicer(page, "Mês", period.label); await selectSlicer(page, "Ano", period.year); await selectSlicer(page, "Filial", branch);
      await selectSlicer(page, "Fornecedor", "MONDELEZ").catch(() => selectSlicer(page, "razao_for", "MONDELEZ"));
      const file = path.join(RUN, `${branch}-${period.year}-${String(period.month).padStart(2, "0")}.xlsx`);
      await exportPowerBiTable(page, file); exports.push({ file, period });
    }
    return parseRevenue(exports, routeFile, branch);
  } finally {
    await isolated.close();
  }
}

async function involves(context) {
  required("INVOLVES_USER", "INVOLVES_PASSWORD");
  const page = await context.newPage(); await page.goto(INVOLVES_URL, { waitUntil: "domcontentloaded", timeout: 60000 });
  await page.locator('input[type="text"], input[name*="user" i]').first().fill(process.env.INVOLVES_USER);
  await page.locator('input[type="password"]').fill(process.env.INVOLVES_PASSWORD);
  await page.getByRole("button", { name: /entrar|login|acessar/i }).click();
  await clickText(page, /^Pesquisas$/i); await clickText(page, /Painel de pesquisas/i);
  const dates = page.locator('input[placeholder*="data" i], input[type="date"]');
  if (await dates.count() < 2) throw new Error("campos de período não encontrados");
  await dates.nth(0).fill(`01/09/${currentYear}`); await dates.nth(1).fill(updatedAt);
  await page.getByRole("button", { name: /filtrar/i }).click(); await page.waitForTimeout(5000);
  await clickText(page, /Opções/i);
  const exports = [];
  for (const label of [/Exportar registros/i, /Exportar com foto/i]) {
    const pending = page.waitForEvent("download", { timeout: 90000 }); await clickText(page, label); const item = await pending;
    const file = path.join(RUN, await item.suggestedFilename()); await item.saveAs(file); exports.push({ name: path.basename(file), bytes: fs.statSync(file).size, sha256: hash(file) });
    await clickText(page, /Opções/i).catch(() => {});
  }
  await page.close();
  atomic("loja-perfeita-daily.json", { meta: { source: "Involves - Painel de pesquisas", updatedAt, period: `01/09/${currentYear} a ${updatedAt}`, status: "exportado" }, exports });
  return `${exports.length} exportações validadas; arquivos brutos não publicados`;
}

const browser = await chromium.launch({ headless: true });
const context = await browser.newContext({ acceptDownloads: true, locale: "pt-BR", timezoneId: "America/Cuiaba" });
required("TCG_BI_URL", "STOCK_XLSX_URL", "SHAREPOINT_TCG_URL", "SHAREPOINT_MCD_URL", "TOP_RETAIL_URL");
if (SYNC_SCOPE === "all") await step("Estoque Google Sheets", async () => importStock(await download(STOCK_URL, path.join(RUN, "estoque.xlsx"))));
if (SYNC_SCOPE === "all") await step("Roteiro TCG SharePoint", async () => importRoute(await sharePointDownload(context, SHAREPOINT.tcg, path.join(RUN, "roteiro-tcg.xlsx")), "seed-data.json", "TCG"));
if (SYNC_SCOPE === "all") await step("Roteiro MCD SharePoint", async () => importRoute(await sharePointDownload(context, SHAREPOINT.mcd, path.join(RUN, "roteiro-mcd.xlsx")), "mcd-route.json", "MCD"));
if (SYNC_SCOPE === "all") await step("Top Varejista SharePoint", async () => importTopRetail(await sharePointDownload(context, SHAREPOINT.top, path.join(RUN, "top-varejista.xlsx"))));
if (SYNC_SCOPE === "all" || SYNC_SCOPE === "tcg") await step("Power BI TCG", () => powerBi(browser, "TCG", "TCG_BI_USER", "TCG_BI_PASSWORD", TCG_BI_URL, "seed-data.json"));
if (SYNC_SCOPE === "all" || SYNC_SCOPE === "mcd") await step("Power BI MCD", () => powerBi(browser, "MCD", "MCD_BI_USER", "MCD_BI_PASSWORD", MCD_BI_URL, "mcd-route.json"));
if (SYNC_SCOPE === "all") await step("Involves Loja Perfeita", () => involves(context));
await browser.close();
const summary = results.map((item) => `${item.ok ? "✅" : "❌"} ${item.name}: ${item.detail}`).join("\n");
console.log(summary);
if (process.env.GITHUB_STEP_SUMMARY) fs.appendFileSync(process.env.GITHUB_STEP_SUMMARY, `## Atualização diária\n\n${summary}\n`);
if (results.every((item) => !item.ok)) process.exitCode = 1;
