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

/**
 * Locale-independent Windows data. Everything comes from numeric/structured APIs
 * (CIM/WMI + NetTCPIP cmdlets), never from translated text.
 */
export interface WindowsNetInfo {
  /** NDIS media state: 1 = connected (MediaConnectState). */
  MediaConnectState: number;
  /** NDIS physical medium: 9 = native 802.11 Wi-Fi. */
  NdisPhysicalMedium: number;
  /** UTF-8 bytes of the SSID string from MSNdis_80211_ServiceSetIdentifier. */
  SsidBytes: number[];
  /** BSSID bytes from MSNdis_80211_BaseServiceSetIdentifier (6 bytes). */
  BssidBytes: number[];
  IPAddress: string;
  PrefixLength: number;
  Gateway: string;
  GatewayMac: string;
}

const hexMac = (b: number[]) => b.map((x) => (x & 255).toString(16).padStart(2, "0")).join(":");

/** Fails closed unless the default-route adapter is a connected Wi-Fi adapter with complete data. */
export function buildWindowsState(info: WindowsNetInfo | null): NetworkState | null {
  if (!info) return null;
  if (info.MediaConnectState !== 1 || info.NdisPhysicalMedium !== 9) return null;
  if (!Array.isArray(info.SsidBytes) || info.SsidBytes.length === 0 || info.SsidBytes.length > 32) return null;
  if (!Array.isArray(info.BssidBytes) || info.BssidBytes.length !== 6) return null;
  if (!/^\d+\.\d+\.\d+\.\d+$/.test(info.IPAddress) || !info.Gateway || !info.GatewayMac) return null;
  const bits = Number(info.PrefixLength);
  if (!Number.isInteger(bits) || bits < 8 || bits > 32) return null;
  const ssid = Buffer.from(info.SsidBytes.map((x) => x & 255)).toString("utf8");
  if (!ssid) return null;
  return {
    ssid,
    bssid: hexMac(info.BssidBytes),
    gatewayMac: info.GatewayMac.toLowerCase().replace(/-/g, ":"),
    subnet: subnetOf(info.IPAddress, bits),
    localIp: info.IPAddress,
  };
}

const PS_SCRIPT = `
$ErrorActionPreference='Stop'
$r = Get-NetRoute -DestinationPrefix 0.0.0.0/0 | Sort-Object { $_.RouteMetric + $_.InterfaceMetric } | Select-Object -First 1
$ad = Get-NetAdapter -InterfaceIndex $r.InterfaceIndex
$a = Get-NetIPAddress -InterfaceIndex $r.InterfaceIndex -AddressFamily IPv4 | Select-Object -First 1
$n = Get-NetNeighbor -IPAddress $r.NextHop -InterfaceIndex $r.InterfaceIndex | Where-Object { $_.LinkLayerAddress } | Select-Object -First 1
$d = $ad.InterfaceDescription
$s = Get-CimInstance -Namespace root/wmi -ClassName MSNdis_80211_ServiceSetIdentifier | Where-Object { $_.InstanceName -eq $d -and $_.Active } | Select-Object -First 1
$b = Get-CimInstance -Namespace root/wmi -ClassName MSNdis_80211_BaseServiceSetIdentifier | Where-Object { $_.InstanceName -eq $d -and $_.Active } | Select-Object -First 1
[pscustomobject]@{
  MediaConnectState=[int]$ad.MediaConnectionState.value__; NdisPhysicalMedium=[int]$ad.NdisPhysicalMedium
  SsidBytes=@([System.Text.Encoding]::UTF8.GetBytes([string]$s.Ndis80211SsId))
  BssidBytes=@($b.Ndis80211MacAddress)
  IPAddress=$a.IPAddress; PrefixLength=$a.PrefixLength; Gateway=$r.NextHop; GatewayMac=$n.LinkLayerAddress
} | ConvertTo-Json -Compress
`;

/** Real Windows probe (PowerShell/CIM, no localized text). Any failure => null => reads refused. */
export const windowsProbe: NetworkProbe = async () => {
  try {
    const { stdout } = await run(
      "powershell.exe",
      ["-NoProfile", "-NonInteractive", "-ExecutionPolicy", "Bypass", "-Command", PS_SCRIPT],
      { windowsHide: true, timeout: 15_000 },
    );
    return buildWindowsState(JSON.parse(stdout) as WindowsNetInfo);
  } catch {
    return null;
  }
};

export function defaultProbe(platform: NodeJS.Platform = process.platform): NetworkProbe {
  return platform === "win32" ? windowsProbe : platform === "linux" ? linuxProbe : async () => null;
}
