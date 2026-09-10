export const runtime = "edge";
export async function PATCH(request: Request, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params;
  const body = await request.json() as { status?: string; reason?: string };
  if (!body.status || !["approved", "rejected", "pending"].includes(body.status)) return Response.json({ error: "Status inválido." }, { status: 400 });
  const { env } = await import("cloudflare:workers");
  const runtimeEnv = env as unknown as { DB: D1Database };
  await runtimeEnv.DB.prepare("UPDATE campaign_photos SET status = ?, reason = ? WHERE id = ?").bind(body.status, body.reason || null, id).run();
  return Response.json({ ok: true });
}
