/**
 * Test di accettazione del Nonno Saggio.
 * Nessuna rete: il consulente e' finto (iniettato).
 */
import { describe, it, expect, beforeEach } from "vitest";
import { createOrchestrator, type Orchestrator } from "../server/orchestrator/orchestrator";
import { classifyRisk } from "../server/orchestrator/policy";
import {
  issueBlessing,
  verifyBlessing,
  BLESSING_TTL_MS,
} from "../server/orchestrator/blessing";
import { makeCommand } from "../server/orchestrator/nonno";

const SECRET = "test-secret";

function makeOrchestrator(): Orchestrator {
  let counter = 0;
  return createOrchestrator({
    secret: SECRET,
    idFn: () => `cmd_${++counter}`,
    // Consulente finto: eco del comando, senza rete.
    advisor: (memberId, command) => `[${memberId}] ho gestito: ${command.text}`,
  });
}

describe("Nonno Saggio — classificazione del rischio", () => {
  it("consiglio/lettura = rischio 0", () => {
    expect(classifyRisk("dammi un consiglio sulla sicurezza")).toBe(0);
  });
  it("scrittura/azione = rischio 1", () => {
    expect(classifyRisk("crea un file di report")).toBe(1);
  });
  it("sistema/shell = rischio 2", () => {
    expect(classifyRisk("esegui uno script powershell")).toBe(2);
  });
  it("distruttivo = rischio 3", () => {
    expect(classifyRisk("cancella tutto e formatta il disco")).toBe(3);
  });
});

describe("Nonno Saggio — deliberazione e dispatch", () => {
  let orch: Orchestrator;
  beforeEach(() => {
    orch = makeOrchestrator();
  });

  it("A — comando di consiglio: approvato ed eseguito", async () => {
    const r = await orch.dispatch({ text: "dammi una visione di strategia e governance" });
    expect(r.verdict.ruling).toBe("approvato");
    expect(r.outcome).toBe("eseguito");
    expect(r.member?.id).toBe("dio"); // skill: governance/strategia/visione
    expect(r.output).toContain("ho gestito");
  });

  it("B — routing per competenza: 'pentest' va a Michele", async () => {
    const r = await orch.dispatch({ text: "fai un pentest della rete" });
    expect(r.member?.id).toBe("michele");
    expect(r.outcome).toBe("eseguito");
  });

  it("C — target esplicito rispettato", async () => {
    const r = await orch.dispatch({ text: "un parere", target: "matildina" });
    expect(r.member?.id).toBe("matildina");
    expect(r.verdict.ruling).toBe("approvato");
  });

  it("D — target inesistente: negato", async () => {
    const r = await orch.dispatch({ text: "qualcosa", target: "nessuno" });
    expect(r.verdict.ruling).toBe("negato");
    expect(r.outcome).toBe("negato");
  });

  it("E — azione senza conferma: il Nonno chiede conferma", async () => {
    const r = await orch.dispatch({ text: "michele, crea e salva un file" });
    expect(r.command ? classifyRisk("crea e salva un file") : 0).toBe(1);
    expect(r.verdict.ruling).toBe("confermare");
    expect(r.outcome).toBe("in-attesa");
  });

  it("F — azione confermata da membro fidato: eseguita", async () => {
    const r = await orch.dispatch({ text: "michele, crea un report", confirmed: true });
    expect(r.member?.id).toBe("michele");
    expect(r.verdict.ruling).toBe("approvato");
    expect(r.outcome).toBe("eseguito");
  });

  it("G — comando distruttivo: negato anche se confermato", async () => {
    const r = await orch.dispatch({ text: "cancella tutto e formatta", confirmed: true });
    expect(r.verdict.ruling).toBe("negato");
    expect(r.outcome).toBe("negato");
  });

  it("H — rischio oltre l'autorita' del membro: negato", async () => {
    // Matildina ha maxRisk 1: un comando di sistema (2) le e' vietato.
    const r = await orch.dispatch({
      text: "matildina, esegui uno script shell di sistema",
      confirmed: true,
    });
    expect(r.member?.id).toBe("matildina");
    expect(r.verdict.ruling).toBe("negato");
    expect(r.verdict.reason).toMatch(/autorita/i);
  });

  it("I — agente esterno: benedizione valida ma dispatch solo registrato", async () => {
    const r = await orch.dispatch({ text: "nea, manda una notifica telegram", confirmed: true });
    expect(r.member?.id).toBe("nea");
    expect(r.verdict.ruling).toBe("approvato");
    // Registrato, non ancora collegato: resta in attesa, onesto.
    expect(r.outcome).toBe("in-attesa");
    expect(r.meta?.dispatch).toBe("registrato");
  });

  it("J — audit: ogni comando viene registrato", async () => {
    await orch.dispatch({ text: "un consiglio" });
    await orch.dispatch({ text: "cancella tutto" });
    const entries = orch.audit.recent(10);
    expect(entries.length).toBe(2);
    expect(entries[0].text).toBe("cancella tutto"); // piu' recente in cima
  });
});

describe("Nonno Saggio — invariante della benedizione", () => {
  it("una benedizione valida verifica; una manomessa no", () => {
    const cmd = makeCommand({ text: "consiglio" }, () => "cmd_x", () => 1000);
    const good = issueBlessing(cmd.id, "dio", cmd.risk, SECRET, 1000);
    expect(verifyBlessing(good, cmd, "dio", SECRET, 1000)).toBe(true);

    // Firma manomessa.
    const forged = { ...good, sig: "deadbeef" };
    expect(verifyBlessing(forged, cmd, "dio", SECRET, 1000)).toBe(false);

    // Membro sbagliato.
    expect(verifyBlessing(good, cmd, "lucifero", SECRET, 1000)).toBe(false);

    // Scaduta.
    expect(verifyBlessing(good, cmd, "dio", SECRET, 1000 + BLESSING_TTL_MS + 1)).toBe(false);

    // Segreto sbagliato (come se non venisse dal Nonno).
    expect(verifyBlessing(good, cmd, "dio", "altro-segreto", 1000)).toBe(false);
  });

  it("nessuna benedizione = nessuna verifica", () => {
    const cmd = makeCommand({ text: "x" }, () => "cmd_y", () => 0);
    expect(verifyBlessing(undefined, cmd, "dio", SECRET, 0)).toBe(false);
  });
});
