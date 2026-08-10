import fs from "fs";

const DOCUMENTS_PATH = "./docs";
const files = fs.readdirSync(DOCUMENTS_PATH);
const totalDocs = files.length;
const BM25_K1 = 1.2;
const BM25_B = 0.75;
const PHRASE_WEIGHT = 1;
const STOP_WORDS = new Set([
    "a",
    "an",
    "and",
    "are",
    "as",
    "at",
    "be",
    "by",
    "for",
    "from",
    "in",
    "is",
    "it",
    "of",
    "on",
    "or",
    "that",
    "the",
    "this",
    "to",
    "was",
    "with",
]);

type Posting = {
    frequency: number;
    positions: number[];
};

type Term = {
    documentFrequency: number;
    postings: Record<string, Posting>;
};

type Index = Record<string, Term>;

type SearchMode = "AND" | "OR";
type PhraseScore = {
    file: string,
    phrase: string,
    occurrences: number,
}
type DocumentStats = {
    length: number,
    maxFrequency: number,
};
type DocumentStatsMap = Record<string, DocumentStats>;

type SearchIndex = {
    index: Index;
    documentStats: DocumentStatsMap;
};


// ---------- 1. Indexing ----------

function tokenize(text: string): string[] {
    return text
        .toLowerCase()
        .replace(/[^\w\s]/g, "")
        .split(/\s+/)
        .filter(Boolean)
        .filter((word) => !STOP_WORDS.has(word));
}


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

