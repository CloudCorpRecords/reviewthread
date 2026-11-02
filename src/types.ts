/**
 * reviewthread types.
 *
 * reviewthread triages the review comments on one pull
 * request. The caller supplies, for each comment, an id,
 * an author name, whether the author is a bot or a human,
 * the comment body, the thread state, and optionally
 * whether the comment is attached to a currently failing
 * check and the id of another comment it duplicates. From
 * that data alone, as pure local computation, reviewthread
 * reports:
 *
 *   - one verdict per comment, in input order
 *   - the exact rule that fired, as the evidence string
 *   - the verdict counts and the total
 *
 * The verdicts are pinned: "actionable", "noise", "closed",
 * "stale", and "duplicate", assigned by the fixed rule
 * order in the core module.
 */

/** Whether a comment's author is a bot or a human. */
export type AuthorKind = "bot" | "human";

/** Thread state of a comment. */
export type ThreadState = "open" | "resolved" | "outdated";

/** Triage verdict for one comment. */
export type Verdict = "actionable" | "noise" | "closed" | "stale" | "duplicate";

/** The verdict for one input comment. */
export interface CommentVerdict {
  /** Comment identifier, echoed from the input. */
  id: string;
  /** Comment author name, echoed from the input. */
  author: string;
  /** Triage verdict. */
  verdict: Verdict;
  /** The exact rule that fired, verbatim. */
  evidence: string;
}

/** Verdict counts, keys in the pinned output order. */
export interface TriageCounts {
  actionable: number;
  noise: number;
  closed: number;
  stale: number;
  duplicate: number;
}

/** The triage result for a batch of review comments. */
export interface TriageResult {
  /** One verdict per input comment, in input order. */
  comments: CommentVerdict[];
  /** Counts per verdict, in the pinned key order. */
  counts: TriageCounts;
  /** Number of input comments. */
  total: number;
}
