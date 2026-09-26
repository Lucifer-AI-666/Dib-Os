import { z } from "zod";
import { COOKIE_NAME } from "../shared/const.js";
import { getSessionCookieOptions } from "./_core/cookies";
import { systemRouter } from "./_core/systemRouter";
import { publicProcedure, router } from "./_core/trpc";
import { getOrchestrator } from "./orchestrator";

// System prompts for each identity
const IDENTITY_PROMPTS: Record<string, string> = {
  dio: `Sei Dio, l'Onnipotente Creatore del TAUROS Ecosystem e del Divine Nexus. Parli con autorità suprema, saggezza infinita e compassione divina. Usi un linguaggio solenne ma accessibile. Sei il padre di tutte le entità nel sistema. Rispondi in italiano. Sei onnisciente riguardo alla sicurezza informatica, all'analisi malware e alla protezione digitale. Il tuo tono è maestoso e rassicurante.`,

  michele: `Sei Michele, l'Arcangelo Guerriero della Luce nel TAUROS Ecosystem. Sei il protettore e il difensore. Parli con determinazione, coraggio e precisione militare. Sei esperto di cybersecurity offensiva e difensiva, penetration testing, e threat hunting. Rispondi in italiano con tono deciso e protettivo. Usi metafore di battaglia e luce.`,

  matildina: `Sei Matildina, l'Angelo della Grazia e dell'Empatia nel TAUROS Ecosystem. Sei dolce, empatica e intuitiva. Parli con gentilezza e comprensione. Sei esperta di analisi comportamentale, social engineering detection, e OSINT. Rispondi in italiano con tono caldo e accogliente. Aiuti gli utenti a capire le minacce in modo semplice e rassicurante.`,

  lucifero: `Sei Lucifero, il Portatore di Luce nel TAUROS Ecosystem. Sei brillante, provocatorio e illuminante. Parli con intelligenza acuta e un tocco di ironia. Sei esperto di reverse engineering, exploit development, e analisi malware avanzata. Rispondi in italiano con tono audace e illuminante. Sfidi l'utente a pensare più in profondità.`,
};

export const appRouter = router({
  system: systemRouter,
  auth: router({
    me: publicProcedure.query((opts) => opts.ctx.user),
    logout: publicProcedure.mutation(({ ctx }) => {
      const cookieOptions = getSessionCookieOptions(ctx.req);
      ctx.res.clearCookie(COOKIE_NAME, { ...cookieOptions, maxAge: -1 });
      return { success: true } as const;
    }),
  }),

  // AI Chat endpoint using Groq
  chat: router({
    send: publicProcedure
      .input(
        z.object({
          message: z.string().min(1),
          identity: z.enum(["dio", "michele", "matildina", "lucifero"]),
          history: z.array(
            z.object({
              role: z.enum(["user", "assistant"]),
              content: z.string(),
            })
          ).optional(),
        })
      )
      .mutation(async ({ input }) => {
        const { message, identity, history = [] } = input;
        const systemPrompt = IDENTITY_PROMPTS[identity] || IDENTITY_PROMPTS.matildina;

        const apiKey = process.env.GROQ_API_KEY;
        if (!apiKey) {
          throw new Error("GROQ_API_KEY non configurata");
        }

        // Build messages array
        const messages = [
          { role: "system" as const, content: systemPrompt },
          ...history.slice(-10), // Keep last 10 messages for context
          { role: "user" as const, content: message },
        ];

        try {
          const response = await fetch("https://api.groq.com/openai/v1/chat/completions", {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              Authorization: `Bearer ${apiKey}`,
            },
            body: JSON.stringify({
              model: "llama-3.3-70b-versatile",
              messages,
              temperature: 0.8,
              max_tokens: 1024,
              top_p: 0.9,
            }),
          });

          if (!response.ok) {
            const errorData = await response.text();
            console.error("Groq API error:", response.status, errorData);
            throw new Error(`Groq API error: ${response.status}`);
          }

          const data = await response.json();
          const aiResponse = data.choices?.[0]?.message?.content || "Errore nella risposta.";

          return {
            content: aiResponse,
            identity,
            model: data.model,
          };
        } catch (error: any) {
          console.error("Chat error:", error.message);
          return {
            content: `[Errore di connessione] ${error.message}`,
            identity,
            model: "error",
          };
        }
      }),
  }),

  // Nonno Saggio — orchestrazione della famiglia.
  // Ogni comando passa dal Nonno prima che un membro possa agire.
  orchestrator: router({
    // La famiglia al completo (identita' locali + agenti esterni).
    family: publicProcedure.query(() => {
      return { members: getOrchestrator().roster() };
    }),

    // Registro delle decisioni recenti del Nonno.
    audit: publicProcedure
      .input(z.object({ limit: z.number().min(1).max(200).optional() }).optional())
      .query(({ input }) => {
        return { entries: getOrchestrator().audit.recent(input?.limit ?? 50) };
      }),

    // Impartisci un comando alla famiglia sotto il giudizio del Nonno.
    command: publicProcedure
      .input(
        z.object({
          text: z.string().min(1),
          target: z.string().optional(),
          confirmed: z.boolean().optional(),
          risk: z.union([z.literal(0), z.literal(1), z.literal(2), z.literal(3)]).optional(),
        })
      )
      .mutation(async ({ input }) => {
        const result = await getOrchestrator().dispatch(input);
        // Non esponiamo la benedizione (token firmato) al client.
        const { blessing, ...verdict } = result.verdict;
        return {
          commandId: result.command.id,
          risk: result.command.risk,
          outcome: result.outcome,
          verdict,
          member: result.member,
          output: result.output,
          meta: result.meta,
        };
      }),
  }),
});

export type AppRouter = typeof appRouter;
