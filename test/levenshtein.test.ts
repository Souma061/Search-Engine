import { test } from "node:test";
import assert from "node:assert/strict";
import { levenshteinDistance, suggestCorrection } from "../src/retrieval/levenshtein.ts";
import { createSearchEngine } from "../src/engine/search-engine.ts";
import type { Document } from "../src/indexer/document.ts";

test("levenshteinDistance calculates correct edit operations", () => {
    assert.equal(levenshteinDistance("userState", "useState"), 1);
    assert.equal(levenshteinDistance("readFiled", "readFile"), 1);
    assert.equal(levenshteinDistance("reac", "react"), 1);
    assert.equal(levenshteinDistance("javascript", "python"), 10);
});

test("suggestCorrection suggests closest indexed term for typos", () => {
    const docs: Document[] = [
        {
            id: "doc-react",
            url: "http://example.com/react",
            title: "React Hooks Guide",
            text: "Use useState and useMemo to manage state in React components.",
        },
    ];

    const engine = createSearchEngine(docs);

    // "usestate" exists in index -> no suggestion needed (returns null)
    assert.equal(suggestCorrection("usestate", engine.index), null);

    // "userstate" is missing -> suggests "usestate"
    assert.equal(suggestCorrection("userstate", engine.index), "usestate");

    // Engine didYouMean method
    assert.equal(engine.didYouMean("userstate hook"), "usestate hook");
});
