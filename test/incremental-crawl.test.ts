import { test } from "node:test";
import assert from "node:assert/strict";
import http from "node:http";
import { crawl } from "../src/crawler/crawler.ts";
import { SqliteDocumentStore } from "../src/store/sqlite-document-store.ts";

test("incremental crawl handles 304 Not Modified and 404 Purging", async () => {
    let requestsCount = 0;
    let serverMode: "initial" | "unchanged" | "deleted" = "initial";

    const server = http.createServer((req, res) => {
        requestsCount++;

        if (req.url === "/robots.txt") {
            res.writeHead(200, { "content-type": "text/plain" });
            res.end("User-agent: *\nAllow: /");
            return;
        }

        if (serverMode === "unchanged") {
            // Check if client sent conditional ETag header
            if (req.headers["if-none-match"] === `"v1"`) {
                res.writeHead(304);
                res.end();
                return;
            }
        }

        if (serverMode === "deleted") {
            res.writeHead(404);
            res.end("Not Found");
            return;
        }

        res.writeHead(200, {
            "content-type": "text/html",
            ETag: `"v1"`,
            "Last-Modified": "Wed, 10 Aug 2026 12:00:00 GMT",
        });
        res.end("<html><head><title>Test Page</title></head><body><h1>Content</h1></body></html>");
    });

    await new Promise<void>((resolve) => server.listen(0, resolve));
    const port = (server.address() as any).port;
    const seedUrl = `http://127.0.0.1:${port}`;

    const store = new SqliteDocumentStore(":memory:");

    const crawlConfig = {
        maxPages: 10,
        maxDepth: 1,
        rateLimitMs: 0,
        timeoutMs: 1000,
        maxRetries: 0,
        concurrency: 1,
    };

    // 1. Initial Crawl (200 OK)
    await crawl(seedUrl, store, crawlConfig);
    assert.equal(store.has(seedUrl), true);
    const doc1 = store.get(seedUrl);
    assert.equal(doc1?.etag, `"v1"`);
    assert.equal(doc1?.statusCode, 200);

    // 2. Incremental Crawl (304 Not Modified)
    serverMode = "unchanged";
    await crawl(seedUrl, store, crawlConfig);
    assert.equal(store.has(seedUrl), true);
    const meta = store.getMetadata(seedUrl);
    assert.equal(meta?.statusCode, 304);

    // 3. Page Deletion (404 Purging)
    serverMode = "deleted";
    await crawl(seedUrl, store, crawlConfig);
    assert.equal(store.has(seedUrl), false); // Purged from DB!

    store.close();
    await new Promise<void>((resolve) => server.close(() => resolve()));
});
