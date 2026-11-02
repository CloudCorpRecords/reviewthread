import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { triageReviewComments } from "../src/reviewthread.js";

/**
 * All tests are pure local computation over inline comment
 * objects: no filesystem and no network. Each of the seven
 * pinned rules firing with its exact evidence string, the
 * rule precedence order, the praise-only normalization
 * edges, the duplicate_of empty/whitespace judgement call,
 * the counts and total, and every validation path are each
 * pinned.
 */

type CommentInput = {
  id: string;
  author: string;
  author_kind: string;
  body: string;
  state: string;
  failing_check?: unknown;
  duplicate_of?: unknown;
};

const human: CommentInput = {
  id: "c1",
  author: "alice",
  author_kind: "human",
  body: "This still races when the cache is cold.",
  state: "open",
};

const bot: CommentInput = {
  id: "c2",
  author: "ci-bot",
  author_kind: "bot",
  body: "Coverage report attached.",
  state: "open",
};

function one(comment: CommentInput) {
  return triageReviewComments({ comments: [comment] }).comments[0];
}

describe("triageReviewComments — each rule fires with its exact evidence", () => {
  it("rule 1: a resolved thread is closed", () => {
    assert.deepEqual(one({ ...human, state: "resolved" }), {
      id: "c1",
      author: "alice",
      verdict: "closed",
      evidence: "thread is already resolved",
    });
  });

  it("rule 2: an outdated thread is stale", () => {
    assert.deepEqual(one({ ...human, state: "outdated" }), {
      id: "c1",
      author: "alice",
      verdict: "stale",
      evidence: "comment is on outdated code",
    });
  });

  it("rule 3: a duplicate names the duplicated comment", () => {
    assert.deepEqual(one({ ...human, duplicate_of: "c9" }), {
      id: "c1",
      author: "alice",
      verdict: "duplicate",
      evidence: "duplicates comment c9",
    });
  });

  it("rule 3: the duplicate evidence uses the trimmed duplicate_of value", () => {
    const out = one({ ...human, duplicate_of: "  c9  " });
    assert.equal(out.verdict, "duplicate");
    assert.equal(out.evidence, "duplicates comment c9");
  });

  it("rule 4: a human comment on a failing check is actionable", () => {
    assert.deepEqual(one({ ...human, failing_check: true }), {
      id: "c1",
      author: "alice",
      verdict: "actionable",
      evidence: "comment is attached to a failing check",
    });
  });

  it("rule 4: a bot comment on a failing check is actionable", () => {
    const out = one({ ...bot, failing_check: true });
    assert.equal(out.verdict, "actionable");
    assert.equal(out.evidence, "comment is attached to a failing check");
  });

  it("rule 5: a praise-only bot comment is noise with the praise evidence", () => {
    assert.deepEqual(one({ ...bot, body: "LGTM" }), {
      id: "c2",
      author: "ci-bot",
      verdict: "noise",
      evidence: "praise-only bot comment with no failing check",
    });
  });

  it("rule 6: a non-praise bot comment is noise with the generic evidence", () => {
    assert.deepEqual(one({ ...bot }), {
      id: "c2",
      author: "ci-bot",
      verdict: "noise",
      evidence: "bot comment with no failing check attached",
    });
  });

  it("rule 7: an open human comment is actionable", () => {
    assert.deepEqual(one({ ...human }), {
      id: "c1",
      author: "alice",
      verdict: "actionable",
      evidence: "open human comment",
    });
  });

  it("an explicit failing_check of false falls through to the later rules", () => {
    assert.equal(
      one({ ...bot, failing_check: false }).evidence,
      "bot comment with no failing check attached",
    );
    assert.equal(
      one({ ...human, failing_check: false }).evidence,
      "open human comment",
    );
  });
});

