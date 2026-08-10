import fs from "fs";

const DOCUMENTS_PATH = "./docs";
const files = fs.readdirSync(DOCUMENTS_PATH);
const totalDocs = files.length;
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

// ---------- 1. Indexing ----------

function tokenize(text: string): string[] {
    return text
        .toLowerCase()
        .replace(/[^\w\s]/g, "")
        .split(/\s+/)
        .filter(Boolean)
        .filter((word) => !STOP_WORDS.has(word));
}

function buildIndex(): Index {
    const index: Index = {};
    for (const file of files) {
        const words = tokenize(
            fs.readFileSync(
                `${DOCUMENTS_PATH}/${file}`,
                "utf8"
            )
        );
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
    return index;
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
const index = buildIndex();

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
    const firstWord = words[0];
    const firstPosition = index[firstWord]?.postings[file]?.positions;

    if (!firstPosition) {
        return false;
    }

    for (const startPosition of firstPosition) {
        let phraseFound = true;
        for (let i = 1; i < words.length; i++) {
            const word = words[i];
            const positions = index[word]?.postings[file]?.positions;

            if (!positions || !positions.includes(startPosition + i)) {
                phraseFound = false;
                break;
            }
        }
        if (phraseFound) {
            return true;
        }
    }
    return false;
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

// ---------- 3. Scoring ----------

function calculateIDF(word: string): number {
    const term = index[word];
    return term ? Math.log(totalDocs / term.documentFrequency) : 0;
}

function calculateTFIDF(word: string, file: string): number {
    const tf = index[word]?.postings[file]?.frequency;
    return tf ? tf * calculateIDF(word) : 0;
}

function scoreDocuments(words: string[], docs: string[]): Record<string, number> {
    const scores: Record<string, number> = {};
    for (const file of docs) {
        scores[file] = words.reduce((sum, word) => sum + calculateTFIDF(word, file), 0);
    }
    return scores;
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

console.log("\nAND Search");
console.table(search("java backend", "AND"));

console.log("\nOR Search");
console.table(search("java programming", "OR"));
console.log(tokenize("Java is a programming language"));


//test
console.log(index["is"]);
console.log(index["a"]);
console.log(index["java"]);
console.dir(index["java"], {depth: null}); // Node is just collapsing the nested array when displaying the object

console.log(
    hasPhrase("1.txt", ["java", "programming"])
);

console.log(
    hasPhrase("1.txt", ["java", "programming", "language"])
);

console.log(
    hasPhrase("1.txt", ["programming", "java"])
);


console.log(
    searchPhrase("java programming")
);

console.log(
    searchPhrase("programming java")
);

console.log(
    searchPhrase("java programming language")
);

console.table(searchPhrase("java programming"));
