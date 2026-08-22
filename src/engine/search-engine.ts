import type { Document } from "../indexer/document.ts";
import { buildIndex, type DocumentStatsMap, type Index } from "../indexer/inverted-index.ts";
import { tokenize } from "../indexer/tokenizer.ts";
import { generateSnippet } from "../retrieval/snippet.ts";
import {
    calculateBM25 as calcBM25,
    calculateBM25IDF as calcBM25IDF,
    calculateBM25TF as calcBM25TF,
    scoreDocumentsBM25,
} from "../ranking/bm25.ts";
import {
    calculateIDF,
    calculateTFIDF,
    scoreDocuments,
} from "../ranking/tfidf.ts";
import { retrieveDocuments, type SearchMode } from "../retrieval/boolean.ts";
import {
    countPhraseOccurrences,
    rankPhrase as rankPhrases,
    searchPhrase as searchPhrases,
    type PhraseResult,
    type PhraseScore,
} from "../retrieval/phrase.ts";
import { DocumentStore } from "../store/document-store.ts";

import { expandTokens } from "../retrieval/synonyms.ts";
import { suggestCorrection } from "../retrieval/levenshtein.ts";

export const PHRASE_WEIGHT = 1;
export const TITLE_BOOST_WEIGHT = 2.0;

export type SearchResult = {
    documentId: string;
    title: string;
    url: string;
    score: number;
    snippet: string;
    category?: string;
};

export type SearchEngine = {
    search: (query: string, mode?: SearchMode, category?: string) => SearchResult[];
    searchBM25: (query: string, mode?: SearchMode, category?: string) => SearchResult[];
    didYouMean: (query: string) => string | null;
    searchPhrase: (query: string) => PhraseResult[];
    rankPhrase: (query: string) => PhraseScore[];
    scorePhraseQuery: (query: string) => SearchResult[];
    calculateTFIDF: (word: string, documentId: string) => number;
    calculateIDF: (word: string) => number;
    calculateBM25: (word: string, documentId: string) => number;
    calculateBM25IDF: (word: string) => number;
    calculateBM25TF: (frequency: number, documentLength: number) => number;
    index: Index;
    documentStats: DocumentStatsMap;
};

export function createSearchEngine(documents: Document[]): SearchEngine {
    const { index, documentStats } = buildIndex(documents);
    const documentIds = Object.keys(documentStats);
    const totalDocs = documentIds.length;
    const averageDocumentLength =
        totalDocs > 0
            ? documentIds.reduce((sum, documentId) => sum + documentStats[documentId].length, 0) / totalDocs
            : 0;

    const rankResults = (scores: Record<string, number>): [string, number][] =>
        Object.entries(scores).sort((a, b) => b[1] - a[1]);

    const documentStore = new DocumentStore();
    documentStore.addMany(documents);

    const toSearchResults = (scores: Record<string, number>, words: string[]): SearchResult[] => {
        const boostedScores: Record<string, number> = {};

        for (const [documentId, baseScore] of Object.entries(scores)) {
            const document = documentStore.get(documentId);
            const titleBoost = document ? calculateTitleBoost(document.title, words) : 0;
            boostedScores[documentId] = baseScore + titleBoost;
        }

        return rankResults(boostedScores).map(([documentId, score]) => {
            const document = documentStore.get(documentId);
            return {
                documentId,
                title: document?.title ?? documentId,
                url: document?.url ?? "",
                score,
                snippet: document?.text ? generateSnippet(document.text, words) : "",
                category: document?.category ?? "General",
            };
        });
    };


    const scorePhraseQuery = (query: string): SearchResult[] => {
        const words = expandTokens(tokenize(query));
        if (words.length === 0) {
            return [];
        }
        const score: Record<string, number> = {};
        for (const documentId of documentIds) {
            const occurrences = countPhraseOccurrences(index, documentId, words);
            if (occurrences === 0) {
                continue;
            }
            const tfidfScore = words.reduce((sum, word) => sum + calculateTFIDF(totalDocs, index, documentStats, word, documentId), 0);
            score[documentId] = tfidfScore + occurrences * PHRASE_WEIGHT;
        }
        return toSearchResults(score, words);
    };

    return {
        search(query, mode = "OR", category?: string) {
            const words = expandTokens(tokenize(query));
            if (words.length === 0) {
                return [];
            }
            let docs = retrieveDocuments(index, words, mode);
            if (category) {
                docs = docs.filter((id) => documentStore.get(id)?.category === category);
            }
            const scores = scoreDocuments(totalDocs, index, documentStats, words, docs);
            return toSearchResults(scores, words);
        },
        searchBM25(query, mode = "OR", category?: string) {
            const words = expandTokens(tokenize(query));
            if (words.length === 0) {
                return [];
            }
            let docs = retrieveDocuments(index, words, mode);
            if (category) {
                docs = docs.filter((id) => documentStore.get(id)?.category === category);
            }
            const scores = scoreDocumentsBM25(totalDocs, averageDocumentLength, index, documentStats, words, docs);
            return toSearchResults(scores, words);
        },
        didYouMean(query: string): string | null {
            const words = tokenize(query);
            if (words.length === 0) return null;

            let hasCorrection = false;
            const corrected = words.map((word) => {
                const suggestion = suggestCorrection(word, index);
                if (suggestion && suggestion !== word.toLowerCase()) {
                    hasCorrection = true;
                    return suggestion;
                }
                return word;
            });

            return hasCorrection ? corrected.join(" ") : null;
        },
        searchPhrase: (query) => searchPhrases(index, documentIds, query),
        rankPhrase: (query) => rankPhrases(index, documentIds, query),
        scorePhraseQuery,
        calculateTFIDF: (word, documentId) => calculateTFIDF(totalDocs, index, documentStats, word, documentId),
        calculateIDF: (word) => calculateIDF(totalDocs, index, word),
        calculateBM25: (word, documentId) => calcBM25(totalDocs, averageDocumentLength, index, documentStats, word, documentId),
        calculateBM25IDF: (word) => calcBM25IDF(totalDocs, index, word),
        calculateBM25TF: (frequency, documentLength) => calcBM25TF(frequency, documentLength, averageDocumentLength),
        index,
        documentStats,
    };
}


function calculateTitleBoost(title: string, words: string[]): number {
    const titleTokens = new Set(tokenize(title));
    let boost = 0;


    for (const word of words) {
        if (titleTokens.has(word)) {
            boost += TITLE_BOOST_WEIGHT;
        }
    }

    return boost;
}
