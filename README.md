# reviewthread

A pull-request review thread collects everything: a
maintainer pointing at a genuinely broken check, a bot
cheering "LGTM", the same coverage note posted twice, a
comment on code that has since been rewritten. reviewthread
sorts a batch of those comments into the five buckets a
reviewer actually acts on — `actionable`, `noise`,
`closed`, `stale`, and `duplicate` — and, for each one,
names the exact rule that put it there, so the verdict can
be checked rather than trusted.

You supply the facts, per comment: an id, the author's
name, whether the author is a bot or a human, the body,
the thread state (`open`, `resolved`, or `outdated`), and
optionally whether the comment is attached to a currently
failing check and the id of another comment it duplicates.
Nothing is fetched; the classification is a pure function
of what you pass in.

The rules run in a fixed order and the first match wins. A
resolved thread is `closed` and an outdated one is `stale`,
whatever else is true of the comment. A comment whose
`duplicate_of` is non-empty after trimming is a
`duplicate`, and its evidence names the trimmed target id.
A comment attached to a failing check is `actionable` —
that outranks everything a bot might say. Only then does
authorship matter: a bot whose body is praise-only (after
trimming, lowercasing, collapsing whitespace, and
stripping trailing `!` and `.` characters, the body is
exactly one of a pinned eleven-phrase set such as `lgtm`,
`looks good to me`, or `ship it`) is `noise`, and any
other bot comment with no failing check is `noise` too.
What remains — an open human comment — is `actionable`.

Two judgement calls are pinned. A `duplicate_of` that is
absent, empty, or whitespace-only counts as no duplicate
at all. And praise is judged against the exact phrase set
only: a bot saying "great job, but the tests fail" is a
generic bot comment, not praise-only, because the whole
normalized body must match a phrase.

Malformed input — a missing or empty `comments` array, a
comment that is not an object, a missing, empty, or
non-string `id` or `author`, an `author_kind` outside
`bot` / `human`, a missing or non-string `body`, a `state`
outside `open` / `resolved` / `outdated`, a non-boolean
`failing_check`, or a non-string `duplicate_of` — is a
validation error naming the offending path, with no
partial result. Unknown extra fields are ignored,
including inside comment items.

## CLI

```bash
npx @reneturcios/reviewthread triage --input args.json
npx @reneturcios/reviewthread --version
```

`args.json` contains the full arguments object:

```json
{
  "comments": [
    {
      "id": "c1",
      "author": "ci-bot",
      "author_kind": "bot",
      "body": "Coverage dropped below the threshold.",
      "state": "open",
      "failing_check": true
    },
    {
      "id": "c2",
      "author": "dependabot[bot]",
      "author_kind": "bot",
      "body": "LGTM!",
      "state": "open"
    },
    {
      "id": "c3",
      "author": "marisol",
      "author_kind": "human",
      "body": "This still races when the cache is cold.",
      "state": "open"
    }
  ]
}
```

The result is printed as JSON:

```json
{
  "comments": [
    {
      "id": "c1",
      "author": "ci-bot",
      "verdict": "actionable",
      "evidence": "comment is attached to a failing check"
    },
    {
      "id": "c2",
      "author": "dependabot[bot]",
      "verdict": "noise",
      "evidence": "praise-only bot comment with no failing check"
    },
    {
      "id": "c3",
      "author": "marisol",
      "verdict": "actionable",
      "evidence": "open human comment"
    }
  ],
  "counts": {
    "actionable": 2,
    "noise": 1,
    "closed": 0,
    "stale": 0,
    "duplicate": 0
  },
  "total": 3
}
```

Exit codes: `0` on success, `1` on a runtime error
(including an unreadable or invalid input file, or invalid
input), `2` on a usage error.

## MCP server

```bash
npx -y @reneturcios/reviewthread mcp
```

MCP client config:

```json
{
  "mcpServers": {
    "reviewthread": {
      "command": "npx",
      "args": ["-y", "@reneturcios/reviewthread", "mcp"]
    }
  }
}
```

### Tools

- `triage_review_comments` — Classify pull-request review
  comments as actionable, noise, closed, stale, or
  duplicate from caller-supplied comment facts.
  - `comments` (array, required, at least 1 item) — the
    review comments to classify. Each item:
    - `id` (string, required, non-empty) — comment
      identifier
    - `author` (string, required, non-empty) — comment
      author name
    - `author_kind` (string, required, `bot` or `human`)
      — whether the author is a bot or a human
    - `body` (string, required, may be empty) — comment
      body text
    - `state` (string, required, `open`, `resolved`, or
      `outdated`) — thread state of the comment
    - `failing_check` (boolean, optional, absent means
      false) — whether the comment is attached to a
      currently failing check
    - `duplicate_of` (string, optional) — id of another
      comment this one duplicates

  Returns `{comments, counts, total}`, where `comments`
  is one `{id, author, verdict, evidence}` per input
  comment in input order, `counts` is `{actionable,
  noise, closed, stale, duplicate}` in that key order,
  and `total` is the number of input comments.

## Docker

```bash
docker run -i ghcr.io/cloudcorprecords/reviewthread
docker run --rm -v "$PWD:/w" ghcr.io/cloudcorprecords/reviewthread triage --input /w/args.json
```

## Development

```bash
npm install
npm run build   # tsc -> dist/
npm test        # tsx --test test/*.test.ts (pure local, no network)
npm run dev     # run the CLI from source
```

## License

MIT — Copyright (c) 2026 Rene Turcios