describe("triageReviewComments — rule precedence", () => {
  it("resolved beats duplicate and failing_check together", () => {
    const out = one({
      ...human,
      state: "resolved",
      duplicate_of: "c9",
      failing_check: true,
    });
    assert.equal(out.verdict, "closed");
    assert.equal(out.evidence, "thread is already resolved");
  });

  it("resolved beats praise for a bot", () => {
    const out = one({ ...bot, state: "resolved", body: "lgtm" });
    assert.equal(out.verdict, "closed");
  });

  it("outdated beats duplicate", () => {
    const out = one({ ...human, state: "outdated", duplicate_of: "c9" });
    assert.equal(out.verdict, "stale");
    assert.equal(out.evidence, "comment is on outdated code");
  });

  it("outdated beats failing_check", () => {
    const out = one({ ...bot, state: "outdated", failing_check: true });
    assert.equal(out.verdict, "stale");
  });

  it("duplicate beats failing_check", () => {
    const out = one({ ...human, duplicate_of: "c9", failing_check: true });
    assert.equal(out.verdict, "duplicate");
    assert.equal(out.evidence, "duplicates comment c9");
  });

  it("duplicate beats praise for a bot", () => {
    const out = one({ ...bot, body: "nice work", duplicate_of: "c9" });
    assert.equal(out.verdict, "duplicate");
  });

  it("failing_check beats praise for a bot", () => {
    const out = one({ ...bot, body: "lgtm", failing_check: true });
    assert.equal(out.verdict, "actionable");
    assert.equal(out.evidence, "comment is attached to a failing check");
  });

  it("failing_check beats the generic bot rule", () => {
    const out = one({ ...bot, failing_check: true });
    assert.equal(out.verdict, "actionable");
  });

  it("praise beats the generic bot rule (praise evidence, not generic)", () => {
    const out = one({ ...bot, body: "nice work" });
    assert.equal(out.verdict, "noise");
    assert.equal(out.evidence, "praise-only bot comment with no failing check");
  });
});

describe("triageReviewComments — praise-only normalization", () => {
  const praiseEvidence = "praise-only bot comment with no failing check";
  const genericEvidence = "bot comment with no failing check attached";
  const verdictFor = (body: string) => one({ ...bot, body });

  it("every phrase in the exact set is praise-only", () => {
    for (const phrase of [
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
    ]) {
      assert.equal(verdictFor(phrase).evidence, praiseEvidence, phrase);
    }
  });

  it("matching is case-insensitive", () => {
    assert.equal(verdictFor("LGTM").evidence, praiseEvidence);
    assert.equal(verdictFor("LoOkS GoOd To Me").evidence, praiseEvidence);
    assert.equal(verdictFor("SHIP IT").evidence, praiseEvidence);
  });

  it("trailing exclamation marks are stripped, repeatedly", () => {
    assert.equal(verdictFor("lgtm!").evidence, praiseEvidence);
    assert.equal(verdictFor("Ship it!!").evidence, praiseEvidence);
    assert.equal(verdictFor("+1!").evidence, praiseEvidence);
  });

  it("trailing periods are stripped, repeatedly, and mixed with exclamation marks", () => {
    assert.equal(verdictFor("Approved.").evidence, praiseEvidence);
    assert.equal(verdictFor("great job..").evidence, praiseEvidence);
    assert.equal(verdictFor("nice work!.").evidence, praiseEvidence);
    assert.equal(verdictFor("nice work.!").evidence, praiseEvidence);
  });

  it("leading and trailing whitespace is trimmed and internal runs collapse", () => {
    assert.equal(verdictFor("  nice work  ").evidence, praiseEvidence);
    assert.equal(verdictFor("looks   good\tto  me").evidence, praiseEvidence);
    assert.equal(verdictFor("\ngreat   job\n").evidence, praiseEvidence);
  });

  it("a body that is not exactly a set phrase falls to rule 6", () => {
    assert.equal(verdictFor("great job everyone").evidence, genericEvidence);
    assert.equal(verdictFor("thanks").evidence, genericEvidence);
    assert.equal(verdictFor("lgtm but one nit").evidence, genericEvidence);
    assert.equal(verdictFor("looks good, mostly").evidence, genericEvidence);
    assert.equal(verdictFor("nice work on the refactor").evidence, genericEvidence);
  });

  it("an empty body from a bot is rule 6, not praise", () => {
    const out = verdictFor("");
    assert.equal(out.verdict, "noise");
    assert.equal(out.evidence, genericEvidence);
  });

  it("a whitespace-only body from a bot is rule 6, not praise", () => {
    assert.equal(verdictFor("   ").evidence, genericEvidence);
  });

  it("a punctuation-only body from a bot is rule 6, not praise", () => {
    assert.equal(verdictFor("!!!").evidence, genericEvidence);
    assert.equal(verdictFor("...").evidence, genericEvidence);
  });

  it("praise-only applies only to bots: a praise body from a human is rule 7", () => {
    const out = one({ ...human, body: "LGTM!" });
    assert.equal(out.verdict, "actionable");
    assert.equal(out.evidence, "open human comment");
  });
});

