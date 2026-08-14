# 🔍 DevDocs — Developer Search Engine

[![TypeScript](https://img.shields.io/badge/TypeScript-5.7-blue.svg?logo=typescript)](https://www.typescriptlang.org/)
[![React 19](https://img.shields.io/badge/React-19.2-61dafb.svg?logo=react)](https://react.dev/)
[![Vite](https://img.shields.io/badge/Vite-8.2-646CFF.svg?logo=vite)](https://vitejs.dev/)
[![Turso](https://img.shields.io/badge/Database-Turso%20(libSQL)-00E699.svg?logo=sqlite)](https://turso.tech)
[![Vercel](https://img.shields.io/badge/Deploy-Vercel-black.svg?logo=vercel)](https://vercel.com)
[![Tests](https://img.shields.io/badge/Tests-28%2F28%20Passing-brightgreen.svg)]()

> A full-stack developer documentation search engine built from first principles in **TypeScript**. Crawls web documentation across **AI/ML**, **Frontend**, **Backend**, and **DevOps**, stores pages in **Turso (distributed libSQL)**, ranks queries with **Okapi BM25** + **Title Boost**, and serves instant results over a **Vercel Serverless API** with global **Edge CDN Caching**.

🔗 **Live Production Demo**: [https://searchengine-jade.vercel.app](https://searchengine-jade.vercel.app)

---

## 📸 Overview

```
User Query: "what is python" or "autograd"
                  │
                  ▼
┌─────────────────────────────────────────────────────────────┐
│                   Vercel Edge Serverless                    │
│   • Edge Cache Hit (<160ms) / SQL Filtering                 │
│   • Smart Word Tokenization & Boundary Match                │
│   • Did-You-Mean Typo Correction (Levenshtein Distance)     │
│   • Okapi BM25 Ranking + Title & Category Affinity Boost    │
└──────────────────────────────┬──────────────────────────────┘
                               │
                ┌──────────────┴──────────────┐
                ▼                             ▼
   Turso Cloud Database (libSQL)      Dynamic React 19 UI
   • 1,300+ Indexed Documentation     • Glassmorphic Dark Mode
   • Real-Time Category Aggregation   • Live Count Category Pills
   • Daily GitHub Actions Cron        • Snippet <mark> Highlights
```

---

## ⚡ Key Engineering Features

### 1. 🕸️ Multi-Worker Asynchronous Web Crawler
* **Breadth-First Search (BFS)**: Uses FIFO worker queues to explore documentation level-by-level without getting stuck in deep crawler traps.
* **Politeness & Safety**: Built-in token-bucket `RateLimiter` and automatic `robots.txt` compliance parser.
* **Incremental Crawling**:
  * Tracks `ETag` and `Last-Modified` headers to handle `HTTP 304 Not Modified` and avoid redundant processing.
  * Purges dead pages automatically upon receiving `404 Not Found` or `410 Gone`.
* **HTML Boilerplate Stripping**: Extracts links and text while discarding noise (`<nav>`, `<header>`, `<footer>`, `<aside>`, `<script>`, `<style>`).
* **Sitemap Auto-Discovery**: Automatically parses `sitemap.xml` for URL discovery and change frequencies.

### 2. 🎯 Information Retrieval & Ranking Engine
* **Okapi BM25 ($k_1=1.2, b=0.75$)**: Length-normalized term frequency scoring with smoothed inverse document frequency (IDF).
* **Title & Category Boosting**: Multiplies weights (+5.0 – +10.0) when search terms appear in document `<title>`, category tags, or URL slugs.
* **Multi-Word Phrase Matching**: Positional phrase checks and full-query phrase bonuses (+8.0).
* **Smart Typo Tolerance ("Did you mean?")**: Calculates Levenshtein edit distance against the vocabulary to auto-suggest corrections.
* **Word-Boundary Snippet Highlighting**: Extracts relevant sentence windows with `<mark>` tags strictly around matching words.

### 3. ☁️ Cloud Infrastructure & Performance
* **Turso Distributed Database (libSQL)**: Replaced ephemeral disk SQLite with cloud-hosted Turso DB located in Mumbai (AWS AP South).
* **Automated Daily Crawling (GitHub Actions)**: Scheduled daily cron workflow (`.github/workflows/crawl.yml`) that automatically crawls fresh seeds and updates Turso.
* **Sub-160ms Edge Caching**: Serverless function headers (`s-maxage=3600, stale-while-revalidate`) enable global CDN cache hits (`x-vercel-cache: HIT`).
* **Database Indexes & SQL Pruning**: Targeted SQL `WHERE` queries prevent downloading megabytes of raw text across the wire.

### 4. 🎨 Dynamic, Self-Evolving React UI
* **React 19 + TypeScript + Vite**: Responsive dark-mode interface.
* **Zero Manual Category Configuration**: Categories and live document counts (e.g. `AI / ML (198)`, `Databases (118)`, `React (100)`) are dynamically aggregated from the database.

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
│   └── crawl.yml                 # Automated daily GitHub Actions crawler
├── api/
│   └── search.ts                 # Vercel Serverless Function (BM25 + Edge Cache)
├── src/
│   ├── crawler/
│   │   ├── crawler.ts            # Orchestrator (BFS crawl loop)
│   │   ├── fetcher.ts            # HTTP client with timeouts, retries, 304 handling
│   │   ├── parser.ts             # HTML content & link extractor (Cheerio)
│   │   ├── ratel-limiter.ts      # Rate limiter per domain
│   │   ├── robots.ts             # robots.txt validator
│   │   ├── sitemap.ts            # sitemap.xml parser
│   │   ├── url-frontier.ts       # URL deduplication and normalization
│   │   └── worker-pool.ts        # Concurrency worker pool
│   ├── engine/
│   │   └── search-engine.ts      # In-memory search engine coordinator
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
│   │   ├── levenshtein.ts        # Typo tolerance & "Did you mean?"
│   │   └── phrase.ts             # Positional phrase matching
│   ├── store/
│   │   ├── sqlite-document-store.ts  # Local SQLite store (node:sqlite)
│   │   ├── sqlite-index-store.ts     # Persisted inverted index tables
│   │   └── turso-document-store.ts   # Turso cloud database client
│   └── ui/
│       ├── App.tsx               # React 19 search UI component
│       ├── App.css               # Dark-mode styling and layout
│       └── main.tsx              # React DOM entrypoint
├── crawl-and-index.ts            # Standalone multi-seed documentation crawl script
├── search-api.ts                 # Local Node.js HTTP server
├── index.db                      # Local SQLite database cache
├── vercel.json                   # Vercel deployment routing & rewrites
└── package.json                  # Dependencies and scripts
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
*(If omitted, the crawler will automatically use the local SQLite file `index.db`)*

### 3. Run the Documentation Crawler
```bash
# Crawls seeds into Turso cloud DB or local index.db
pnpm run crawl
```

### 4. Start the Frontend & API Server
```bash
# Start Vite development server (UI on http://localhost:5173)
pnpm run dev

# (Optional) Start standalone local HTTP API server
pnpm run serve
```

---

## 🧪 Testing Suite

Run the comprehensive unit and integration test suite:

```bash
pnpm test
```

```
✔ detectCategory detects framework from URL hostname (1.01ms)
✔ search engine filters results by category (1.57ms)
✔ incremental crawl handles 304 Not Modified and 404 Purging (56.81ms)
✔ crawl → store → index → search end to end (561.63ms)
✔ levenshteinDistance calculates correct edit operations (0.67ms)
✔ suggestCorrection suggests closest indexed term for typos (0.96ms)
✔ parsePage extracts links before stripping nav (13.47ms)
✔ tokenize drops stop words (0.50ms)
✔ AND search only returns docs with all terms (0.85ms)
✔ phrase scoring ranks phrase matches first (0.49ms)
✔ BM25 OR search returns sorted scores (1.14ms)
✔ parseSitemap extracts loc URLs and lastmod timestamps (5.34ms)
✔ generateSnippet extracts text window and highlights words (1.02ms)
...
ℹ tests 28 | pass 28 | fail 0
```

---

## 📜 Available NPM Scripts

| Script | Command | Description |
|---|---|---|
| `pnpm run dev` | `vite` | Starts Vite React frontend development server |
| `pnpm run ui:build` | `vite build` | Compiles production React bundle into `dist/` |
| `pnpm run crawl` | `tsx crawl-and-index.ts` | Runs multi-seed crawler and syncs to Turso/SQLite |
| `pnpm run serve` | `tsx search-api.ts` | Runs standalone local HTTP search server |
| `pnpm run seed` | `tsx seed-demo.ts` | Populates demo documents into `index.db` |
| `pnpm test` | `node --test test/*.test.ts` | Runs Node.js native test runner |

---

## 🗺️ Roadmap & Future Enhancements

- [x] **Phase 1**: Code-aware tokenizer, BM25 scoring, and Porter stemmer.
- [x] **Phase 2**: Incremental crawling with HTTP 304 ETag validation and 404 purging.
- [x] **Phase 3**: Turso distributed cloud database migration & Vercel Edge Serverless Functions.
- [x] **Phase 4**: Automated daily GitHub Actions crawling pipeline.
- [x] **Phase 5**: Dynamic self-evolving category taxonomy with live document count badges.
- [ ] **Phase 6 (Upcoming)**: **AI Overview (AIO)** layer using Retrieval-Augmented Generation (RAG) to synthesize direct code answers and explanations from top retrieved snippets (Perplexity/Google-style).

---

## 📄 License
MIT License. Free to use, study, and modify.