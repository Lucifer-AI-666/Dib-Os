/**
 * Nonno Saggio — punto d'ingresso pubblico.
 *
 * Espone un'istanza singleton dell'orchestratore, gia' collegata al consulente
 * Groq per le identita' locali. La usa il router tRPC.
 */
import { createGroqAdvisor } from "./advisor";
import { getNonnoSecret } from "./blessing";
import { createOrchestrator, type Orchestrator } from "./orchestrator";

export * from "./types";
export { buildFamily } from "./family";
export { classifyRisk } from "./policy";
export { createNonno, chooseMember, makeCommand } from "./nonno";
export { createOrchestrator } from "./orchestrator";
export { issueBlessing, verifyBlessing } from "./blessing";
export { createAuditLog } from "./audit";
export { createGroqAdvisor } from "./advisor";

let singleton: Orchestrator | null = null;

/** Orchestratore condiviso dell'applicazione (lazy). */
export function getOrchestrator(): Orchestrator {
  if (!singleton) {
    singleton = createOrchestrator({
      secret: getNonnoSecret(),
      advisor: createGroqAdvisor(),
    });
  }
  return singleton;
}
