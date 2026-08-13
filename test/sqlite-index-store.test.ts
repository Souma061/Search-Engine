import { test } from "node:test";
import assert from "node:assert/strict";
import { SqliteIndexStore } from "../src/store/sqlite-index-store.ts";
import { buildIndex } from "../src/indexer/inverted-index.ts";
import type { Document } from "../src/indexer/document.ts";

test("SqliteIndexStore saves and loads inverted index and document stats", () => {
    const docs: Document[] = [
        {
            id: "doc-1",
            url: "http://example.com/1",
            title: "React Hooks",
            text: "Use useState to manage state in React components.",
        },
        {
            id: "doc-2",
            url: "http://example.com/2",
            title: "Node.js FS",
            text: "Use fs.readFile to read files in Node.js.",
        },
    ];

    const built = buildIndex(docs);
    const store = new SqliteIndexStore(":memory:");

    assert.equal(store.hasIndex(), false);

    store.saveIndex(built.index, built.documentStats);

    assert.equal(store.hasIndex(), true);

    const loaded = store.loadIndex();

    // Verify index structure match
    assert.deepStrictEqual(loaded.index["usestate"], built.index["usestate"]);
    assert.deepStrictEqual(loaded.documentStats["doc-1"], built.documentStats["doc-1"]);

    store.close();
});
