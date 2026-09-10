type RuntimeEnv = { DB: D1Database; BUCKET: R2Bucket };
export type PublishedAsset = { key: string; name: string; quem: string; objectKey: string; parts: number; quando: number; complete: number };
export const NO_CACHE = { "cache-control": "no-store" };

export async function getAssetStorage() {
  const { env } = await import("cloudflare:workers");
  return env as unknown as RuntimeEnv;
}
export function storageUnavailable() {
  return Response.json({ erro: "A publicação compartilhada está temporariamente indisponível. Sua seleção não foi perdida; tente novamente." }, { status: 503, headers: NO_CACHE });
}
export function checkOrigin(request: Request) {
  const origin = request.headers.get("origin");
  return (!origin || origin === new URL(request.url).origin) && request.headers.get("sec-fetch-site") !== "cross-site";
}
export async function readLimited(request: Request, max: number) {
  if (Number(request.headers.get("content-length")) > max) throw new Error("Arquivo acima do limite permitido.");
  const reader = request.body?.getReader();
  if (!reader) throw new Error("Arquivo vazio.");
  const chunks: Uint8Array[] = []; let size = 0;
  while (true) {
    const { value, done } = await reader.read();
    if (done) break;
    size += value.byteLength;
    if (size > max) { await reader.cancel(); throw new Error("Arquivo acima do limite permitido."); }
    chunks.push(value);
  }
  if (!size) throw new Error("Arquivo vazio.");
  const bytes = new Uint8Array(size); let offset = 0;
  for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.length; }
  return bytes;
}
export async function readAsset(DB: D1Database, key: string) {
  return DB.prepare("SELECT key, name, published_by AS quem, object_key AS objectKey, parts, updated_at AS quando, complete FROM published_assets WHERE key = ?").bind(key).first<PublishedAsset>();
}
export function putAsset(DB: D1Database, asset: PublishedAsset) {
  return DB.prepare("INSERT INTO published_assets (key, name, published_by, object_key, parts, complete, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?) ON CONFLICT(key) DO UPDATE SET name=excluded.name, published_by=excluded.published_by, object_key=excluded.object_key, parts=excluded.parts, complete=excluded.complete, updated_at=excluded.updated_at")
    .bind(asset.key, asset.name, asset.quem, asset.objectKey, asset.parts, asset.complete, asset.quando);
}

// Operational columns only. CPF, contacts and HR data are not published.
export function sanitizeReport(csv: string) {
  const text = csv.replace(/^\uFEFF/, "");
  const header = text.split(/\r?\n/, 1)[0];
  const separator = header.includes(";") ? ";" : header.includes("\t") ? "\t" : ",";
  const records: string[][] = []; let row: string[] = [], field = "", quoted = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (quoted) { if (ch === '"') { if (text[i + 1] === '"') { field += '"'; i++; } else quoted = false; } else field += ch; }
    else if (ch === '"') quoted = true;
    else if (ch === separator) { row.push(field); field = ""; }
    else if (ch === "\n") { row.push(field); records.push(row); row = []; field = ""; }
    else if (ch !== "\r") field += ch;
  }
  if (quoted) throw new Error("CSV inválido: aspas não fechadas.");
  if (field || row.length) { row.push(field); records.push(row); }
  const normalize = (value: string) => value.trim().normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
  const names = (records.shift() || []).map(normalize);
  const required = ["rotulo", "tipo de coleta", "ponto de venda", "responsavel", "status"];
  if (required.some(name => !names.includes(name))) throw new Error("Use o relatório de pesquisas com Rótulo, Tipo de Coleta, Ponto de Venda, Responsável e Status.");
  const allowed = new Set([...required, "id", "data de solicitacao", "data de conclusao", "data de expiracao", "justificada?", "justificada", "cnpj", "cidade", "rede"]);
  const selected = names.map((name, index) => ({ name, index })).filter(item => allowed.has(item.name));
  const lines = records.filter(record => record.some(value => value.trim()));
  if (!lines.length || lines.length > 60000) throw new Error("O relatório precisa ter entre 1 e 60 mil linhas.");
  const escape = (value: string) => `"${String(value || "").replaceAll('"', '""')}"`;
  return { csv: [selected.map(item => escape(item.name)).join(";"), ...lines.map(line => selected.map(item => escape(line[item.index])).join(";"))].join("\n"), linhas: lines.length };
}
