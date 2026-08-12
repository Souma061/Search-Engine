import { test } from "node:test";
import assert from "node:assert/strict";
import { generateSnippet } from "../src/retrieval/snippet.ts";

test("generateSnippet extracts surrounding text window and highlights query words", () => {
    const text =
        "JavaScript is a lightweight programming language. The useState hook allows functional components to manage local state in React. It simplifies state management.";

    const snippet = generateSnippet(text, ["useState", "React"]);

    // Contains <mark> highlight tags
    assert.ok(snippet.includes("<mark>useState</mark>"));
    assert.ok(snippet.includes("<mark>React</mark>"));

    // Extract window centered around match
    assert.ok(snippet.includes("hook allows functional components"));
});
