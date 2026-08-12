import {DocumentStore} from "../src/store/document-store.ts";
import {crawl} from "../src/crawler/crawler.ts";

const store = new DocumentStore();
await crawl(
    "http://localhost:3000",
    store,
    {
        maxPages: 10,
        maxDepth: 2,
        rateLimitMs: 1000,
        timeoutMs: 10_000,
        maxRetries: 2,
        concurrency: 3,
    },
);

console.dir(store.getAll(), {depth: null});