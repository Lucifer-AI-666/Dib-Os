# Dib-OS Bridge

Read-mostly local bridge: no public ports, AES-256-GCM envelopes, per-device pairing keys.

## Install
`pnpm install` then `pnpm test bridge` (Linux probe needs `nmcli` and `iproute2`).

## Pairing
1. `newPairingKey()` (bridge/channel.ts) → share the 32-byte key with the device over a trusted local channel (e.g. QR).
2. `bridge.pair({ deviceId, name, key, allowedFolders, network })` where `network` is the fingerprint (SSID + gateway MAC + subnet, optional BSSID) you authorize.
3. `bridge.revoke(deviceId)` ends access immediately.

## Guarantees
- Network is re-verified on **every** request using SSID + gateway MAC + subnet (SSID alone is not trusted), and the device must report the same fingerprint and an IP in the subnet. Changed/unverifiable network → refused.
- Unknown/unpaired/revoked devices, bad keys, replays and stale messages are refused.
- Reads are limited to authorized folders (symlink-safe) and filtered by query; OS permission errors are respected.
- write/move/delete require `explicit: true`.
- Every answer carries `source`, `retrievedAt` and `unreachable`; nothing is claimed for devices not contacted.
- GitHub/Vercel/Codacy use their own tokens (`GITHUB_TOKEN`, `VERCEL_TOKEN`, `CODACY_API_TOKEN`); Wi-Fi never substitutes authentication. `integrationStatus()` reports honestly when not connected.
- Bind any listener to the LAN interface only; never port-forward on the router.
