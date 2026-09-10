import { checkOrigin, getAssetStorage, NO_CACHE, putAsset, readAsset, readLimited, storageUnavailable } from "@/app/lib/published-assets";
export const runtime = "edge";
const KEY = "loja_perfeita_fotos";
const ID = /^[a-f0-9-]{36}$/;
const PART_SIZE = 3 * 1024 * 1024;

export async function GET(request: Request) {
  try {
    const { DB, BUCKET } = await getAssetStorage();
    const url = new URL(request.url), version = url.searchParams.get("versao");
    if (version && !ID.test(version)) return Response.json({ erro: "Versão inválida." }, { status: 400 });
    const row = await readAsset(DB, version ? `${KEY}:${version}` : KEY);
    if (!row?.complete) return Response.json({ vazio: true }, { headers: NO_CACHE });
    const part = url.searchParams.get("parte");
    if (part !== null) {
      const index = Number(part);
      if (!Number.isInteger(index) || index < 0 || index >= row.parts) return Response.json({ erro: "Parte inválida." }, { status: 400 });
      const object = await BUCKET.get(`${row.objectKey}/${index}.bin`);
      if (!object) return storageUnavailable();
      return new Response(object.body, { headers: { ...NO_CACHE, "content-type": "application/octet-stream", "x-content-type-options": "nosniff" } });
    }
    return Response.json({ vazio: false, versao: row.objectKey.split("/").at(-1), partes: row.parts, nome: row.name, quem: row.quem, quando: new Date(row.quando).toISOString() }, { headers: NO_CACHE });
  } catch { return storageUnavailable(); }
}

export async function POST(request: Request) {
  if (!checkOrigin(request)) return Response.json({ erro: "Abra a página Publicar o dia para enviar arquivos." }, { status: 403 });
  const url = new URL(request.url), action = url.searchParams.get("acao");
  try {
    const { DB, BUCKET } = await getAssetStorage();
    if (action === "iniciar") {
      const body = JSON.parse(new TextDecoder().decode(await readLimited(request, 4096)));
      const parts = Number(body.partes);
      if (!Number.isInteger(parts) || parts < 1 || parts > 40 || !String(body.quem || "").trim()) return Response.json({ erro: "PDF de até 120 MB e responsável são obrigatórios." }, { status: 400 });
      const id = crypto.randomUUID();
      await putAsset(DB, { key: `${KEY}:${id}`, name: String(body.nome || "fotos.pdf").slice(0, 180), quem: String(body.quem).trim().slice(0, 100), objectKey: `loja-perfeita/fotos/${id}`, parts, complete: 0, quando: Date.now() }).run();
      return Response.json({ id }, { headers: NO_CACHE });
    }
    const id = url.searchParams.get("envio") || "";
    if (!ID.test(id)) return Response.json({ erro: "Envio inválido. Selecione o PDF novamente." }, { status: 400 });
    const upload = await readAsset(DB, `${KEY}:${id}`);
    if (!upload || Date.now() - upload.quando > 24 * 60 * 60 * 1000) return Response.json({ erro: "Envio expirado. Reinicie o envio." }, { status: 410 });
    if (upload.complete) return Response.json({ ok: true, completo: true }, { headers: NO_CACHE });
    if (action === "concluir") {
      for (let part = 0; part < upload.parts; part++) {
        if (!await BUCKET.head(`${upload.objectKey}/${part}.bin`)) return Response.json({ erro: `Parte ${part + 1} ainda não foi recebida. O PDF anterior permanece publicado.` }, { status: 409 });
      }
      const completed = { ...upload, complete: 1, quando: Date.now() };
      await DB.batch([putAsset(DB, completed), putAsset(DB, { ...completed, key: KEY })]);
      return Response.json({ ok: true, completo: true }, { headers: NO_CACHE });
    }
    const partText = url.searchParams.get("parte"), part = Number(partText);
    if (partText === null || !Number.isInteger(part) || part < 0 || part >= upload.parts) return Response.json({ erro: "Parte inválida." }, { status: 400 });
    const bytes = await readLimited(request, PART_SIZE);
    if (part < upload.parts - 1 && bytes.byteLength !== PART_SIZE) return Response.json({ erro: "Parte incompleta. Tente novamente." }, { status: 400 });
    if (part === 0 && new TextDecoder().decode(bytes.slice(0, 5)) !== "%PDF-") return Response.json({ erro: "Este arquivo não é um PDF válido." }, { status: 400 });
    await BUCKET.put(`${upload.objectKey}/${part}.bin`, bytes, { httpMetadata: { contentType: "application/octet-stream" } });
    return Response.json({ ok: true, parte: part, completo: false }, { headers: NO_CACHE });
  } catch (error) {
    if (error instanceof SyntaxError || (error instanceof Error && /Arquivo (vazio|acima)/.test(error.message))) return Response.json({ erro: "Arquivo inválido ou acima do limite." }, { status: 400 });
    return storageUnavailable();
  }
}
