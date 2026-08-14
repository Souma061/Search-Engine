import { createClient, type Client } from "@libsql/client";
import type { Document } from "../indexer/document.ts";
import type { DocumentMetadata } from "./sqlite-document-store.ts";

export class TursoDocumentStore {
    private readonly client: Client;

    constructor(url: string, authToken: string) {
        const cleanUrl = url.trim();
        const cleanToken = authToken.trim();
        this.client = createClient({ url: cleanUrl, authToken: cleanToken });
    }

    async init(): Promise<void> {
        await this.client.execute(`
            CREATE TABLE IF NOT EXISTS documents (
                id TEXT PRIMARY KEY,
                url TEXT NOT NULL,
                title TEXT NOT NULL,
                text TEXT NOT NULL,
                etag TEXT,
                last_modified TEXT,
                last_crawled_at INTEGER,
                status_code INTEGER DEFAULT 200,
                category TEXT DEFAULT 'General'
            );
        `);
        try {
            await this.client.execute(`CREATE INDEX IF NOT EXISTS idx_category ON documents(category);`);
        } catch {
            // Index already exists
        }
    }

    async add(document: Document): Promise<void> {
        await this.client.execute({
            sql: `INSERT OR REPLACE INTO documents 
                 (id, url, title, text, etag, last_modified, last_crawled_at, status_code, category) 
                 VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
            args: [
                document.id,
                document.url,
                document.title,
                document.text,
                document.etag ?? null,
                document.lastModified ?? null,
                document.lastCrawledAt ?? Date.now(),
                document.statusCode ?? 200,
                document.category ?? "General",
            ],
        });
    }

    async addMany(documents: Document[]): Promise<void> {
        for (const doc of documents) {
            await this.add(doc);
        }
    }

    async getMetadata(id: string): Promise<DocumentMetadata | undefined> {
        const result = await this.client.execute({
            sql: `SELECT etag, last_modified, last_crawled_at, status_code, category FROM documents WHERE id = ?`,
            args: [id],
        });

        if (result.rows.length === 0) return undefined;
        const row = result.rows[0] as unknown as {
            etag: string | null;
            last_modified: string | null;
            last_crawled_at: number | null;
            status_code: number | null;
            category: string | null;
        };

        return {
            etag: row.etag ?? undefined,
            lastModified: row.last_modified ?? undefined,
            lastCrawledAt: row.last_crawled_at ?? undefined,
            statusCode: row.status_code ?? undefined,
            category: row.category ?? undefined,
        };
    }

    async touchCrawled(id: string, statusCode: number = 200): Promise<void> {
        await this.client.execute({
            sql: `UPDATE documents SET last_crawled_at = ?, status_code = ? WHERE id = ?`,
            args: [Date.now(), statusCode, id],
        });
    }

    async delete(id: string): Promise<boolean> {
        const result = await this.client.execute({
            sql: `DELETE FROM documents WHERE id = ?`,
            args: [id],
        });
        return result.rowsAffected > 0;
    }

    async getAll(): Promise<Document[]> {
        const result = await this.client.execute(`SELECT id, url, title, text, etag, last_modified, last_crawled_at, status_code, category FROM documents`);
        return result.rows.map((row: any) => ({
            id: row.id,
            url: row.url,
            title: row.title,
            text: row.text,
            etag: row.etag ?? undefined,
            lastModified: row.last_modified ?? undefined,
            lastCrawledAt: row.last_crawled_at ?? undefined,
            statusCode: row.status_code ?? undefined,
            category: row.category ?? undefined,
        }));
    }
}
