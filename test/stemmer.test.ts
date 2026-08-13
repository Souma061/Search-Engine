import { test } from "node:test";
import assert from "node:assert/strict";
import { stem } from "../src/indexer/stemmer.ts";
import { createSearchEngine } from "../src/engine/search-engine.ts";
import type { Document } from "../src/indexer/document.ts";

test("stem reduces common suffixes", () => {
    assert.equal(stem("fetching"), "fetch");
    assert.equal(stem("components"), "component");
    assert.equal(stem("updating"), "updat");
    assert.equal(stem("express"), "express"); // preserved reserved word
    assert.equal(stem("process"), "process"); // preserved reserved word
});

test("search engine matches stemmed query to document variations", () => {
    const docs: Document[] = [
        {
            id: "doc-fetch",
            url: "http://example.com/fetch",
            title: "Data Fetching API",
            text: "How to fetch data asynchronously in your application.",
        },
    ];

    const engine = createSearchEngine(docs);

    // Document text contains "fetch", query is "fetching"
    const results = engine.searchBM25("fetching");
    assert.equal(results.length, 1);
    assert.equal(results[0].documentId, "doc-fetch");
});
