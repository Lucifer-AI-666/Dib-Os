import fs from "node:fs/promises";
import path from "node:path";
import { open, seal, type Envelope } from "./channel";
import { fingerprintsMatch, ipInSubnet, type NetworkFingerprint, type NetworkProbe } from "./network";

export interface PairedDevice {
  deviceId: string;
  name: string;
  key: Buffer;
  /** Only these folders may be read. */
  allowedFolders: string[];
  /** Network the user authorized for this device. */
  network: NetworkFingerprint;
  revoked?: boolean;
}

export type Request =
  | { kind: "read"; query?: string; folder: string; limit?: number }
  | { kind: "write"; path: string; content: string; explicit: true }
  | { kind: "move"; from: string; to: string; explicit: true }
  | { kind: "delete"; path: string; explicit: true };

/** Plaintext carried INSIDE the encrypted envelope. */
export interface Message {
  nonce: string;
  ts: number;
  /** Network fingerprint + IP as observed by the device itself. */
  deviceNet: NetworkFingerprint;
  deviceIp: string;
  request: Request;
}

export type Reason =
  | "unknown_device" | "revoked" | "bad_envelope" | "replay" | "stale"
  | "network_unverifiable" | "network_changed" | "device_network_mismatch"
  | "forbidden_path" | "explicit_required" | "bad_request" | "os_denied";

export interface Answer {
  ok: boolean;
  reason?: Reason;
  source: string;
  retrievedAt: string;
  unreachable: string[];
  data?: unknown;
}

const MAX_SKEW_MS = 30_000;

export class Bridge {
  private devices = new Map<string, PairedDevice>();
  private seen = new Map<string, number>();
  constructor(private probe: NetworkProbe, private now: () => number = Date.now) {}

  pair(d: PairedDevice) {
    this.devices.set(d.deviceId, { ...d, allowedFolders: d.allowedFolders.map((f) => path.resolve(f)) });
  }
  revoke(deviceId: string) {
    const d = this.devices.get(deviceId);
    if (d) d.revoked = true;
  }

  private reply(deviceId: string, a: Omit<Answer, "retrievedAt" | "unreachable"> & { unreachable?: string[] }): Envelope | Answer {
    const answer: Answer = { unreachable: [], ...a, retrievedAt: new Date(this.now()).toISOString() };
    const d = this.devices.get(deviceId);
    return d && !d.revoked ? seal(deviceId, d.key, answer) : answer;
  }

  /** Handles one encrypted request. Network is re-verified on EVERY request (no cached trust). */
  async handle(env: Envelope): Promise<Envelope | Answer> {
    const deny = (reason: Reason, devId = env.deviceId): Envelope | Answer =>
      this.reply(devId, { ok: false, reason, source: "bridge", unreachable: [env.deviceId] });
    const dev = this.devices.get(env.deviceId);
    if (!dev) return deny("unknown_device");
    if (dev.revoked) return deny("revoked");
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
    if (!fingerprintsMatch(dev.network, msg.deviceNet) || !ipInSubnet(msg.deviceIp, dev.network.subnet))
      return deny("device_network_mismatch");

    try {
      const data = await this.execute(dev, msg.request);
      return this.reply(dev.deviceId, { ok: true, source: `device:${dev.name}`, data });
    } catch (e) {
      const code = (e as { code?: string; message?: string }).code;
      if (code === "EACCES" || code === "EPERM") return deny("os_denied");
      if ((e as Error).message === "forbidden_path") return deny("forbidden_path");
      return deny("bad_request");
    }
  }

  /** Resolves symlinks (of the nearest existing ancestor) and ensures the path stays inside an allowed folder. */
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
        const root = await this.inside(dev, r.folder);
        const q = (r.query ?? "").toLowerCase();
        const limit = Math.min(Math.max(r.limit ?? 50, 1), 200);
        const out: { name: string; size: number; modified: string }[] = [];
        for (const e of await fs.readdir(root, { withFileTypes: true })) {
          if (!e.isFile() || (q && !e.name.toLowerCase().includes(q))) continue;
          const st = await fs.stat(path.join(root, e.name)).catch(() => null);
          if (st) out.push({ name: e.name, size: st.size, modified: st.mtime.toISOString() });
          if (out.length >= limit) break;
        }
        return out;
      }
      case "write":
        if (r.explicit !== true) throw new Error("explicit_required");
        await fs.writeFile(await this.inside(dev, r.path), r.content);
        return { written: r.path };
      case "move":
        if (r.explicit !== true) throw new Error("explicit_required");
        await fs.rename(await this.inside(dev, r.from), await this.inside(dev, r.to));
        return { moved: r.to };
      case "delete":
        if (r.explicit !== true) throw new Error("explicit_required");
        await fs.unlink(await this.inside(dev, r.path));
        return { deleted: r.path };
      default:
        throw new Error("bad_request");
    }
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
