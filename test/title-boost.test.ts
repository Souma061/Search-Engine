import { test } from "node:test";
import assert from "node:assert/strict";
import { createSearchEngine } from "../src/engine/search-engine.ts";
import type { Document } from "../src/indexer/document.ts";

test("title boost ranks document higher when search term appears in title", () => {
    const docs: Document[] = [
        {
            id: "doc-body-only",
            url: "http://example.com/doc1",
            title: "General Web Guide",
            // Mentions useState 4 times in body text
            text: "React useState hook useState is used for local state. useState management in useState components.",
        },
        {
            id: "doc-title-match",
            url: "http://example.com/doc2",
            title: "React useState Hook API",
            // Mentions useState only 1 time in body text
            text: "Basic usage of state in React.",
        },
    ];

    const engine = createSearchEngine(docs);
    const results = engine.searchBM25("useState");

    assert.equal(results.length, 2);
    // doc-title-match must rank #1 due to title boost weight
    assert.equal(results[0].documentId, "doc-title-match");
    assert.ok(results[0].score > results[1].score);
});
