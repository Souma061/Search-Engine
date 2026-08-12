import type { Index, DocumentStatsMap } from "../indexer/inverted-index.ts";

// TF-IDF = augmented TF × IDF

export function calculateIDF(totalDocs: number, index: Index, word: string): number {
    if (totalDocs === 0) return 0;
    const term = index[word];
    return term ? 1 + Math.log(totalDocs / term.documentFrequency) : 0;
}

export function calculateTF(frequency: number, maxFrequency: number): number {
    return 0.5 + 0.5 * (frequency / maxFrequency);
}

export function calculateTFIDF(
    totalDocs: number,
    index: Index,
    documentStats: DocumentStatsMap,
    word: string,
    file: string,
): number {
    const frequency = index[word]?.postings[file]?.frequency;
    const documentLength = documentStats[file]?.length;
    if (!frequency || !documentLength) return 0;

    const maxFrequency = documentStats[file]?.maxFrequency;
    if (!maxFrequency) return 0;

    const tf = calculateTF(frequency, maxFrequency);
    const idf = calculateIDF(totalDocs, index, word);

    return tf * idf;
}

export function scoreDocuments(
    totalDocs: number,
    index: Index,
    documentStats: DocumentStatsMap,
    words: string[],
    docs: string[],
): Record<string, number> {
    const scores: Record<string, number> = {};
    for (const file of docs) {
        scores[file] = words.reduce((sum, word) => sum + calculateTFIDF(totalDocs, index, documentStats, word, file), 0);
    }
    return scores;
}
