import fs from "fs";

const DOCUMENTS_PATH = "./docs";
const files = fs.readdirSync(DOCUMENTS_PATH);
const totalDocs = files.length;

// ---------- 1. Indexing ----------

function tokenize(text) {
    return text
        .toLowerCase()
        .replace(/[^\w\s]/g, "")
        .split(/\s+/)
        .filter(Boolean);
}

function buildIndex() {
    const index = {};
    for (const file of files) {
        const words = tokenize(fs.readFileSync(`${DOCUMENTS_PATH}/${file}`, "utf-8"));
        for (const word of words) {
            index[word] ??= { documentFrequency: 0, postings: {} };
            if (!(file in index[word].postings)) {
                index[word].postings[file] = 0;
                index[word].documentFrequency++;
            }
            index[word].postings[file]++;
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
 *       "1.txt": 3,
 *       "3.txt": 1
 *     }
 *   }
 * }
 */
const index = buildIndex();

// ---------- 2. Retrieval ----------

function retrieveDocuments(words, mode) {
    const postings = words.map((word) => index[word]?.postings);

    if (mode === "AND") {
        if (postings.some((p) => !p)) return [];
        return Object.keys(postings[0]).filter((file) => postings.every((p) => p[file]));
    }

    const docSet = new Set();
    for (const posting of postings) {
        if (!posting) {
            continue;
        }
        for (const file of Object.keys(posting)) docSet.add(file);
    }
    return [...docSet];
}

// ---------- 3. Scoring ----------

function calculateIDF(word) {
    const term = index[word];
    return term ? Math.log(totalDocs / term.documentFrequency) : 0;
}

function calculateTFIDF(word, file) {
    const tf = index[word]?.postings[file];
    return tf ? tf * calculateIDF(word) : 0;
}

function scoreDocuments(words, docs) {
    const scores = {};
    for (const file of docs) {
        scores[file] = words.reduce((sum, word) => sum + calculateTFIDF(word, file), 0);
    }
    return scores;
}

// ---------- 4. Ranking ----------

function rankResults(scores) {
    return Object.entries(scores).sort((a, b) => b[1] - a[1]);
}

// ---------- Pipeline ----------

function search(query, mode = "OR") {
    if (mode !== "AND" && mode !== "OR") {
        throw new Error(`Unknown search mode: ${mode}`);
    }

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
