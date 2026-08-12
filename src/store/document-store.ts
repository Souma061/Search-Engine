import type { Document } from "../indexer/document.ts";

export class DocumentStore {
    private documents = new Map<string, Document>();

    add(document: Document): void {
        this.documents.set(document.id, document);
    }

    addMany(documents: Document[]): void {
        for (const document of documents) {
            this.add(document);
        }
    }

    get(id: string): Document | undefined {
        return this.documents.get(id);
    }

    getAll(): Document[] {
        return [...this.documents.values()];
    }

    has(id: string): boolean {
        return this.documents.has(id);
    }

    delete(id: string): boolean {
        return this.documents.delete(id);
    }
}
