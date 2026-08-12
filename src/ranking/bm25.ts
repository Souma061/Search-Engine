import type {DocumentStatsMap, Index} from "../indexer/inverted-index.ts";

export const BM25_K1 = 1.2; // controls how quickly term-frequency gains saturate.
export const BM25_B = 0.75; // controls how strongly document length affects the score.

export function calculateBM25TF(
    frequency: number,
    documentLength: number,
    averageDocumentLength: number,
    k1: number = BM25_K1,
    b: number = BM25_B,
): number {
    const lengthNormalization =
        1 -
        b +
        b * (documentLength / averageDocumentLength);

    return (
        (frequency * (k1 + 1)) /
        (frequency + k1 * lengthNormalization)
    );
}

export function calculateBM25IDF(totalDocs: number, index: Index, word: string): number {
    if (totalDocs === 0) {
        return 0;
    }
    const term = index[word];
    if (!term) {
        return 0;
    }
    const documentFrequency = term.documentFrequency;
    return Math.log(
        (totalDocs - documentFrequency + 0.5) / (documentFrequency + 0.5) + 1,
    )
}

// Smoothed BM25 IDF.
// +1 keeps the IDF non-negative for very common terms.
export function calculateBM25(
    totalDocs: number,
    averageDocumentLength: number,
    index: Index,
    documentStats: DocumentStatsMap,
    word: string,
    file: string,
): number {
    const frequency = index[word]?.postings[file]?.frequency;
    const documentLength = documentStats[file]?.length;

    if (!frequency || !documentLength) return 0;

    const tf = calculateBM25TF(
        frequency,
        documentLength,
        averageDocumentLength,
    );
    const idf = calculateBM25IDF(totalDocs, index, word);
    return tf * idf;
}

export function scoreDocumentsBM25(
    totalDocs: number,
    averageDocumentLength: number,
    index: Index,
    documentStats: DocumentStatsMap,
    words: string[],
    docs: string[],
): Record<string, number> {
    const scores: Record<string, number> = {};

    for (const file of docs) {
        scores[file] = words.reduce(
            (sum, word) => sum + calculateBM25(totalDocs, averageDocumentLength, index, documentStats, word, file), 0,
        );
    }
    return scores;
}
