import { createClient, type Client } from "@libsql/client";
import type { Document } from "../indexer/document.ts";
import type { DocumentMetadata } from "./sqlite-document-store.ts";

export type DocumentRow = {
    id: string;
    url: string;
    title: string;
    text: string;
    etag: string | null;
    last_modified: string | null;
    last_crawled_at: number | null;
    status_code: number | null;
    category: string | null;
};

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

        // Regular B-tree index for category filtering
        await this.client.execute(
            `CREATE INDEX IF NOT EXISTS idx_category ON documents(category);`
        );

        // FTS5 virtual table — inverted index for fast full-text search
        await this.client.execute(`
            CREATE VIRTUAL TABLE IF NOT EXISTS docs_fts USING fts5(
                id   UNINDEXED,
                url  UNINDEXED,
                title,
                text,
                category UNINDEXED,
                content='documents',
                content_rowid='rowid',
                tokenize='unicode61 remove_diacritics 1'
            );
        `);

        await this.client.execute(
            `CREATE VIRTUAL TABLE IF NOT EXISTS docs_vocab USING fts5vocab('docs_fts','row');`
        );

        // Triggers to keep docs_fts in sync with documents table
        await this.client.execute(`
            CREATE TRIGGER IF NOT EXISTS docs_fts_insert
            AFTER INSERT ON documents BEGIN
                INSERT INTO docs_fts(rowid, id, url, title, text, category)
                VALUES (new.rowid, new.id, new.url, new.title, new.text, new.category);
            END;
        `);

        await this.client.execute(`
            CREATE TRIGGER IF NOT EXISTS docs_fts_update
            AFTER UPDATE ON documents BEGIN
                INSERT INTO docs_fts(docs_fts, rowid, id, url, title, text, category)
                VALUES ('delete', old.rowid, old.id, old.url, old.title, old.text, old.category);
                INSERT INTO docs_fts(rowid, id, url, title, text, category)
                VALUES (new.rowid, new.id, new.url, new.title, new.text, new.category);
            END;
        `);

        await this.client.execute(`
            CREATE TRIGGER IF NOT EXISTS docs_fts_delete
            AFTER DELETE ON documents BEGIN
                INSERT INTO docs_fts(docs_fts, rowid, id, url, title, text, category)
                VALUES ('delete', old.rowid, old.id, old.url, old.title, old.text, old.category);
            END;
        `);
    }

    /**
     * Rebuilds the FTS index from scratch.
     * Call this once after the initial crawl if documents were inserted
     * before the FTS table existed (i.e. first-time migration).
     */
    async rebuildFts(): Promise<void> {
        await this.client.execute(`INSERT INTO docs_fts(docs_fts) VALUES('rebuild');`);
        console.log("✅ FTS5 index rebuilt from documents table.");
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
        if (documents.length === 0) return;

        const statements = documents.map((doc) => ({
            sql: `INSERT OR REPLACE INTO documents
            (id, url, title, text, etag, last_modified, last_crawled_at, status_code, category)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
            args: [
                doc.id,
                doc.url,
                doc.title,
                doc.text,
                doc.etag ?? null,
                doc.lastModified ?? null,
                doc.lastCrawledAt ?? Date.now(),
                doc.statusCode ?? 200,
                doc.category ?? "General",
            ],
        }));
        await this.client.batch(statements, "write");
    }

    async getMetadata(id: string): Promise<DocumentMetadata | undefined> {
        const result = await this.client.execute({
            sql: `SELECT etag, last_modified, last_crawled_at, status_code, category FROM documents WHERE id = ?`,
            args: [id],
        });

        if (result.rows.length === 0) return undefined;
        const row = result.rows[0] as unknown as DocumentRow;

        return {
            etag: row.etag ?? undefined,
            lastModified: row.last_modified ?? undefined,
            lastCrawledAt: row.last_crawled_at ? Number(row.last_crawled_at) : undefined,
            statusCode: row.status_code ? Number(row.status_code) : undefined,
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
        const result = await this.client.execute(
            `SELECT id, url, title, text, etag, last_modified, last_crawled_at, status_code, category FROM documents`
        );
        const rows = result.rows as unknown as DocumentRow[];

        return rows.map((row) => ({
            id: row.id,
            url: row.url,
            title: row.title,
            text: row.text,
            etag: row.etag ?? undefined,
            lastModified: row.last_modified ?? undefined,
            lastCrawledAt: row.last_crawled_at ? Number(row.last_crawled_at) : undefined,
            statusCode: row.status_code ? Number(row.status_code) : undefined,
            category: row.category ?? "General",
        }));
    }
}

