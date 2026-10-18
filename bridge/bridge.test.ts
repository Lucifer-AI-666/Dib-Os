import { execFileSync } from "node:child_process";
import fs from "node:fs";
import https from "node:https";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { Bridge, type Answer, type Approver, type Connection, type Message } from "./bridge";
import { newPairingKey, open, seal, type Envelope } from "./channel";
import { integrationStatus } from "./integrations";
import { buildWindowsState, parseNetshWlan, type NetworkState } from "./network";
import { createBridgeServer } from "./server";

const net: NetworkState = { ssid: "Home", gatewayMac: "aa:bb:cc:dd:ee:ff", subnet: "192.168.1.0/24", localIp: "192.168.1.10" };
const FP = "ab".repeat(32);
const conn: Connection = { remoteAddress: "192.168.1.20", localAddress: "192.168.1.10", certFingerprint: FP };
let n = 0;

function setup(approver?: Approver) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "bridge-"));
  fs.writeFileSync(path.join(dir, "report.txt"), "hello project alpha");
  fs.writeFileSync(path.join(dir, "other.txt"), "nothing");
  let current: NetworkState | null = net;
  const key = newPairingKey();
  const b = new Bridge(async () => current, Date.now, approver);
  b.pair({ deviceId: "d1", name: "Laptop", key, certFingerprint: FP, allowedFolders: [dir], network: net });
  const ask = async (request: Message["request"], c: Connection = conn, over: Partial<Message> = {}) => {
    const msg: Message = { nonce: String(n++), ts: Date.now(), request, ...over };
    const res = await b.handle(seal("d1", key, msg), c);
    return ("iv" in res ? open<Answer>(res, key) : res) as Answer;
  };
  return { b, dir, key, ask, setNet: (x: NetworkState | null) => (current = x) };
}

describe("bridge core", () => {
  it("returns file content (only relevant files) with provenance", async () => {
    const { ask, dir } = setup();
    const r = await ask({ kind: "read", path: dir, query: "alpha" });
    expect(r.ok).toBe(true);
    const files = r.data as { name: string; content: string }[];
    expect(files.map((f) => f.name)).toEqual(["report.txt"]);
    expect(files[0].content).toBe("hello project alpha");
    expect(r.source).toBe("device:Laptop");
    expect(r.retrievedAt).toBeTruthy();
  });
  it("blocks when gateway changes even with same SSID", async () => {
    const { ask, dir, setNet } = setup();
    setNet({ ...net, gatewayMac: "11:22:33:44:55:66" });
    expect((await ask({ kind: "read", path: dir })).reason).toBe("network_changed");
  });
  it("refuses when network cannot be verified", async () => {
    const { ask, dir, setNet } = setup();
    setNet(null);
    expect((await ask({ kind: "read", path: dir })).reason).toBe("network_unverifiable");
  });
  it("uses the server-observed peer IP, not anything the client says", async () => {
    const { ask, dir } = setup();
    expect((await ask({ kind: "read", path: dir }, { ...conn, remoteAddress: "10.0.0.5" })).reason).toBe("connection_mismatch");
    expect((await ask({ kind: "read", path: dir }, { ...conn, localAddress: "10.0.0.1" })).reason).toBe("connection_mismatch");
    // a client-supplied deviceIp field is simply ignored
    expect((await ask({ kind: "read", path: dir }, { ...conn, remoteAddress: "10.0.0.5" }, { deviceIp: "192.168.1.9" } as never)).ok).toBe(false);
  });
  it("requires the paired client certificate", async () => {
    const { ask, dir } = setup();
    expect((await ask({ kind: "read", path: dir }, { ...conn, certFingerprint: "cd".repeat(32) })).reason).toBe("cert_mismatch");
    expect((await ask({ kind: "read", path: dir }, { ...conn, certFingerprint: undefined })).reason).toBe("cert_mismatch");
  });
  it("blocks after revocation, replays and wrong keys", async () => {
    const { b, ask, dir } = setup();
    const req = { kind: "read", path: dir } as const;
    expect((await ask(req, conn, { nonce: "same" })).ok).toBe(true);
    expect((await ask(req, conn, { nonce: "same" })).reason).toBe("replay");
    const bad = await b.handle(seal("d1", newPairingKey(), { nonce: "x", ts: Date.now(), request: req }), conn);
    expect((bad as Envelope).iv).toBeDefined();
    b.revoke("d1");
    expect((await ask(req)).reason).toBe("revoked");
  });
  it("rejects paths outside allowed folders", async () => {
    const { ask } = setup();
    expect((await ask({ kind: "read", path: "/etc" })).reason).toBe("forbidden_path");
  });
});

describe("mutations need separate operator approval", () => {
  it("denies without an approver, even if the client claims explicit", async () => {
    const { ask, dir } = setup();
    const f = path.join(dir, "report.txt");
    expect((await ask({ kind: "delete", path: f, explicit: true } as never)).reason).toBe("not_approved");
    expect(fs.existsSync(f)).toBe(true);
  });
  it("executes only the approved operation", async () => {
    const seen: string[] = [];
    const { ask, dir } = setup(async (_d, req) => { seen.push(req.kind); return true; });
    const f = path.join(dir, "report.txt");
    expect((await ask({ kind: "delete", path: f })).ok).toBe(true);
    expect(seen).toEqual(["delete"]);
    expect(fs.existsSync(f)).toBe(false);
  });
  it("operator refusal blocks the change", async () => {
    const { ask, dir } = setup(async () => false);
    const f = path.join(dir, "report.txt");
    expect((await ask({ kind: "write", path: f, content: "x" })).ok).toBe(false);
    expect(fs.readFileSync(f, "utf8")).toBe("hello project alpha");
  });
});

