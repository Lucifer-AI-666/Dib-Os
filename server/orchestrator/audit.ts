/**
 * Registro di controllo (audit).
 *
 * Ogni decisione del Nonno e ogni esito viene annotato. In v1 e' in memoria
 * (utile per la dashboard e i test); il punto di estensione naturale e' una
 * tabella persistente.
 */
import type { AuditEntry } from "./types";

export interface AuditLog {
  record: (entry: AuditEntry) => void;
  recent: (limit?: number) => AuditEntry[];
  all: () => AuditEntry[];
  clear: () => void;
}

/** Crea un registro in memoria con un tetto massimo di voci. */
export function createAuditLog(max = 500): AuditLog {
  const entries: AuditEntry[] = [];
  return {
    record(entry) {
      entries.push(entry);
      if (entries.length > max) entries.splice(0, entries.length - max);
    },
    recent(limit = 50) {
      return entries.slice(-limit).reverse();
    },
    all() {
      return [...entries];
    },
    clear() {
      entries.length = 0;
    },
  };
}
