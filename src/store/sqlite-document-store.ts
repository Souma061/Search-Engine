import { DatabaseSync } from "node:sqlite";
import type { Document } from "../indexer/document.ts";

export function loadDocuments(dbPath: string): Document[] {
    const store = new SqliteDocumentStore(dbPath);
    const documents = store.getAll();
    store.close();
    return documents;
}

export class SqliteDocumentStore {
    private readonly db: DatabaseSync;

    constructor(path: string) {
        this.db = new DatabaseSync(path);
        this.db.exec(`
            CREATE TABLE IF NOT EXISTS documents (
                id TEXT PRIMARY KEY,
                url TEXT NOT NULL,
                title TEXT NOT NULL,
                text TEXT NOT NULL
            )
        `);
    }

    add(document: Document): void {
        this.db.prepare(
            "INSERT OR REPLACE INTO documents (id, url, title, text) VALUES (?, ?, ?, ?)",
        ).run(document.id, document.url, document.title, document.text);
    }

    addMany(documents: Document[]): void {
        const insert = this.db.prepare(
            "INSERT OR REPLACE INTO documents (id, url, title, text) VALUES (?, ?, ?, ?)",
        );
        for (const document of documents) {
            insert.run(document.id, document.url, document.title, document.text);
        }
    }

    get(id: string): Document | undefined {
        const row = this.db.prepare("SELECT * FROM documents WHERE id = ?").get(id) as
            | Record<string, unknown>
            | undefined;
        return row ? this.rowToDocument(row) : undefined;
    }

    getAll(): Document[] {
        const rows = this.db.prepare("SELECT * FROM documents").all() as Record<string, unknown>[];
        return rows.map(this.rowToDocument);
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
        };
    }
}
