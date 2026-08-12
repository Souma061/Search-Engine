# Technical Analysis: DevDocs Search Engine

In-depth analysis of the current implementation, its architectural strengths,
the concrete deficiencies that block the developer-documentation use case, and
a phased remediation plan. Written from the state of the code at the latest
commit (all 9 tests passing).

---

## 1. System overview

The engine is a complete vertical slice of a text search system:

```
crawl ──▶ store ──▶ index ──▶ retrieve ──▶ rank ──▶ serve
 |         |          |           |           |         |
 fetch   sqlite    inverted     boolean     BM25     http api
+robots   /mem       index      AND/OR     TF-IDF    + html ui
+rate-              (with      + phrase     (summed)
+concurrency        positions)
```

All components live under `src/`, unit-testable in isolation, and are wired
together by `createSearchEngine` (dependency-injected) with zero global state.

**Target scope (planned):** Web Development Documentation — MDN, TypeScript,
Node.js, React, Next.js, Vite, Express.

---

## 2. Component-by-component technical review

### 2.1 Crawler (`src/crawler/`)

| File | Responsibility | Notes |
|---|---|---|
| `url-frontier.ts` | URL dedup + normalization | Root/index.html equivalence handled |
| `robots.ts` | robots.txt enforcement | Minimal parser (see §5.1) |
| `ratel-limiter.ts` | per-request delay | Global limiter, one delay |
| `worker-pool.ts` | bounded concurrency | Async queue + active-task tracking |
| `fetcher.ts` | HTTP fetch + timeout + retries | Non-HTML content-type guard |
| `parser.ts` | cheerio page extraction | title, text, links |
| `crawler.ts` | orchestration | BFS, host scope, maxPages/maxDepth |

**Data flow.** The seed URL is added to the frontier and submitted to the
worker pool. Each worker task (`crawlPage`):

1. checks `robots.canCrawl(url)` **before** reserving a page slot,
2. reserves a slot atomically against `maxPages` (`pagesReserved++`),
3. waits on the rate limiter, then `fetchPage` with `timeoutMs`/`maxRetries`,
4. parses HTML → `Document {id=url, url, title, text}` → `store.add`,
5. stops link discovery at `maxDepth`; otherwise normalizes each same-host
   link and submits it to the pool (frontier dedupes).

The crawler blocks until the queue is empty **and** all workers are idle
(`pool.done()`).

**Correctness highlights:**
- Slot reservation happens before fetch, so concurrent workers can never
  collectively exceed `maxPages` (assignment earlier happened after fetch,
  allowing overshoot).
- The robots check precedes slot consumption — blocked URLs don't waste
  page budget.
- Document id **is the URL**, giving natural dedup in the store
  (`INSERT OR REPLACE`).
- The robots.txt fetch tolerates 404 and network errors (crawl succeeds with
  an "allow all" policy — fail-open, deliberate).

**Current limitations:** single-host only; no `sitemap.xml`; robots parser
ignores `User-agent` specificity and `Crawl-delay`; URLs that 404 on a
re-crawl are not purged; there is no support for `text/html` charset variants
beyond the content-type guard; all logging is `console.*` (not structured).

### 2.2 Indexer (`src/indexer/`)

**Tokenizer.** `tokenize(text)`:
```
lowercase → strip non-word chars ([^\w\s] → "") → split whitespace → drop empties → drop stop-words
```

The stop-word set is a 23-entry static whitelist of common English function
words.

**Inverted index build.** The heart of the system. `buildIndex` produces:

```
Index:           term → { documentFrequency, postings: { docId → { frequency, positions[] } } }
DocumentStats:   docId → { length, maxFrequency }
```

**Critical asset: positional postings.** Every occurrence of a term records
its token-position (`positions: number[]`). This is what powers phrase
matching — the most sophisticated retrieval feature currently implemented.
Adjacency is tested by checking `positions.includes(start + i)` for each
subsequent phrase term — an `O(k · pos(first))` scan per document, correct
and simple for v1.

