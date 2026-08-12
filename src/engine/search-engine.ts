import { buildIndex, type Index, type DocumentStatsMap } from "../indexer/inverted-index.ts";
import { DocumentStore } from "../store/document-store.ts";
import type { Document } from "../indexer/document.ts";
import { tokenize } from "../indexer/tokenizer.ts";
import { retrieveDocuments, type SearchMode } from "../retrieval/boolean.ts";
import {
    countPhraseOccurrences,
    rankPhrase as rankPhrases,
    searchPhrase as searchPhrases,
    type PhraseResult,
    type PhraseScore,
} from "../retrieval/phrase.ts";
import {
    calculateIDF,
    calculateTFIDF,
    scoreDocuments,
} from "../ranking/tfidf.ts";
import {
    calculateBM25 as calcBM25,
    calculateBM25IDF as calcBM25IDF,
    calculateBM25TF as calcBM25TF,
    scoreDocumentsBM25,
} from "../ranking/bm25.ts";

export const PHRASE_WEIGHT = 1;

export type SearchResult = {
    documentId: string;
    title: string;
    url: string;
    score: number;
};

export type SearchEngine = {
    search: (query: string, mode?: SearchMode) => SearchResult[];
    searchBM25: (query: string, mode?: SearchMode) => SearchResult[];
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
        documentIds.reduce((sum, documentId) => sum + documentStats[documentId].length, 0) / totalDocs;

    const rankResults = (scores: Record<string, number>): [string, number][] =>
        Object.entries(scores).sort((a, b) => b[1] - a[1]);

    const documentStore = new DocumentStore();
    documentStore.addMany(documents);

    const toSearchResults = (scores: Record<string, number>): SearchResult[] =>
        rankResults(scores).map(([documentId, score]) => {
            const document = documentStore.get(documentId);
            return {
                documentId,
                title: document?.title ?? documentId,
                url: document?.url ?? "",
                score,
            };
        });

    const scorePhraseQuery = (query: string): SearchResult[] => {
        const words = tokenize(query);
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
        return toSearchResults(score);
    };

    return {
        search(query, mode = "OR") {
            const words = tokenize(query);
            if (words.length === 0) {
                return [];
            }
            const docs = retrieveDocuments(index, words, mode);
            const scores = scoreDocuments(totalDocs, index, documentStats, words, docs);
            return toSearchResults(scores);
        },
        searchBM25(query, mode = "OR") {
            const words = tokenize(query);
            if (words.length === 0) {
                return [];
            }
            const docs = retrieveDocuments(index, words, mode);
            const scores = scoreDocumentsBM25(totalDocs, averageDocumentLength, index, documentStats, words, docs);
            return toSearchResults(scores);
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