describe("triageReviewComments — duplicate_of empty/whitespace judgement call", () => {
  it("an absent duplicate_of is no duplicate", () => {
    assert.equal(one({ ...human }).evidence, "open human comment");
  });

  it("an empty-string duplicate_of is no duplicate (pinned judgement call)", () => {
    const out = one({ ...human, duplicate_of: "" });
    assert.equal(out.verdict, "actionable");
    assert.equal(out.evidence, "open human comment");
  });

  it("a whitespace-only duplicate_of is no duplicate (pinned judgement call)", () => {
    const out = one({ ...human, duplicate_of: "   " });
    assert.equal(out.verdict, "actionable");
    assert.equal(out.evidence, "open human comment");
  });

  it("a whitespace-only duplicate_of falls through to the praise rule for a bot", () => {
    const out = one({ ...bot, body: "lgtm", duplicate_of: " \t " });
    assert.equal(out.verdict, "noise");
    assert.equal(out.evidence, "praise-only bot comment with no failing check");
  });

  it("an empty duplicate_of falls through to the failing-check rule", () => {
    const out = one({ ...human, duplicate_of: "", failing_check: true });
    assert.equal(out.verdict, "actionable");
    assert.equal(out.evidence, "comment is attached to a failing check");
  });
});

describe("triageReviewComments — output shape, counts, and total", () => {
  it("a mixed batch yields one verdict per comment in input order, with exact counts", () => {
    const out = triageReviewComments({
      comments: [
        { ...human, id: "a", state: "resolved" },
        { ...human, id: "b", state: "outdated" },
        { ...human, id: "c", duplicate_of: "a" },
        { ...bot, id: "d", failing_check: true },
        { ...bot, id: "e", body: "ship it" },
        { ...human, id: "f" },
      ],
    });
    assert.deepEqual(
      out.comments.map((c) => [c.id, c.verdict]),
      [
        ["a", "closed"],
        ["b", "stale"],
        ["c", "duplicate"],
        ["d", "actionable"],
        ["e", "noise"],
        ["f", "actionable"],
      ],
    );
    assert.deepEqual(out.counts, {
      actionable: 2,
      noise: 1,
      closed: 1,
      stale: 1,
      duplicate: 1,
    });
    assert.equal(out.total, 6);
  });

  it("counts keys are in the pinned order", () => {
    const out = triageReviewComments({ comments: [human] });
    assert.deepEqual(Object.keys(out.counts), [
      "actionable",
      "noise",
      "closed",
      "stale",
      "duplicate",
    ]);
    assert.deepEqual(Object.keys(out), ["comments", "counts", "total"]);
  });

  it("verdict objects carry exactly id, author, verdict, and evidence", () => {
    const out = triageReviewComments({ comments: [human] });
    assert.deepEqual(Object.keys(out.comments[0]), [
      "id",
      "author",
      "verdict",
      "evidence",
    ]);
    assert.deepEqual(out.counts, {
      actionable: 1,
      noise: 0,
      closed: 0,
      stale: 0,
      duplicate: 0,
    });
    assert.equal(out.total, 1);
  });

  it("counts sum to the total on a larger batch", () => {
    const comments = Array.from({ length: 10 }, (_, i) => ({
      ...bot,
      id: `b${i}`,
      body: i % 2 === 0 ? "lgtm" : "scan complete, 3 findings",
    }));
    const out = triageReviewComments({ comments });
    assert.equal(out.total, 10);
    assert.equal(out.counts.noise, 10);
    assert.equal(
      Object.values(out.counts).reduce((a, b) => a + b, 0),
      out.total,
    );
  });

  it("id and author are echoed exactly", () => {
    const out = one({
      ...human,
      id: "PRR_kwDO-123_x",
      author: "some.user+bot",
    });
    assert.equal(out.id, "PRR_kwDO-123_x");
    assert.equal(out.author, "some.user+bot");
  });
});

