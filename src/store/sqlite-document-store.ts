import { DatabaseSync } from "node:sqlite";
import type { Document } from "../indexer/document.ts";

export function loadDocuments(dbPath: string): Document[] {
    const store = new SqliteDocumentStore(dbPath);
    const documents = store.getAll();
    store.close();
    return documents;
}

export type DocumentMetadata = {
    etag?: string;
    lastModified?: string;
    lastCrawledAt?: number;
    statusCode?: number;
};

export class SqliteDocumentStore {
    private readonly db: DatabaseSync;

    constructor(path: string) {
        this.db = new DatabaseSync(path);
        this.db.exec(`
            CREATE TABLE IF NOT EXISTS documents (
                id TEXT PRIMARY KEY,
                url TEXT NOT NULL,
                title TEXT NOT NULL,
                text TEXT NOT NULL,
                etag TEXT,
                last_modified TEXT,
                last_crawled_at INTEGER,
                status_code INTEGER DEFAULT 200
            )
        `);

        // Migration helpers for existing databases
        this.ensureColumn("etag", "TEXT");
        this.ensureColumn("last_modified", "TEXT");
        this.ensureColumn("last_crawled_at", "INTEGER");
        this.ensureColumn("status_code", "INTEGER DEFAULT 200");
    }

    private ensureColumn(name: string, typeSql: string): void {
        try {
            this.db.exec(`ALTER TABLE documents ADD COLUMN ${name} ${typeSql}`);
        } catch {
            // Column already exists
        }
    }

    add(document: Document): void {
        this.db.prepare(
            `INSERT OR REPLACE INTO documents 
             (id, url, title, text, etag, last_modified, last_crawled_at, status_code) 
             VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        ).run(
            document.id,
            document.url,
            document.title,
            document.text,
            document.etag ?? null,
            document.lastModified ?? null,
            document.lastCrawledAt ?? Date.now(),
            document.statusCode ?? 200,
        );
    }

    addMany(documents: Document[]): void {
        const insert = this.db.prepare(
            `INSERT OR REPLACE INTO documents 
             (id, url, title, text, etag, last_modified, last_crawled_at, status_code) 
             VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        );
        for (const document of documents) {
            insert.run(
                document.id,
                document.url,
                document.title,
                document.text,
                document.etag ?? null,
                document.lastModified ?? null,
                document.lastCrawledAt ?? Date.now(),
                document.statusCode ?? 200,
            );
        }
    }

    get(id: string): Document | undefined {
        const row = this.db.prepare("SELECT * FROM documents WHERE id = ?").get(id) as
            | Record<string, unknown>
            | undefined;
        return row ? this.rowToDocument(row) : undefined;
    }

    getMetadata(id: string): DocumentMetadata | undefined {
        const row = this.db
            .prepare("SELECT etag, last_modified, last_crawled_at, status_code FROM documents WHERE id = ?")
            .get(id) as Record<string, unknown> | undefined;

        if (!row) return undefined;

        return {
            etag: row.etag ? String(row.etag) : undefined,
            lastModified: row.last_modified ? String(row.last_modified) : undefined,
            lastCrawledAt: row.last_crawled_at ? Number(row.last_crawled_at) : undefined,
            statusCode: row.status_code ? Number(row.status_code) : undefined,
        };
    }

    touchCrawled(id: string, statusCode = 304): void {
        this.db.prepare(
            "UPDATE documents SET last_crawled_at = ?, status_code = ? WHERE id = ?",
        ).run(Date.now(), statusCode, id);
    }

    getAll(): Document[] {
        const rows = this.db.prepare("SELECT * FROM documents").all() as Record<string, unknown>[];
        return rows.map((r) => this.rowToDocument(r));
    }

    has(id: string): boolean {
        const row = this.db.prepare("SELECT id FROM documents WHERE id = ?").get(id);
        return row !== undefined;
    }

    delete(id: string): boolean {
        return this.db.prepare("DELETE FROM documents WHERE id = ?").run(id).changes > 0;
    }

    close(): void {
        this.db.close();
    }

    private rowToDocument(row: Record<string, unknown>): Document {
        return {
            id: String(row.id),
            url: String(row.url),
            title: String(row.title),
            text: String(row.text),
            etag: row.etag ? String(row.etag) : undefined,
            lastModified: row.last_modified ? String(row.last_modified) : undefined,
            lastCrawledAt: row.last_crawled_at ? Number(row.last_crawled_at) : undefined,
            statusCode: row.status_code ? Number(row.status_code) : undefined,
        };
    }
}
