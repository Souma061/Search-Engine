import http from "node:http";
import { loadDocuments } from "./src/store/sqlite-document-store.ts";
import { createSearchEngine } from "./src/engine/search-engine.ts";
import type { Document } from "./src/indexer/document.ts";

const PORT = Number(process.env.SEARCH_PORT ?? 8080);
const DB_PATH = process.env.DB_PATH ?? "index.db";

const PAGE = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8"><title>Search</title>
<style>
    body { font-family: system-ui, sans-serif; max-width: 640px; margin: 40px auto; }
    input[type=text] { width: 70%; padding: 8px; }
    button { padding: 8px 16px; }
    li { margin: 16px 0; }
    .url { color: #006621; font-size: 0.85em; text-decoration: none; }
    .score { color: #888; font-size: 0.85em; margin-left: 6px; }
    .snippet { margin-top: 4px; color: #444; font-size: 0.9em; line-height: 1.4; }
    mark { background: #fff3a3; padding: 0 2px; border-radius: 2px; }
</style>
</head>
<body>
<h1>Search</h1>
<form id="f">
    <input type="text" id="q" placeholder="search query">
    <select id="mode">
        <option value="BM25">BM25</option>
        <option value="TFIDF">TFIDF</option>
        <option value="PHRASE">Phrase</option>
    </select>
    <button>Search</button>
</form>
<ol id="r"></ol>
<script>
const f = document.getElementById("f");
const r = document.getElementById("r");
f.addEventListener("submit", async (e) => {
    e.preventDefault();
    const q = document.getElementById("q").value;
    const mode = document.getElementById("mode").value;
    const res = await fetch("/search?q=" + encodeURIComponent(q) + "&mode=" + mode);
    const data = await res.json();
    r.innerHTML = data.results.map(x =>
        "<li><a href=\"" + x.url + "\">" + x.title + "</a> " +
        "<span class=score>[" + x.score.toFixed(3) + "]</span><br>" +
        "<span class=url>" + x.url + "</span>" +
        (x.snippet ? "<div class=snippet>" + x.snippet + "</div>" : "") +
        "</li>"
    ).join("") || "<li>No results</li>";
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
            const q = url.searchParams.get("q") ?? "";
            const mode = url.searchParams.get("mode") ?? "BM25";

            const results =
                mode === "TFIDF" ? engine.search(q) :
                mode === "PHRASE" ? engine.scorePhraseQuery(q) :
                engine.searchBM25(q);

            res.setHeader("content-type", "application/json");
            res.end(JSON.stringify({ q, mode, count: results.length, results }));
            return;
        }

        if (url.pathname === "/") {
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
    const documents = loadDocuments(DB_PATH);
    console.log(`Loaded ${documents.length} documents from ${DB_PATH}`);
    const server = createSearchApp(documents);
    server.listen(PORT, () => console.log(`Search API on http://localhost:${PORT}/search?q=...`));
}
