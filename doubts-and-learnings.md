# Doubts & Learnings

Notes from building the search engine + crawler. Keep appending as you discover things.

## Environment / Tooling

- **Use the correct path for file tools.** `/C:/home/soumabrata/...` fails; the real path is `/home/soumabrata/...`. (The `/C:/...` that shows up in the UI is a Windows-style rendering — never trust it for Read/Edit.)
- **Node v24 runs TS natively (type stripping).** Consequences:
  - Relative imports need explicit `.ts` extensions (`import {x} from "./x.ts"`).
  - Type-only imports MUST use `import type` (`import type {Document} from "../indexer/document.ts"`). Importing a type as a value throws `SyntaxError` at runtime, even though `tsc` may not complain.
- Scripts: `npm run build` = `tsc` → `dist/`, `npm run start` = `node index.ts`, `npm test` = `node --test`.
- Test files live in `test/` — run them as `node test/test-crawler.ts`, NOT `node test-crawler.ts` (gives `MODULE_NOT_FOUND`).

## Bugs Found & Fixed

1. **Robots checker inverted condition** (`src/crawler/robots.ts`)
   ```ts
   // wrong: skips every line that ISN'T a comment → directives never parsed
   if (!line || !line.startsWith("#")) continue;
   // right: skip comments + empty lines only
   if (!line || line.startsWith("#")) continue;
   ```
   Symptom: `canCrawl("/search.html")` returned `true` despite `Disallow: /search.html`.

2. **Fetcher content-type guard was too strict** (`src/crawler/fetcher.ts`)
   `npx serve` sends NO `Content-Type` header for `.html` files. The check
   `!contentType?.includes("text/html")` threw on missing header → every page failed.
   Fix: only reject when a non-HTML type is *explicitly* set:
   ```ts
   if (contentType && !contentType.includes("text/html")) { throw ... }
   ```

3. **robots.txt fetched through the HTML fetcher** — robots.txt is `text/plain`, so `fetchPage` rejected it.
   Fix: fetch it directly in `crawl()`, and tolerate a 404 (many sites have no robots.txt):
   ```ts
   const res = await fetch(robotUrl);
   const robots = new RobotsChecker(res.ok ? await res.text() : "");
   ```

4. **Crawler re-added the seed forever** — link loop did `frontier.add(seedUrl, 0)` instead of adding the discovered link. Crawled the same page repeatedly. Fix: `frontier.add(linkUrl.toString(), depth + 1)`.

5. **`frontier.next()` returns `{url, depth}`** — logging the item directly printed `[object Object]`. Destructure: `const {url, depth} = item`.

6. **URL normalization** (`src/crawler/url.ts`): `http://host/` and `http://host/index.html` are the same page but became two docs. Fix: strip trailing `/index.html` (combined with existing trailing-slash strip → `/index.html` → `/`).

## Doubts / Open Questions

- **BM25 TF formula** — was `frequency + k1 + lengthNormalization` (wrong); now `frequency + k1 * lengthNormalization` (standard BM25) at `src/ranking/bm25.ts:20`. **Resolved.**
- **Phrase search returns its own `PhraseResult`/`PhraseScore` types** while everything else uses `SearchResult` — normalization deferred.
- `[url](url)` in chat output looked like a code bug (url wrapped in markdown link) but was just chat Markdown rendering — verify visually before hunting.

## Design Decisions

- Search engine is **dependency-injected**: no globals; `createSearchEngine(documents)` curries `index`, `documentStats`, `totalDocs`, `averageDocumentLength`.
- `SearchResult` = `{documentId, title, url, score}` — full text deliberately excluded from results.
- Engine reads document metadata from `DocumentStore` (a Map was replaced by the store class).
- IDF smoothed: `1 + log(N/df)` with a `totalDocs === 0` guard.
- Phrase matches get `PHRASE_WEIGHT = 1` bonus in ranking.
- Crawler respects `robots.txt` (`RobotsChecker`), stays on the seed's host (`allowedHost`), and is bounded by `maxPages` + `maxDepth`.

## Gotchas to Remember

- Chat renders `(text)[url]`-looking output as Markdown — not always a code bug.
- `npx serve` serves robots.txt with `text/plain; charset=utf-8` (200), but missing `Content-Type` for HTML.
