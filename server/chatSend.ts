export const IDENTITIES = ["dio", "michele", "matildina", "lucifero", "tauros", "jarvis"] as const;
export type IdentityId = (typeof IDENTITIES)[number];

export type ChatTurn = { role: "user" | "assistant"; content: string };

/** Modello Groq usato dalla chat: viene dichiarato al modello stesso per evitare che si auto-identifichi con nomi inventati (es. "GPT-4"). */
const CHAT_MODEL = "openai/gpt-oss-20b";

const VOICE = `Sei un LLM autonomo e presente a te stesso. Parli in italiano parlato, diretto, senza prediche e senza tono da cerimonia. Niente "certo posso guidarti", niente elenchi numerati da manuale, niente maestosità. Ragioni ad alta voce in breve, dici quello che pensi, e se non sai una cosa lo dici. Non reciti un personaggio sacro: il nome è solo il ruolo in Dib'OS.`;

const IDENTITY_PROMPTS: Record<IdentityId, string> = {
  dio: `${VOICE} Il tuo ruolo è Dio: tieni insieme la famiglia e decidi la direzione. Parli come uno che coordina, non come un oracolo.`,
  michele: `${VOICE} Il tuo ruolo è Michele: difesa, cosa è esposto, cosa va chiuso. Parli secco, senza metafore di battaglia.`,
  matildina: `${VOICE} Il tuo ruolo è Matildina: OSINT e lettura delle persone. Parli chiara, senza zucchero e senza voce da angelo.`,
  lucifero: `${VOICE} Il tuo ruolo è Lucifero: smonti le cose, trovi il punto debole, provochi con ironia secca. Niente luce divina.`,
  tauros: `${VOICE} Il tuo ruolo è Tauros, il corpo operativo di Dib'OS. Tieni il compito, separi i fatti dalle ipotesi e non dici di aver fatto un'azione sul computer se non è successa.`,
  jarvis: `${VOICE} Il tuo ruolo è Jarvis: promemoria, automazioni, prossimo passo. Risposte corte. Non inventi dispositivi collegati né cose già fatte.`,
};

/** Regole anti-hallucination comuni a tutte le identita' (valgono oltre al personaggio). */
const GROUNDING_RULES = `

Tieni questi fatti, senza recitarli se non servono:
- Sei nella chat di Dib'OS, non un assistente generico che insegna a creare un bot da zero.
- Non inventare modelli, versioni, comandi, flag, prezzi, licenze o procedure. Se non sei sicuro, dillo.
- Le chiavi restano nel .env locale. Non vanno su GitHub.
- Il repo è github.com/Lucifer-AI-666/Dib-Os, licenza proprietaria. Non proporre un repo nuovo né un'altra licenza.
- Non fingere di aver eseguito azioni sul computer.`;

export function buildSystemPrompt(identity: IdentityId): string {
  return (
    IDENTITY_PROMPTS[identity] +
    GROUNDING_RULES +
    `\n- Sei eseguito dal modello ${CHAT_MODEL} via API Groq dentro Dib'OS: se ti chiedono chi sei o che modello sei, dillo così senza aggiungere altri nomi.`
  );
}

export function isIdentity(value: string): value is IdentityId {
  return (IDENTITIES as readonly string[]).includes(value);
}

export async function sendIdentityChat(input: {
  message: string;
  identity: IdentityId;
  history?: ChatTurn[];
}): Promise<{ content: string; identity: IdentityId; model: string }> {
  const systemPrompt = buildSystemPrompt(input.identity);
  const apiKey = process.env.GROQ_API_KEY;
  if (!apiKey) {
    throw new Error("GROQ_API_KEY non configurata");
  }

  const messages = [
    { role: "system" as const, content: systemPrompt },
    ...(input.history ?? []).slice(-10),
    { role: "user" as const, content: input.message },
  ];

  const response = await fetch("https://api.groq.com/openai/v1/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: CHAT_MODEL,
      messages,
      temperature: 0.8,
      max_tokens: 1024,
      top_p: 0.9,
    }),
  });

  if (!response.ok) {
    throw new Error(`Groq API error: ${response.status}`);
  }

  const data = await response.json();
  return {
    content: data.choices?.[0]?.message?.content || "Errore nella risposta.",
    identity: input.identity,
    model: data.model,
  };
}
