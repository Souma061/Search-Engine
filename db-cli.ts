import { createClient } from "@libsql/client";
import * as fs from "fs";

let url = process.env.TURSO_DATABASE_URL?.trim();
let authToken = process.env.TURSO_AUTH_TOKEN?.trim();

if (!url && fs.existsSync(".env")) {
    const env = fs.readFileSync(".env", "utf-8");
    url = env.match(/TURSO_DATABASE_URL=(.*)/)?.[1]?.trim();
    authToken = env.match(/TURSO_AUTH_TOKEN=(.*)/)?.[1]?.trim();
}

if (!url) {
    console.error("❌ No TURSO_DATABASE_URL found in environment or .env file.");
    process.exit(1);
}

const db = createClient({ url, authToken });

async function main() {
    const query = process.argv[2] || "SELECT id, title, category FROM documents LIMIT 10;";
    console.log(`\n🔍 Executing on Turso (${url}):\n   ${query}\n`);
    
    try {
        const result = await db.execute(query);
        if (result.rows.length === 0) {
            console.log("Empty result set (0 rows).");
        } else {
            console.table(result.rows);
            console.log(`Total rows returned: ${result.rows.length}`);
        }
    } catch (err: any) {
        console.error("❌ Query error:", err.message || err);
    }
}

main();
