export const runtime = "edge";
type RuntimeEnv = { DB: D1Database; BUCKET: R2Bucket; OPENAI_API_KEY?: string };
async function getRuntimeEnv() {
  const { env } = await import("cloudflare:workers");
  return env as unknown as RuntimeEnv;
}

export async function GET(request: Request) {
  const month = new URL(request.url).searchParams.get("month") || "2026-09";
  const runtimeEnv = await getRuntimeEnv();
  const result = await runtimeEnv.DB.prepare("SELECT id, store, promoter, campaign, month, filename, status, reason, source, created_at AS createdAt FROM campaign_photos WHERE month = ? ORDER BY created_at DESC").bind(month).all();
  return Response.json({ photos: result.results });
}

export async function POST(request: Request) {
  const runtimeEnv = await getRuntimeEnv();
  const form = await request.formData();
  const file = form.get("photo");
  const store = String(form.get("store") || "").trim();
  const promoter = String(form.get("promoter") || "").trim();
  const campaign = String(form.get("campaign") || "").trim();
  const month = String(form.get("month") || "2026-09");
  if (!(file instanceof File) || !store || !promoter || !campaign) return Response.json({ error: "Preencha loja, promotor, campanha e foto." }, { status: 400 });
  if (!file.type.startsWith("image/") || file.size > 12 * 1024 * 1024) return Response.json({ error: "Envie uma imagem de até 12 MB." }, { status: 400 });
  const id = crypto.randomUUID();
  const objectKey = `campaigns/${month}/${id}-${file.name.replace(/[^a-zA-Z0-9._-]/g, "_")}`;
  await runtimeEnv.BUCKET.put(objectKey, await file.arrayBuffer(), { httpMetadata: { contentType: file.type } });
  const status = runtimeEnv.OPENAI_API_KEY ? "processing" : "pending";
  const reason = runtimeEnv.OPENAI_API_KEY ? "Análise automática iniciada" : "Aguardando conexão da IA de visão";
  await runtimeEnv.DB.prepare("INSERT INTO campaign_photos (id, store, promoter, campaign, month, object_key, filename, content_type, status, reason, source, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'manual', ?)").bind(id, store, promoter, campaign, month, objectKey, file.name, file.type, status, reason, Date.now()).run();
  return Response.json({ id, status, reason }, { status: 201 });
}
