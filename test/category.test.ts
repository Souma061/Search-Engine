import { test } from "node:test";
import assert from "node:assert/strict";
import { detectCategory } from "../src/indexer/category.ts";
import { createSearchEngine } from "../src/engine/search-engine.ts";
import type { Document } from "../src/indexer/document.ts";

test("detectCategory detects framework from URL hostname", () => {
    assert.equal(detectCategory("https://developer.mozilla.org/en-US/docs/Web/API/Fetch_API"), "MDN");
    assert.equal(detectCategory("https://react.dev/reference/react/useState"), "React");
    assert.equal(detectCategory("https://nodejs.org/api/fs.html"), "Node.js");
    assert.equal(detectCategory("https://www.typescriptlang.org/docs/handbook"), "TypeScript");
    assert.equal(detectCategory("https://expressjs.com/en/4x/api.html"), "Express");
    assert.equal(detectCategory("https://nextjs.org/docs"), "Next.js");
    assert.equal(detectCategory("https://example.com/blog"), "General");
});

test("search engine filters results by category", () => {
    const docs: Document[] = [
        {
            id: "doc-react",
            url: "https://react.dev/reference/react/useState",
            title: "React useState",
            text: "useState is a React Hook for managing state.",
            category: "React",
        },
        {
            id: "doc-node",
            url: "https://nodejs.org/api/fs.html",
            title: "Node.js File System",
            text: "fs.readFile reads file contents in Node.js.",
            category: "Node.js",
        },
    ];

    const engine = createSearchEngine(docs);

    // Search without filter -> returns both docs matching common word "in" or search
    const globalResults = engine.searchBM25("state");
    assert.equal(globalResults.length, 1);

    // Search with category filter "React"
    const reactResults = engine.searchBM25("state", "OR", "React");
    assert.equal(reactResults.length, 1);
    assert.equal(reactResults[0].category, "React");

    // Search with category filter "Node.js" for React term -> 0 results
    const nodeResults = engine.searchBM25("useState", "OR", "Node.js");
    assert.equal(nodeResults.length, 0);
});
