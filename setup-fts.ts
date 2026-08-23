import { TursoDocumentStore } from "./src/store/turso-document-store.ts";
import * as fs from "fs";

let url = process.env.TURSO_DATABASE_URL?.trim();
let authToken = process.env.TURSO_AUTH_TOKEN?.trim();

if (!url && fs.existsSync(".env")) {
    const env = fs.readFileSync(".env", "utf-8");
    url = env.match(/TURSO_DATABASE_URL=(.*)/)?.[1]?.trim();
    authToken = env.match(/TURSO_AUTH_TOKEN=(.*)/)?.[1]?.trim();
}

if (!url || !authToken) {
    console.error("❌ Missing Turso credentials.");
    process.exit(1);
}

const databaseUrl = url;
const databaseAuthToken = authToken;

async function setup() {
    console.log("⚡ Connecting to Turso & setting up FTS5...");
    const store = new TursoDocumentStore(databaseUrl, databaseAuthToken);
    await store.init();
    console.log("⚡ Rebuilding FTS5 index from existing documents...");
    await store.rebuildFts();
    console.log("✅ Done! FTS5 is ready.");
}

setup().catch(console.error);
