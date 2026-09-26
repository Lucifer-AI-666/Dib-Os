/**
 * Il Nonno Saggio.
 *
 * Riceve un comando, decide CHI della famiglia dovrebbe occuparsene e SE puo'
 * farlo. Solo quando approva emette una benedizione. Nessun membro agisce senza
 * passare da qui.
 */
import { issueBlessing } from "./blessing";
import { classifyRisk, evaluate } from "./policy";
import type { Command, FamilyMember, Verdict } from "./types";

/** Normalizza per il matching (minuscole, senza accenti). */
function norm(s: string): string {
  return s
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
}

/**
 * Sceglie il membro piu' adatto a un comando in base alle competenze.
 * Punteggio = numero di skill che compaiono nel testo; a parita' vince la
 * fiducia piu' alta. Se nessuno combacia, torna null (deciso a monte).
 */
export function chooseMember(
  command: Command,
  family: FamilyMember[]
): FamilyMember | null {
  const text = norm(command.text);
  let best: FamilyMember | null = null;
  let bestScore = -1;

  for (const m of family) {
    let score = 0;
    for (const skill of m.skills) {
      if (text.includes(norm(skill))) score += 1;
    }
    // Il nome esplicito nel testo pesa molto.
    if (text.includes(norm(m.name)) || text.includes(m.id)) score += 3;

    if (score > bestScore || (score === bestScore && best && m.trust > best.trust)) {
      best = m;
      bestScore = score;
    }
  }

  return bestScore > 0 ? best : null;
}

export interface Nonno {
  deliberate: (command: Command, family: FamilyMember[]) => Verdict;
}

export interface NonnoOptions {
  secret: string;
  /** Membro di riserva quando il routing non trova competenze (default "dio"). */
  fallbackMemberId?: string;
  now?: () => number;
}

/** Crea un'istanza del Nonno con un segreto per firmare le benedizioni. */
export function createNonno(opts: NonnoOptions): Nonno {
  const now = opts.now ?? (() => Date.now());
  const fallbackId = opts.fallbackMemberId ?? "dio";

  return {
    deliberate(command, family) {
      const risk = command.risk;

      // 1) Chi se ne occupa.
      const explicit = command.target
        ? family.find((m) => m.id === command.target)
        : undefined;

      if (command.target && !explicit) {
        return {
          ruling: "negato",
          risk,
          reason: `Nessun membro della famiglia si chiama "${command.target}".`,
        };
      }

      const member =
        explicit ??
        chooseMember(command, family) ??
        family.find((m) => m.id === fallbackId) ??
        null;

      if (!member) {
        return {
          ruling: "negato",
          risk,
          reason: "Il Nonno non trova nessun membro adatto a questo comando.",
        };
      }

      // 2) La policy decide cosa e' permesso.
      const decision = evaluate(member, risk, command.confirmed);

      if (!decision.allowed) {
        return {
          ruling: decision.needsConfirmation ? "confermare" : "negato",
          risk,
          assignedTo: member.id,
          reason: decision.reason,
        };
      }

      // 3) Approvato: il Nonno benedice il comando per questo membro.
      const blessing = issueBlessing(command.id, member.id, risk, opts.secret, now());
      return {
        ruling: "approvato",
        risk,
        assignedTo: member.id,
        reason: `Il Nonno affida il compito a ${member.name}. ${decision.reason}`,
        blessing,
      };
    },
  };
}

/** Costruisce un Command completo a partire da un input grezzo. */
export function makeCommand(
  input: { text: string; target?: string; confirmed?: boolean; risk?: number; issuedBy?: string },
  idFn: () => string,
  now: () => number = Date.now
): Command {
  const classified = classifyRisk(input.text);
  const provided = input.risk;
  const safeProvided = provided === 0 || provided === 1 || provided === 2 || provided === 3 ? provided : undefined;
  const risk = (safeProvided !== undefined ? Math.max(classified, safeProvided) : classified) as Command["risk"];
  return {
    id: idFn(),
    text: input.text,
    risk,
    target: input.target,
    confirmed: input.confirmed ?? false,
    issuedBy: input.issuedBy ?? "capofamiglia",
    at: now(),
  };
}
