import { DatabaseSync } from "node:sqlite";
import type { DocumentStatsMap, Index } from "../indexer/inverted-index.ts";


export class SqliteIndexStore {
    private readonly db: DatabaseSync;

    constructor(path: string) {
        this.db = new DatabaseSync(path);
        this.db.exec(
            `
            CREATE TABLE IF NOT EXISTS inverted_index (
                term TEXT NOT NULL,
                doc_id TEXT NOT NULL,
                frequency INTEGER NOT NULL,
                positions TEXT NOT NULL,
                PRIMARY KEY (term, doc_id)
            );
            CREATE INDEX IF NOT EXISTS idx_term ON inverted_index(term);
            CREATE TABLE IF NOT EXISTS doc_stats (
                doc_id TEXT PRIMARY KEY,
                length INTEGER NOT NULL,
                max_frequency INTEGER NOT NULL
            );
            `);
    }
    saveIndex(index: Index, documentStats: DocumentStatsMap): void {
        this.db.exec("BEGIN TRANSACTION");
        try {
            const insertPosting = this.db.prepare(
                "INSERT OR REPLACE INTO inverted_index (term,doc_id,frequency,positions) VALUES (?,?,?,?)"
            );
            for (const [term, termData] of Object.entries(index)) {
                for (const [doc_id, posting] of Object.entries(termData.postings)) {
                    insertPosting.run(term, doc_id, posting.frequency, JSON.stringify(posting.positions));
                }
            }
            const insertStat = this.db.prepare(
                "INSERT OR REPLACE INTO doc_stats (doc_id,length,max_frequency) VALUES (?,?,?)"
            );
            for (const [doc_id, stats] of Object.entries(documentStats)) {
                insertStat.run(doc_id, stats.length, stats.maxFrequency);
            };
            this.db.exec("COMMIT");
        } catch (error) {
            this.db.exec("ROLLBACK");
            throw error;
        }

    }
    loadIndex(): { index: Index, documentStats: DocumentStatsMap } {
        const index: Index = {};
        const documentStats: DocumentStatsMap = {};

        const postingRows = this.db.prepare("SELECT term, doc_id, frequency, positions FROM inverted_index").all() as Record<string,unknown>[]
        for (const row of postingRows) {
            const term = String(row.term);
            const docId = String(row.doc_id)
            const freq = Number(row.frequency)
            const pos = JSON.parse(String(row.positions)) as number[];

            index[term] ??= { documentFrequency: 0, postings: {} };
            index[term].postings[docId] = { frequency: freq, positions: pos }
            index[term].documentFrequency++;
        }
        const statsRows = this.db.prepare("SELECT doc_id,length,max_frequency FROM doc_stats").all() as Record<string,unknown>[]
        for (const row of statsRows) {
            const docId = String(row.doc_id)
            const len = Number(row.length)
            const maxFreq = Number(row.max_frequency)
            documentStats[docId] = { length: len, maxFrequency: maxFreq };
        }
        return { index, documentStats };
    }
    hasIndex(): boolean {
        const row = this.db.prepare("SELECT COUNT(*) as count FROM inverted_index").get() as { count: number };
        return row.count > 0;
    }
    close(): void {
        this.db.close();
    }

}