describe("triageReviewComments — validation", () => {
  const throws = (args: unknown, message: string) =>
    assert.throws(() => triageReviewComments(args), { message });

  it("comments missing is an error naming comments", () => {
    throws({}, "comments is required");
  });

  it("a non-object top-level argument is treated as {} and fails on comments", () => {
    throws(null, "comments is required");
    throws([], "comments is required");
    throws("comments", "comments is required");
    throws(42, "comments is required");
    throws(undefined, "comments is required");
  });

  it("comments not an array names comments", () => {
    throws({ comments: "c1" }, "comments must be an array");
    throws({ comments: { 0: human } }, "comments must be an array");
    throws({ comments: 3 }, "comments must be an array");
    throws({ comments: null }, "comments must be an array");
  });

  it("an empty comments array is an error", () => {
    throws({ comments: [] }, "comments must contain at least 1 item");
  });

  it("an item that is not an object names its path", () => {
    throws({ comments: [null] }, "comments[0] must be an object");
    throws({ comments: ["c1"] }, "comments[0] must be an object");
    throws({ comments: [[human]] }, "comments[0] must be an object");
    throws({ comments: [human, 7] }, "comments[1] must be an object");
  });

  it("id missing, empty, or non-string names comments[i].id", () => {
    const { id: _drop, ...noId } = human;
    throws({ comments: [noId] }, "comments[0].id is required");
    throws({ comments: [{ ...human, id: "" }] }, "comments[0].id must be a non-empty string");
    throws({ comments: [{ ...human, id: 42 }] }, "comments[0].id must be a non-empty string");
    throws({ comments: [{ ...human, id: null }] }, "comments[0].id must be a non-empty string");
    throws(
      { comments: [human, { ...human, id: "" }] },
      "comments[1].id must be a non-empty string",
    );
  });

  it("author missing, empty, or non-string names comments[i].author", () => {
    const { author: _drop, ...noAuthor } = human;
    throws({ comments: [noAuthor] }, "comments[0].author is required");
    throws(
      { comments: [{ ...human, author: "" }] },
      "comments[0].author must be a non-empty string",
    );
    throws(
      { comments: [{ ...human, author: false }] },
      "comments[0].author must be a non-empty string",
    );
    throws(
      { comments: [{ ...human, author: null }] },
      "comments[0].author must be a non-empty string",
    );
  });

  it("author_kind missing names comments[i].author_kind", () => {
    const { author_kind: _drop, ...noKind } = human;
    throws({ comments: [noKind] }, "comments[0].author_kind is required");
  });

  it("author_kind outside the pinned enum names comments[i].author_kind", () => {
    throws(
      { comments: [{ ...human, author_kind: "robot" }] },
      "comments[0].author_kind must be one of: bot, human",
    );
    throws(
      { comments: [{ ...human, author_kind: "Bot" }] },
      "comments[0].author_kind must be one of: bot, human",
    );
    throws(
      { comments: [{ ...human, author_kind: "" }] },
      "comments[0].author_kind must be one of: bot, human",
    );
    throws(
      { comments: [{ ...human, author_kind: 1 }] },
      "comments[0].author_kind must be one of: bot, human",
    );
    throws(
      { comments: [{ ...human, author_kind: null }] },
      "comments[0].author_kind must be one of: bot, human",
    );
  });

  it("body missing or non-string names comments[i].body, and an empty body is valid", () => {
    const { body: _drop, ...noBody } = human;
    throws({ comments: [noBody] }, "comments[0].body is required");
    throws(
      { comments: [{ ...human, body: 42 }] },
      "comments[0].body must be a string",
    );
    throws(
      { comments: [{ ...human, body: null }] },
      "comments[0].body must be a string",
    );
    throws(
      { comments: [{ ...human, body: [] }] },
      "comments[0].body must be a string",
    );
    assert.equal(one({ ...human, body: "" }).verdict, "actionable");
  });

  it("state missing names comments[i].state", () => {
    const { state: _drop, ...noState } = human;
    throws({ comments: [noState] }, "comments[0].state is required");
  });

  it("state outside the pinned enum names comments[i].state with the spec's exact message", () => {
    throws(
      { comments: [human, { ...human, state: "closed" }] },
      "comments[1].state must be one of: open, resolved, outdated",
    );
    throws(
      { comments: [{ ...human, state: "Open" }] },
      "comments[0].state must be one of: open, resolved, outdated",
    );
    throws(
      { comments: [{ ...human, state: "" }] },
      "comments[0].state must be one of: open, resolved, outdated",
    );
    throws(
      { comments: [{ ...human, state: null }] },
      "comments[0].state must be one of: open, resolved, outdated",
    );
  });

  it("failing_check present but not a boolean names comments[i].failing_check", () => {
    for (const bad of ["true", 1, 0, null, [], {}]) {
      throws(
        { comments: [{ ...human, failing_check: bad }] },
        "comments[0].failing_check must be a boolean",
      );
    }
  });

  it("duplicate_of present but not a string names comments[i].duplicate_of", () => {
    for (const bad of [42, true, null, [], {}]) {
      throws(
        { comments: [{ ...human, duplicate_of: bad }] },
        "comments[0].duplicate_of must be a string",
      );
    }
  });

  it("unknown extra fields are ignored, at the top level and inside items", () => {
    const out = triageReviewComments({
      comments: [{ ...human, thread_url: "https://example.invalid/1", extra: 1 }],
      pr_number: 17,
    });
    assert.equal(out.total, 1);
    assert.equal(out.comments[0].verdict, "actionable");
  });

  it("no partial result is produced when a later item is invalid", () => {
    assert.throws(
      () =>
        triageReviewComments({
          comments: [human, bot, { ...human, state: "pending" }],
        }),
      { message: "comments[2].state must be one of: open, resolved, outdated" },
    );
  });
});
