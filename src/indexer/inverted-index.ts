import {tokenize} from "./tokenizer.ts";
import type {Document} from "./document.ts";


export type Posting = {
    frequency: number;
    positions: number[];
};

export type Term = {
    documentFrequency: number;
    postings: Record<string, Posting>;
};

export type Index = Record<string, Term>;

export type DocumentStats = {
    length: number;
    maxFrequency: number;
};

export type DocumentStatsMap = Record<string, DocumentStats>;

export type SearchIndex = {
    index: Index;
    documentStats: DocumentStatsMap;
};

function calculateMaxFrequency(index: Index, file: string): number {
    let maxFrequency = 0;
    for (const term of Object.values(index)) {
        const posting = term.postings[file];
        if (posting) {
            maxFrequency = Math.max(
                maxFrequency,
                posting.frequency
            );
        }
    }
    return maxFrequency;
}

/*
 * Inverted Index
 *
 * Example:
 * {
 *   java: {
 *     documentFrequency: 2,
 *     postings: {
 *       "1.txt": {
 *         frequency: 3,
 *         positions: [0, 5, 12]
 *       },
 *       "3.txt": {
 *         frequency: 1,
 *         positions: [4]
 *       }
 *     }
 *   }
 * }
 */
export function buildIndex(documents: Document[]): SearchIndex {
    const index: Index = {};
    const documentStats: DocumentStatsMap = {};

    for (const document of documents) {
        const words = tokenize(document.text);

        documentStats[document.id] = {
            length: words.length,
            maxFrequency: 0,
        };

        for (const [position, word] of words.entries()) {
            index[word] ??= {
                documentFrequency: 0,
                postings: {},
            };

            if (!(document.id in index[word].postings)) {
                index[word].postings[document.id] = {
                    frequency: 0,
                    positions: [],
                };

                index[word].documentFrequency++;
            }

            index[word].postings[document.id].frequency++;
            index[word].postings[document.id].positions.push(position);
        }
    }

    for (const document of documents) {
        documentStats[document.id].maxFrequency =
            calculateMaxFrequency(index, document.id);
    }

    return {index, documentStats};
}

