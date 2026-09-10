export const runtime = "edge";
export async function GET(request: Request) {
  const url = new URL(request.url);
  const { env } = await import("cloudflare:workers");
  const runtimeEnv = env as unknown as { WHATSAPP_VERIFY_TOKEN?: string };
  if (url.searchParams.get("hub.mode") === "subscribe" && runtimeEnv.WHATSAPP_VERIFY_TOKEN && url.searchParams.get("hub.verify_token") === runtimeEnv.WHATSAPP_VERIFY_TOKEN) return new Response(url.searchParams.get("hub.challenge") || "");
  return new Response("Verificação recusada", { status: 403 });
}
export async function POST(request: Request) {
  console.log("WhatsApp webhook", JSON.stringify(await request.json()));
  return new Response("EVENT_RECEIVED");
}
