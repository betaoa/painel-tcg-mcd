import { checkOrigin, getAssetStorage, NO_CACHE, putAsset, readAsset, readLimited, sanitizeReport, storageUnavailable } from "@/app/lib/published-assets";
export const runtime = "edge";
const KEY = "loja_perfeita_dados";

export async function GET(request: Request) {
  try {
    const { DB, BUCKET } = await getAssetStorage();
    const row = await readAsset(DB, KEY);
    if (!row?.complete) return Response.json({ vazio: true }, { headers: NO_CACHE });
    const metadata = { vazio: false, nome: row.name, quem: row.quem, quando: new Date(row.quando).toISOString() };
    if (new URL(request.url).searchParams.has("meta")) return Response.json(metadata, { headers: NO_CACHE });
    const object = await BUCKET.get(row.objectKey);
    if (!object) return storageUnavailable();
    return Response.json({ ...metadata, csv: await object.text() }, { headers: NO_CACHE });
  } catch { return storageUnavailable(); }
}

export async function POST(request: Request) {
  if (!checkOrigin(request)) return Response.json({ erro: "Abra a página Publicar o dia para enviar arquivos." }, { status: 403 });
  if (!request.headers.get("content-type")?.includes("application/json")) return Response.json({ erro: "Formato inválido." }, { status: 415 });
  let input: { nome: string; quem: string; csv: string; linhas: number };
  try {
    const body = JSON.parse(new TextDecoder().decode(await readLimited(request, 20_000_000)));
    if (typeof body.csv !== "string" || !String(body.quem || "").trim()) throw new Error("Informe o responsável pela publicação e o relatório.");
    input = { ...sanitizeReport(body.csv), nome: String(body.nome || "relatorio.csv").slice(0, 180), quem: String(body.quem).trim().slice(0, 100) };
  } catch (error) { return Response.json({ erro: error instanceof Error ? error.message : "Relatório inválido." }, { status: 400 }); }
  try {
    const { DB, BUCKET } = await getAssetStorage();
    const id = crypto.randomUUID(), now = Date.now();
    const objectKey = `loja-perfeita/dados/${id}.csv`;
    await BUCKET.put(objectKey, input.csv, { httpMetadata: { contentType: "text/csv; charset=utf-8" } });
    const asset = { key: KEY, name: input.nome, quem: input.quem, objectKey, parts: 1, complete: 1, quando: now };
    await DB.batch([putAsset(DB, { ...asset, key: `${KEY}:${id}` }), putAsset(DB, asset)]);
    return Response.json({ ok: true, linhas: input.linhas, quando: new Date(now).toISOString() }, { headers: NO_CACHE });
  } catch { return storageUnavailable(); }
}
