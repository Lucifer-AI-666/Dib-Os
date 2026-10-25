import fs from "node:fs";
import path from "node:path";

const THREE_DAYS_MS = 3 * 24 * 60 * 60 * 1000;
const FILE = path.join(process.cwd(), "data", "trials.json");

type Row = { startedAt: number; paid?: boolean };
type Store = Record<string, Row>;

export type TrialState = {
  trialId: string;
  startedAt: number;
  expiresAt: number;
  active: boolean;
  daysLeft: number;
  paid: boolean;
  mustPay: boolean;
};

function readStore(): Store {
  try {
    return JSON.parse(fs.readFileSync(FILE, "utf8")) as Store;
  } catch {
    return {};
  }
}

function writeStore(store: Store) {
  fs.mkdirSync(path.dirname(FILE), { recursive: true });
  fs.writeFileSync(FILE, JSON.stringify(store));
}

export function validTrialId(id: string): boolean {
  return /^[A-Za-z0-9-]{16,64}$/.test(id);
}

function stateOf(trialId: string, row: Row): TrialState {
  const expiresAt = row.startedAt + THREE_DAYS_MS;
  const left = expiresAt - Date.now();
  const paid = row.paid === true;
  const inTrial = left > 0;
  return {
    trialId,
    startedAt: row.startedAt,
    expiresAt,
    active: paid || inTrial,
    daysLeft: inTrial ? Math.ceil(left / (24 * 60 * 60 * 1000)) : 0,
    paid,
    mustPay: !paid && !inTrial,
  };
}

/** Apre la prova se l'id è nuovo. Non allunga mai una prova già iniziata. */
export function openTrial(trialId: string): TrialState {
  if (!validTrialId(trialId)) {
    throw new Error("identificativo prova non valido");
  }
  const store = readStore();
  const row = store[trialId] ?? { startedAt: Date.now() };
  if (!store[trialId]) {
    store[trialId] = row;
    writeStore(store);
  }
  return stateOf(trialId, row);
}

/** Sblocca la chat dopo un pagamento confermato da Stripe. */
export function markTrialPaid(trialId: string): TrialState | null {
  if (!validTrialId(trialId)) return null;
  const store = readStore();
  const row = store[trialId];
  if (!row) return null;
  row.paid = true;
  store[trialId] = row;
  writeStore(store);
  return stateOf(trialId, row);
}
