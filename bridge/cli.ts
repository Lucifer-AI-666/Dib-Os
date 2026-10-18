import fs from "node:fs";
import readline from "node:readline/promises";
import { Bridge, type Approver } from "./bridge";
import { defaultProbe } from "./network";
import { createBridgeServer } from "./server";

/** Usage: tsx bridge/cli.ts bridge.config.json  (see bridge/README.md) */
interface Config {
  host: string;
  port: number;
  tls: { key: string; cert: string; clientCa: string };
  devices: {
    deviceId: string;
    name: string;
    keyBase64: string;
    certFingerprint: string;
    allowedFolders: string[];
    network: { ssid: string; bssid?: string; gatewayMac: string; subnet: string };
  }[];
}

const cfgPath = process.argv[2];
if (!cfgPath) {
  console.error("usage: tsx bridge/cli.ts <config.json>");
  process.exit(2);
}
const cfg = JSON.parse(fs.readFileSync(cfgPath, "utf8")) as Config;

// Mutations need a live, per-operation approval typed by the operator on THIS console.
const approver: Approver = async (dev, req) => {
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  try {
    const answer = await Promise.race([
      rl.question(`\n[APPROVE?] ${dev.name}: ${JSON.stringify({ ...req, content: "content" in req ? `<${req.content.length} chars>` : undefined })}\nType "yes" to allow: `),
      new Promise<string>((r) => setTimeout(() => r("no"), 60_000)),
    ]);
    return answer.trim().toLowerCase() === "yes";
  } finally {
    rl.close();
  }
};

const probe = defaultProbe();
const bridge = new Bridge(probe, Date.now, approver);
for (const d of cfg.devices) {
  bridge.pair({
    deviceId: d.deviceId, name: d.name, key: Buffer.from(d.keyBase64, "base64"),
    certFingerprint: d.certFingerprint, allowedFolders: d.allowedFolders, network: d.network,
  });
}

const s = createBridgeServer(bridge, {
  key: fs.readFileSync(cfg.tls.key), cert: fs.readFileSync(cfg.tls.cert), ca: fs.readFileSync(cfg.tls.clientCa),
  host: cfg.host, port: cfg.port,
});
void s.listen().then(async () => {
  const st = await probe();
  console.log(`Bridge on https://${cfg.host}:${cfg.port} (mTLS). Current network: ${st ? `${st.ssid} ${st.subnet}` : "UNVERIFIABLE - reads refused"}`);
});
