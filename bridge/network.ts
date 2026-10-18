import { execFile } from "node:child_process";
import { promisify } from "node:util";

export interface NetworkFingerprint {
  ssid: string;
  bssid?: string;
  gatewayMac: string;
  subnet: string; // e.g. 192.168.1.0/24
}

/** What the OS reports right now. `localIp` is the address of the verified Wi-Fi interface. */
export interface NetworkState extends NetworkFingerprint {
  localIp: string;
}

/** Returns the current network state, or null when it cannot be verified. */
export type NetworkProbe = () => Promise<NetworkState | null>;

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

export function normalizeIp(ip: string | undefined): string {
  return (ip ?? "").replace(/^::ffff:/i, "");
}

export function subnetOf(ip: string, bits: number): string {
  const n = ip.split(".").reduce((a, o) => ((a << 8) | Number(o)) >>> 0, 0);
  const mask = bits === 0 ? 0 : (~0 << (32 - bits)) >>> 0;
  const net = (n & mask) >>> 0;
  return `${[24, 16, 8, 0].map((sh) => (net >>> sh) & 255).join(".")}/${bits}`;
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
    const subnet = subnetOf(cidr[1], Number(cidr[2]));
    return { ssid, bssid, gatewayMac: mac[1], subnet, localIp: cidr[1] };
  } catch {
    return null;
  }
};

/** Parses `netsh wlan show interfaces` (English output). Only a "connected" interface counts. */
export function parseNetshWlan(text: string): { name: string; ssid: string; bssid: string } | null {
  const blocks = text.split(/\r?\n\s*\r?\n/);
  for (const block of blocks) {
    const f: Record<string, string> = {};
    for (const line of block.split(/\r?\n/)) {
      const m = line.match(/^\s*([A-Za-z0-9 ]+?)\s*:\s(.*)$/);
      if (m && !(m[1] in f)) f[m[1].toLowerCase()] = m[2].trim();
    }
    if (f["state"]?.toLowerCase() === "connected" && f["ssid"] && f["bssid"] && f["name"]) {
      return { name: f["name"], ssid: f["ssid"], bssid: f["bssid"].toLowerCase().replace(/-/g, ":") };
    }
  }
  return null;
}

export interface WindowsIpInfo {
  InterfaceAlias: string;
  IPAddress: string;
  PrefixLength: number;
  Gateway: string;
  GatewayMac: string;
}

/** Combines netsh + PowerShell data. Fails closed if the default route is not via the Wi-Fi interface. */
export function buildWindowsState(wlanText: string, ip: WindowsIpInfo | null): NetworkState | null {
  const w = parseNetshWlan(wlanText);
  if (!w || !ip) return null;
  if (w.name.toLowerCase() !== String(ip.InterfaceAlias).toLowerCase()) return null;
  if (!/^\d+\.\d+\.\d+\.\d+$/.test(ip.IPAddress) || !ip.GatewayMac || !ip.Gateway) return null;
  const bits = Number(ip.PrefixLength);
  if (!Number.isInteger(bits) || bits < 8 || bits > 32) return null;
  return {
    ssid: w.ssid,
    bssid: w.bssid,
    gatewayMac: ip.GatewayMac.toLowerCase().replace(/-/g, ":"),
    subnet: subnetOf(ip.IPAddress, bits),
    localIp: ip.IPAddress,
  };
}

const PS_SCRIPT = `
$ErrorActionPreference='Stop'
$r = Get-NetRoute -DestinationPrefix 0.0.0.0/0 | Sort-Object { $_.RouteMetric + $_.InterfaceMetric } | Select-Object -First 1
$a = Get-NetIPAddress -InterfaceIndex $r.InterfaceIndex -AddressFamily IPv4 | Select-Object -First 1
$n = Get-NetNeighbor -IPAddress $r.NextHop -InterfaceIndex $r.InterfaceIndex -ErrorAction Stop | Where-Object { $_.LinkLayerAddress } | Select-Object -First 1
[pscustomobject]@{ InterfaceAlias=$a.InterfaceAlias; IPAddress=$a.IPAddress; PrefixLength=$a.PrefixLength; Gateway=$r.NextHop; GatewayMac=$n.LinkLayerAddress } | ConvertTo-Json -Compress
`;

/** Real Windows probe (netsh + PowerShell). Any failure => null => reads refused. */
export const windowsProbe: NetworkProbe = async () => {
  try {
    const { stdout: wlan } = await run("netsh", ["wlan", "show", "interfaces"], { windowsHide: true, timeout: 10_000 });
    const { stdout: ps } = await run(
      "powershell.exe",
      ["-NoProfile", "-NonInteractive", "-ExecutionPolicy", "Bypass", "-Command", PS_SCRIPT],
      { windowsHide: true, timeout: 15_000 },
    );
    return buildWindowsState(wlan, JSON.parse(ps) as WindowsIpInfo);
  } catch {
    return null;
  }
};

export function defaultProbe(platform: NodeJS.Platform = process.platform): NetworkProbe {
  return platform === "win32" ? windowsProbe : platform === "linux" ? linuxProbe : async () => null;
}
