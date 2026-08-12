import {test, before, after} from "node:test";
import assert from "node:assert/strict";
import {createTestServer} from "../server.mjs";
import {DocumentStore} from "../src/store/document-store.ts";
import {crawl, type CrawlConfig} from "../src/crawler/crawler.ts";
import {createSearchEngine} from "../src/engine/search-engine.ts";

let server: ReturnType<typeof createTestServer>;
let baseUrl: string;

before(async () => {
    process.env.SLOW_MS = "2000";
    server = createTestServer();
    await new Promise<void>(resolve => server.listen(0, "127.0.0.1", resolve));
    baseUrl = `http://127.0.0.1:${(server.address() as {port: number}).port}`;
});

after(() => new Promise<void>(resolve => server.close(() => resolve())));

test("crawl → store → index → search end to end", async () => {
    const store = new DocumentStore();

    const config: CrawlConfig = {
        maxPages: 10,
        maxDepth: 2,
        rateLimitMs: 0,
        timeoutMs: 500,
        maxRetries: 0,
        concurrency: 3,
    };

    await crawl(baseUrl, store, config);

    const docs = store.getAll();
    assert.ok(docs.length >= 3, `expected at least 3 docs, got ${docs.length}`);

    const ids = new Set(docs.map(doc => doc.id));
    assert.ok(ids.has(`${baseUrl}/java.html`), "java.html should be crawled");
    assert.ok(ids.has(`${baseUrl}/backend.html`), "backend.html should be crawled");
    assert.ok(ids.has(`${baseUrl}/about.html`), "about.html should be crawled");
    assert.ok(!ids.has(`${baseUrl}/search.html`), "search.html should be blocked by robots.txt");
    assert.ok(!ids.has(`${baseUrl}/slow`), "slow should have failed to fetch");

    const engine = createSearchEngine(docs);
    const results = engine.searchBM25("java programming");
    assert.ok(results.length > 0, "search should return results");
    assert.equal(results[0].documentId, `${baseUrl}/java.html`, "java.html should rank first for 'java programming'");
});
