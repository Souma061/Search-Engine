import {test} from "node:test";
import assert from "node:assert/strict";
import fs from "fs";
import {tokenize} from "../src/indexer/tokenizer.ts";
import type {Document} from "../src/indexer/document.ts";
import {createSearchEngine} from "../src/engine/search-engine.ts";

const documents: Document[] = ["5"].map((id) => ({
    id,
    url: `file://${id}.txt`,
    title: `Document ${id}`,
    text: fs.readFileSync(`./docs/${id}.txt`, "utf8"),
}));

const engine = createSearchEngine(documents);

test("tokenize splits dotted identifiers", () => {
    const words = tokenize("fs.readFile");
    assert.ok(words.includes("readfile"), `got ${words}`);
    assert.ok(words.includes("fs"), `got ${words}`);
});

test("tokenize splits camelCase into components", () => {
    const words = tokenize("useState");
    assert.ok(words.includes("usestate"), `got ${words}`);
    assert.ok(words.includes("use"), `got ${words}`);
    assert.ok(words.includes("state"), `got ${words}`);
});

test("tokenize retains c++ as a searchable form", () => {
    const words = tokenize("c++");
    assert.ok(words.includes("c++"), `got ${words}`);
});

test("exact identifier queries find the dev doc", () => {
    const results = engine.searchBM25("readFile");
    assert.equal(results[0]?.documentId, "5", JSON.stringify(results));

    const hookResults = engine.searchBM25("useMemo");
    assert.equal(hookResults[0]?.documentId, "5", JSON.stringify(hookResults));
});

test("split queries also find the dev doc", () => {
    assert.equal(engine.searchBM25("use state")[0]?.documentId, "5");
    assert.equal(engine.search("fs readFile", "AND")[0]?.documentId, "5");
    assert.equal(engine.searchBM25("node js")[0]?.documentId, "5");
    assert.equal(engine.searchBM25("c++")[0]?.documentId, "5");
    assert.equal(engine.searchBM25("array prototype map")[0]?.documentId, "5");
});