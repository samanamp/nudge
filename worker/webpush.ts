/**
 * Web Push (RFC 8291 aes128gcm) + VAPID (RFC 8292) using the Web Crypto API.
 * No external dependencies — runs natively in Cloudflare Workers.
 */

function b64url(buf: ArrayBuffer | Uint8Array): string {
  const bytes = buf instanceof Uint8Array ? buf : new Uint8Array(buf);
  let s = "";
  for (const b of bytes) s += String.fromCharCode(b);
  return btoa(s).replace(/\+/g, "-").replace(/\//g, "_").replace(/=/g, "");
}

function fromb64url(s: string): Uint8Array {
  const b64 = s.replace(/-/g, "+").replace(/_/g, "/");
  const padded = b64 + "=".repeat((4 - (b64.length % 4)) % 4);
  return Uint8Array.from(atob(padded), (c) => c.charCodeAt(0));
}

function concat(...arrays: Uint8Array[]): Uint8Array {
  const out = new Uint8Array(arrays.reduce((n, a) => n + a.length, 0));
  let off = 0;
  for (const a of arrays) { out.set(a, off); off += a.length; }
  return out;
}

async function hkdf(
  salt: Uint8Array,
  ikm: Uint8Array,
  info: Uint8Array,
  length: number,
): Promise<Uint8Array> {
  const key = await crypto.subtle.importKey("raw", ikm as BufferSource, "HKDF", false, ["deriveBits"]);
  const bits = await crypto.subtle.deriveBits(
    { name: "HKDF", hash: "SHA-256", salt: salt as BufferSource, info: info as BufferSource },
    key,
    length * 8,
  );
  return new Uint8Array(bits);
}

/** Sign a VAPID JWT with the stored EC private key (ES256). */
async function vapidJWT(
  privateKeyJWK: JsonWebKey,
  audience: string,
  subject: string,
): Promise<string> {
  const enc = new TextEncoder();
  const hdr = b64url(enc.encode(JSON.stringify({ alg: "ES256", typ: "JWT" })));
  const pld = b64url(
    enc.encode(
      JSON.stringify({
        aud: audience,
        exp: Math.floor(Date.now() / 1000) + 43_200, // 12 h
        sub: subject,
      }),
    ),
  );
  const signing = `${hdr}.${pld}`;
  const key = await crypto.subtle.importKey(
    "jwk",
    privateKeyJWK,
    { name: "ECDSA", namedCurve: "P-256" },
    false,
    ["sign"],
  );
  const sig = await crypto.subtle.sign(
    { name: "ECDSA", hash: "SHA-256" },
    key,
    enc.encode(signing),
  );
  return `${signing}.${b64url(sig)}`;
}

/** Encrypt a push payload per RFC 8291 (aes128gcm). */
async function encryptPayload(
  clientPublicB64: string,
  authSecretB64: string,
  payload: string,
): Promise<{ body: Uint8Array; salt: Uint8Array; serverPublic: Uint8Array }> {
  const enc = new TextEncoder();
  const clientPublic = fromb64url(clientPublicB64);
  const authSecret = fromb64url(authSecretB64);

  // Ephemeral server key pair
  const serverPair = await crypto.subtle.generateKey(
    { name: "ECDH", namedCurve: "P-256" },
    true,
    ["deriveBits"],
  );
  const serverPublic = new Uint8Array(
    await crypto.subtle.exportKey("raw", serverPair.publicKey),
  );

  // ECDH shared secret
  const clientKey = await crypto.subtle.importKey(
    "raw",
    clientPublic as BufferSource,
    { name: "ECDH", namedCurve: "P-256" },
    false,
    [],
  );
  const ikm = new Uint8Array(
    await crypto.subtle.deriveBits(
      { name: "ECDH", public: clientKey },
      serverPair.privateKey,
      256,
    ),
  );

  const salt = crypto.getRandomValues(new Uint8Array(16));

  // PRK: HKDF(auth_secret, ikm, "WebPush: info\0" || receiver_pub || sender_pub)
  const prk = await hkdf(
    authSecret,
    ikm,
    concat(enc.encode("WebPush: info\0"), clientPublic, serverPublic),
    32,
  );

  // Content encryption key + nonce
  const cek = await hkdf(salt, prk, enc.encode("Content-Encoding: aes128gcm\0"), 16);
  const nonce = await hkdf(salt, prk, enc.encode("Content-Encoding: nonce\0"), 12);

  // Encrypt: plaintext || 0x02 (last-record delimiter) with AES-128-GCM
  const aesKey = await crypto.subtle.importKey("raw", cek as BufferSource, "AES-GCM", false, ["encrypt"]);
  const plaintext = concat(enc.encode(payload), new Uint8Array([2]));
  const ciphertext = new Uint8Array(
    await crypto.subtle.encrypt({ name: "AES-GCM", iv: nonce as BufferSource }, aesKey, plaintext as BufferSource),
  );

  // aes128gcm message: salt(16) | rs(4 BE) | keyid_len(1) | server_pub(65) | ciphertext
  const rs = new Uint8Array(4);
  new DataView(rs.buffer).setUint32(0, 4096, false);
  const body = concat(salt, rs, new Uint8Array([serverPublic.length]), serverPublic, ciphertext);

  return { body, salt, serverPublic };
}

export interface PushSubscription {
  endpoint: string;
  p256dh: string;
  auth: string;
}

/**
 * Send a Web Push notification.
 * Returns true on 201 Created, false on any error (logs the status).
 */
export async function sendWebPush(
  subscription: PushSubscription,
  payload: { title: string; body: string; tag?: string },
  vapidPrivateKeyJSON: string,
  vapidPublicKeyB64: string,
): Promise<boolean> {
  try {
    const privateKeyJWK = JSON.parse(vapidPrivateKeyJSON) as JsonWebKey;
    const { endpoint, p256dh, auth } = subscription;

    // Audience = push service origin
    const audience = new URL(endpoint).origin;
    const jwt = await vapidJWT(privateKeyJWK, audience, "mailto:nudge@updates.edge.bond");
    const authorization = `vapid t=${jwt},k=${vapidPublicKeyB64}`;

    const { body } = await encryptPayload(p256dh, auth, JSON.stringify(payload));

    const res = await fetch(endpoint, {
      method: "POST",
      headers: {
        Authorization: authorization,
        "Content-Encoding": "aes128gcm",
        "Content-Type": "application/octet-stream",
        TTL: "86400",
        Urgency: "normal",
      },
      body: body.buffer as ArrayBuffer,
    });

    if (!res.ok && res.status !== 201) {
      console.warn(`web push ${res.status} for ${endpoint.slice(0, 50)}`);
      return false;
    }
    return true;
  } catch (e) {
    console.error("sendWebPush error:", e);
    return false;
  }
}
