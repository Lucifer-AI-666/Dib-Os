/**
 * Consulente locale: fa ragionare un'identita' tramite il modello (Groq),
 * riusando le personalita' del Divine Nexus. Usato dagli adattatori locali per
 * consigli e analisi. Se GROQ_API_KEY manca, ritorna un messaggio chiaro.
 */
import type { Advisor, Command } from "./types";

/** Prompt di sistema per membro (le identita' locali del Nexus). */
const MEMBER_PROMPTS: Record<string, string> = {
  dio: "Sei Dio, il Creatore del TAUROS Ecosystem. Coordini la famiglia con visione e saggezza. Rispondi in italiano, conciso e operativo.",
  michele:
    "Sei Michele, il Guerriero della Luce: difesa, pentest e threat hunting. Rispondi in italiano, deciso e concreto.",
  matildina:
    "Sei Matildina, empatica e intuitiva: OSINT e analisi comportamentale. Rispondi in italiano, chiara e rassicurante.",
  lucifero:
    "Sei Lucifero, brillante e provocatorio: reverse engineering e analisi malware. Rispondi in italiano, acuto e diretto.",
};

const FALLBACK_PROMPT =
  "Sei un membro operativo del TAUROS Ecosystem. Rispondi in italiano, conciso e concreto, restando nei limiti del compito affidato dal Nonno.";

/**
 * Crea un Advisor basato su Groq. Iniettabile: nei test si passa un finto
 * advisor senza toccare la rete.
 */
export function createGroqAdvisor(model = "llama-3.3-70b-versatile"): Advisor {
  return async (memberId: string, command: Command): Promise<string> => {
    const apiKey = process.env.GROQ_API_KEY;
    if (!apiKey) {
      return `[${memberId}] Consulente non configurato (GROQ_API_KEY assente). Comando ricevuto: "${command.text}".`;
    }

    const systemPrompt = MEMBER_PROMPTS[memberId] ?? FALLBACK_PROMPT;

    try {
      const response = await fetch("https://api.groq.com/openai/v1/chat/completions", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${apiKey}`,
        },
        body: JSON.stringify({
          model,
          messages: [
            { role: "system", content: systemPrompt },
            { role: "user", content: command.text },
          ],
          temperature: 0.7,
          max_tokens: 1024,
        }),
      });

      if (!response.ok) {
        const detail = await response.text();
        return `[${memberId}] Errore modello ${response.status}: ${detail.slice(0, 200)}`;
      }

      const data = await response.json();
      return data.choices?.[0]?.message?.content ?? "(nessuna risposta dal modello)";
    } catch (err: any) {
      return `[${memberId}] Errore di connessione: ${err?.message ?? err}`;
    }
  };
}
