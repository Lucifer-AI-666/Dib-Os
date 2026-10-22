import fs from "node:fs/promises";
import path from "node:path";
import { open, seal, type Envelope } from "./channel";
import { fingerprintsMatch, ipInSubnet, normalizeIp, type NetworkFingerprint, type NetworkProbe } from "./network";

export interface PairedDevice {
  deviceId: string;
  name: string;
  key: Buffer;
  /** SHA-256 fingerprint of the device's mTLS client certificate (the transport identity). */
  certFingerprint: string;
  /** Only these folders may be read. */
  allowedFolders: string[];
  /** Network the user authorized for this device. */
  network: NetworkFingerprint;
  revoked?: boolean;
}

export type Request =
  | { kind: "read"; path: string; query?: string; limit?: number }
  | { kind: "write"; path: string; content: string }
  | { kind: "move"; from: string; to: string }
  | { kind: "delete"; path: string };

/** Plaintext carried INSIDE the encrypted envelope. The client never states its own network. */
export interface Message {
  nonce: string;
  ts: number;
  request: Request;
}

/** Facts observed by the server on the real TLS connection (never taken from the client). */
export interface Connection {
  remoteAddress?: string;
  localAddress?: string;
  certFingerprint?: string;
}

/** Operator approval for ONE specific mutating operation, obtained out-of-band (local prompt). */
export type Approver = (dev: PairedDevice, req: Exclude<Request, { kind: "read" }>) => Promise<boolean>;

export type Reason =
  | "unknown_device" | "revoked" | "bad_envelope" | "replay" | "stale"
  | "network_unverifiable" | "network_changed" | "connection_mismatch" | "cert_mismatch"
  | "forbidden_path" | "not_approved" | "bad_request" | "os_denied";

export interface Answer {
  ok: boolean;
  reason?: Reason;
  source: string;
  retrievedAt: string;
  unreachable: string[];
  data?: unknown;
}

const MAX_SKEW_MS = 30_000;
const MAX_FILE_BYTES = 256 * 1024;
const MAX_TOTAL_BYTES = 1024 * 1024;

export class Bridge {
  private devices = new Map<string, PairedDevice>();
  private seen = new Map<string, number>();
  private approvalQueue: Promise<unknown> = Promise.resolve();
  private approver: Approver;
  constructor(
    private probe: NetworkProbe,
    private now: () => number = Date.now,
    approver: Approver = async () => false,
  ) {
    // Approvals are strictly one at a time: a prompt is shown only after the previous one is answered.
    this.approver = (dev, req) => {
      const run = this.approvalQueue.then(() => approver(dev, req));
      this.approvalQueue = run.catch(() => undefined);
      return run;
    };
  }

  pair(d: PairedDevice) {
    this.devices.set(d.deviceId, { ...d, allowedFolders: d.allowedFolders.map((f) => path.resolve(f)) });
  }
  revoke(deviceId: string) {
    const d = this.devices.get(deviceId);
    if (d) d.revoked = true;
  }
  getDevice(deviceId: string) {
    return this.devices.get(deviceId);
  }
  deviceIds() {
    return [...this.devices.keys()];
  }
  /** True only if the device is paired, not revoked, and the OS-verified network matches. */
  async networkAllowed(deviceId: string): Promise<boolean> {
    const d = this.devices.get(deviceId);
    if (!d || d.revoked) return false;
    return fingerprintsMatch(d.network, await this.probe());
  }

  private reply(deviceId: string, a: Omit<Answer, "retrievedAt" | "unreachable"> & { unreachable?: string[] }): Envelope | Answer {
    const answer: Answer = { unreachable: [], ...a, retrievedAt: new Date(this.now()).toISOString() };
    const d = this.devices.get(deviceId);
    return d && !d.revoked ? seal(deviceId, d.key, answer) : answer;
  }

