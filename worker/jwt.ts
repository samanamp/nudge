/**
 * Minimal stateless session token (HMAC-SHA256), no dependencies.
 * Not a full JWT library — just enough for signed, expiring sessions.
 */

const enc = new TextEncoder();
const dec = new TextDecoder();

function b64urlEncode(bytes: Uint8Array): string {
  let bin = "";
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function b64urlDecode(s: string): Uint8Array {
  const pad = s.length % 4 ? "=".repeat(4 - (s.length % 4)) : "";
  const bin = atob(s.replace(/-/g, "+").replace(/_/g, "/") + pad);
  return Uint8Array.from(bin, (c) => c.charCodeAt(0));
}

async function key(secret: string): Promise<CryptoKey> {
  return crypto.subtle.importKey(
    "raw",
    enc.encode(secret) as BufferSource,
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign", "verify"],
  );
}

export interface SessionPayload {
  sub: string; // email
  exp: number; // epoch seconds
}

const SESSION_TTL_SECONDS = 60 * 60 * 24 * 30; // 30 days

export async function signSession(
  email: string,
  secret: string,
): Promise<string> {
  const payload: SessionPayload = {
    sub: email,
    exp: Math.floor(Date.now() / 1000) + SESSION_TTL_SECONDS,
  };
  const body = b64urlEncode(enc.encode(JSON.stringify(payload)));
  const sig = await crypto.subtle.sign(
    "HMAC",
    await key(secret),
    enc.encode(body) as BufferSource,
  );
  return `${body}.${b64urlEncode(new Uint8Array(sig))}`;
}

export async function verifySession(
  token: string,
  secret: string,
): Promise<SessionPayload | null> {
  const [body, sig] = token.split(".");
  if (!body || !sig) return null;
  const valid = await crypto.subtle.verify(
    "HMAC",
    await key(secret),
    b64urlDecode(sig) as BufferSource,
    enc.encode(body) as BufferSource,
  );
  if (!valid) return null;
  try {
    const payload = JSON.parse(dec.decode(b64urlDecode(body))) as SessionPayload;
    if (payload.exp < Math.floor(Date.now() / 1000)) return null;
    return payload;
  } catch {
    return null;
  }
}
