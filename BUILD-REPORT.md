# reviewthread — Build Report

MCP Rebuild 1000, Batch 18. Original program build from the
packages-100 plan (cluster A #3), built from the spec in
`~/workspace/mcp-rebuild-100/specs-batch18/reviewthread.md`
(read first). There is no external original; the tool surface
is the program's defined spec. Local build only — nothing
pushed or published.

Identity: repo `reviewthread`, npm `@reneturcios/reviewthread`,
MCP name `io.github.CloudCorpRecords/reviewthread`, version
`0.1.0`, bin `reviewthread` → `dist/cli.js`.

## Files created (19/19 per TEMPLATE.md checklist)

- `package.json`, `server.json` (description "Classify PR
  review comments as actionable or noise, with the rule that
  fired as evidence." — 89 chars, verified by count; npm entry
  carries `version: 0.1.0`; OCI entry
  `ghcr.io/cloudcorprecords/reviewthread:0.1.0` carries **no**
  `version` field), `Dockerfile` (node:20-alpine two-stage,
  label
  `io.modelcontextprotocol.server.name="io.github.CloudCorpRecords/reviewthread"`),
  `tsconfig.json` (copied unchanged from the reference, 318
  bytes), `.gitignore`, `LICENSE` (MIT, Copyright (c) 2026
  Rene Turcios), `README.md` (fresh text), `CHANGELOG.md`
  (single 0.1.0 entry, 2026-10-27), `package-lock.json`
  (Route 3, see below)
- `src/index.ts`, `src/cli.ts` (`triage --input <args.json>`
  where the file holds the full arguments object, `mcp`,
  `--version`; exit 2 usage / 1 runtime error, argument
  validation before any file read), `src/mcp.ts`,
  `src/types.ts`, `src/reviewthread.ts` (core,
  `VERSION = "0.1.0"`, `formatPayload`)
- `test/reviewthread.test.ts`
- `.github/workflows/{ci,publish,publish-container,registry-publish}.yml`
  (publish-container `IMAGE = ghcr.io/cloudcorprecords/reviewthread`,
  smoke-test server-name assertion `reviewthread`)

Plus the parity fixture at
`harness/fixtures/reviewthread-tools-original.json`, labelled
as a program spec from the packages-100 plan cluster A #3.

## Tools implemented (1)

- `triage_review_comments` — arguments: `comments` (array,
  required, at least 1 item). Each item: `id` (string,
  required, non-empty), `author` (string, required,
  non-empty), `author_kind` (string, required, one of "bot"
  or "human"), `body` (string, required, may be empty),
  `state` (string, required, one of "open", "resolved", or
  "outdated"), `failing_check` (boolean, optional, absent
  means false), and `duplicate_of` (string, optional).
  Required is exactly `["comments"]` at the top level and
  `["id", "author", "author_kind", "body", "state"]` per
  item. The `author_kind` and `state` fields carry the
  spec's pinned values as `enum` arrays in both the fixture
  literal and the `src/mcp.ts` literal, identically.

  Rules are evaluated per comment in the pinned order; the
  first matching rule wins and its evidence string is
  reported verbatim: (1) state "resolved" → "closed",
  "thread is already resolved"; (2) state "outdated" →
  "stale", "comment is on outdated code"; (3) `duplicate_of`
  present and non-empty after trimming → "duplicate",
  "duplicates comment <id>" with the trimmed value;
  (4) `failing_check` true → "actionable", "comment is
  attached to a failing check"; (5) bot with a praise-only
  body → "noise", "praise-only bot comment with no failing
  check"; (6) bot → "noise", "bot comment with no failing
  check attached"; (7) human → "actionable", "open human
  comment".

  Praise-only is pinned: normalize the body — trim, convert
  to lowercase, collapse each internal whitespace run to a
  single space, then repeatedly strip trailing characters
  in the set { "!", "." } — and compare against the exact
  set "lgtm", "approved", "approve", "looks good", "looks
  good to me", "nice", "nice work", "great job", "great
  work", "+1", "ship it". Membership means praise-only.

  Returns `{comments, counts, total}`, where `comments` is
  one `{id, author, verdict, evidence}` per input comment
  in input order, `counts` is `{actionable, noise, closed,
  stale, duplicate}` with keys in that order, and `total`
  is the number of input comments.

  The fixture literal
  (`harness/fixtures/reviewthread-tools-original.json`) and
  the `src/mcp.ts` literal are identical (fixture properties
  sorted alphabetically, as in the reference fixture), with
  no `$schema` and no `additionalProperties` — confirmed by
  the parity run below.

## Implementation notes

- `src/mcp.ts` uses the SDK's low-level `Server` with an
  explicit inputSchema literal exactly matching the
  fixture, per the standing fleet rule (no McpServer/zod
  schema conversion). Every `tools/call` is validated by
  the core itself, so the MCP and CLI paths share one
  validation implementation; the core takes the full
  arguments object.
- Validation is path-naming and total: a missing, non-array,
  or empty `comments`; an item that is not an object; a
  missing, empty, or non-string `id` or `author`; a missing
  or out-of-enum `author_kind` or `state`; a missing or
  non-string `body`; a present but non-boolean
  `failing_check`; or a present but non-string
  `duplicate_of` throws an Error naming the offending path
  (e.g. "comments[1].state must be one of: open, resolved,
  outdated") and produces no partial result (MCP: `isError`;
  CLI: exit 1). Unknown extra fields are ignored, including
  inside comment items; a non-object top-level argument is
  treated as {}.

## Verification (foreground, this session)

- `npm test` (`tsx --test test/*.test.ts`): **55 tests,
  55 pass, 0 fail** — each of the 7 rules firing with its
  exact evidence string (rule 4 for both a human and a bot,
  explicit `failing_check: false` falling through); rule
  precedence (resolved beats duplicate + failing_check
  together and beats praise; outdated beats duplicate and
  failing_check; duplicate beats failing_check and praise;
  failing_check beats praise and the generic bot rule;
  praise beats the generic bot rule); praise-only
  normalization (all eleven set phrases, case-insensitivity,
  repeated trailing "!"/"." stripping including mixed
  "!." / ".!", trim plus internal-whitespace collapse with
  spaces, tabs, and newlines, a non-set body falling to
  rule 6 in five forms, empty / whitespace-only /
  punctuation-only bot bodies as rule 6, praise applying
  only to bots); the duplicate_of judgement call (absent,
  empty string, and whitespace-only all counting as no
  duplicate, with fall-through to the failing-check and
  praise rules pinned); the duplicate evidence using the
  trimmed value; the output shape (input order preserved,
  counts deep-equal on a six-comment batch covering all five
  verdicts, counts key order pinned, verdict-object key set
  pinned, counts summing to total, exact id/author echo);
  and every validation path (missing / non-array / empty
  `comments`, non-object top-level treated as {}, non-object
  items at two indexes, `id` and `author` missing / empty /
  non-string, `author_kind` missing and out-of-enum in five
  forms, `body` missing / non-string plus empty-body valid,
  `state` missing and out-of-enum including the spec's exact
  `comments[1]` example message, `failing_check` non-boolean
  in six forms, `duplicate_of` non-string in five forms,
  unknown extras ignored at both levels, no partial result
  on a late invalid item).
- `npx tsc --noEmit` → exit 0; `npm run build` produced
  `dist/` with all 15 outputs.
- `dist/cli.js --version` → `0.1.0`; unknown command exits
  2 with usage; `triage` with no `--input` exits 2;
  `triage --input <missing file>` exits 1 naming the file;
  `triage --input <valid file>` exits 0 and prints the
  hand-checked result for a five-comment input (failing-check
  bot → actionable / "comment is attached to a failing
  check"; "LGTM!" bot → noise / praise-only evidence; open
  human → actionable / "open human comment";
  `duplicate_of: " c1 "` → duplicate / "duplicates comment
  c1"; resolved human → closed / "thread is already
  resolved"; counts actionable 2, noise 1, closed 1, stale
  0, duplicate 1; total 5); `triage --input <invalid file>`
  (`state: "closed"` on the second item) exits 1 with
  `comments[1].state must be one of: open, resolved, outdated`.
- Parity: `harness/parity.py` vs
  `harness/fixtures/reviewthread-tools-original.json` →
  **PASS, parity 100.0, identical_tools 1/1** (run with
  the rebuild path as an absolute path; the harness does
  not expand a `~` inside the quoted stdio command
  string). Report saved under `parity-out/`.

## Lockfile status

`package-lock.json` generated clean via Route 3 (in the
build directory with no `node_modules` present, offline
`npm install --package-lock-only --ignore-scripts
--offline`), verified: parses, name
`@reneturcios/reviewthread`, **128 package entries**.
Resolved versions match the sibling reference tree
(`@modelcontextprotocol/sdk` 1.32.2, `zod` 3.25.76,
`tsx` 4.23.15, `typescript` 5.9.3, `@types/node`
20.19.43). The subsequent offline
`npm install --ignore-scripts --offline`, build, tests,
and parity all ran against this lockfile's tree.

## Gaps / honest notes

- **Spec ambiguities found and how they were pinned:**
  (1) The spec states the praise normalization order as
  trim → lowercase → collapse whitespace → strip trailing
  "!"/"." with **no re-trim after stripping**, so a body
  like "lgtm !" (space before the punctuation) normalizes
  to "lgtm " and is NOT praise-only; the implementation
  follows the stated order literally and no test asserts
  the opposite. (2) The spec does not give exact wording
  for the `comments`-level validation errors; they follow
  the fleet's path-naming pattern ("comments is required",
  "comments must be an array", "comments must contain at
  least 1 item", "comments[0] must be an object"), while
  the per-field enum messages use the spec's own example
  form ("comments[1].state must be one of: open, resolved,
  outdated"). (3) The schema literal carries no `minItems`
  or `minLength` keys — consistent with the reference
  build's literal, which likewise leaves the >= 0 integer
  bounds to core validation; the at-least-1 and non-empty
  constraints are enforced by the core and pinned by tests.
  (4) The duplicate_of empty/whitespace judgement call is
  the spec's own pinned call, with dedicated tests. No
  other spec ambiguity was found in the core behaviour.
- Container build not exercised locally; the
  publish-container workflow smoke-tests the image at
  publish time.
- Nothing pushed or published; this is a local build only.
