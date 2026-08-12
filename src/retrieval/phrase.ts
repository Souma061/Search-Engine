import type { Index } from "../indexer/inverted-index.ts";
import { tokenize } from "../indexer/tokenizer.ts";

export type PhraseResult = {
    file: string;
    phrase: string;
};

export type PhraseScore = {
    file: string;
    phrase: string;
    occurrences: number;
};

export function countPhraseOccurrences(
    index: Index,
    file: string,
    words: string[],
): number {
    const firstWord = words[0];
    const firstPosition = index[firstWord]?.postings[file]?.positions;
    if (!firstPosition) {
        return 0;
    }
    let count = 0;
    for (const startPosition of firstPosition) {
        let phrasesFound = true;
        for (let i = 1; i < words.length; i++) {
            const word = words[i];
            const positions = index[word]?.postings[file]?.positions;
            if (!positions || !positions.includes(startPosition + i)) {
                phrasesFound = false;
                break;
            }
        }
        if (phrasesFound) {
            count++;
        }
    }
    return count;
}

export function hasPhrase(index: Index, file: string, words: string[]): boolean {
    return countPhraseOccurrences(index, file, words) > 0;
}

export function searchPhrase(index: Index, files: string[], query: string): PhraseResult[] {
    const words = tokenize(query);
    if (words.length === 0) {
        return [];
    }
    const result: PhraseResult[] = [];
    for (const file of files) {
        if (hasPhrase(index, file, words)) {
            result.push({
                file,
                phrase: query,
            });
        }
    }
    return result;
}

export function rankPhrase(index: Index, files: string[], query: string): PhraseScore[] {
    const words = tokenize(query);
    if (words.length === 0) {
        return [];
    }
    const results: PhraseScore[] = [];
    for (const file of files) {
        const occurrences = countPhraseOccurrences(index, file, words);

        if (occurrences > 0) {
            results.push({file, phrase: query, occurrences});
        }
    }
    return results.sort((a, b) => b.occurrences - a.occurrences);
}
