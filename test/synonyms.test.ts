import { test } from "node:test";
import assert from "node:assert/strict";
import { expandTokens } from "../src/retrieval/synonyms.ts";
import { createSearchEngine } from "../src/engine/search-engine.ts";
import type { Document } from "../src/indexer/document.ts";

test("expandTokens expands common developer abbreviations", () => {
    assert.deepStrictEqual(expandTokens(["js"]), ["js", "javascript"]);
    assert.deepStrictEqual(expandTokens(["ts"]), ["ts", "typescript"]);
    assert.deepStrictEqual(expandTokens(["k8s"]), ["k8s", "kubernetes"]);
    assert.deepStrictEqual(expandTokens(["react"]), ["react", "reactjs"]);
});

test("search retrieves document using alias query", () => {
    const docs: Document[] = [
        {
            id: "doc-1",
            url: "http://example.com/js",
            title: "JavaScript Basics",
            text: "This document describes core JavaScript concepts and functions.",
        },
    ];

    const engine = createSearchEngine(docs);

    // Document contains "JavaScript", query is "js"
    const results = engine.searchBM25("js");
    assert.equal(results.length, 1);
    assert.equal(results[0].documentId, "doc-1");
});