  /** Handles one encrypted request. Network is re-verified on EVERY request (no cached trust). */
  async handle(env: Envelope, conn: Connection): Promise<Envelope | Answer> {
    const deny = (reason: Reason): Envelope | Answer =>
      this.reply(env.deviceId, { ok: false, reason, source: "bridge", unreachable: [env.deviceId] });
    const dev = this.devices.get(env.deviceId);
    if (!dev) return deny("unknown_device");
    if (dev.revoked) return deny("revoked");
    if (!conn.certFingerprint || conn.certFingerprint.toLowerCase() !== dev.certFingerprint.toLowerCase())
      return deny("cert_mismatch");
    const msg = open<Message>(env, dev.key);
    if (!msg || !msg.request) return deny("bad_envelope");
    if (Math.abs(this.now() - msg.ts) > MAX_SKEW_MS) return deny("stale");
    const nk = `${dev.deviceId}:${msg.nonce}`;
    if (this.seen.has(nk)) return deny("replay");
    this.seen.set(nk, msg.ts);
    for (const [k, t] of this.seen) if (this.now() - t > 2 * MAX_SKEW_MS) this.seen.delete(k);

    const current = await this.probe();
    if (!current) return deny("network_unverifiable");
    if (!fingerprintsMatch(dev.network, current)) return deny("network_changed");
    // The real TCP peer must be on the authorized subnet and must have reached us via the verified Wi-Fi interface.
    const remote = normalizeIp(conn.remoteAddress);
    if (!ipInSubnet(remote, dev.network.subnet) || normalizeIp(conn.localAddress) !== current.localIp)
      return deny("connection_mismatch");

    try {
      if (msg.request.kind !== "read") {
        const ok = await this.approver(dev, msg.request);
        if (ok !== true) return deny("not_approved");
      }
      const data = await this.execute(dev, msg.request);
      return this.reply(dev.deviceId, { ok: true, source: `device:${dev.name}`, data });
    } catch (e) {
      const code = (e as { code?: string }).code;
      if (code === "EACCES" || code === "EPERM") return deny("os_denied");
      if ((e as Error).message === "forbidden_path") return deny("forbidden_path");
      return deny("bad_request");
    }
  }

  private async inside(dev: PairedDevice, p: string): Promise<string> {
    const abs = path.resolve(p);
    let base = abs;
    for (;;) {
      try { base = await fs.realpath(base); break; } catch {
        const up = path.dirname(base);
        if (up === base) throw new Error("forbidden_path");
        base = up;
      }
    }
    const resolved = path.join(base, path.relative(await nearest(abs, base), abs));
    const roots = await Promise.all(dev.allowedFolders.map((f) => fs.realpath(f).catch(() => f)));
    if (!roots.some((r) => resolved === r || resolved.startsWith(r + path.sep))) throw new Error("forbidden_path");
    return resolved;
  }

  private async execute(dev: PairedDevice, r: Request): Promise<unknown> {
    switch (r.kind) {
      case "read": {
        const target = await this.inside(dev, r.path);
        const st = await fs.stat(target);
        if (st.isFile()) return [await readEntry(target, path.basename(target), st)];
        const q = (r.query ?? "").toLowerCase();
        const limit = Math.min(Math.max(r.limit ?? 50, 1), 200);
        const out: FileEntry[] = [];
        let total = 0;
        for (const e of await fs.readdir(target, { withFileTypes: true })) {
          if (!e.isFile()) continue;
          const full = path.join(target, e.name);
          const fst = await fs.stat(full).catch(() => null);
          if (!fst) continue;
          const entry = await readEntry(full, e.name, fst);
          // only return what is relevant to the request
          if (q && !e.name.toLowerCase().includes(q) && !(entry.content ?? "").toLowerCase().includes(q)) continue;
          total += entry.content?.length ?? 0;
          if (total > MAX_TOTAL_BYTES) break;
          out.push(entry);
          if (out.length >= limit) break;
        }
        return out;
      }
      case "write":
        await fs.writeFile(await this.inside(dev, r.path), r.content);
        return { written: r.path };
      case "move":
        await fs.rename(await this.inside(dev, r.from), await this.inside(dev, r.to));
        return { moved: r.to };
      case "delete":
        await fs.unlink(await this.inside(dev, r.path));
        return { deleted: r.path };
      default:
        throw new Error("bad_request");
    }
  }
}

export interface FileEntry {
  name: string;
  size: number;
  modified: string;
  content: string | null;
  truncated: boolean;
}

async function readEntry(full: string, name: string, st: { size: number; mtime: Date }): Promise<FileEntry> {
  const fh = await fs.open(full, "r"); // OS permissions apply: EACCES propagates
  try {
    const buf = Buffer.alloc(Math.min(st.size, MAX_FILE_BYTES));
    const { bytesRead } = await fh.read(buf, 0, buf.length, 0);
    const slice = buf.subarray(0, bytesRead);
    const binary = slice.includes(0);
    return {
      name,
      size: st.size,
      modified: st.mtime.toISOString(),
      content: binary ? null : slice.toString("utf8"),
      truncated: st.size > MAX_FILE_BYTES,
    };
  } finally {
    await fh.close();
  }
}

/** The original (unresolved) ancestor of `abs` that realpath resolved to `real`. */
async function nearest(abs: string, real: string): Promise<string> {
  let cur = abs;
  for (;;) {
    if ((await fs.realpath(cur).catch(() => null)) === real) return cur;
    const up = path.dirname(cur);
    if (up === cur) return cur;
    cur = up;
  }
}
