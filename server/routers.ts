import { z } from "zod";
import { COOKIE_NAME } from "../shared/const.js";
import { getSessionCookieOptions } from "./_core/cookies";
import { systemRouter } from "./_core/systemRouter";
import { publicProcedure, router } from "./_core/trpc";
import { getOrchestrator } from "./orchestrator";
import { IDENTITIES, sendIdentityChat } from "./chatSend";
import { openTrial, validTrialId } from "./trial";
import { createCheckout } from "./pay";

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
          identity: z.enum(IDENTITIES),
          trialId: z.string().min(16).max(64),
          history: z.array(
            z.object({
              role: z.enum(["user", "assistant"]),
              content: z.string(),
            })
          ).optional(),
        })
      )
      .mutation(async ({ input }) => {
        const trial = openTrial(input.trialId);
        if (!trial.active) {
          return {
            content: "I 3 giorni di prova sono finiti. Per continuare bisogna pagare.",
            identity: input.identity,
            model: "trial-ended",
            trial,
          };
        }
        try {
          const reply = await sendIdentityChat(input);
          return { ...reply, trial };
        } catch (error: any) {
          console.error("Chat error:", error.message);
          return {
            content: `[Errore di connessione] ${error.message}`,
            identity: input.identity,
            model: "error",
            trial,
          };
        }
      }),
  }),

  trial: router({
    start: publicProcedure
      .input(z.object({ trialId: z.string().min(16).max(64) }))
      .mutation(({ input }) => {
        if (!validTrialId(input.trialId)) {
          throw new Error("identificativo prova non valido");
        }
        return openTrial(input.trialId);
      }),
    checkout: publicProcedure
      .input(z.object({ trialId: z.string().min(16).max(64) }))
      .mutation(async ({ input }) => {
        const trial = openTrial(input.trialId);
        if (!trial.mustPay) {
          return { url: "", trial };
        }
        const url = await createCheckout(input.trialId);
        return { url, trial };
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