function buildIndex(): SearchIndex {
    const index: Index = {};
    const documentStats: DocumentStatsMap = {};

    for (const file of files) {
        const words = tokenize(
            fs.readFileSync(
                `${DOCUMENTS_PATH}/${file}`,
                "utf8"
            )
        );
        documentStats[file] = {
            length: words.length,
            maxFrequency: 0,
        };

        for (const [position, word] of words.entries()) {
            index[word] ??= {documentFrequency: 0, postings: {}};
            if (!(file in index[word].postings)) {
                index[word].postings[file] = {
                    frequency: 0,
                    positions: [],
                };
                index[word].documentFrequency++;
            }
            index[word].postings[file].frequency++;
            index[word].postings[file].positions.push(position);
        }
    }
    for (const file of files) {
        documentStats[file].maxFrequency = calculateMaxFrequency(index, file);
    }
    return {index, documentStats};
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
const {index, documentStats} = buildIndex();

const averageDocumentLength =
    Object.values(documentStats)
        .reduce((sum, doc) => sum + doc.length, 0) / totalDocs;

// ---------- 2. Retrieval ----------

function retrieveDocuments(words: string[], mode: SearchMode): string[] {
    if (words.length === 0) return [];

    const postings = words.map((word) => index[word]?.postings);

    if (mode === "AND") {
        if (postings.some((p) => !p)) return [];
        return Object.keys(postings[0]).filter((file) => postings.every((p) => p[file]));
    }

    const docSet = new Set<string>();
    for (const posting of postings) {
        if (!posting) {
            continue;
        }
        for (const file of Object.keys(posting)) docSet.add(file);
    }
    return [...docSet];
}

function hasPhrase(file: string, words: string[]): boolean {
    return countPhraseOccurrences(file, words) > 0;
}

type PhraseResult = {
    file: string;
    phrase: string;
};

function searchPhrase(query: string): PhraseResult[] {
    const words = tokenize(query);
    if (words.length === 0) {
        return [];
    }
    const result: PhraseResult[] = [];
    for (const file of files) {
        if (hasPhrase(file, words)) {
            result.push({
                file,
                phrase: query,
            });
        }
    }
    return result;
}

function countPhraseOccurrences(
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

function rankPhrase(query: string): PhraseScore[] {
    const words = tokenize(query);
    if (words.length === 0) {
        return [];
    }
    const results: PhraseScore[] = [];
    for (const file of files) {
        const occurrences = countPhraseOccurrences(file, words);

        if (occurrences > 0) {
            results.push({file, phrase: query, occurrences,});
        }
    }
    return results.sort((a, b) => b.occurrences - a.occurrences);

}

// ---------- 3. Scoring ----------
// TF-IDF = (1 + log(TF frequency)) × IDF

function calculateIDF(word: string): number {
    if (totalDocs === 0) return 0;
    const term = index[word];
    return term ? 1 + Math.log(totalDocs / term.documentFrequency) : 0;
}

function calculateTFIDF(word: string, file: string): number {
    const frequency = index[word]?.postings[file]?.frequency;
    const documentLength = documentStats[file]?.length;
    if (!frequency || !documentLength) return 0;

    const maxFrequency = documentStats[file]?.maxFrequency;

    if (!maxFrequency) return 0;

    const tf = calculateTF(frequency, maxFrequency);
    const idf = calculateIDF(word);

    return tf * idf;
}

function calculateLogTF(frequency: number): number {
    return 1 + Math.log(frequency);
}

function calculateTF(frequency: number, maxFrequency: number): number {
    return 0.5 + 0.5 * (frequency / maxFrequency);
}

function calculateBM25TF(frequency: number, documentLength: number): number {
    const K1 = 1.2; // controls how quickly term-frequency gains saturate.
    const b = 0.75; //controls how strongly document length affects the score.

    const lengthNormalization = 1 - b + b * (documentLength / averageDocumentLength);
    return (
        (frequency * (K1 + 1)) / (frequency + K1 * lengthNormalization)
    );
}

function calculateBM25IDF(word: string): number {
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
function calculateBM25(word: string, file: string): number {
    const frequency = index[word]?.postings[file]?.frequency;
    const documentLength = documentStats[file]?.length;

    if (!frequency || !documentLength) return 0;

    const tf = calculateBM25TF(
        frequency,
        documentLength
    );
    const idf = calculateBM25IDF(word);
    return tf * idf;
}

/*
    What this is doing

The important part is:

documentLength / averageDocumentLength

For 1.txt:

6 / 5.6667 ≈ 1.0588

For 2.txt:

5 / 5.6667 ≈ 0.8824
* */

function scoreDocuments(words: string[], docs: string[]): Record<string, number> {
    const scores: Record<string, number> = {};
    for (const file of docs) {
        scores[file] = words.reduce((sum, word) => sum + calculateTFIDF(word, file), 0);
    }
    return scores;
}

function scorePhraseQuery(query: string): [string, number][] {
    const words = tokenize(query);
    if (words.length === 0) {
        return [];
    }
    const score: Record<string, number> = {};
    for (const file of files) {
        const occurrences = countPhraseOccurrences(file, words);
        if (occurrences === 0) {
            continue;
        }
        const tfidfScore = words.reduce((sum, word) => sum + calculateTFIDF(word, file), 0);
        score[file] = tfidfScore + occurrences * PHRASE_WEIGHT;
    }
    return rankResults(score);
}

// ---------- 4. Ranking ----------

function rankResults(scores: Record<string, number>): [string, number][] {
    return Object.entries(scores).sort((a, b) => b[1] - a[1]);
}

// ---------- Pipeline ----------

function search(query: string, mode: SearchMode = "OR"): [string, number][] {
    const words = tokenize(query);

    if (words.length === 0) {
        return [];
    }

    const docs = retrieveDocuments(words, mode);
    const scores = scoreDocuments(words, docs);

    return rankResults(scores);
}

// ---------- Demo ----------

// console.log("\nAND Search");
// console.table(search("java backend", "AND"));
//
// console.log("\nOR Search");
// console.table(search("java programming", "OR"));
//
// console.log("\nPhrase Search");
// console.table(searchPhrase("java programming"));
//
// console.log("\nPhrase Ranking");
// console.table(rankPhrase("java programming"));
//
// console.log("\nPhrase + TF-IDF Ranking");
// console.table(scorePhraseQuery("java programming"));

//
// console.log("\nDocument Lengths");
// console.log(documentStats);
//
// console.log("\nTF-IDF");
// console.log("java / 1.txt:", calculateTFIDF("java", "1.txt"));
// console.log("java / 3.txt:", calculateTFIDF("java", "3.txt"));
//
// console.log("\nAND Search");
// console.table(search("java backend", "AND"));
//
// console.log("\nOR Search");
// console.table(search("java programming", "OR"));
//
// console.log("\nPhrase + TF-IDF");
// console.table(scorePhraseQuery("java programming"));
//
//
// console.log(calculateLogTF(1));
// console.log(calculateLogTF(2));
// console.log(calculateLogTF(5));
// console.log(calculateLogTF(10));
// console.log(calculateLogTF(100));


// console.log("\nDocument Lengths");
// console.log(documentStats);
//
// console.log("\nAugmented TF");
//
// console.log(
//     "frequency 1, max 2:",
//     calculateTF(1, 2),
// );
//
// console.log(
//     "frequency 2, max 2:",
//     calculateTF(2, 2),
// );
// console.log("\nAND Search");
// console.table(search("java backend", "AND"));
//
// console.log("\nOR Search");
// console.table(search("java programming", "OR"));
//
// console.log("\nPhrase + TF-IDF");
// console.table(scorePhraseQuery("java programming"));

//
// console.log("Average document length:", averageDocumentLength);
// console.log("\nBM25 TF");
//
// console.log(
//     "frequency 1, document length 6:",
//     calculateBM25TF(1, 6),
// );
//
// console.log(
//     "frequency 2, document length 6:",
//     calculateBM25TF(2, 6),
// );
//
// console.log(
//     "frequency 5, document length 6:",
//     calculateBM25TF(5, 6),
// );
//
// console.log("TF-IDF IDF:", calculateIDF("java"));
// console.log("BM25 IDF:", calculateBM25IDF("java"));

console.log("\nBM25");

console.log(
    "java / 1.txt:",
    calculateBM25("java", "1.txt"),
);

console.log(
    "java / 3.txt:",
    calculateBM25("java", "3.txt"),
);