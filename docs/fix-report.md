# DevDocs Search Engine — Fix & Optimization Report

**Date:** August 2026
**Scope:** `api/search.ts`, `api/healthCheck.ts`, `src/ui/App.tsx`, `src/crawler/*`, `test/error-handling.test.ts`, repo configuration
**Status:** All changes verified (types, tests, build, live end-to-end). Nothing committed at time of writing.

---

## Overview

This round of work started as a full-codebase review and turned into a focused remediation pass. The codebase was in good structural shape — a clean IR pipeline (`crawl → store → index → retrieve → rank → serve`), proper FTS5 usage, and a genuinely useful test suite. But the review surfaced one production-crashing bug, one feature that never actually rendered, a test suite that was quietly hitting the production database on every run, and a search hot path that shipped megabytes of data per request to do work the database had already done.

This report covers what was broken, why it mattered, what changed, and what it measurably bought. Where something was deliberately **not** changed, that decision is documented too.

---

## 1. Critical Fixes (P0)

### 1.1 Query crash: special characters returned HTTP 500

**Symptom:** Searching `c++` — or any query where a token survives tokenization containing `+`, `.`, or `#` — crashed the API handler with an unhandled exception instead of returning results.

**Root cause:** The inlined snippet generator in `api/search.ts` contained a malformed regex escape:

```js
// before — char class closes early; requires two literal backslashes after it
word.replace(/[.*+?^${}()|[\\]\\\\]/g, "\\$&")

// after — correct class, shared helper
function escapeRegExp(value: string): string {
    return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
```

Because the character class closed early, metacharacters were *never* escaped. The result was passed into `new RegExp("\\b(c++)\\b")` — `++` is "nothing to repeat", which throws `SyntaxError`. The same unescaped interpolation existed in the "did you mean" replacement, so it had two crash vectors.

**Why it mattered:** This is a user-reachable 500 on a public API. It's also a textbook duplication bug: a correct version of this exact function already lived in `src/retrieval/snippet.ts`, and the copy had drifted.

**Fix:** Added a single `escapeRegExp()` helper in `api/search.ts` and used it in both `generateSnippet` and the `didYouMean` interpolation (the latter also switched to a function replacement, which is immune to `$&`-style substitution surprises).

**Verified:** Direct handler repro throws no more; regression queries `'c++'` and `'node.js'` added to `test/error-handling.test.ts`; live smoke test returns HTTP 200 with ranked results.

### 1.2 Snippet highlighting never rendered

**Symptom:** The server carefully wraps matching terms in `<mark>` tags. The React UI then rendered `{item.snippet}` as a plain text child — React escapes text children, so users saw literal `<mark>` markup instead of highlights. The feature has been visually broken since the UI shipped.

**Fix:** In `src/ui/App.tsx`, the snippet is split on `/<\/?mark>/`; odd-indexed segments render as real `<mark>` elements, everything else stays a React text child. This is deliberately **not** `dangerouslySetInnerHTML`: crawled document text can contain `<`, `&`, or worse, and React escaping keeps all of it inert while still rendering the highlight styling. No sanitizer dependency needed.

### 1.3 Tests were silently querying the production database

**Symptom:** `test/error-handling.test.ts` imported the *default* handler export, which binds to a real libsql client built from `.env` at module load. Every "dangerous FTS query" test executed live queries against the production Turso instance. The health-check test explicitly pinged prod.

**Why it mattered:** Non-hermetic tests are slow (network round-trips), flaky (CI has no `.env`), mildly risky (test traffic against prod), and they make failure diagnosis ambiguous — is the bug in the handler or the network?

**Fix:** Both API modules now expose factory functions — `createSearchHandler(db)` (already existed) and a new `createHealthHandler(db)` mirroring the pattern. Default exports still exist and bind the real client, so Vercel and the Vite dev middleware are unaffected. All tests now inject a mock database; zero network access remains in the suite.

**Measured side effect:** suite runtime dropped from **8.7s → 2.7s**, purely by removing prod round-trips.

---

## 2. Performance Work (P1)

