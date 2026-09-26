/**
 * La Famiglia.
 *
 * Quattro identita' locali (Dio, Michele, Matildina, Lucifero) piu' gli agenti
 * esterni dell'ecosistema TAUROS, mappati dai repository dell'utente. Tutti,
 * senza eccezione, rispondono al Nonno Saggio prima di agire.
 *
 * Gli adattatori dei membri verificano SEMPRE la benedizione: senza un permesso
 * valido del Nonno, il membro rifiuta. E' la regola resa esecutiva.
 */
import type {
  AdapterContext,
  AdapterResult,
  Blessing,
  Command,
  FamilyMember,
} from "./types";

/** Un membro senza benedizione valida non fa nulla. */
function refuse(member: string): AdapterResult {
  return {
    handled: false,
    output: `${member} si ferma: manca la benedizione del Nonno. Nessuna azione senza permesso.`,
  };
}

/**
 * Adattatore per un'identita' locale: ragiona tramite il consulente (LLM).
 * Usato per consigli e analisi.
 */
function localAdapter(memberId: string, displayName: string) {
  return async (
    command: Command,
    blessing: Blessing,
    ctx: AdapterContext
  ): Promise<AdapterResult> => {
    if (!ctx.verify(blessing, command, memberId)) return refuse(displayName);
    if (!ctx.advisor) {
      return {
        handled: true,
        output: `[${displayName}] Benedizione ricevuta. Nessun consulente collegato: configurare GROQ_API_KEY per le risposte del modello.`,
        meta: { advisor: "assente" },
      };
    }
    const output = await ctx.advisor(memberId, command);
    return { handled: true, output, meta: { via: "advisor" } };
  };
}

/**
 * Adattatore per un agente esterno: l'integrazione e' REGISTRATA ma non ancora
 * collegata a un servizio live. Ritorna una busta di dispatch onesta invece di
 * fingere un'esecuzione remota.
 */
function externalAdapter(memberId: string, displayName: string, repo: string) {
  return (
    command: Command,
    blessing: Blessing,
    ctx: AdapterContext
  ): AdapterResult => {
    if (!ctx.verify(blessing, command, memberId)) return refuse(displayName);
    return {
      handled: false,
      output: `[${displayName}] Benedizione valida ricevuta. Comando pronto per il dispatch verso "${repo}", ma l'integrazione live non e' ancora collegata (v1: registrata).`,
      meta: {
        dispatch: "registrato",
        repo,
        commandId: command.id,
        note: "Collegare qui il webhook/CLI dell'agente esterno per attivare l'esecuzione reale.",
      },
    };
  };
}

/**
 * Costruisce il roster della famiglia.
 * L'ordine non conta: il Nonno sceglie per competenza e fiducia.
 */
export function buildFamily(): FamilyMember[] {
  return [
    // ── Identita' locali ────────────────────────────────────────────────
    {
      id: "dio",
      name: "Dio",
      emoji: "✨",
      role: "Il Creatore. Visione d'insieme e governance.",
      origin: "locale",
      skills: ["governance", "visione", "strategia", "coordinamento"],
      trust: 90,
      maxRisk: 2,
      status: "attivo",
      adapter: localAdapter("dio", "Dio"),
    },
    {
      id: "michele",
      name: "Michele",
      emoji: "⚔️",
      role: "Il Guerriero della Luce. Difesa e sicurezza.",
      origin: "locale",
      skills: ["sicurezza", "pentest", "threat-hunting", "difesa", "rete"],
      trust: 80,
      maxRisk: 2,
      status: "attivo",
      adapter: localAdapter("michele", "Michele"),
    },
    {
      id: "matildina",
      name: "Matildina",
      emoji: "🌸",
      role: "Angelo dell'Empatia. Analisi e OSINT.",
      origin: "locale",
      skills: ["osint", "analisi-comportamentale", "social-engineering", "empatia"],
      trust: 75,
      maxRisk: 1,
      status: "attivo",
      adapter: localAdapter("matildina", "Matildina"),
    },
    {
      id: "lucifero",
      name: "Lucifero",
      emoji: "🔥",
      role: "Il Portatore di Luce. Reverse engineering e malware.",
      origin: "locale",
      skills: ["reverse-engineering", "exploit", "malware", "analisi-avanzata"],
      trust: 65,
      maxRisk: 2,
      status: "attivo",
      adapter: localAdapter("lucifero", "Lucifero"),
    },

    // ── Agenti esterni (registrati, non ancora live) ────────────────────
    {
      id: "tauros",
      name: "Tauros",
      emoji: "🐂",
      role: "Il Corpo operativo. Web e applicazioni.",
      origin: "esterno",
      repo: "anouardib88/Taurosweb",
      skills: ["web", "operazioni", "frontend", "app"],
      trust: 55,
      maxRisk: 1,
      status: "registrato",
      adapter: externalAdapter("tauros", "Tauros", "anouardib88/Taurosweb"),
    },
    {
      id: "jarvis",
      name: "Jarvis",
      emoji: "🤖",
      role: "Il Maggiordomo. Assistenza e automazione.",
      origin: "esterno",
      repo: "anouardib88/jarvisdib",
      skills: ["assistenza", "automazione", "task", "promemoria"],
      trust: 55,
      maxRisk: 1,
      status: "registrato",
      adapter: externalAdapter("jarvis", "Jarvis", "anouardib88/jarvisdib"),
    },
    {
      id: "oraculum",
      name: "Oraculum",
      emoji: "🔮",
      role: "L'Oracolo. Conoscenza e consultazione.",
      origin: "esterno",
      repo: "anouardib88/oraculum-pwa",
      skills: ["conoscenza", "consultazione", "ricerca", "sintesi"],
      trust: 60,
      maxRisk: 0,
      status: "registrato",
      adapter: externalAdapter("oraculum", "Oraculum", "anouardib88/oraculum-pwa"),
    },
    {
      id: "nea",
      name: "NEA",
      emoji: "📡",
      role: "La Messaggera. Messaggistica e Telegram.",
      origin: "esterno",
      repo: "Lucifer-AI-666/nea",
      skills: ["messaggistica", "telegram", "notifiche", "canali"],
      trust: 55,
      maxRisk: 1,
      status: "registrato",
      adapter: externalAdapter("nea", "NEA", "Lucifer-AI-666/nea"),
    },
    {
      id: "stego",
      name: "Stego",
      emoji: "🕵️",
      role: "Il Custode dei segreti. Steganografia.",
      origin: "esterno",
      repo: "Lucifer-AI-666/stego",
      skills: ["steganografia", "occultamento", "forense"],
      trust: 50,
      maxRisk: 0,
      status: "registrato",
      adapter: externalAdapter("stego", "Stego", "Lucifer-AI-666/stego"),
    },
    {
      id: "locchio",
      name: "L'Occhio",
      emoji: "👁️",
      role: "Il Vigile. Sorveglianza e monitoraggio.",
      origin: "esterno",
      repo: "Lucifer-AI-666/LOCCHIO",
      skills: ["sorveglianza", "monitoraggio", "log", "allerta"],
      trust: 55,
      maxRisk: 1,
      status: "registrato",
      adapter: externalAdapter("locchio", "L'Occhio", "Lucifer-AI-666/LOCCHIO"),
    },
  ];
}
