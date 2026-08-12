import { SqliteDocumentStore } from "./src/store/sqlite-document-store.ts";
import { crawl } from "./src/crawler/crawler.ts";

const SEED_URL = process.env.SEED_URL ?? "http://localhost:3000";
const DB_PATH = process.env.DB_PATH ?? "index.db";

const store = new SqliteDocumentStore(DB_PATH);

await crawl(SEED_URL, store, {
    maxPages: 50,
    maxDepth: 3,
    rateLimitMs: 200,
    timeoutMs: 2_000,
    maxRetries: 0,
    concurrency: 4,
});

console.log(`Crawled ${store.getAll().length} documents from ${SEED_URL} into ${DB_PATH}`);
store.close();