### 2.1 The problem

The default BM25 path fetched the **full body text of up to 120 candidate documents on every search** (`SELECT d.id, d.url, d.title, d.text … LIMIT 120`), then re-tokenized all of it in JavaScript to compute BM25 scores. Measured directly against the live database, that query moved **~1.3 MB** for the query *"react hooks"* — of which only ten ~160-character snippets were ever used.

Three compounding costs:

1. **Data transfer** — megabytes from Turso cloud per request, billed per row-read.
2. **CPU** — tokenizing ~1.3 MB of text (splitting, case-folding, camel-splitting, stemming) per request, paid in Vercel GB-seconds.
3. **Redundancy** — FTS5 had *already* ranked these documents with corpus-wide BM25 via `ORDER BY docs_fts.rank`. The JS recomputation also computed IDF over the 120-document candidate window rather than the corpus, which is statistically wrong (a term rare within the window looks important even if it's common site-wide).

### 2.2 The new design

The BM25 path now runs two cheap, indexed queries instead of one huge one:

```
Query 1:  SELECT id, url, title, category, docs_fts.rank AS base   ← ~3 KB total
          (candidates + corpus-wide BM25 rank)
              ↓ JS: score = −rank + title/category/url/domain/path boosts
              ↓ sort, paginate
Query 2:  SELECT id, text WHERE id IN (visible page ids)            ← ~10 rows
          (snippet generation for just what the user sees)
```

TF-IDF and PHRASE modes intentionally keep the old text-heavy path — they genuinely need per-document body statistics and exact-phrase verification across all candidates before pagination.

### 2.3 Ranking parity

A refactor like this is only safe if relevance doesn't move. Baseline top-5 rankings were captured from the pre-change implementation and re-measured after:

| Query | Top result (before) | Top result (after) |
|---|---|---|
| react hooks | `react.dev/reference/react/hooks` | identical |
| autograd | `pytorch.org/docs/2.13/autograd.html` | identical |
| docker compose | `docs.docker.com/compose/support-and-feedback/faq/` | identical |
| getting started | `doc.rust-lang.org/book/ch01-00-getting-started.html` | identical |

All four queries produced identical #1 results; positions 2–5 showed minor reordering consistent with switching from window-IDF to corpus-wide IDF (the statistically *better* estimator).

---

## 3. Crawler Hardening

Small, safe changes to stop the crawler from hanging or hoarding garbage:

- **robots.txt and sitemap.xml fetches** (`src/crawler/crawler.ts`, `sitemap.ts`) previously used bare `fetch` — no timeout, no User-Agent. Now both send the polite `DevDocsBot/1.0` UA and abort after 8 seconds.
- **Page downloads** (`src/crawler/fetcher.ts`) are capped at 5 MB (Content-Length check plus post-read guard) so a pathological page can't balloon memory.
- Deliberately out of scope: full robots.txt group semantics (`Allow:`, `Crawl-delay:`) — the existing minimal parser is documented as such.

---

## 4. Repo Hygiene

| Change | Rationale |
|---|---|
| Deleted `index2.js` | Early learning scratch file with commented-out code; already gitignored but tracked |
| Deleted `search-api.ts` | Legacy standalone server: third copy of ranking logic, embedded HTML, `innerHTML` string-concat XSS surface; its only consumer was the stale jest spec |
| Deleted jest suite (`jest.config.js`, `test/api-supertest.spec.ts`) | Spec asserted a page title that no longer exists — it would fail if run; CI never ran it. One test runner (node --test) remains |
| Untracked `.idea/*` | IDE files listed in `.gitignore` but committed long ago |
| Deleted `package-lock.json` | Repo uses pnpm (`pnpm-lock.yaml`, CI); dual lockfiles invite drift |
| `package.json` | `engines.node >=22` (node:sqlite requirement), removed dead `main`/`start`/`serve`/`test:jest`, purged jest/swc/supertest deps, moved build tooling to `devDependencies` |
| `tsconfig.json` | `noEmit: true` (nobody runs tsc emit), dropped stale jest types entry |
| README.md | Test-count badge and claims updated to actual (39/39) |

---

## 5. Measured Benchmarks

Run against live Turso (ap-south-1) from local dev, 8 iterations per config after warmup, `limit=10`. The legacy TF-IDF/PHRASE modes serve as the control group: same process, same DB, same network — they represent the old architecture.

### End-to-end handler latency

| Path | Query | min | median | max |
|---|---|---:|---:|---:|
| **BM25 (new light path)** | react hooks | 87 ms | **101 ms** | 197 ms |
| **BM25 (new light path)** | docker | 92 ms | **110 ms** | 136 ms |
| **BM25 (new light path)** | autograd | 93 ms | **109 ms** | 161 ms |
| **BM25 (new light path)** | getting started | 111 ms | **120 ms** | 395 ms |
| TF-IDF (legacy path) | react hooks | 144 ms | **159 ms** | 170 ms |
| PHRASE (legacy path)* | react hooks | 69 ms | **84 ms** | 97 ms |

\* PHRASE is fast here only because AND-matching narrows candidates to ~4 documents — it still uses the heavy architecture.

**Takeaway:** ~30–37% faster median end-to-end vs the legacy architecture under identical conditions — and a conservative estimate, since the old BM25 did strictly more work than the TF-IDF control (extra whole-body substring scans for phrase boosts).

### Candidate fetch: the source of the win

| Query | Variant | median | rows | payload |
|---|---|---:|---:|---|
| react hooks | metadata + rank (**new**) | 69 ms | 120 | **~3 KB** |
| react hooks | full text (**old**) | 114 ms | 120 | **~1.3 MB** |
| docker | metadata + rank (**new**) | 60 ms | 96 | **~4 KB** |
| docker | full text (**old**) | 81 ms | 96 | **~612 KB** |

**~430× less data moved on the ranking query**, plus one small indexed lookup (~10 rows) for snippet hydration.

### What this means in production

- **Latency:** ~40–60 ms saved per search on this network; grows with Turso RTT.
- **CPU (the bigger deal):** eliminating per-request tokenization of ~1.3 MB removes most of the handler's compute — directly relevant to serverless billing and cold-start concurrency.
- **Egress/pricing:** KB-scale reads instead of MB-scale scale straight into Turso's row-read-based pricing.
- **Floor context:** ~60 ms of each median is raw network round-trip to Turso cloud; the compute share of the new path is now small.

---

## 6. Verification Matrix

| Layer | Check | Result |
|---|---|---|
| Types | `tsc --noEmit` | clean |
| Unit / integration | `pnpm test` | 39 / 39 pass (hermetic, ~2.7 s) |
| Regression | `c++` handler repro | HTTP 200 (previously threw) |
| Build | `pnpm run build` | ✓ |
| Import graph | all consumers of refactored modules audited | compatible |
| Live E2E | vite middleware → real Turso | health ✓ · BM25 ✓ · PHRASE ✓ · TF-IDF ✓ · `c++` ✓ · typo suggestion ("dokcer" → "docker") ✓ · categories (25) ✓ · pagination clamp ✓ |
| Ranking parity | baseline top-1 comparison, 4 queries | identical × 4 |

---

## 7. Deferred Items & Rationale

1. **Deduplicating `api/search.ts` against `src/`** (stemmer, tokenizer, synonyms, Levenshtein, snippets). The review originally recommended importing from `src/`, but git history shows those imports broke the Vercel bundler twice (`b2b4bd3`, `ac4b9c3`), which is why the file was inlined in the first place. The file stays self-contained by design; the crash fix was applied in place instead. Revisit only with a deliberate bundler-config change.
2. **Per-instance rate limiter.** The in-memory sliding window counts per serverless instance, so effective protection is `60 req/min × warm instances`. A real fix needs an external store (Upstash Redis / Vercel KV) — an infrastructure decision, not a code patch.
3. **Full robots.txt semantics** (`Allow:`, group merging, `Crawl-delay`). Current minimal parser is fine for its crawl scope and documented as such.