describe("windows detection", () => {
  const wlan = `
There is 1 interface on the system:

    Name                   : Wi-Fi
    Description            : Intel(R) Wi-Fi 6
    State                  : connected
    SSID                   : Home
    BSSID                  : AA-BB-CC-00-11-22
    Radio type             : 802.11ax
`;
  const ip = { InterfaceAlias: "Wi-Fi", IPAddress: "192.168.1.44", PrefixLength: 24, Gateway: "192.168.1.1", GatewayMac: "AA-BB-CC-DD-EE-FF" };
  it("parses netsh and builds a state", () => {
    expect(parseNetshWlan(wlan)?.ssid).toBe("Home");
    expect(buildWindowsState(wlan, ip)).toEqual({
      ssid: "Home", bssid: "aa:bb:cc:00:11:22", gatewayMac: "aa:bb:cc:dd:ee:ff", subnet: "192.168.1.0/24", localIp: "192.168.1.44",
    });
  });
  it("fails closed when disconnected or default route is not Wi-Fi", () => {
    expect(buildWindowsState(wlan.replace("connected", "disconnected"), ip)).toBeNull();
    expect(buildWindowsState(wlan, { ...ip, InterfaceAlias: "Ethernet" })).toBeNull();
    expect(buildWindowsState(wlan, null)).toBeNull();
    expect(buildWindowsState("garbage", ip)).toBeNull();
  });
});

describe("integrations", () => {
  it("reports not connected without tokens", () => {
    expect(integrationStatus({}).every((s) => !s.connected)).toBe(true);
  });
});

function sh(cwd: string, ...args: string[]) {
  execFileSync("openssl", args, { cwd, stdio: "ignore" });
}

describe("real mTLS server (loopback)", () => {
  it("accepts paired client, rejects unpaired cert, and cuts access on network change", async () => {
    const d = fs.mkdtempSync(path.join(os.tmpdir(), "mtls-"));
    sh(d, "req", "-x509", "-newkey", "rsa:2048", "-nodes", "-keyout", "ca.key", "-out", "ca.crt", "-subj", "/CN=ca", "-days", "2");
    const issue = (name: string, ca = "ca", san = "") => {
      sh(d, "req", "-newkey", "rsa:2048", "-nodes", "-keyout", `${name}.key`, "-out", `${name}.csr`, "-subj", `/CN=${name}`);
      fs.writeFileSync(path.join(d, `${name}.ext`), san);
      sh(d, "x509", "-req", "-in", `${name}.csr`, "-CA", `${ca}.crt`, "-CAkey", `${ca}.key`, "-CAcreateserial", "-out", `${name}.crt`, "-days", "2", "-extfile", `${name}.ext`);
    };
    issue("server", "ca", "subjectAltName=IP:127.0.0.1");
    issue("client");
    sh(d, "req", "-x509", "-newkey", "rsa:2048", "-nodes", "-keyout", "rogue-ca.key", "-out", "rogue-ca.crt", "-subj", "/CN=rogue", "-days", "2");
    issue("rogue", "rogue-ca");
    const rd = (f: string) => fs.readFileSync(path.join(d, f));
    const fp = new (await import("node:crypto")).X509Certificate(rd("client.crt")).fingerprint256.replace(/:/g, "").toLowerCase();

    const loop: NetworkState = { ssid: "Home", gatewayMac: "aa:bb:cc:dd:ee:ff", subnet: "127.0.0.0/8", localIp: "127.0.0.1" };
    let current: NetworkState | null = loop;
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "bridge-"));
    fs.writeFileSync(path.join(dir, "a.txt"), "secret alpha");
    const key = newPairingKey();
    const bridge = new Bridge(async () => current);
    bridge.pair({ deviceId: "d1", name: "Laptop", key, certFingerprint: fp, allowedFolders: [dir], network: loop });
    const s = createBridgeServer(bridge, { key: rd("server.key"), cert: rd("server.crt"), ca: rd("ca.crt"), host: "127.0.0.1", port: 0, monitorMs: 50 });
    await s.listen();
    const port = (s.server.address() as { port: number }).port;

    const post = (client: string) => new Promise<Answer | null>((resolve, reject) => {
      const env = seal("d1", key, { nonce: String(n++), ts: Date.now(), request: { kind: "read", path: dir } } satisfies Message);
      const req = https.request({ host: "127.0.0.1", port, path: "/v1/request", method: "POST", ca: rd("ca.crt"), key: rd(`${client}.key`), cert: rd(`${client}.crt`), agent: false }, (res) => {
        let b = "";
        res.on("data", (c) => (b += c));
        res.on("end", () => resolve(open<Answer>(JSON.parse(b), key) ?? JSON.parse(b)));
      });
      req.on("error", reject);
      req.end(JSON.stringify(env));
    });

    try {
      const ok = await post("client");
      expect(ok?.ok).toBe(true);
      expect((ok?.data as { content: string }[])[0].content).toBe("secret alpha");
      await expect(post("rogue")).rejects.toBeTruthy(); // cert not signed by the paired CA
      current = { ...loop, gatewayMac: "00:00:00:00:00:01" }; // "Wi-Fi changed"
      expect((await post("client"))?.reason).toBe("network_changed");
      current = null;
      expect((await post("client"))?.reason).toBe("network_unverifiable");
    } finally {
      s.server.close();
      s.server.closeAllConnections();
    }
  });
});
