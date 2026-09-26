/**
 * Benedizione firmata del Nonno.
 *
 * Una benedizione e' un token HMAC che prova che il Nonno ha approvato un
 * comando specifico per un membro specifico. L'esecutore la verifica prima di
 * agire: se manca o non e' valida (firma errata, membro sbagliato, scaduta),
 * il membro NON puo' fare nulla.
 */
import { createHmac, timingSafeEqual } from "crypto";
import type { Blessing, Command, RiskTier } from "./types";

/** Durata di validita' di una benedizione (5 minuti). */
export const BLESSING_TTL_MS = 5 * 60 * 1000;

/**
 * Segreto del Nonno. In produzione va impostato via NONNO_SECRET.
 * Il fallback serve solo a sviluppo/test locali.
 */
export function getNonnoSecret(): string {
  return process.env.NONNO_SECRET || "nonno-saggio-dev-secret-cambiami";
}

function payload(b: Pick<Blessing, "commandId" | "memberId" | "risk" | "issuedAt" | "expiresAt">): string {
  return `${b.commandId}.${b.memberId}.${b.risk}.${b.issuedAt}.${b.expiresAt}`;
}

function sign(data: string, secret: string): string {
  return createHmac("sha256", secret).update(data).digest("hex");
}

/** Il Nonno emette una benedizione per un comando e un membro. */
export function issueBlessing(
  commandId: string,
  memberId: string,
  risk: RiskTier,
  secret: string,
  now: number = Date.now()
): Blessing {
  const base = {
    commandId,
    memberId,
    risk,
    issuedAt: now,
    expiresAt: now + BLESSING_TTL_MS,
  };
  return { ...base, sig: sign(payload(base), secret) };
}

/**
 * Verifica una benedizione contro il comando e il membro attesi.
 * Ritorna true solo se firma valida, comando/membro coincidenti e non scaduta.
 */
export function verifyBlessing(
  blessing: Blessing | undefined | null,
  command: Command,
  memberId: string,
  secret: string,
  now: number = Date.now()
): boolean {
  if (!blessing) return false;
  if (blessing.commandId !== command.id) return false;
  if (blessing.memberId !== memberId) return false;
  if (blessing.risk !== command.risk) return false;
  if (now > blessing.expiresAt) return false;

  const expected = sign(payload(blessing), secret);
  const a = Buffer.from(expected, "hex");
  const b = Buffer.from(blessing.sig ?? "", "hex");
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}
