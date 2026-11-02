/**
 * reviewthread core: classify pull-request review comments
 * as actionable, noise, closed, stale, or duplicate, from
 * caller-supplied comment facts only.
 *
 *   triageReviewComments(args) -> { comments, counts, total }
 *
 * Rules (pinned): evaluated per comment in this exact
 * order; the first matching rule wins and its evidence
 * string is reported verbatim:
 *   1. state is "resolved" -> verdict "closed", evidence
 *      "thread is already resolved".
 *   2. state is "outdated" -> verdict "stale", evidence
 *      "comment is on outdated code".
 *   3. duplicate_of is present and non-empty after trimming
 *      -> verdict "duplicate", evidence "duplicates comment
 *      <id>" with the trimmed duplicate_of value.
 *   4. failing_check is true -> verdict "actionable",
 *      evidence "comment is attached to a failing check".
 *   5. author_kind is "bot" and the body is praise-only ->
 *      verdict "noise", evidence "praise-only bot comment
 *      with no failing check".
 *   6. author_kind is "bot" -> verdict "noise", evidence
 *      "bot comment with no failing check attached".
 *   7. author_kind is "human" -> verdict "actionable",
 *      evidence "open human comment".
 *
 * Praise-only (pinned): normalize the body — trim, convert
 * to lowercase, collapse each internal whitespace run to a
 * single space, then repeatedly strip trailing characters
 * in the set { "!", "." } — and compare against the exact
 * phrase set in PRAISE_PHRASES. Membership means
 * praise-only.
 *
 * A duplicate_of that is absent, or a string that is empty
 * or whitespace-only, counts as NO duplicate (rule 3 does
 * not fire). This is a pinned judgement call.
 *
 * Validation is strict and path-naming: any malformed
 * input throws an Error naming the offending path and no
 * partial result is produced. Unknown extra fields are
 * ignored, including inside comment items; a non-object
 * top-level argument is treated as {}.
 */
import type {
  AuthorKind,
  CommentVerdict,
  ThreadState,
  TriageCounts,
  TriageResult,
  Verdict,
} from "./types.js";

export const VERSION = "0.1.0";

/** The exact praise-only phrase set (pinned). */
const PRAISE_PHRASES: ReadonlySet<string> = new Set([
  "lgtm",
  "approved",
  "approve",
  "looks good",
  "looks good to me",
  "nice",
  "nice work",
  "great job",
  "great work",
  "+1",
  "ship it",
]);

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/** Normalize a body for the praise-only comparison (pinned). */
function isPraiseOnly(body: string): boolean {
  let normalized = body.trim().toLowerCase().replace(/\s+/g, " ");
  while (
    normalized.length > 0 &&
    (normalized.endsWith("!") || normalized.endsWith("."))
  ) {
    normalized = normalized.slice(0, -1);
  }
  return PRAISE_PHRASES.has(normalized);
}

interface ParsedComment {
  id: string;
  author: string;
  authorKind: AuthorKind;
  body: string;
  state: ThreadState;
  failingCheck: boolean;
  duplicateOf: string | undefined;
}

function parseComment(item: unknown, index: number): ParsedComment {
  const path = `comments[${index}]`;
  if (!isRecord(item)) {
    throw new Error(`${path} must be an object`);
  }

  if (item.id === undefined) throw new Error(`${path}.id is required`);
  if (typeof item.id !== "string" || item.id.length === 0) {
    throw new Error(`${path}.id must be a non-empty string`);
  }

  if (item.author === undefined) throw new Error(`${path}.author is required`);
  if (typeof item.author !== "string" || item.author.length === 0) {
    throw new Error(`${path}.author must be a non-empty string`);
  }

  if (item.author_kind === undefined) {
    throw new Error(`${path}.author_kind is required`);
  }
  if (item.author_kind !== "bot" && item.author_kind !== "human") {
    throw new Error(`${path}.author_kind must be one of: bot, human`);
  }

  if (item.body === undefined) throw new Error(`${path}.body is required`);
  if (typeof item.body !== "string") {
    throw new Error(`${path}.body must be a string`);
  }

  if (item.state === undefined) throw new Error(`${path}.state is required`);
  if (
    item.state !== "open" &&
    item.state !== "resolved" &&
    item.state !== "outdated"
  ) {
    throw new Error(`${path}.state must be one of: open, resolved, outdated`);
  }

  if (
    item.failing_check !== undefined &&
    typeof item.failing_check !== "boolean"
  ) {
    throw new Error(`${path}.failing_check must be a boolean`);
  }

  if (item.duplicate_of !== undefined && typeof item.duplicate_of !== "string") {
    throw new Error(`${path}.duplicate_of must be a string`);
  }

  return {
    id: item.id,
    author: item.author,
    authorKind: item.author_kind,
    body: item.body,
    state: item.state,
    failingCheck: item.failing_check ?? false,
    duplicateOf: item.duplicate_of,
  };
}

function classify(comment: ParsedComment): { verdict: Verdict; evidence: string } {
  // Rule 1: resolved thread.
  if (comment.state === "resolved") {
    return { verdict: "closed", evidence: "thread is already resolved" };
  }
  // Rule 2: outdated thread.
  if (comment.state === "outdated") {
    return { verdict: "stale", evidence: "comment is on outdated code" };
  }
  // Rule 3: duplicate (absent / empty / whitespace-only is no duplicate).
  const duplicateId = comment.duplicateOf?.trim();
  if (duplicateId !== undefined && duplicateId.length > 0) {
    return { verdict: "duplicate", evidence: `duplicates comment ${duplicateId}` };
  }
  // Rule 4: attached to a failing check.
  if (comment.failingCheck) {
    return {
      verdict: "actionable",
      evidence: "comment is attached to a failing check",
    };
  }
  // Rule 5: praise-only bot comment.
  if (comment.authorKind === "bot" && isPraiseOnly(comment.body)) {
    return {
      verdict: "noise",
      evidence: "praise-only bot comment with no failing check",
    };
  }
  // Rule 6: any other bot comment.
  if (comment.authorKind === "bot") {
    return {
      verdict: "noise",
      evidence: "bot comment with no failing check attached",
    };
  }
  // Rule 7: open human comment.
  return { verdict: "actionable", evidence: "open human comment" };
}

/** Classify pull-request review comments. */
export function triageReviewComments(args: unknown): TriageResult {
  const raw: Record<string, unknown> = isRecord(args) ? args : {};

  if (raw.comments === undefined) throw new Error("comments is required");
  if (!Array.isArray(raw.comments)) {
    throw new Error("comments must be an array");
  }
  if (raw.comments.length === 0) {
    throw new Error("comments must contain at least 1 item");
  }

  const parsed = raw.comments.map((item, index) => parseComment(item, index));

  const comments: CommentVerdict[] = parsed.map((comment) => {
    const { verdict, evidence } = classify(comment);
    return { id: comment.id, author: comment.author, verdict, evidence };
  });

  const counts: TriageCounts = {
    actionable: 0,
    noise: 0,
    closed: 0,
    stale: 0,
    duplicate: 0,
  };
  for (const comment of comments) counts[comment.verdict] += 1;

  return { comments, counts, total: comments.length };
}

/** Render a payload as the JSON text block MCP clients show. */
export function formatPayload(payload: unknown): string {
  return typeof payload === "string" ? payload : JSON.stringify(payload, null, 2);
}
