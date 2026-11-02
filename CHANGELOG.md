# Changelog

## 0.1.0 (2026-10-27)

- Initial release: `triage_review_comments` MCP tool and
  `triage` CLI command classifying pull-request review
  comments from caller-supplied facts only: author kind,
  thread state, failing-check linkage, and body.
- Pinned rule order, first match wins: resolved thread is
  `closed`; outdated thread is `stale`; a non-empty trimmed
  `duplicate_of` is `duplicate`; a comment attached to a
  failing check is `actionable`; a praise-only bot comment
  is `noise`; any other bot comment is `noise`; an open
  human comment is `actionable`. Each verdict carries the
  exact rule that fired as its evidence string.
- Pinned praise-only test: trim, lowercase, collapse
  internal whitespace runs to a single space, repeatedly
  strip trailing `!` and `.` characters, then compare
  against an exact eleven-phrase set. A `duplicate_of`
  that is absent, empty, or whitespace-only counts as no
  duplicate.
- Output is one verdict per input comment in input order,
  plus verdict counts in the pinned key order and the
  total. Path-naming validation errors for malformed
  input, including the `author_kind` and `state` enums,
  with no partial results.
