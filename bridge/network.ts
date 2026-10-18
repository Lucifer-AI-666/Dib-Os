import { execFile } from "node:child_process";
import { promisify } from "node:util";

export interface NetworkFingerprint {
  ssid: string;
  bssid?: string;
  gatewayMac: string;
  subnet: string; // e.g. 192.168.1.0/24
}

/** Returns the current network fingerprint, or null when it cannot be verified. */
export type NetworkProbe = () => Promise<NetworkFingerprint | null>;

const norm = (s?: string) => (s ?? "").trim().toLowerCase().replace(/-/g, ":");

/**
 * The SSID alone is spoofable, so ALL of these must match: SSID, gateway MAC
 * and subnet (plus BSSID when both sides know it; mesh APs may legitimately vary,
 * so BSSID is only compared when the authorized fingerprint pinned it).
 */
export function fingerprintsMatch(
  authorized: NetworkFingerprint,
  current: NetworkFingerprint | null | undefined,
): boolean {
  if (!current) return false;
  if (!authorized.ssid || !authorized.gatewayMac || !authorized.subnet) return false;
  if (authorized.ssid !== current.ssid) return false;
  if (norm(authorized.gatewayMac) !== norm(current.gatewayMac)) return false;
  if (authorized.subnet !== current.subnet) return false;
  if (authorized.bssid && norm(authorized.bssid) !== norm(current.bssid)) return false;
  return true;
}

export function ipInSubnet(ip: string, subnet: string): boolean {
  const [base, bitsStr] = subnet.split("/");
  const bits = Number(bitsStr);
  const toInt = (a: string) => {
    const p = a.split(".").map(Number);
    if (p.length !== 4 || p.some((n) => !Number.isInteger(n) || n < 0 || n > 255)) return null;
    return ((p[0] << 24) | (p[1] << 16) | (p[2] << 8) | p[3]) >>> 0;
  };
  const a = toInt(ip);
  const b = toInt(base);
  if (a === null || b === null || !Number.isInteger(bits) || bits < 8 || bits > 32) return false;
  const mask = bits === 0 ? 0 : (~0 << (32 - bits)) >>> 0;
  return (a & mask) === (b & mask);
}

const run = promisify(execFile);

/** Best-effort Linux probe (nmcli + ip). Returns null on any failure => reads refused. */
export const linuxProbe: NetworkProbe = async () => {
  try {
    const { stdout: wifi } = await run("nmcli", ["-t", "-f", "active,ssid,bssid", "dev", "wifi"]);
    const line = wifi.split("\n").find((l) => l.startsWith("yes:"));
    if (!line) return null;
    const m = line.match(/^yes:(.*?):((?:[0-9A-Fa-f]{2}\\?:){5}[0-9A-Fa-f]{2})$/);
    if (!m) return null;
    const ssid = m[1];
    const bssid = m[2].replace(/\\/g, "");
    const { stdout: route } = await run("ip", ["-4", "route", "show", "default"]);
    const gw = route.match(/default via (\S+) dev (\S+)/);
    if (!gw) return null;
    const { stdout: addr } = await run("ip", ["-4", "-o", "addr", "show", "dev", gw[2]]);
    const cidr = addr.match(/inet (\d+\.\d+\.\d+\.\d+)\/(\d+)/);
    if (!cidr) return null;
    const { stdout: neigh } = await run("ip", ["neigh", "show", gw[1]]);
    const mac = neigh.match(/lladdr (\S+)/);
    if (!mac) return null;
    const bits = Number(cidr[2]);
    const ipInt = cidr[1].split(".").reduce((a, o) => ((a << 8) | Number(o)) >>> 0, 0);
    const mask = (~0 << (32 - bits)) >>> 0;
    const net = (ipInt & mask) >>> 0;
    const subnet = `${[24, 16, 8, 0].map((s) => (net >>> s) & 255).join(".")}/${bits}`;
    return { ssid, bssid, gatewayMac: mac[1], subnet };
  } catch {
    return null;
  }
};
