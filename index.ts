import fs from "fs";
import { createSearchEngine } from "./src/engine/search-engine.ts";
import type { Document } from "./src/indexer/document.ts";

const documents: Document[] = ["1", "2", "3", "4"].map((id) => ({
    id,
    url: `file://${id}.txt`,
    title: `Document ${id}`,
    text: fs.readFileSync(`./docs/${id}.txt`, "utf8"),
}));

const engine = createSearchEngine(documents);

console.log("\nComponents");

console.log(
    "TF-IDF java / 1:",
    engine.calculateTFIDF("java", "1"),
);

console.log(
    "BM25 java / 1:",
    engine.calculateBM25("java", "1"),
);

console.log(
    "TF-IDF programming / 1:",
    engine.calculateTFIDF("programming", "1"),
);

console.log(
    "BM25 programming / 1:",
    engine.calculateBM25("programming", "1"),
);

console.log(
    "BM25 IDF java:",
    engine.calculateBM25IDF("java"),
);

console.log(
    "BM25 TF java / 1:",
    engine.calculateBM25TF(
        engine.index["java"]?.postings["1"]?.frequency ?? 0,
        engine.documentStats["1"].length,
    ),
);

console.log("new")
console.log("\nTF-IDF OR");
console.table(engine.search("java programming", "OR"));

console.log("\nBM25 OR");
console.table(engine.searchBM25("java programming", "OR"));
console.table(engine.search("java", "OR"));
console.table(engine.searchBM25("java", "OR"));
