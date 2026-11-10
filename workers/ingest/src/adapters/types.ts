import type { ImportedDay, ImportKind } from "@zdz/db";

/**
 * One adapter per schedule source (ARCHITECTURE.md §5). Remote adapters must
 * not fetch anything before `assertImportAllowed` passed for `sourceName`.
 */
export interface ScheduleAdapter {
  name: string;
  /** Must match schedule_source.name, which carries the license status. */
  sourceName: string;
  kind: ImportKind;
  /** Dates this adapter can deliver, "YYYY-MM-DD". */
  listDays(): Promise<string[]>;
  loadDay(date: string): Promise<ImportedDay>;
}
