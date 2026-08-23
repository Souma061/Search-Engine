import { createClient, type Client } from "@libsql/client";
import type { VercelRequest, VercelResponse } from "@vercel/node";
import * as fs from "node:fs";

let tursoUrl = process.env.TURSO_DATABASE_URL?.trim();
let tursoToken = process.env.TURSO_AUTH_TOKEN?.trim();

if ((!tursoUrl || !tursoToken) && fs.existsSync(".env")) {
    const env = fs.readFileSync(".env", "utf-8");
    tursoUrl = tursoUrl || env.match(/TURSO_DATABASE_URL=(.*)/)?.[1]?.trim();
    tursoToken = tursoToken || env.match(/TURSO_AUTH_TOKEN=(.*)/)?.[1]?.trim();
}

const db = createClient({
    url: tursoUrl ?? "",
    authToken: tursoToken ?? "",
});

export type HealthDatabase = Pick<Client, "execute">;

export function createHealthHandler(database: HealthDatabase) {
    return async function handler(_req: VercelRequest, res: VercelResponse) {
        const start = performance.now();
        try {
            //ping db and get total doc count
            const result = await database.execute("SELECT COUNT(*) AS count FROM documents");
            const docCount = Number(result.rows[0]?.count ?? 0);
            const latency = Number(performance.now() - start).toFixed(2);

            return res.status(200).json({
                status: "healthy",
                timestamp: new Date().toISOString(),
                database: "connected",
                documentIndexed: docCount,
                latencyMs: latency
            })

        } catch (error: any) {
            return res.status(503).json({
                status: "unhealthy",
                timestamp: new Date().toISOString(),
                database: "disconnected",
                error: error?.message || "Database unreachable",
            });
        }
    };
}

export default createHealthHandler(db);
