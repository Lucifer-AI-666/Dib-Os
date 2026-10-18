import https from "node:https";
import type { Socket } from "node:net";
import type { Bridge, Connection } from "./bridge";
import type { Envelope } from "./channel";

export interface ServerOptions {
  key: Buffer | string;
  cert: Buffer | string;
  /** CA that signed the paired client certificates. */
  ca: Buffer | string;
  /** LAN interface address to bind. 0.0.0.0 / :: are refused (no exposure on other interfaces). */
  host: string;
  port: number;
  /** How often the network is re-verified for already-open connections. */
  monitorMs?: number;
}

const MAX_BODY = 1024 * 1024;

/** mTLS (TLS 1.3, client certificate required and verified) server in front of the Bridge. */
export function createBridgeServer(bridge: Bridge, o: ServerOptions) {
  if (["0.0.0.0", "::", ""].includes(o.host)) throw new Error("bind to a specific LAN interface address");
  const sockets = new Map<Socket, string>(); // socket -> deviceId (by cert)

  const server = https.createServer(
    {
      key: o.key, cert: o.cert, ca: o.ca,
      requestCert: true, rejectUnauthorized: true, minVersion: "TLSv1.3",
    },
    (req, res) => {
      const sock = req.socket as import("node:tls").TLSSocket;
      const peer = sock.getPeerCertificate();
      const fp = peer?.fingerprint256?.replace(/:/g, "").toLowerCase();
      const send = (code: number, body: unknown) => {
        res.writeHead(code, { "content-type": "application/json", connection: "close" });
        res.end(JSON.stringify(body));
      };
      if (req.method !== "POST" || req.url !== "/v1/request" || !sock.authorized) return send(403, { ok: false });
      const chunks: Buffer[] = [];
      let size = 0;
      req.on("data", (c: Buffer) => {
        size += c.length;
        if (size > MAX_BODY) { req.destroy(); return; }
        chunks.push(c);
      });
      req.on("end", async () => {
        try {
          const env = JSON.parse(Buffer.concat(chunks).toString("utf8")) as Envelope;
          const conn: Connection = { remoteAddress: sock.remoteAddress, localAddress: sock.localAddress, certFingerprint: fp };
          sockets.set(sock, env.deviceId);
          send(200, await bridge.handle(env, conn));
        } catch {
          send(400, { ok: false });
        }
      });
    },
  );
  server.on("connection", (s) => s.on("close", () => sockets.delete(s as Socket)));

  // Cut open connections as soon as the network changes / is unverifiable / the device is revoked.
  const timer = setInterval(async () => {
    for (const [s, id] of [...sockets]) {
      if (!(await bridge.networkAllowed(id))) { s.destroy(); sockets.delete(s); }
    }
  }, o.monitorMs ?? 3000);
  timer.unref();
  server.on("close", () => clearInterval(timer));

  return { server, listen: () => new Promise<void>((r) => server.listen(o.port, o.host, r)) };
}