`maxFrequency` (the most-frequent term's count in a document) is computed
after the main pass by scanning every term's postings — `O(|terms|)` per
document. Fine at this scale; not a design to keep at corpus scale (§6).

**Weakness (blocking for dev docs).** The tokenizer is designed for
narrative English prose. It is actively hostile to developer documentation:

| Input | Produced token | Consequence |
|---|---|---|
| `fs.readFile` | `fsreadfile` (glued) | `readFile` unreachable by search |
| `node.js` | `nodejs` | `node js` / `njs` mismatch |
| `Array.prototype.map` | `arrayprototypemap` | unusable |
| `C++` | `c` | `c++` queries find nothing |
| `v20.8.1` | `v2081` | version filtering impossible |
| `useState` | `usestate` | `use state` won't match |
| `React.useMemo()` | `reactusememo` | compounded again |

Because `[^\w\s]` deletes punctuation **without inserting a separator**, all
dot/slash/paren-delimited identifiers collapse into single tokens. The index
is built on corrupted terms; every downstream stage (retrieval, ranking,
phrase search) is faithful to the tokenizer's output — garbage in, garbage out.

### 2.3 Retrieval (`src/retrieval/`)

**Boolean.** `retrieveDocuments(index, words, mode)`:
- `OR`: union of postings document-sets.
- `AND`: requires every term present in a doc; computed as a filter over the
  first term's postings (`postings.every(...)`).

**Phrase.** `countPhraseOccurrences` walks the first term's positions and
verifies each following term appears at `start + offset`. `searchPhrase`
returns matching docs; `rankPhrase` sorts by occurrence count.

The phrase code is the one place the API deviates from the unified
`SearchResult` shape — it emits its own `PhraseResult`/`PhraseScore` types
(`{file, phrase, occurrences}`), a known, self-documented debt
(`doubts-and-learnings.md`).

### 2.4 Ranking (`src/ranking/`)

Two scorers, both summing a per-term contribution per document.

**TF-IDF** (`tfidf.ts`):
- Augmented (double-normalized) TF: `tf = 0.5 + 0.5 · (freq / maxFreq)`
  — guards against documents dominated by a single repeated term.
- Smoothed IDF: `idf = 1 + ln(N / df)` — never zero for a term present in
  the corpus, so single-corpus-term queries still produce a nonzero signal.
- Guards: `N = 0` → 0; missing term/posting → 0.

**BM25** (`bm25.ts`):
- `k1 = 1.2` (TF saturation), `b = 0.75` (length normalization).
- Length-normalized TF:
  `tf' = freq·(k1+1) / (freq + k1·(1 − b + b·Len/avgLen))`.
- Smoothed IDF: `ln((N − df + 0.5)/(df + 0.5) + 1)` — the `+1` keeps common
  terms from scoring negative.

**Phrase bonus** (`search-engine.ts`): matched phrases add
`occurrences · PHRASE_WEIGHT (1)` to the term-sum.

**Ranking weaknesses for dev docs:**
- **Term-only, flat-field scoring.** Title, headings, and code blocks are all
  treated as body text. For documentation, a term in the `<title>` or an
  `<h1>` is a far stronger signal than one in a paragraph (or worse, a code
  example). Neither scorer accepts field weights.
- **No synonyms.** `js` ↔ `javascript`, `reactjs` ↔ `react` return disjoint
  results. Docs highly favor aliases.
- **No stemming.** `react`, `reacting`, `reaction` are separate terms.
- **No typo tolerance / did-you-mean.** Misspelled identifiers return 0
  results with no fallback.
- Empty corpus: `averageDocumentLength` is `0/0 = NaN` when no documents
  exist (new-engine construction only, since the API requires a loaded DB —
  minor).

### 2.5 Storage (`src/store/`)

- `DocumentStore` — in-memory `Map<id, Document>`, insert/dedupe/addMany/get.
- `SqliteDocumentStore` — `node:sqlite` (`DatabaseSync`), synchronous,
  `CREATE TABLE IF NOT EXISTS documents (id PK, url, title, text)`; id is the
  URL. Used by `crawl-db.ts` (persistence during crawl) and `search-api.ts`
  (load at startup).

**Fundamental limit:** only *documents* persist. The inverted index is rebuilt
from scratch in memory every server start. That is acceptable for hundreds of
pages, but it means:
- index build cost scales with the **entire** corpus on every boot,
- no incremental updates (adding one page re-tokenizes everything),
- the index cannot exceed RAM.

### 2.6 API (`search-api.ts`)

Plain `node:http`, no framework:
- `GET /search?q=…&mode=BM25|TFIDF|PHRASE` → JSON
  `{q, mode, count, results:[{documentId,title,url,score}]}`.
- `GET /` → embedded HTML page with a form + fetch-driven result list.
- CORS `Access-Control-Allow-Origin: *`.

Results deliberately exclude document text (`SearchResult` has no content
field). There is no snippet, no highlighting, no pagination, no result
metadata (e.g., indexed date), no query logging, no API rate limiting.

### 2.7 Tests (`test/`)

`node --test` (built-in runner, no framework). Nine tests:

- **Unit:** tokenizer stop-word removal; boolean AND/OR; TF-IDF exact-value
  assertion; phrase ranking order; BM25 sorted scores; frontier dedup +
  root/index.html normalization.
- **Integration** (`integration.test.ts`): spins up `createTestServer`,
  crawls it, stores, indexes, and asserts `"java programming"` ranks
  `java.html` first — while asserting `search.html` is robots-blocked and
  `/slow` is fetch-timeout-failed. This is a genuine crawl→store→index→search
  contract test.

---

## 3. Strengths worth preserving

1. **Positions in the inverted index.** Phrase search for free at build time;
   rare in hand-rolled engines. Also enables future candidate generation
   (e.g., ordered proximity scoring).
2. **Clean dependency injection.** No globals; the engine is a pure function
   of the document set. Easy to test and to swap each stage.
3. **Discipline about ranking correctness.** Smoothed IDF, guarded corpus
   stats, lenient content-type handling — the author understands what breaks
   ranking and guarded against it.
4. **Rate limiting + robots + concurrency bound is done properly** — slots
   reserved before fetch, robots before slots, depth-bounded link discovery.
5. **Zero-framework surface.** `cheerio` is the only runtime dependency;
   `node:http` and `node:sqlite` cover the wire and persistence. Small
   dependency footprint is a strong base to build on.

---

## 4. Problem documents (worked examples)

These are realistic dev-doc queries and where today's pipeline fails:

| Query | Intent | Today's behavior | Root cause |
|---|---|---|---|
| `readFile` | Node fs API | 0 hits | `fs.readFile` tokenized to `fsreadfile` |
| `useMemo` | React hook | Only exact-text docs | camelCase never split; `use memo` fails |
| `map reduce` | JS array method | Lowercase exact only | synonym collapse, casing |
| `c++` | language | 0 hits | `c++` → `c` |
| `state` | React state | serious noise | no title/heading weight; `useState` unmatchable |
| `tsconfig` | TS config | 0 hits | `tsconfig` is fine as a token, but `ts` alias won't expand to `typescript` |

The `readFile` row is not a marginal case — dotted identifiers are the
**default** shape of every Node/TypeScript/React doc. Until tokenization is
fixed, the engine cannot index the target corpus meaningfully.

---

## 5. Gap analysis, categorized

### 5.1 Crawler gaps
- `sitemap.xml` support, robots `Crawl-delay`, per-User-agent matching,
  `Allow` directives — robots parser only tracks `Disallow` under
  `User-agent: *`.
- 「 ("html|external resource handling) … 」 — only `text/html`; no schema for
  PDFs (MDN code samples, spec pages).
- No incremental/delta crawl: `has(id)` exists on the store but `crawl()`
  never consults it; a re-crawl re-fetches everything exposed by the frontier.
- Re-crawl of a gone page leaves the stale document in the DB.
- No `ETag`/`Last-Modified` conditional fetch; no gzip (relying on undici
  defaults over the wire — headers not verified).

### 5.2 Indexer gaps
- **Code-aware tokenization is the #1 blocker** (§2.2, §4).
- No per-field indexing: title/headings/body/code-block are one text blob.
- No stemming/lemmatization.
- No synonym/alias table.
- No document fingerprinting for near-duplicate suppression (MDN has
  rewritten/cloned pages; React docs mirror patterns).

### 5.3 Ranking gaps
- Flat-field scoring — no title/heading weight.
- No query-dependent term weighting beyond I.D.F. (in-link/PageRank out of
  scope for a docs site, but "occurrence density in code blocks" is not).
- No multi-field BM25 (title-class vs body-class corpora).
- No snippet scoring / concordance extraction.

### 5.4 Storage & serving gaps
- Index not persisted — full rebuild each boot; no incremental updates.
- Search results have no metadata (date, section, snippet).
- API: no pagination, no facets, no logging, no `/health`, no response
  caching, no request validation (empty `q` → empty result, fine, but no
  upper bound on query length either).

### 5.5 Dev-focused search UX (the differentiating layer)
- did-you-mean / typo tolerance (Levenshtein over the query) — highest-value
  differentiator for docs where users mistype identifiers.
- alias expansion (`js→javascript`, `ts→typescript`, `node→node.js`) —
  cheap, dramatically better recall.
- result snippets with `<mark>` highlighting from positional data.
- topic facets (JavaScript/React/Node…) driven by URL pattern or a small
  classification pass.
- query analytics.

---

## 6. Remediation plan

Estimate ordering by (impact on dev-doc quality) ÷ (effort).

### Phase 1 — Core quality (highest ROI, next sprint)

1. **Code-aware tokenizer** (`tokenizer.ts`).
   - Split on punctuation and whitespace, dropping the separators *but
     keeping the fragments as tokens*: `fs.readFile` → `["fs","readFile"]`;
     `node.js` → `["node","js"]`; `c++` → `["c","c"]` (or `["c", "c++"]`
     with a version/symbol retained token).
   - Lowercase but retain a side table of original-cased term forms for
     display/casing-aware matching.
   - Optional camelCase/snake_case split (`useState` → `use` + `state`) —
     but index BOTH the whole token and its pieces so exact queries
     (`useState`) and fuzzy ones (`use state`) both hit.
   - Test: `readFile`, `useMemo`, `fs.readFile`, `v20.8.1` must be
     retrievable after this change.
2. **Stemmer** (Porter2 or a small hand-rolled suffix list) applied at index
   and query time.
3. **Synonym/alias map** (`js→javascript`, `ts→typescript`, `reactjs→react`,
   `node→node.js`, *site-specific abbreviations*) applied at query expansion.
4. **Field weighting** — index `title`/`headings` separately, surface a
   per-field BM25/tfidf weight (title wins, headings second, body last).
5. **Lexical fallback on zero results** — if a query returns nothing, retry
   with stemmed/aliased tokens; report to the user which form matched.
6. **Result snippets + highlighting** — a `snippet` field built from
   `positions` (the closest matching window to first hit + `<mark>`x1).

### Phase 2 — Scale & correctness

7. Persist the inverted index (segment files à la Lucene, or snapshot the
   `Document[]` and rebuild incrementally); incremental adds without a full
   re-tokenize.
8. Incremental crawl: skip visited URLs, purge 404s on re-crawl, use
   conditional fetch (ETag) to detect staleness.
9. `sitemap.xml` discovery, `Crawl-delay` respect, per-directory allow rules
   in robots.
10. Near-duplicate suppression via content hash (normalized).

### Phase 3 — Dev-focused search UX

11. Did-you-mean via Levenshtein/edit-distance against the top-N terms in
    the index dictionary.
12. Faceted API + pagination; stable result ids.
13. Query logging + analytics endpoint.

### Explicitly out of scope (YAGNI at this stage)
- Distributed/MapReduce indexing; sharding.
- Vector/embedding retrieval. Keyword + positional retrieval answers
  identifier-style dev queries better and far cheaper; revisit only if
  semantic recall becomes a measured requirement.
- Natural-language query parsing beyond AND/OR.

---

## 7. Decision log / trade-offs

| Decision | Why |
|---|---|
| Positions stored at index time | Phrase search is O(1) lookup at query time; cost is build-time only |
| `INSERT OR REPLACE` keyed by URL | Idempotent re-crawl; natural dedup |
| Digitally single-host crawler | Correct first; multi-host politeness is a Phase-2 concern |
| Fail-open robots on error | A broken robots.txt must not kill a crawl; log instead |
| Smooth IDF +`1` in BM25 | Prevents negative scores for common terms — a classic BM25 foot-gun |
| Augmented TF-IDF TF | Prevents a single repeated term from dominating a doc |
| No text in `SearchResult` | Keeps the API small; snippets are a separate planned feature |
| Denormalized `maxFrequency` recomputed per doc | Index-time simplicity; revisit if build cost metrics say otherwise |

---

## 8. Verification & measurement

After each Phase-1 item, extend the integration test (`integration.test.ts`)
with a dev-doc-shaped fixture: pages containing `fs.readFile`, `useState`,
`c++`, nested headings, and titles — then assert recall/ranking for the
queries in §4. Keep the existing `java`/`programming` assertions as a
regression lock.

Track, at minimum:
- **Recall@10** for the §4 query set over the fixture corpus.
- **Index build time** and **RAM** (data structures are plain objects — swap
  for typed/compact forms if we exceed ~100k docs).
- **Query latency p50/p99** on `/search` under a threaded load (hint:
  `DatabaseSync` serializes — a read-only `worker_thread` or a snapshot in
  memory may be needed for multi-tenant serving once the API grows).

---

*Coverage: all source under `src/`, entry points at repo root, test suite,
and the roadmap in `README.md`. Generated from the codebase state at the
`09f8b4d` commit.*