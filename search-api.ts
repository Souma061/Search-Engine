import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import { loadDocuments, SqliteDocumentStore } from "./src/store/sqlite-document-store.ts";
import { createSearchEngine } from "./src/engine/search-engine.ts";
import type { Document } from "./src/indexer/document.ts";

const PORT = Number(process.env.SEARCH_PORT ?? 8080);
const DB_PATH = process.env.DB_PATH ?? "index.db";

const PAGE = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>DevDocs Search</title>
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap" rel="stylesheet">
<style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body {
        font-family: 'Inter', -apple-system, BlinkMacSystemFont, sans-serif;
        background-color: #202124;
        color: #e8eaed;
        min-height: 100vh;
        display: flex;
        flex-direction: column;
    }
    .container {
        width: 100%;
        max-width: 750px;
        margin: 0 auto;
        padding: 40px 20px 60px;
    }
    /* Logo Header */
    .header {
        text-align: center;
        margin-bottom: 24px;
        transition: margin 0.3s ease;
    }
    .logo {
        font-size: 2.4rem;
        font-weight: 700;
        letter-spacing: -0.5px;
        background: linear-gradient(135deg, #4285f4, #a142f4, #34a853);
        -webkit-background-clip: text;
        -webkit-text-fill-color: transparent;
        text-decoration: none;
        display: inline-block;
    }
    .tagline {
        font-size: 0.85rem;
        color: #9aa0a6;
        margin-top: 4px;
    }

    /* Search Bar Box */
    .search-box {
        background: #303134;
        border: 1px solid #5f6368;
        border-radius: 24px;
        display: flex;
        align-items: center;
        padding: 6px 16px;
        box-shadow: 0 1px 6px rgba(0, 0, 0, 0.28);
        transition: border 0.2s, box-shadow 0.2s;
    }
    .search-box:focus-within {
        background: #303134;
        border-color: #8ab4f8;
        box-shadow: 0 1px 8px rgba(138, 180, 248, 0.25);
    }
    .search-icon {
        color: #9aa0a6;
        font-size: 1.1rem;
        margin-right: 12px;
    }
    input[type="text"] {
        flex: 1;
        background: transparent;
        border: none;
        outline: none;
        color: #e8eaed;
        font-size: 1rem;
        font-family: inherit;
        padding: 8px 0;
    }
    select {
        background: #202124;
        color: #e8eaed;
        border: 1px solid #5f6368;
        border-radius: 12px;
        padding: 4px 8px;
        font-size: 0.8rem;
        margin-left: 8px;
        outline: none;
        cursor: pointer;
    }
    button.search-btn {
        background: #8ab4f8;
        color: #202124;
        border: none;
        border-radius: 16px;
        padding: 6px 14px;
        font-size: 0.85rem;
        font-weight: 600;
        margin-left: 10px;
        cursor: pointer;
        transition: opacity 0.2s;
    }
    button.search-btn:hover { opacity: 0.9; }

    /* Category Filter Tabs */
    .categories {
        display: flex;
        gap: 8px;
        margin-top: 16px;
        overflow-x: auto;
        padding-bottom: 8px;
        scrollbar-width: none;
    }
    .category-chip {
        background: #303134;
        color: #9aa0a6;
        border: 1px solid #5f6368;
        padding: 5px 14px;
        border-radius: 16px;
        font-size: 0.82rem;
        font-weight: 500;
        cursor: pointer;
        white-space: nowrap;
        transition: all 0.2s;
        text-decoration: none;
    }
    .category-chip:hover, .category-chip.active {
        background: #3c4043;
        color: #8ab4f8;
        border-color: #8ab4f8;
    }

    /* Results Header & Metrics */
    .metrics {
        font-size: 0.82rem;
        color: #9aa0a6;
        margin: 18px 0 14px;
    }
    .did-you-mean {
        background: rgba(234, 67, 53, 0.12);
        border-left: 3px solid #ea4335;
        padding: 10px 14px;
        border-radius: 6px;
        font-size: 0.9rem;
        color: #f28b82;
        margin-bottom: 18px;
    }
    .did-you-mean a {
        color: #8ab4f8;
        font-weight: 600;
        text-decoration: underline;
        cursor: pointer;
    }

    /* Search Result Card */
    ul.results-list {
        list-style: none;
    }
    li.result-card {
        margin-bottom: 24px;
        animation: fadeIn 0.2s ease-in-out;
    }
    .res-header {
        display: flex;
        align-items: center;
        gap: 8px;
    }
    .res-title {
        font-size: 1.15rem;
        color: #8ab4f8;
        text-decoration: none;
        font-weight: 500;
        line-height: 1.3;
    }
    .res-title:hover { text-decoration: underline; }
    .res-badge {
        background: #3c4043;
        color: #e8eaed;
        font-size: 0.7rem;
        font-weight: 600;
        padding: 2px 8px;
        border-radius: 10px;
        text-transform: uppercase;
    }
    .res-score {
        font-size: 0.75rem;
        color: #9aa0a6;
        margin-left: 6px;
    }
    .res-url {
        font-size: 0.82rem;
        color: #bdc1c6;
        word-break: break-all;
        margin-top: 2px;
        display: block;
        text-decoration: none;
    }
    .res-snippet {
        font-size: 0.88rem;
        color: #bdc1c6;
        margin-top: 6px;
        line-height: 1.5;
    }
    mark {
        background: rgba(253, 216, 53, 0.25);
        color: #fdd835;
        padding: 0 2px;
        border-radius: 2px;
        font-weight: 600;
    }

    @keyframes fadeIn {
        from { opacity: 0; transform: translateY(4px); }
        to { opacity: 1; transform: translateY(0); }
    }
</style>
</head>
<body>
<div class="container">
    <div class="header">
        <a href="/" class="logo">DevDocs</a>
        <div class="tagline">Developer Search Engine for Web Documentation</div>
    </div>

    <form id="f" onsubmit="doSearch(event)">
        <div class="search-box">
            <span class="search-icon">🔍</span>
            <input type="text" id="q" placeholder="Search JS, React, Node, TS docs..." autofocus autocomplete="off">
            <select id="mode">
                <option value="BM25">BM25</option>
                <option value="TFIDF">TF-IDF</option>
                <option value="PHRASE">Phrase</option>
            </select>
            <button type="submit" class="search-btn">Search</button>
        </div>

        <div class="categories" id="cat-chips">
            <span class="category-chip active" data-cat="">All</span>
            <span class="category-chip" data-cat="MDN">MDN</span>
            <span class="category-chip" data-cat="React">React</span>
            <span class="category-chip" data-cat="Node.js">Node.js</span>
            <span class="category-chip" data-cat="TypeScript">TypeScript</span>
            <span class="category-chip" data-cat="Express">Express</span>
            <span class="category-chip" data-cat="Next.js">Next.js</span>
        </div>
    </form>

    <div id="meta" class="metrics" style="display:none"></div>
    <div id="didyoumean" class="did-you-mean" style="display:none"></div>

    <ul id="r" class="results-list"></ul>
</div>

<script>
let selectedCategory = "";

const chips = document.querySelectorAll(".category-chip");
chips.forEach(chip => {
    chip.addEventListener("click", () => {
        chips.forEach(c => c.classList.remove("active"));
        chip.classList.add("active");
        selectedCategory = chip.getAttribute("data-cat");
        if (document.getElementById("q").value.trim()) {
            doSearch();
        }
    });
});

const r = document.getElementById("r");
const meta = document.getElementById("meta");
const dym = document.getElementById("didyoumean");

async function doSearch(e) {
    if (e) e.preventDefault();
    const q = document.getElementById("q").value.trim();
    if (!q) return false;

    const mode = document.getElementById("mode").value;
    const start = performance.now();

    // Update URL history without page reload
    const newUrl = "/?q=" + encodeURIComponent(q) + (selectedCategory ? "&category=" + encodeURIComponent(selectedCategory) : "");
    window.history.pushState({}, "", newUrl);

    try {
        const res = await fetch("/search?q=" + encodeURIComponent(q) + "&mode=" + mode + (selectedCategory ? "&category=" + encodeURIComponent(selectedCategory) : ""));
        const data = await res.json();
        const elapsed = (performance.now() - start).toFixed(1);

        meta.style.display = "block";
        meta.innerText = "About " + data.count + " results (" + elapsed + " ms)";

        if (data.didYouMean) {
            dym.style.display = "block";
            dym.innerHTML = "Did you mean: <a onclick=\"searchFor('" + data.didYouMean + "')\">" + data.didYouMean + "</a>?";
        } else {
            dym.style.display = "none";
        }

        if (!data.results || data.results.length === 0) {
            r.innerHTML = "<li class='result-card' style='color:#9aa0a6'>No results found for '" + data.q + "'. Try different keywords.</li>";
            return false;
        }

        r.innerHTML = data.results.map(x =>
            "<li class='result-card'>" +
            "  <div class='res-header'>" +
            "    <a href='" + x.url + "' target='_blank' class='res-title'>" + x.title + "</a>" +
            (x.category ? "    <span class='res-badge'>" + x.category + "</span>" : "") +
            "    <span class='res-score'>[" + x.score.toFixed(3) + "]</span>" +
            "  </div>" +
            "  <a href='" + x.url + "' target='_blank' class='res-url'>" + x.url + "</a>" +
            (x.snippet ? "  <div class='res-snippet'>" + x.snippet + "</div>" : "") +
            "</li>"
        ).join("");
    } catch (err) {
        console.error(err);
    }
    return false;
}

function searchFor(term) {
    document.getElementById("q").value = term;
    doSearch();
}

// Auto-run search if query parameters exist in URL on initial page load
window.addEventListener("DOMContentLoaded", () => {
    const params = new URLSearchParams(window.location.search);
    const initialQ = params.get("q");
    const initialCat = params.get("category");

    if (initialCat) {
        selectedCategory = initialCat;
        chips.forEach(c => {
            if (c.getAttribute("data-cat") === initialCat) c.classList.add("active");
            else c.classList.remove("active");
        });
    }

    if (initialQ) {
        document.getElementById("q").value = initialQ;
        doSearch();
    }
});
</script>
</body>
</html>`;

export function createSearchApp(documents: Document[]): http.Server {
    const engine = createSearchEngine(documents);

    return http.createServer(async (req, res) => {
        const url = new URL(req.url ?? "/", `http://${req.headers.host}`);

        res.setHeader("Access-Control-Allow-Origin", "*");

        if (url.pathname === "/search") {
            const action = url.searchParams.get("action");
            const categoryCounts: Record<string, number> = {};
            for (const doc of documents) {
                if (doc.category) {
                    categoryCounts[doc.category] = (categoryCounts[doc.category] || 0) + 1;
                }
            }
            const categories = Object.entries(categoryCounts)
                .map(([name, count]) => ({ name, count }))
                .sort((a, b) => b.count - a.count);

            if (action === "categories") {
                res.setHeader("content-type", "application/json");
                res.end(JSON.stringify({ categories }));
                return;
            }

            const q = url.searchParams.get("q") ?? "";
            const mode = url.searchParams.get("mode") ?? "BM25";
            const category = url.searchParams.get("category") ?? undefined;

            const results =
                mode === "TFIDF" ? engine.search(q, "OR", category) :
                mode === "PHRASE" ? engine.scorePhraseQuery(q) :
                engine.searchBM25(q, "OR", category);

            const didYouMean = engine.didYouMean(q);

            res.setHeader("content-type", "application/json");
            res.end(JSON.stringify({ q, mode, category: category ?? "All", didYouMean, count: results.length, categories, results }));
            return;
        }

        if (url.pathname.startsWith("/assets/")) {
            const assetPath = path.join(process.cwd(), "dist", url.pathname);
            if (fs.existsSync(assetPath)) {
                if (assetPath.endsWith(".js")) res.setHeader("content-type", "application/javascript");
                else if (assetPath.endsWith(".css")) res.setHeader("content-type", "text/css");
                res.end(fs.readFileSync(assetPath));
                return;
            }
        }

        if (url.pathname === "/") {
            const reactHtmlPath = path.join(process.cwd(), "dist", "index.html");
            if (fs.existsSync(reactHtmlPath)) {
                res.setHeader("content-type", "text/html");
                res.end(fs.readFileSync(reactHtmlPath));
                return;
            }
            res.setHeader("content-type", "text/html");
            res.end(PAGE);
            return;
        }

        res.statusCode = 404;
        res.end("Not found");
    });
}

