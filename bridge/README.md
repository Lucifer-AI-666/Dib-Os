# Dib-OS / TAUROS Bridge

Read-mostly local bridge. mTLS 1.3 transport + AES-256-GCM envelopes, no public router ports.

## Install (Windows 10/11)
1. Install Node 20+ and pnpm, run `pnpm install`. Install OpenSSL (e.g. via Git for Windows) for certificates.
2. Create a CA, a server cert (with `subjectAltName=IP:<your LAN IP>`) and one client cert per device with `openssl req/x509`.
3. Get the client cert fingerprint: `openssl x509 -in client.crt -noout -fingerprint -sha256` (strip the colons).
4. Create a 32-byte pairing key: `node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"` and give it, with the client cert, to the device over a trusted local channel.
5. Create `bridge.config.json`:
   `{ "host": "<LAN IP>", "port": 8443, "tls": {"key":"server.key","cert":"server.crt","clientCa":"ca.crt"},
   "devices": [{"deviceId":"d1","name":"Laptop","keyBase64":"...","certFingerprint":"<hex>","allowedFolders":["C:\\Projects"],
   "network":{"ssid":"Home","bssid":"optional","gatewayMac":"aa:bb:cc:dd:ee:ff","subnet":"192.168.1.0/24"}}] }`
   (current values are what the bridge prints/probes while connected to your Wi-Fi; `ipconfig`, `arp -a`, `netsh wlan show interfaces`).
6. Run `pnpm bridge bridge.config.json`.

The Windows probe uses PowerShell/CIM numeric fields (`MediaConnectionState`, `NdisPhysicalMedium`, `MSNdis_80211_*` in root/wmi, `Get-NetRoute/IPAddress/Neighbor`), so it does not depend on the Windows display language. It fails closed (reads refused) if disconnected, unparsable, or if the default route is not a connected Wi-Fi adapter. Linux uses `nmcli`/`ip`.

## Guarantees
- Client must present a certificate signed by your CA **and** matching the paired device's fingerprint; unknown certs fail the TLS handshake.
- Server binds to one LAN address (0.0.0.0 refused). The peer IP and local interface IP come from the real TCP connection and must be in the authorized subnet / on the verified Wi-Fi interface; the client's own claims are ignored.
- Network (SSID + gateway MAC + subnet, optional BSSID) is re-verified on every request and every 3 s for open connections, which are destroyed on change, unverifiable network or revocation.
- `read` returns file contents (≤256 KB per file, text only, query-filtered) from authorized folders only; OS permission errors are respected.
- write/move/delete require a live operator "yes" on the bridge console for each operation; a client flag cannot grant it. Without an approver, they are denied.
- Approval prompts are queued: one at a time.
- Replay/stale protection; answers include `source`, `retrievedAt`, `unreachable`.
- GitHub/Vercel/Codacy: tokens via `GITHUB_TOKEN`, `VERCEL_TOKEN`, `CODACY_API_TOKEN` (presence check only; no API calls yet).

## Verification status
`pnpm vitest run bridge` runs unit tests, Windows parser fixtures and a real mTLS server on loopback where the network state is changed. Note: when the Wi-Fi really changes, the PC's IP changes too, so the client usually sees "cannot connect" rather than `network_changed` (still safe). The Windows PowerShell probe and a real Wi-Fi switch have **not** been exercised on a physical Windows machine yet; do this manually: start the bridge, query OK, switch Wi-Fi, query must return `network_changed`/`network_unverifiable`.
