import type { Index } from "../indexer/inverted-index.ts";

export function levenshteinDistance(a: string, b: string): number {
    if (a === b) return 0;
    if (a.length === 0) return b.length;
    if (b.length === 0) return a.length;

    const row: number[] = Array.from({ length: b.length + 1 }, (_, i) => i);

    for (let i = 1; i <= a.length; i++) {
        let prev = i;
        for (let j = 1; j <= b.length; j++) {
            const val = a[i - 1] === b[j - 1] ? row[j - 1] : Math.min(row[j - 1], prev, row[j]) + 1;
            row[j - 1] = prev;
            prev = val;
        }
        row[b.length] = prev;
    }

    return row[b.length];
}

export function suggestCorrection(queryWord: string, index: Index, maxDistance = 2): string | null {
    const word = queryWord.toLowerCase();

    // 1. Fast O(1) hash lookup — if word exists in index, no typo suggestion needed
    if (index[word]) {
        return null;
    }

    let bestCandidate: string | null = null;
    let minDistance = maxDistance + 1;
    let maxDocFreq = -1;

    for (const [candidate, termData] of Object.entries(index)) {
        // Fast pre-filter: Skip terms with length difference > maxDistance
        if (Math.abs(candidate.length - word.length) > maxDistance) {
            continue;
        }

        const dist = levenshteinDistance(word, candidate);

        if (dist <= maxDistance) {
            // Pick candidate with lower distance, or tie-break using higher document frequency
            if (dist < minDistance || (dist === minDistance && termData.documentFrequency > maxDocFreq)) {
                minDistance = dist;
                bestCandidate = candidate;
                maxDocFreq = termData.documentFrequency;
            }
        }
    }

    return bestCandidate;
}
