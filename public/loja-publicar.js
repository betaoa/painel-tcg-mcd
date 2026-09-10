"use strict";
const $ = selector => document.querySelector(selector);
const API_DADOS = "/api/public/dados", API_FOTOS = "/api/public/fotos", CHUNK = 3 * 1024 * 1024;
const selected = { Csv: null, Pdf: null };
let busy = false;
function message(id, text, state = "") { const node = $(id); node.textContent = text; node.className = "status " + state; }
function dateLabel(value) { return new Date(value).toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" }); }
async function api(url, options) {
  const response = await fetch(url, { ...options, cache: "no-store" });
  const result = await response.json().catch(() => ({ erro: "Resposta inesperada do servidor. Tente novamente." }));
  if (!response.ok) throw new Error(result.erro || "Não foi possível publicar.");
  return result;
}
function refreshButton() { $("#publish").disabled = busy || !(selected.Csv || selected.Pdf); }
function choose(kind, file) {
  if (busy || !file) return;
  const valid = kind === "Pdf" ? /\.pdf$/i.test(file.name) && file.size <= 40 * CHUNK : /\.(csv|txt|xlsx|xls)$/i.test(file.name) && file.size <= 18 * 1024 * 1024;
  if (!valid || !file.size) { message("#st" + kind, "Arquivo inválido ou acima do limite indicado.", "erro"); return; }
  selected[kind] = file; $("#name" + kind).textContent = file.name;
  message("#st" + kind, "Selecionado. Aguardando sua confirmação para publicar."); refreshButton();
}
for (const kind of ["Csv", "Pdf"]) {
  const input = $("#file" + kind), drop = $("#drop" + kind);
  $("#btn" + kind).addEventListener("click", () => input.click());
  input.addEventListener("change", () => { choose(kind, input.files[0]); input.value = ""; });
  for (const name of ["dragenter", "dragover"]) drop.addEventListener(name, event => { event.preventDefault(); drop.classList.add("over"); });
  for (const name of ["dragleave", "drop"]) drop.addEventListener(name, event => { event.preventDefault(); drop.classList.remove("over"); });
  drop.addEventListener("drop", event => choose(kind, event.dataTransfer.files[0]));
}
async function reportText(file) {
  if (/\.xlsx?$/i.test(file.name)) {
    if (!window.XLSX) await new Promise((resolve, reject) => { const script = document.createElement("script"); script.src = "/xlsx.full.min.js"; script.onload = resolve; script.onerror = () => reject(new Error("Não foi possível abrir o Excel. Exporte em CSV e tente novamente.")); document.head.appendChild(script); });
    const workbook = XLSX.read(await file.arrayBuffer(), { type: "array" });
    for (const sheet of workbook.SheetNames) {
      const csv = XLSX.utils.sheet_to_csv(workbook.Sheets[sheet], { FS: ";" });
      if (validHeader(csv)) return csv;
    }
    throw new Error("Nenhuma aba contém as colunas do relatório de pesquisas.");
  }
  const bytes = await file.arrayBuffer();
  let text = new TextDecoder("utf-8").decode(bytes);
  if (text.includes("\uFFFD")) text = new TextDecoder("windows-1252").decode(bytes);
  if (!validHeader(text)) throw new Error("Faltam as colunas Rótulo, Tipo de Coleta, Ponto de Venda, Responsável e Status.");
  return text.replace(/^\uFEFF/, "");
}
function validHeader(text) { const header = text.split(/\r?\n/, 1)[0].normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase(); return ["rotulo", "tipo de coleta", "ponto de venda", "responsavel", "status"].every(name => header.includes(name)); }
async function publishReport(file, quem) {
  message("#stCsv", "Validando e publicando relatório…");
  const csv = await reportText(file);
  const result = await api(API_DADOS, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ csv, nome: file.name, quem }) });
  message("#stCsv", `${result.linhas} linhas publicadas para a equipe.`, "ok"); selected.Csv = null;
}
async function publishPhotos(file, quem) {
  if (new TextDecoder().decode(await file.slice(0, 5).arrayBuffer()) !== "%PDF-") throw new Error("O arquivo selecionado não é um PDF válido.");
  const parts = Math.ceil(file.size / CHUNK);
  const { id } = await api(API_FOTOS + "?acao=iniciar", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ nome: file.name, quem, partes: parts }) });
  const progress = $("#progressPdf"); progress.hidden = false; progress.value = 0;
  for (let part = 0; part < parts; part++) {
    message("#stPdf", `Enviando fotos: parte ${part + 1} de ${parts}…`);
    await api(API_FOTOS + "?" + new URLSearchParams({ envio: id, parte: String(part) }), { method: "POST", headers: { "content-type": "application/octet-stream" }, body: file.slice(part * CHUNK, (part + 1) * CHUNK) });
    progress.value = Math.round((part + 1) / parts * 100);
  }
  await api(API_FOTOS + "?" + new URLSearchParams({ acao: "concluir", envio: id }), { method: "POST" });
  message("#stPdf", "PDF publicado. A galeria processará e vinculará as fotos ao abrir o painel.", "ok"); selected.Pdf = null;
}
async function current() {
  for (const [kind, url] of [["Csv", API_DADOS + "?meta=1"], ["Pdf", API_FOTOS]]) {
    try { const data = await api(url); $("#atual" + kind).textContent = data.vazio ? "Nenhum arquivo compartilhado publicado ainda." : `${data.nome} • ${data.quem} • ${dateLabel(data.quando)}`; }
    catch { $("#atual" + kind).textContent = "Publicação compartilhada indisponível no momento."; }
  }
}
$("#publish").addEventListener("click", async () => {
  const quem = $("#quem").value.trim();
  if (!quem) { message("#result", "Informe seu nome antes de publicar.", "erro"); $("#quem").focus(); return; }
  if (busy) return; busy = true; refreshButton();
  message("#result", "Publicando os arquivos selecionados. Mantenha esta página aberta.");
  let failed = false;
  for (const [kind, publish] of [["Csv", publishReport], ["Pdf", publishPhotos]]) {
    if (!selected[kind]) continue;
    try { await publish(selected[kind], quem); } catch (error) { failed = true; message("#st" + kind, error.message, "erro"); }
  }
  busy = false; refreshButton(); await current();
  message("#result", failed ? "Um arquivo não foi publicado. Confira a mensagem acima e tente novamente; os arquivos concluídos já estão disponíveis." : "Publicação concluída. Reabra o painel para carregar agora; as páginas abertas verificam atualizações a cada 2 minutos.", failed ? "erro" : "ok");
});
window.addEventListener("beforeunload", event => { if (busy) { event.preventDefault(); event.returnValue = ""; } });
current();
