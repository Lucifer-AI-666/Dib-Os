import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { Bridge, type Message, type Answer } from "./bridge";
import { newPairingKey, open, seal } from "./channel";
import { integrationStatus } from "./integrations";
import type { NetworkFingerprint } from "./network";

const net: NetworkFingerprint = { ssid: "Home", gatewayMac: "aa:bb:cc:dd:ee:ff", subnet: "192.168.1.0/24" };
let n = 0;

function setup(initial: NetworkFingerprint | null = net) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "bridge-"));
  fs.writeFileSync(path.join(dir, "report.txt"), "x");
  let current = initial;
  const key = newPairingKey();
  const b = new Bridge(async () => current);
  b.pair({ deviceId: "d1", name: "Laptop", key, allowedFolders: [dir], network: net });
  const ask = async (request: Message["request"], over: Partial<Message> = {}) => {
    const msg: Message = { nonce: String(n++), ts: Date.now(), deviceNet: net, deviceIp: "192.168.1.20", request, ...over };
    const res = await b.handle(seal("d1", key, msg));
    return ("iv" in res ? open<Answer>(res, key) : res) as Answer;
  };
  return { b, dir, ask, setNet: (x: NetworkFingerprint | null) => (current = x) };
}

describe("bridge", () => {
  it("reads authorized files with provenance", async () => {
    const { ask, dir } = setup();
    const r = await ask({ kind: "read", folder: dir, query: "report" });
    expect(r.ok).toBe(true);
    expect(r.source).toBe("device:Laptop");
    expect(r.retrievedAt).toBeTruthy();
  });
  it("blocks when the gateway changes even if SSID is the same", async () => {
    const { ask, dir, setNet } = setup();
    setNet({ ...net, gatewayMac: "11:22:33:44:55:66" });
    expect((await ask({ kind: "read", folder: dir })).reason).toBe("network_changed");
  });
  it("blocks when SSID/subnet changes", async () => {
    const { ask, dir, setNet } = setup();
    setNet({ ...net, ssid: "Cafe", subnet: "10.0.0.0/24" });
    expect((await ask({ kind: "read", folder: dir })).ok).toBe(false);
  });
  it("refuses when network cannot be verified", async () => {
    const { ask, dir, setNet } = setup();
    setNet(null);
    expect((await ask({ kind: "read", folder: dir })).reason).toBe("network_unverifiable");
  });
  it("refuses when the device reports a different network", async () => {
    const { ask, dir } = setup();
    expect((await ask({ kind: "read", folder: dir }, { deviceIp: "10.0.0.5" })).reason).toBe("device_network_mismatch");
  });
  it("blocks after revocation and rejects replays and wrong keys", async () => {
    const { b, ask, dir } = setup();
    const unwrap = (r: unknown) => r as { iv?: string };
    const msg: Message = { nonce: "same", ts: Date.now(), deviceNet: net, deviceIp: "192.168.1.9", request: { kind: "read", folder: dir } };
    expect((await ask(msg.request, { nonce: "same" })).ok).toBe(true);
    expect((await ask(msg.request, { nonce: "same" })).reason).toBe("replay");
    const bad = await b.handle(seal("d1", newPairingKey(), msg));
    expect(unwrap(bad).iv).toBeDefined(); // sealed denial; wrong key never yields data
    expect((bad as Answer).ok).toBeUndefined();
    b.revoke("d1");
    expect((await ask(msg.request)).reason).toBe("revoked");
  });
  it("rejects paths outside allowed folders", async () => {
    const { ask } = setup();
    expect((await ask({ kind: "read", folder: "/etc" })).reason).toBe("forbidden_path");
  });
  it("only writes/deletes with explicit flag", async () => {
    const { ask, dir } = setup();
    const f = path.join(dir, "report.txt");
    expect((await ask({ kind: "delete", path: f } as never)).ok).toBe(false);
    expect(fs.existsSync(f)).toBe(true);
    expect((await ask({ kind: "delete", path: f, explicit: true })).ok).toBe(true);
    expect(fs.existsSync(f)).toBe(false);
  });
});

describe("integrations", () => {
  it("reports not connected without tokens", () => {
    expect(integrationStatus({}).every((s) => !s.connected)).toBe(true);
    expect(integrationStatus({ GITHUB_TOKEN: "t" })[0].connected).toBe(true);
  });
});
