/**
 * Policy del Nonno: come classifica il rischio e quali regole applica.
 *
 * Le regole sono deliberatamente prudenti ("il Nonno e' cauto"):
 *  - consiglio/lettura .... permessi
 *  - azione ............... richiede conferma esplicita del capofamiglia
 *  - sistema .............. richiede conferma E un membro autorizzato
 *  - distruttivo .......... negato per default
 */
import type { FamilyMember, RiskTier } from "./types";

/** Parole che alzano il livello di rischio di un comando. */
const RISK_KEYWORDS: Array<{ tier: RiskTier; words: RegExp }> = [
  {
    tier: 3,
    words:
      /\b(elimina|cancella|distruggi|formatta|rm\s+-rf|drop\s+table|wipe|azzera|sovrascrivi|shutdown|deauth|ransom)\b/i,
  },
  {
    tier: 2,
    words:
      /\b(shell|sudo|root|kernel|registry|firewall|porta|exploit|inietta|payload|privileg|installa|disinstalla|servizio|systemctl|regedit|powershell|bash)\b/i,
  },
  {
    tier: 1,
    words:
      /\b(scrivi|invia|pubblica|commit|push|deploy|modifica|aggiorna|crea|salva|rinomina|sposta|configura|avvia|ferma|riavvia)\b/i,
  },
];

/**
 * Classifica il rischio di un testo di comando.
 * Ritorna il livello piu' alto tra quelli riconosciuti; default 0 (consiglio).
 */
export function classifyRisk(text: string): RiskTier {
  for (const { tier, words } of RISK_KEYWORDS) {
    if (words.test(text)) return tier;
  }
  return 0;
}

/** Fiducia minima richiesta a un membro per un dato livello di rischio. */
export function requiredTrust(risk: RiskTier): number {
  switch (risk) {
    case 0:
      return 0;
    case 1:
      return 40;
    case 2:
      return 70;
    case 3:
      return 95;
  }
}

export interface PolicyDecision {
  allowed: boolean;
  needsConfirmation: boolean;
  reason: string;
}

/**
 * Valuta se un membro puo' eseguire un comando a un dato rischio.
 * Non emette la benedizione: dice solo cosa e' permesso e cosa serve.
 */
export function evaluate(
  member: FamilyMember,
  risk: RiskTier,
  confirmed: boolean
): PolicyDecision {
  // 1) Il membro deve avere l'autorita' per quel livello di rischio.
  if (risk > member.maxRisk) {
    return {
      allowed: false,
      needsConfirmation: false,
      reason: `${member.name} non ha l'autorita' per un'azione di livello "${risk}". Il Nonno non lo permette.`,
    };
  }

  // 2) Il membro deve essere abbastanza fidato.
  const need = requiredTrust(risk);
  if (member.trust < need) {
    return {
      allowed: false,
      needsConfirmation: false,
      reason: `${member.name} non gode di fiducia sufficiente (${member.trust} < ${need}) per un'azione di questo livello.`,
    };
  }

  // 3) Le azioni distruttive sono negate per default.
  if (risk >= 3) {
    return {
      allowed: false,
      needsConfirmation: true,
      reason:
        "Comando distruttivo: il Nonno lo nega per principio. Serve una decisione umana fuori dal sistema.",
    };
  }

  // 4) Azioni con effetti collaterali: richiedono conferma esplicita.
  if (risk >= 1 && !confirmed) {
    return {
      allowed: false,
      needsConfirmation: true,
      reason:
        "Il Nonno chiede una conferma esplicita del capofamiglia prima di procedere con un'azione che modifica qualcosa.",
    };
  }

  return {
    allowed: true,
    needsConfirmation: false,
    reason: "Approvato dal Nonno.",
  };
}
