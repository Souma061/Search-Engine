import { test } from "node:test";
import assert from "node:assert/strict";
import { calculateQueryMetrics } from "../src/evaluation/relevance-metrics.ts";

test("relevance metrics reward highly ranked graded results", () => {
    const metrics = calculateQueryMetrics(
        ["https://example.test/other", "https://example.test/relevant", "https://example.test/ideal"],
        [
            { url: "https://example.test/ideal", grade: 3 },
            { url: "https://example.test/relevant", grade: 1 },
        ],
    );

    assert.equal(metrics.reciprocalRank, 0.5);
    assert.equal(metrics.recall, 1);
    assert.deepEqual(metrics.relevantRanks, [2, 3]);
    assert.ok(metrics.ndcg > 0 && metrics.ndcg < 1);
});

test("relevance metrics return zero for a query with no retrieved judgments", () => {
    const metrics = calculateQueryMetrics(
        ["https://example.test/other"],
        [{ url: "https://example.test/ideal", grade: 3 }],
    );

    assert.deepEqual(metrics, {
        reciprocalRank: 0,
        recall: 0,
        ndcg: 0,
        relevantRanks: [],
    });
});
