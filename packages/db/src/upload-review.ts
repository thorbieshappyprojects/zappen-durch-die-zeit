import { eq } from "drizzle-orm";
import type { Db } from "./client";
import { uploadReview } from "./schema";

export type UploadDecision = "include" | "exclude";

/** Admin decisions per review group (see seed/upload-review.json); groups without a row are undecided. */
export async function listUploadDecisions(db: Db): Promise<Record<string, { decision: UploadDecision; note: string | null; decidedAt: Date }>> {
  const rows = await db.select().from(uploadReview);
  return Object.fromEntries(rows.map((r) => [r.groupId, { decision: r.decision, note: r.note, decidedAt: r.decidedAt }]));
}

export async function setUploadDecision(db: Db, groupId: string, decision: UploadDecision | null, note?: string): Promise<void> {
  if (decision === null) {
    await db.delete(uploadReview).where(eq(uploadReview.groupId, groupId));
    return;
  }
  await db
    .insert(uploadReview)
    .values({ groupId, decision, note: note ?? null })
    .onConflictDoUpdate({ target: uploadReview.groupId, set: { decision, note: note ?? null, decidedAt: new Date() } });
}
