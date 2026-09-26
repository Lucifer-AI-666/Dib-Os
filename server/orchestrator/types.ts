/**
 * Nonno Saggio — Orchestrazione della Famiglia
 * =============================================
 * Un solo governatore (il "Nonno Saggio") a cui ogni membro della famiglia
 * deve chiedere il permesso PRIMA di fare qualunque cosa.
 *
 * Il permesso ha forma di "benedizione" (Blessing): un token firmato che il
 * membro deve possedere per poter agire. Nessuna benedizione = nessuna azione.
 * Questa e' la regola resa vera nel codice, non solo a parole.
 */

/**
 * Livello di rischio di un comando, in ordine crescente.
 *  0 = consiglio/lettura (nessun effetto collaterale)
 *  1 = azione (scrittura, effetti collaterali reversibili)
 *  2 = sistema (accesso al sistema, shell, configurazioni)
 *  3 = distruttivo (irreversibile o pericoloso)
 */
export type RiskTier = 0 | 1 | 2 | 3;

export const RISK_LABELS: Record<RiskTier, string> = {
  0: "consiglio",
  1: "azione",
  2: "sistema",
  3: "distruttivo",
};

/** Provenienza di un membro: identita' locale o agente esterno (repo/servizio). */
export type Origin = "locale" | "esterno";

/** Stato operativo di un membro. */
export type MemberStatus = "attivo" | "registrato";

/** Verdetto del Nonno su un comando. */
export type Ruling = "approvato" | "confermare" | "negato";

/** Esito finale dell'orchestrazione di un comando. */
export type Outcome = "eseguito" | "negato" | "in-attesa" | "errore";

/**
 * Benedizione: prova firmata che il Nonno ha approvato un dato comando per un
 * dato membro. Il membro/esecutore la verifica prima di agire.
 */
export interface Blessing {
  commandId: string;
  memberId: string;
  risk: RiskTier;
  issuedAt: number;
  expiresAt: number;
  /** Firma HMAC sui campi sopra, con il segreto del Nonno. */
  sig: string;
}

/** Comando impartito dal capofamiglia (l'utente) al sistema. */
export interface Command {
  id: string;
  /** Cosa vuole l'utente, in linguaggio naturale. */
  text: string;
  /** Rischio classificato del comando. */
  risk: RiskTier;
  /** Membro esplicitamente richiesto (opzionale: altrimenti sceglie il Nonno). */
  target?: string;
  /** L'utente ha confermato esplicitamente un'azione rischiosa. */
  confirmed: boolean;
  /** Chi ha impartito il comando (sempre l'utente/capofamiglia in v1). */
  issuedBy: string;
  at: number;
}

/** Input grezzo per creare un comando (i campi mancanti vengono dedotti). */
export interface CommandInput {
  text: string;
  target?: string;
  confirmed?: boolean;
  /** Rischio esplicito; se assente viene classificato automaticamente. */
  risk?: RiskTier;
  issuedBy?: string;
}

/**
 * Adattatore di un membro: il modo concreto con cui il membro "agisce" una
 * volta ricevuta la benedizione. Riceve sempre la benedizione: senza di essa
 * (o con una benedizione non valida) deve rifiutare.
 */
export type MemberAdapter = (
  command: Command,
  blessing: Blessing,
  ctx: AdapterContext
) => Promise<AdapterResult> | AdapterResult;

export interface AdapterContext {
  /** Verifica una benedizione contro il comando e il membro correnti. */
  verify: (blessing: Blessing, command: Command, memberId: string) => boolean;
  /** Consulente locale (LLM) per i membri che ragionano tramite il modello. */
  advisor?: Advisor;
}

export interface AdapterResult {
  /** L'azione e' stata realmente eseguita/consegnata. */
  handled: boolean;
  /** Risposta testuale o payload strutturato. */
  output: string;
  /** Metadati (canale, target esterno, modello, ecc.). */
  meta?: Record<string, unknown>;
}

/** Un membro della famiglia. */
export interface FamilyMember {
  id: string;
  name: string;
  emoji: string;
  /** Ruolo nella famiglia. */
  role: string;
  origin: Origin;
  /** Se esterno: repository/servizio di riferimento. */
  repo?: string;
  /** Competenze per il routing dei comandi. */
  skills: string[];
  /** Quanto il Nonno si fida (0..100). */
  trust: number;
  /** Massimo livello di rischio che questo membro puo' ricevere. */
  maxRisk: RiskTier;
  status: MemberStatus;
  adapter: MemberAdapter;
}

/** Vista pubblica di un membro (senza funzioni). */
export type MemberProfile = Omit<FamilyMember, "adapter">;

/** Verdetto emesso dal Nonno. */
export interface Verdict {
  ruling: Ruling;
  reason: string;
  /** Membro scelto per eseguire (se pertinente). */
  assignedTo?: string;
  /** Rischio come valutato dal Nonno. */
  risk: RiskTier;
  /** Benedizione, presente solo quando ruling === "approvato". */
  blessing?: Blessing;
}

/** Voce del registro di controllo (audit). */
export interface AuditEntry {
  commandId: string;
  at: number;
  text: string;
  risk: RiskTier;
  ruling: Ruling;
  reason: string;
  memberId?: string;
  outcome: Outcome;
  output?: string;
}

/** Risultato completo dell'orchestrazione di un comando. */
export interface DispatchResult {
  command: Command;
  verdict: Verdict;
  outcome: Outcome;
  member?: MemberProfile;
  output?: string;
  meta?: Record<string, unknown>;
}

/** Funzione consulente: un membro locale ragiona tramite un modello. */
export type Advisor = (
  memberId: string,
  command: Command
) => Promise<string> | string;

/** Configurazione della famiglia (una regola/consiglio dal Nonno). */
export const NONNO = {
  id: "nonno",
  name: "Nonno Saggio",
  emoji: "🧓",
  role: "Il Vecchio Saggio. Nessuno agisce senza il suo permesso.",
} as const;
