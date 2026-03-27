/**
 * Cloudflare Worker — receives Linear webhooks and forwards to the local daemon
 * via Cloudflare Tunnel.
 *
 * Deploy: wrangler deploy
 * Config: set secrets via `wrangler secret put <NAME>`
 */

export interface Env {
  LINEAR_WEBHOOK_SECRET: string;
  TUNNEL_URL: string; // e.g. https://agent-daemon.your-tunnel.com
  TUNNEL_SECRET: string;
}

async function verifyLinearSignature(
  body: string,
  signature: string,
  secret: string
): Promise<boolean> {
  const encoder = new TextEncoder();
  const key = await crypto.subtle.importKey(
    "raw",
    encoder.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  );
  const sig = await crypto.subtle.sign("HMAC", key, encoder.encode(body));
  const expected = Array.from(new Uint8Array(sig))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");

  // Constant-time comparison
  if (expected.length !== signature.length) return false;
  let result = 0;
  for (let i = 0; i < expected.length; i++) {
    result |= expected.charCodeAt(i) ^ signature.charCodeAt(i);
  }
  return result === 0;
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    if (request.method !== "POST") {
      return new Response("Method not allowed", { status: 405 });
    }

    const url = new URL(request.url);
    if (url.pathname !== "/webhook/linear") {
      return new Response("Not found", { status: 404 });
    }

    // 1. Verify Linear signature
    const signature = request.headers.get("linear-signature");
    if (!signature) {
      return Response.json({ error: "Missing signature" }, { status: 401 });
    }

    const body = await request.text();
    const valid = await verifyLinearSignature(body, signature, env.LINEAR_WEBHOOK_SECRET);
    if (!valid) {
      return Response.json({ error: "Invalid signature" }, { status: 401 });
    }

    // 2. Forward to local daemon via tunnel
    try {
      const res = await fetch(`${env.TUNNEL_URL}/webhook/linear`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-Tunnel-Secret": env.TUNNEL_SECRET,
        },
        body,
      });

      const data = await res.text();
      return new Response(data, {
        status: res.status,
        headers: { "Content-Type": "application/json" },
      });
    } catch (err: any) {
      return Response.json(
        { error: "Failed to reach daemon", details: err.message },
        { status: 502 }
      );
    }
  },
};
