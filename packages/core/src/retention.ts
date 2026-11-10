/**
 * How long contributions and reports are kept (`pnpm ingest purge`, run with every snapshot).
 * The Mitmachen consent text and the Datenschutzerklärung quote these numbers.
 */
export const RETENTION_DAYS = {
  /** Submissions the spam filter caught (kept a while to audit the filter). */
  spam: 30,
  /** Rejected submissions, with their files. */
  rejected: 90,
  /** The optional e-mail address, after a submission was approved or rejected. */
  email: 90,
  /** Handled "Video defekt" reports. */
  reports: 180,
} as const;
