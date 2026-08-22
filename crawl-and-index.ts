import { crawl, type CrawlConfig } from "./src/crawler/crawler.ts";
import { TursoDocumentStore } from "./src/store/turso-document-store.ts";
import { SqliteDocumentStore } from "./src/store/sqlite-document-store.ts";

const TURSO_URL = process.env.TURSO_DATABASE_URL?.trim();
const TURSO_TOKEN = process.env.TURSO_AUTH_TOKEN?.trim();

const SEED_URLS = [
    // 🧠 AI / Machine Learning
    "https://pytorch.org/docs/stable/index.html",
    "https://huggingface.co/docs/transformers/index",
    "https://python.langchain.com/docs/introduction",
    "https://scikit-learn.org/stable/user_guide.html",

    // ⚡ Frontend Frameworks
    "https://react.dev/reference/react",
    "https://nextjs.org/docs",
    "https://angular.dev/overview",
    "https://vuejs.org/guide/introduction.html",
    "https://tailwindcss.com/docs/installation",

    // 🐍 Languages & Core Runtimes
    "https://docs.python.org/3/tutorial/index.html",
    "https://www.typescriptlang.org/docs/handbook/intro.html",
    "https://nodejs.org/api/fs.html",
    "https://doc.rust-lang.org/book/title-page.html",
    "https://go.dev/doc/tutorial/getting-started",

    // 🛠️ Backend Frameworks & APIs
    "https://fastapi.tiangolo.com/tutorial",
    "https://expressjs.com/en/4x/api.html",
    "https://developer.mozilla.org/en-US/docs/Web/API",

    // 🐳 DevOps & Containers
    "https://docs.docker.com/get-started",
    "https://kubernetes.io/docs/concepts/overview",

    // 🗄️ Databases
    "https://www.postgresql.org/docs/current/intro-whatis.html",
    "https://redis.io/docs/latest/develop/get-started",
];

const config: CrawlConfig = {
    maxPages: 60,
    maxDepth: 2,
    rateLimitMs: 300,
    timeoutMs: 8000,
    maxRetries: 2,
    concurrency: 4,
};

async function main() {
    console.log("==========================================");
    console.log("🚀 Starting Multi-Branch Developer Crawler");
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

    console.log("\n\uD83D\uDD04 Rebuilding FTS5 full-text search index...");
    if (TURSO_URL && TURSO_TOKEN) {
        await (store as TursoDocumentStore).rebuildFts();
    }

    console.log("\n==========================================");
    console.log("✅ Multi-branch crawl complete! Database updated.");
    console.log("==========================================");
}

main().catch((err) => {
    console.error("Fatal error during crawl:", err);
    process.exit(1);
});
