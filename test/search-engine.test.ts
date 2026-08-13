import {test} from "node:test";
import assert from "node:assert/strict";
import fs from "fs";
import {tokenize} from "../src/indexer/tokenizer.ts";
import type {Document} from "../src/indexer/document.ts";
import {createSearchEngine} from "../src/engine/search-engine.ts";

const documents: Document[] = ["1", "2", "3", "4"].map((id) => ({
    id,
    url: `file://${id}.txt`,
    title: `Document ${id}`,
    text: fs.readFileSync(`./docs/${id}.txt`, "utf8"),
}));

const engine = createSearchEngine(documents);

test("tokenize drops stop words", () => {
    const tokens = tokenize("Java is a programming language");
    assert.ok(tokens.includes("java"));
    assert.ok(tokens.includes("programming"));
    assert.ok(tokens.includes("language"));
    assert.ok(!tokens.includes("is"));
    assert.ok(!tokens.includes("a"));
});

test("AND search only returns docs with all terms", () => {
    const results = engine.search("java backend", "AND");
    assert.ok(results.length >= 1);
    const {index} = engine;
    for (const result of results) {
        assert.ok(index["java"].postings[result.documentId]);
        assert.ok(index["backend"].postings[result.documentId]);
    }
});

test("TF-IDF of java in doc 1 matches", () => {
    assert.equal(engine.calculateTFIDF("java", "1"), 1.2876820724517808);
});

test("phrase scoring ranks doc 1 first", () => {
    const results = engine.scorePhraseQuery("java programming");
    assert.equal(results[0].documentId, "1");
    assert.ok(results[0].title.length > 0);
    assert.ok(results[0].url.length > 0);
});

test("BM25 OR search returns sorted scores", () => {
    const results = engine.searchBM25("java programming", "OR");
    const scores = results.map((result) => result.score);
    assert.deepEqual(scores, [...scores].sort((a, b) => b - a));
});

