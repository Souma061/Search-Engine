# 🔍 DevDocs — Developer Search Engine

[![TypeScript](https://img.shields.io/badge/TypeScript-5.7-blue.svg?logo=typescript)](https://www.typescriptlang.org/)
[![React 19](https://img.shields.io/badge/React-19.2-61dafb.svg?logo=react)](https://react.dev/)
[![Vite](https://img.shields.io/badge/Vite-8.2-646CFF.svg?logo=vite)](https://vitejs.dev/)
[![Turso](https://img.shields.io/badge/Database-Turso%20(libSQL%20FTS5)-00E699.svg?logo=sqlite)](https://turso.tech)
[![Vercel](https://img.shields.io/badge/Deploy-Vercel-black.svg?logo=vercel)](https://vercel.com)
[![CI](https://img.shields.io/badge/CI-GitHub%20Actions-2088FF.svg?logo=github-actions)](https://github.com/Souma061/Search-Engine)
[![Tests](https://img.shields.io/badge/Tests-33%2F33%20Passing-brightgreen.svg)]()

> A production-grade developer documentation search engine built from first principles in **TypeScript**. Crawls web documentation across **AI/ML**, **Frontend**, **Backend**, and **DevOps**, indexes full-text content in **Turso (distributed libSQL with FTS5)**, ranks queries with **Okapi BM25 + Title Boost**, protects servers with **Sliding-Window Rate Limiting**, and serves instant paginated results over a **Vercel Serverless API** with global **Edge CDN Caching**.

🔗 **Live Production Demo**: [https://searchengine-jade.vercel.app](https://searchengine-jade.vercel.app)

---

## 📸 Overview

```
User Query: "usememo", "autograd", "dokcer"
                   │
                   ▼
┌─────────────────────────────────────────────────────────────┐
│                   Vercel Edge Serverless                    │
│   • IP-Based Sliding Window Rate Limiting (60 req/min)      │
│   • Anti-DoS Input Guard (200 chars max)                    │
│   • Dynamic "Did You Mean" via FTS5 Vocabulary (fts5vocab)  │
│   • SQLite FTS5 Inverted Index Lookups (O(log N))           │
│   • Okapi BM25 Ranking + Title & Category Affinity Boost    │
│   • Server-Side Pagination & Word Snippet Highlighting      │
└──────────────────────────────┬──────────────────────────────┘
                               │
                ┌──────────────┴──────────────┐
                ▼                             ▼
   Turso Cloud Database (libSQL)      Dynamic React 19 UI
   • 1,300+ Indexed Documentation     • Glassmorphic Dark Mode
   • FTS5 Virtual Table + Triggers    • Live Category Filters
   • Atomic Batch Crawler Inserts     • Interactive "Did You Mean"
   • Health Check Endpoint (/health)  • Pagination Controls & URL Sync
```

---

## ⚡ Key Engineering Features

### 1. 🕸️ Multi-Worker Asynchronous Web Crawler
* **Breadth-First Search (BFS)**: Explores documentation level-by-level using an asynchronous `WorkerPool` queue.
* **Politeness & Safety**: Built-in per-domain `RateLimiter`, automatic `robots.txt` compliance parser, and polite `DevDocsBot/1.0` User-Agent.
* **Incremental Crawling**:
  * Tracks `ETag` and `Last-Modified` headers to handle `HTTP 304 Not Modified` and avoid redundant processing.
  * Purges dead pages automatically upon receiving `404 Not Found` or `410 Gone`.
* **HTML Boilerplate Stripping**: Extracts clean text while discarding noise (`<nav>`, `<header>`, `<footer>`, `<aside>`, `<script>`, `<style>`).
* **Sitemap Auto-Discovery**: Recursively discovers seed URLs from `sitemap.xml`.

### 2. 🎯 Information Retrieval & FTS5 Ranking Engine
* **SQLite FTS5 Inverted Index**: Persistent inverted full-text index on Turso with automatic synchronization triggers (`INSERT`, `UPDATE`, `DELETE`).
* **Okapi BM25 ($k_1=1.2, b=0.75$)**: Length-normalized term frequency scoring with smoothed inverse document frequency (IDF).
* **Title & Category Boosting**: Boosts relevance (+5.0 to +10.0) when search terms appear in document `<title>`, category tags, or URL slugs.
* **Dynamic Typo Tolerance ("Did You Mean?")**: Queries Turso's live `fts5vocab` dictionary and applies Levenshtein edit distance to suggest real-time typo corrections without hardcoded word lists.
* **Phrase Matching & Highlighting**: Multi-word phrase matching and sentence window generation with `<mark>` tags around matched tokens.

### 3. 🛡️ Production Hardening & Abuse Prevention
* **Sliding-Window Rate Limiter**: IP-based rate limiting (60 requests/minute per client IP) returning `HTTP 429 Too Many Requests` with standard `Retry-After` headers.
* **Input Validation**: Rejects queries exceeding 200 characters with `HTTP 400 Bad Request` to prevent DoS attacks.
* **Server-Side Pagination**: Robust `page` and `limit` support with clamped inputs preventing buffer overflow.
* **Health Check Endpoint (`/health`)**: Status probe for uptime monitors (Vercel, BetterStack) reporting database connectivity, document counts, and live response latency.
* **Atomic Batch Writes**: Inserts crawled pages in single atomic `client.batch(...)` transactions, speeding up crawl operations by 10x.

### 4. 🎨 Developer-Centric React 19 UI
* **React 19 + TypeScript + Vite**: Fast, responsive dark-mode interface.
* **Zero Manual Taxonomy Configuration**: Categories and live document counts (e.g. `AI / ML (198)`, `Databases (118)`, `React (100)`) are dynamically aggregated from the database.
* **Deep Linking**: Shareable URL query states (`/?q=react&category=React&page=2`) with smooth-scrolling pagination.

---

## 📊 Live Indexed Documentation (1,300+ Pages)

| Domain / Ecosystem | Frameworks & Sources |
|---|---|
| 🧠 **AI & Machine Learning** | PyTorch, LangChain, Hugging Face Transformers, Scikit-Learn |
| ⚡ **Frontend Frameworks** | React, Next.js, Angular, Vue.js, Tailwind CSS |
| 🐍 **Languages & Runtimes** | Python, TypeScript, Node.js, Rust, Go, C/C++, Web APIs (MDN) |
| 🛠️ **Backend & DevOps** | FastAPI, Express, Docker, Kubernetes, PostgreSQL, Redis |

---

## 📁 Repository Structure

```
.
├── .github/workflows/
│   ├── ci.yml                    # Automated GitHub Actions CI (build & test)
│   └── crawl.yml                 # Automated daily GitHub Actions crawler cron
├── api/
│   ├── search.ts                 # Vercel Serverless Search API (FTS5 + BM25 + Rate Limiter)
│   └── healthCheck.ts            # System health status endpoint (/health)
├── src/
│   ├── crawler/
│   │   ├── crawler.ts            # Orchestrator (BFS crawl loop)
│   │   ├── fetcher.ts            # HTTP client with timeouts, retries, 304 handling, User-Agent
│   │   ├── parser.ts             # HTML content & link extractor (Cheerio)
│   │   ├── rate-limiter.ts       # Per-domain rate limiter
│   │   ├── robots.ts             # robots.txt compliance validator
│   │   ├── sitemap.ts            # sitemap.xml parser
│   │   ├── url-frontier.ts       # URL deduplication and normalization
│   │   └── worker-pool.ts        # Concurrency worker pool
│   ├── engine/
│   │   └── search-engine.ts      # Search engine coordinator
│   ├── indexer/
│   │   ├── category.ts           # Dynamic domain/meta brand classifier
│   │   ├── inverted-index.ts     # Postings lists with term positions
│   │   ├── stemmer.ts            # Porter stemmer algorithm
│   │   └── tokenizer.ts          # Code-aware tokenization & abbreviation expansion
│   ├── ranking/
│   │   ├── bm25.ts               # Okapi BM25 scoring formula
│   │   └── tfidf.ts              # TF-IDF scoring formula
│   ├── retrieval/
│   │   ├── boolean.ts            # Boolean AND / OR retrieval
│   │   ├── levenshtein.ts        # Levenshtein typo tolerance algorithm
│   │   ├── phrase.ts             # Positional phrase matching
│   │   ├── snippet.ts            # Keyword snippet & <mark> highlighter
│   │   └── synonyms.ts           # Developer abbreviation mapping (js, ts, k8s, etc.)
│   ├── store/
│   │   ├── sqlite-document-store.ts  # Local SQLite store (node:sqlite)
│   │   ├── sqlite-index-store.ts     # Persisted inverted index tables
│   │   └── turso-document-store.ts   # Turso cloud store (FTS5, triggers, batch writes)
│   └── ui/
│       ├── App.tsx               # React 19 search UI component (Pagination + Filters)
│       ├── App.css               # Dark-mode styling and pagination layout
│       └── main.tsx              # React DOM entrypoint
├── test/
│   ├── error-handling.test.ts    # Test suite for rate-limiting, DoS guards, FTS injection
│   └── *.test.ts                 # 33 comprehensive unit & integration tests
├── crawl-and-index.ts            # Multi-seed documentation crawl script
├── db-cli.ts                     # CLI query tool for inspecting Turso database
├── setup-fts.ts                  # One-time FTS5 virtual table & vocabulary setup script
├── vite.config.ts                # Vite dev server with integrated API middleware
├── vercel.json                   # Vercel deployment routing & rewrites
└── package.json                  # Dependencies, test runner, and build scripts
```

---

## 🚀 Getting Started Locally

### Prerequisites
* **Node.js**: $\ge 22.0.0$
* **pnpm**: $\ge 9.0.0$

### 1. Installation
```bash
git clone https://github.com/Souma061/Search-Engine.git
cd Search-Engine
pnpm install
```

### 2. Environment Setup (Optional for Cloud DB)
Create a `.env` file in the root directory:
```env
TURSO_DATABASE_URL=libsql://your-database.turso.io
TURSO_AUTH_TOKEN=your-turso-token
```
*(If omitted, the crawler and local testing will automatically use the local SQLite file `index.db`)*

### 3. Start Frontend & Search API
```bash
# Starts unified Vite server (UI on http://localhost:3000, API on /search & /health)
pnpm run dev
```

### 4. Run the Documentation Crawler
```bash
# Crawls documentation seeds into Turso cloud DB
pnpm run crawl
```

### 5. Query the Database via CLI
```bash
# Inspect Turso tables and query terms from terminal
pnpm run db "SELECT title, rank FROM docs_fts WHERE docs_fts MATCH 'react' ORDER BY rank LIMIT 5;"
```

---

## 🧪 Testing & Reliability Suite

Run all 33 automated tests (unit, integration, crawler, ranking, and error resilience):

```bash
pnpm test
```

```
✔ detectCategory detects framework from URL hostname (1.63ms)
✔ search engine filters results by category (2.22ms)
✔ Error Handling: Query exceeding max length returns 400 (1.25ms)
✔ Error Handling: Special FTS5 characters do not crash query engine (5.62ms)
✔ Error Handling: Invalid pagination values are safely sanitized (0.47ms)
✔ Error Handling: Rate limiter triggers 429 on abuse (5.02ms)
✔ Error Handling: Health check handles request and reports status (111.8ms)
✔ incremental crawl handles 304 Not Modified and 404 Purging (107.9ms)
✔ crawl → store → index → search end to end (562.6ms)
✔ levenshteinDistance calculates correct edit operations (0.99ms)
✔ suggestCorrection suggests closest indexed term for typos (2.36ms)
✔ BM25 OR search returns sorted scores (1.52ms)
✔ parseSitemap extracts loc URLs and lastmod timestamps from XML (3.54ms)
✔ generateSnippet extracts surrounding text window and highlights query words (1.30ms)
...
ℹ tests 33 | pass 33 | fail 0
```

---

## 📜 Available NPM Scripts

| Script | Command | Description |
|---|---|---|
| `pnpm run dev` | `vite` | Starts Vite React frontend & integrated backend API on `localhost:3000` |
| `pnpm run build` | `vite build` | Compiles production bundle into `dist/` |
| `pnpm run crawl` | `tsx crawl-and-index.ts` | Runs multi-seed crawler, batch-inserts into Turso, and syncs FTS index |
| `pnpm run db` | `tsx db-cli.ts` | Terminal CLI tool to query Turso cloud database |
| `pnpm run seed` | `tsx seed-demo.ts` | Populates local demo documents into `index.db` |
| `pnpm test` | `node --test test/*.test.ts` | Runs native Node.js test runner |

---

## 🗺️ Roadmap & Future Enhancements

- [x] **Phase 1**: Code-aware tokenizer, BM25 scoring, and Porter stemmer.
- [x] **Phase 2**: Incremental crawling with HTTP 304 ETag validation, 404 purging, and `DevDocsBot` User-Agent.
- [x] **Phase 3**: Turso distributed cloud database migration & Vercel Edge Serverless Functions.
- [x] **Phase 4**: SQLite FTS5 inverted index, auto-sync triggers, and dynamic vocabulary (`fts5vocab`).
- [x] **Phase 5**: Production rate limiting (60 req/min), DoS input guards, and server-side pagination.
- [x] **Phase 6**: Automated daily GitHub Actions crawl cron and CI test/build pipeline.
- [ ] **Phase 7 (Upcoming)**: **AI Overview (AIO)** layer using Retrieval-Augmented Generation (RAG) to synthesize direct code explanations from top retrieved snippets.

---

## 📄 License
MIT License. Free to use, study, and modify.