import { readFile } from "node:fs/promises";
import {
    calculateQueryMetrics,
    type QueryMetrics,
    type RelevanceJudgment,
} from "./src/evaluation/relevance-metrics.ts";

type BenchmarkCase = {
    id: string;
    query: string;
    relevance: RelevanceJudgment[];
    mode?: "BM25" | "TF-IDF" | "PHRASE";
};

type SearchResponse = {
    results?: Array<{ url: string }>;
    error?: string;
};

const benchmarkPath = process.argv[2] ?? "eval/relevance.v1.json";
const endpoint = process.env.SEARCH_API_URL ?? "https://searchengine-jade.vercel.app/search";
const cutoff = 10;
const delayMs = Number(process.env.EVAL_REQUEST_DELAY_MS ?? 1_100);

function normalizeUrl(value: string): string {
    const url = new URL(value);
    url.hash = "";
    url.pathname = url.pathname.replace(/\/$/, ""); // strip trailing slash
    return url.toString();
}

function average(values: number[]): number {
    return values.length === 0 ? 0 : values.reduce((sum, value) => sum + value, 0) / values.length;
}

function formatPercent(value: number): string {
    return `${(value * 100).toFixed(1)}%`;
}

async function loadBenchmark(path: string): Promise<BenchmarkCase[]> {
    const raw = await readFile(path, "utf8");
    const benchmark = JSON.parse(raw) as unknown;
    if (!Array.isArray(benchmark) || benchmark.length === 0) {
        throw new Error("Benchmark must be a non-empty JSON array.");
    }

    for (const item of benchmark) {
        if (
            !item
            || typeof item !== "object"
            || typeof (item as BenchmarkCase).id !== "string"
            || typeof (item as BenchmarkCase).query !== "string"
            || !Array.isArray((item as BenchmarkCase).relevance)
        ) {
            throw new Error("Each benchmark entry must contain id, query, and relevance fields.");
        }
    }
    return benchmark as BenchmarkCase[];
}

async function search(query: BenchmarkCase): Promise<string[]> {
    const requestUrl = new URL(endpoint);
    requestUrl.searchParams.set("q", query.query);
    requestUrl.searchParams.set("mode", query.mode ?? "BM25");
    requestUrl.searchParams.set("page", "1");
    requestUrl.searchParams.set("limit", String(cutoff));

    const response = await fetch(requestUrl);
    const payload = await response.json() as SearchResponse;
    if (!response.ok) {
        throw new Error(`${response.status}: ${payload.error ?? "Search request failed"}`);
    }
    return (payload.results ?? []).map((result) => normalizeUrl(result.url));
}

async function main(): Promise<void> {
    const benchmark = await loadBenchmark(benchmarkPath);
    const allMetrics: QueryMetrics[] = [];

    console.log(`Evaluating ${benchmark.length} queries against ${endpoint}`);
    console.log(`Cutoff: ${cutoff}; request delay: ${delayMs}ms\n`);

    for (const [index, entry] of benchmark.entries()) {
        try {
            const results = await search(entry);
            const judgments = entry.relevance.map((judgment) => ({ ...judgment, url: normalizeUrl(judgment.url) }));
            const metrics = calculateQueryMetrics(results, judgments, cutoff);
            allMetrics.push(metrics);
            const firstRank = metrics.relevantRanks[0] ? `#${metrics.relevantRanks[0]}` : "not in top 10";
            console.log(`${entry.id.padEnd(24)} MRR ${metrics.reciprocalRank.toFixed(3)}  Recall ${formatPercent(metrics.recall)}  NDCG ${metrics.ndcg.toFixed(3)}  first relevant: ${firstRank}`);
        } catch (error) {
            console.error(`${entry.id.padEnd(24)} ERROR ${error instanceof Error ? error.message : String(error)}`);
        }

        if (index < benchmark.length - 1 && delayMs > 0) {
            await new Promise((resolve) => setTimeout(resolve, delayMs));
        }
    }

    if (allMetrics.length !== benchmark.length) {
        process.exitCode = 1;
        return;
    }

    console.log("\nAggregate metrics");
    console.log(`MRR@${cutoff}:    ${average(allMetrics.map((metrics) => metrics.reciprocalRank)).toFixed(3)}`);
    console.log(`Recall@${cutoff}: ${formatPercent(average(allMetrics.map((metrics) => metrics.recall)))}`);
    console.log(`NDCG@${cutoff}:   ${average(allMetrics.map((metrics) => metrics.ndcg)).toFixed(3)}`);
}

main().catch((error) => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
});
