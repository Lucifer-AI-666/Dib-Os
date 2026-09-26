/**
 * L'Orchestratore.
 *
 * L'unico ingresso per impartire comandi alla famiglia. Il flusso e' sempre:
 *
 *   comando  →  il Nonno delibera  →  (se approvato) benedizione  →  il membro
 *   verifica la benedizione ed esegue  →  audit
 *
 * Non esiste percorso che salti il Nonno. E' cosi' che "la famiglia risponde al
 * nonno saggio prima di fare qualunque cosa".
 */
import { createAuditLog, type AuditLog } from "./audit";
import { verifyBlessing } from "./blessing";
import { buildFamily } from "./family";
import { createNonno, makeCommand, type Nonno } from "./nonno";
import type {
  AdapterContext,
  Advisor,
  Command,
  CommandInput,
  DispatchResult,
  FamilyMember,
  MemberProfile,
} from "./types";

export interface OrchestratorOptions {
  secret: string;
  family?: FamilyMember[];
  nonno?: Nonno;
  audit?: AuditLog;
  advisor?: Advisor;
  idFn?: () => string;
  now?: () => number;
}

export interface Orchestrator {
  dispatch: (input: CommandInput) => Promise<DispatchResult>;
  roster: () => MemberProfile[];
  audit: AuditLog;
}

function toProfile(m: FamilyMember): MemberProfile {
  const { adapter, ...profile } = m;
  return profile;
}

function randomId(): string {
  // ID sufficientemente unico senza dipendenze esterne.
  return `cmd_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}

export function createOrchestrator(opts: OrchestratorOptions): Orchestrator {
  const secret = opts.secret;
  const family = opts.family ?? buildFamily();
  const nonno = opts.nonno ?? createNonno({ secret, now: opts.now });
  const audit = opts.audit ?? createAuditLog();
  const idFn = opts.idFn ?? randomId;
  const now = opts.now ?? (() => Date.now());

  const ctx: AdapterContext = {
    verify: (blessing, command, memberId) =>
      verifyBlessing(blessing, command, memberId, secret, now()),
    advisor: opts.advisor,
  };

  async function dispatch(input: CommandInput): Promise<DispatchResult> {
    const command: Command = makeCommand(input, idFn, now);
    const verdict = nonno.deliberate(command, family);
    const member = verdict.assignedTo
      ? family.find((m) => m.id === verdict.assignedTo)
      : undefined;

    // Verdetto negativo o in attesa di conferma: si ferma qui.
    if (verdict.ruling !== "approvato" || !verdict.blessing || !member) {
      const outcome = verdict.ruling === "confermare" ? "in-attesa" : "negato";
      audit.record({
        commandId: command.id,
        at: command.at,
        text: command.text,
        risk: command.risk,
        ruling: verdict.ruling,
        reason: verdict.reason,
        memberId: verdict.assignedTo,
        outcome,
      });
      return {
        command,
        verdict,
        outcome,
        member: member ? toProfile(member) : undefined,
        output: verdict.reason,
      };
    }

    // Approvato: il membro esegue, ma solo dopo aver verificato la benedizione.
    try {
      const result = await member.adapter(command, verdict.blessing, ctx);
      const outcome = result.handled ? "eseguito" : "in-attesa";
      audit.record({
        commandId: command.id,
        at: command.at,
        text: command.text,
        risk: command.risk,
        ruling: verdict.ruling,
        reason: verdict.reason,
        memberId: member.id,
        outcome,
        output: result.output,
      });
      return {
        command,
        verdict,
        outcome,
        member: toProfile(member),
        output: result.output,
        meta: result.meta,
      };
    } catch (err: any) {
      audit.record({
        commandId: command.id,
        at: command.at,
        text: command.text,
        risk: command.risk,
        ruling: verdict.ruling,
        reason: verdict.reason,
        memberId: member.id,
        outcome: "errore",
        output: err?.message ?? String(err),
      });
      return {
        command,
        verdict,
        outcome: "errore",
        member: toProfile(member),
        output: `Errore durante l'esecuzione: ${err?.message ?? err}`,
      };
    }
  }

  return {
    dispatch,
    roster: () => family.map(toProfile),
    audit,
  };
}
