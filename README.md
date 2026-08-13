# DevDocs Search Engine

A developer-documentation-focused search engine, built from scratch in
TypeScript. It crawls documentation sites (MDN, TypeScript, Node.js, React,
Next.js, Vite, Express, …), builds an inverted index, and serves ranked search
results over a small HTTP API — with no frameworks and a minimal dependency
set (`cheerio` is the only runtime dep).

Planned scopes:

```
Zone: Web Development Documentation
JavaScript / TypeScript
    MDN, TypeScript, Node.js, React, Next.js, Vite, Express
```

## Status

Working end-to-end vertical slice, 9/9 tests passing:

```
crawl  →  store  →  index  →  rank  →  serve
fetch     sqlite    inverted   bm25     http api
+robot     /mem      index      tfidf    + html ui
```

Known gap: the tokenizer is not yet code-aware (see Roadmap). Dotted
identifiers (`fs.readFile`), camelCase (`useState`), and versions are mangled.

## Architecture

```
┌───────────────────────────────────────────────────────────────┐
│                         Crawler (src/crawler)                 │
│  URLFrontier → RobotsChecker → RateLimiter → WorkerPool       │
│    seed URL → bounded by maxPages / maxDepth                  │
│  fetch(url, timeout, retries) → parse(cheerio) → Document     │
└───────────────────────────┬───────────────────────────────────┘
                            ▼
                  DocumentStore (src/store)
        DocumentStore (in-memory) | SqliteDocumentStore (node:sqlite)
                            ▼
                     buildIndex (src/indexer)
   term → { documentFrequency, postings: { doc → {freq, positions} } }
                        ＋ documentStats (length, maxFrequency)
                            ▼
                  createSearchEngine (src/engine)
    retrieval (boolean AND/OR, phrase) ＋ ranking (BM25, TF-IDF)
                            ▼
                         Search API (search-api.ts)
                       /search?q=..&mode=BM25|TFIDF|PHRASE
```

### Crawler (`src/crawler/`)

- `url-frontier.ts` — dedupes URLs (normalized: strips trailing slash and
  `index.html`, so `/` and `/index.html` count once).
- `robots.ts` — parses `robots.txt` and blocks `Disallow` paths. Fetched once
  per seed host; a missing file means "allow".
- `ratel-limiter.ts` — global delay between requests (ms).
- `worker-pool.ts` — fixed concurrency; respects `maxPages` by reserving a
  page slot before each fetch.
- `fetcher.ts` — fetch with timeout + retries; rejects when a non-HTML
  content type is explicitly set.
- `parser.ts` — `cheerio`: extracts `title`, `text`, and outbound links.
- `crawler.ts` — orchestrates: seed → robots → BFS with host scope, `maxPages`,
  `maxDepth`.

### Indexer (`src/indexer/`)

- `tokenizer.ts` — lowercase, strip non-word chars, drop stop words.
  ⚠️ Roadmap item: code-aware tokenization.
- `inverted-index.ts` — term → postings with **positions**, enabling phrase
  search; plus `documentStats` (length, max term frequency).

### Retrieval (`src/retrieval/`)

- `boolean.ts` — AND/OR over postings lists.
- `phrase.ts` — positional phrase matching via `positions` + adjacency check.

### Ranking (`src/ranking/`)

Both scorers operate per query term, summed per document.

- **TF-IDF**: augmented TF `0.5 + 0.5·(freq/maxFreq)` × smoothed IDF
  `1 + ln(N/df)`.
- **BM25**: k1 = 1.2, b = 0.75, length-normalized TF, non-negative smoothed
  IDF `ln((N − df + 0.5)/(df + 0.5) + 1)`.
- Phrase hits get a `PHRASE_WEIGHT = 1` bonus.

### Storage (`src/store/`)

- `document-store.ts` — in-memory `Map`.
- `sqlite-document-store.ts` — SQLite via `node:sqlite` (`DatabaseSync`),
  `INSERT OR REPLACE` by URL id. Persists documents only; the inverted index
  is rebuilt in memory on each server start.

### API (`search-api.ts`)

Plain `node:http`. One page HTML UI + JSON endpoint:

```
GET /search?q=java+programming&mode=BM25
→ { q, mode, count, results: [{documentId, title, url, score}] }
```

Modes: `BM25` (default), `TFIDF`, `PHRASE`.

## Getting started

Requires Node ≥ 22.5 (for `node:sqlite`); TS files run natively (type
stripping — imports use explicit `.ts` extensions).

```bash
npm install

# 1. Mirror a site and crawl it (or use the bundled crawler-test-site)
npx serve crawler-test-site            # serves http://localhost:3000
SEED_URL=http://localhost:3000 pnpm exec tsx crawl-db.ts
# → writes index.db

# 2. Serve search over the crawled docs
pnpm exec tsx search-api.ts            # http://localhost:8080

# 3. Tests (incl. end-to-end crawl→store→index→search)
npm test
npm run build    # tsc → dist/
```

Demo on canned documents:

```bash
node index.ts     # BM25/TF-IDF breakdown over docs/1..4.txt
```

## Scripts

| Script | What |
|---|---|
| `npm run build` | `tsc` → `dist/` |
| `npm start` | `node index.ts` demo |
| `npm test` | `node --test test/*.test.ts` |

## Roadmap

**Phase 1 — Core quality**
- [x] Code-aware tokenizer: handles `fs.readFile`, camelCase splitting, version tags.
- [x] Query-time synonym & alias expansion (`js→javascript`, `ts→typescript`, `react→reactjs`, `k8s→kubernetes`).
- [x] HTML Boilerplate Stripping: strips `<nav>`, `<header>`, `<footer>`, `<aside>`, `<script>`, `<style>` while preserving full link discovery.
- [x] Title field boost weighting (`TITLE_BOOST_WEIGHT = 2.0`).
- [x] Result snippets with `<mark>` match highlighting.
- [x] Porter stemmer / lemmatization (`src/indexer/stemmer.ts`).

**Phase 2 — Scale & correctness**
- [x] Persist inverted index to SQLite (`src/store/sqlite-index-store.ts`).
- [x] Incremental crawl: conditional HTTP requests (`ETag` / `Last-Modified` $\rightarrow$ `304 Not Modified`), purge 404s.
- [ ] `sitemap.xml` + `Crawl-delay` support; per-host rate limiting.
- [ ] Near-duplicate detection (content hash).

**Phase 3 — Dev-focused search UX**
- [x] Did-you-mean / typo tolerance (`src/retrieval/levenshtein.ts`).
- [ ] Topic facets (JavaScript, React, Node, …) + paginated API.
- [ ] Query logging.

Deliberately out of scope for now: vector/embedding retrieval, distributed
indexing.

## Design notes

- Dependency-injected engine: `createSearchEngine(documents)` curries the
  index, doc stats, and corpus lengths — no globals.
- `SearchResult = {documentId, title, url, score}` — full text deliberately
  kept out of results (moved to the snippet feature in the roadmap).
- `IDF` guards `N = 0`; BM25 IDF is smoothed to stay non-negative.

## Tests

- `test/search-engine.test.ts` — tokenizer, boolean retrieval, ranking,
  phrase scoring.
- `test/url-frontier.test.ts` — dedup + normalization.
- `test/integration.test.ts` — end-to-end: test server → crawl → store →
  index → `"java programming"` ranks `java.html` first; respects robots.txt
  and fetch timeouts.
- `test/test-*.ts` — standalone manual scripts for crawler/robots/ratelimiter.