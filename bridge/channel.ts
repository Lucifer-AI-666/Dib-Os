import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";

/** AES-256-GCM envelope; deviceId is bound as AAD so envelopes cannot be redirected. */
export interface Envelope {
  deviceId: string;
  iv: string;
  tag: string;
  data: string;
}

export function newPairingKey(): Buffer {
  return randomBytes(32);
}

export function seal(deviceId: string, key: Buffer, payload: unknown): Envelope {
  const iv = randomBytes(12);
  const c = createCipheriv("aes-256-gcm", key, iv);
  c.setAAD(Buffer.from(deviceId));
  const data = Buffer.concat([c.update(JSON.stringify(payload), "utf8"), c.final()]);
  return {
    deviceId,
    iv: iv.toString("base64"),
    tag: c.getAuthTag().toString("base64"),
    data: data.toString("base64"),
  };
}

export function open<T = unknown>(env: Envelope, key: Buffer): T | null {
  try {
    const d = createDecipheriv("aes-256-gcm", key, Buffer.from(env.iv, "base64"));
    d.setAAD(Buffer.from(env.deviceId));
    d.setAuthTag(Buffer.from(env.tag, "base64"));
    const out = Buffer.concat([d.update(Buffer.from(env.data, "base64")), d.final()]);
    return JSON.parse(out.toString("utf8")) as T;
  } catch {
    return null;
  }
}
