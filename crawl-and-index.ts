import { crawl, type CrawlConfig } from "./src/crawler/crawler.ts";
import { TursoDocumentStore } from "./src/store/turso-document-store.ts";
import { SqliteDocumentStore } from "./src/store/sqlite-document-store.ts";

const TURSO_URL = process.env.TURSO_DATABASE_URL;
const TURSO_TOKEN = process.env.TURSO_AUTH_TOKEN;

const SEED_URLS = [
    "https://react.dev/reference/react",
    "https://developer.mozilla.org/en-US/docs/Web/API",
    "https://nodejs.org/api/fs.html",
    "https://www.typescriptlang.org/docs/handbook/intro.html",
    "https://expressjs.com/en/4x/api.html",
    "https://nextjs.org/docs",
];

const config: CrawlConfig = {
    maxPages: 100,
    maxDepth: 2,
    rateLimitMs: 500,
    timeoutMs: 8000,
    maxRetries: 2,
    concurrency: 3,
};

async function main() {
    console.log("==========================================");
    console.log("🚀 Starting Automated Documentation Crawler");
    console.log("==========================================");

    let store: any;

    if (TURSO_URL && TURSO_TOKEN) {
        console.log(`🌐 Target: Turso Cloud Database (${TURSO_URL})`);
        const tursoStore = new TursoDocumentStore(TURSO_URL, TURSO_TOKEN);
        await tursoStore.init();
        store = tursoStore;
    } else {
        console.log("📁 Target: Local SQLite Database (index.db)");
        store = new SqliteDocumentStore("index.db");
    }

    for (const seedUrl of SEED_URLS) {
        console.log(`\n🕸️ Crawling seed: ${seedUrl}`);
        try {
            await crawl(seedUrl, store, config);
        } catch (error) {
            console.error(`❌ Error crawling ${seedUrl}:`, error);
        }
    }

    console.log("\n==========================================");
    console.log("✅ Crawling complete! Database updated successfully.");
    console.log("==========================================");
}

main().catch((err) => {
    console.error("Fatal error during crawl:", err);
    process.exit(1);
});