// Auto-start when executed as the main file
if (process.argv[1] && process.argv[1].endsWith("search-api.ts")) {
    let documents = loadDocuments(DB_PATH);
    if (documents.length === 0) {
        console.log(`Database ${DB_PATH} is empty. Auto-seeding initial web dev documentation...`);
        const sampleDocs: Document[] = [
            {
                id: "https://react.dev/reference/react/useState",
                url: "https://react.dev/reference/react/useState",
                title: "useState – React Docs",
                text: "useState is a React Hook that lets you add state variables to functional components. Pass initial state to useState and call setFn to update value.",
                category: "React",
            },
            {
                id: "https://react.dev/reference/react/useMemo",
                url: "https://react.dev/reference/react/useMemo",
                title: "useMemo – React Docs",
                text: "useMemo is a React Hook that lets you cache the result of a calculation between re-renders in functional components.",
                category: "React",
            },
            {
                id: "https://developer.mozilla.org/en-US/docs/Web/API/Fetch_API",
                url: "https://developer.mozilla.org/en-US/docs/Web/API/Fetch_API",
                title: "Fetch API - Web APIs | MDN",
                text: "The Fetch API provides a JavaScript interface for accessing and manipulating parts of the HTTP protocol, such as requests and responses with async await.",
                category: "MDN",
            },
            {
                id: "https://nodejs.org/api/fs.html",
                url: "https://nodejs.org/api/fs.html",
                title: "File System | Node.js v20 API Documentation",
                text: "The node:fs module enables interacting with the file system in a way modeled on standard POSIX functions. fs.readFile reads entire file asynchronously.",
                category: "Node.js",
            },
            {
                id: "https://www.typescriptlang.org/docs/handbook/2/generics.html",
                url: "https://www.typescriptlang.org/docs/handbook/2/generics.html",
                title: "Documentation - Generics | TypeScript",
                text: "A major part of software engineering is building components that not only have well-defined and consistent APIs, but are also reusable using TypeScript generics.",
                category: "TypeScript",
            },
            {
                id: "https://expressjs.com/en/4x/api.html",
                url: "https://expressjs.com/en/4x/api.html",
                title: "Express 4.x API Reference",
                text: "The app object conventionally denotes the Express application. Create it by calling the top-level express() function exported by the Express module.",
                category: "Express",
            },
            {
                id: "https://nextjs.org/docs/app/building-your-application/routing",
                url: "https://nextjs.org/docs/app/building-your-application/routing",
                title: "Routing: Getting Started | Next.js Docs",
                text: "Next.js uses a file-system based router where folders define routes. Each folder in app directory represents a route segment mapped to URL path.",
                category: "Next.js",
            },
        ];
        const store = new SqliteDocumentStore(DB_PATH);
        store.addMany(sampleDocs);
        store.close();
        documents = sampleDocs;
    }
    console.log(`Loaded ${documents.length} documents from ${DB_PATH}`);
    const server = createSearchApp(documents);
    server.listen(PORT, () => console.log(`Search API on http://localhost:${PORT}/search?q=...`));
}
