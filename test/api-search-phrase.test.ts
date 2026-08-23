import { test } from "node:test";
import assert from "node:assert/strict";
import { createSearchHandler, matchesPhrase, type SearchDatabase } from "../api/search.ts";

test("phrase mode accepts contiguous terms in a title or document body", () => {
    assert.equal(
        matchesPhrase({ title: "React state management", text: "Reference documentation" }, "react state"),
        true,
    );
    assert.equal(
        matchesPhrase({ title: "React guide", text: "Manage component state with hooks." }, "component state"),
        true,
    );
});

test("phrase mode rejects documents containing only separated query terms", () => {
    assert.equal(
        matchesPhrase({ title: "React guide", text: "Manage component local state with hooks." }, "component state"),
        false,
    );
});

test("deployed search handler returns only exact phrase matches", async () => {
    const database: SearchDatabase = {
        execute: async (statement: string | { sql: string }) => {
            const sql = typeof statement === "string" ? statement : statement.sql;
            if (sql.includes("docs_vocab") || sql.includes("GROUP BY category")) {
                return { rows: [] } as any;
            }
            return {
                rows: [
                    { id: "exact", url: "https://example.test/exact", title: "React state guide", text: "A reference page.", category: "React" },
                    { id: "separated", url: "https://example.test/separated", title: "React guide", text: "Manage state with components.", category: "React" },
                ],
            } as any;
        },
    };
    const handler = createSearchHandler(database);
    let responseBody: any;
    const response: any = {
        setHeader: () => response,
        status: () => response,
        json: (body: unknown) => {
            responseBody = body;
            return response;
        },
    };

    await handler(
        { query: { q: "react state", mode: "PHRASE" }, headers: {}, socket: { remoteAddress: "127.0.0.1" } } as any,
        response,
    );

    assert.deepEqual(responseBody.results.map((result: { documentId: string }) => result.documentId), ["exact"]);
});
