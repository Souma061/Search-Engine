import { createClient } from "@libsql/client";
import type { VercelRequest, VercelResponse } from "@vercel/node";
import * as fs from "node:fs";

let tursoUrl = process.env.TURSO_DATABASE_URL?.trim();
let tursoToken = process.env.TURSO_AUTH_TOKEN?.trim();

if ((!tursoUrl || !tursoToken) && fs.existsSync(".env")) {
    const env = fs.readFileSync(".env", "utf-8");
    tursoUrl = tursoUrl || env.match(/TURSO_DATABASE_URL=(.*)/)?.[1]?.trim();
    tursoToken = tursoToken || env.match(/TURSO_AUTH_TOKEN=(.*)/)?.[1]?.trim();
}

const db = createClient({
    url: tursoUrl ?? "",
    authToken: tursoToken ?? "",
});

const STOP_WORDS = new Set([
    "a", "an", "and", "are", "as", "at", "be", "by", "for", "from",
    "in", "is", "it", "of", "on", "or", "that", "the", "this", "to",
    "was", "what", "when", "where", "who", "will", "with"
]);

function tokenize(text: string): string[] {
    const rawTokens = text
        .toLowerCase()
        .replace(/([a-z])([A-Z])/g, "$1 $2")
        .split(/[^a-z0-9+#.]+/);

    const tokens: string[] = [];
    for (const token of rawTokens) {
        if (!token) continue;
        if (STOP_WORDS.has(token)) continue;
        tokens.push(token);
    }
    return tokens;
}

function levenshteinDistance(a: string, b: string): number {
    if (a.length === 0) return b.length;
    if (b.length === 0) return a.length;
    const row: number[] = Array.from({ length: b.length + 1 }, (_, i) => i);
    for (let i = 1; i <= a.length; i++) {
        let prev = i;
        for (let j = 1; j <= b.length; j++) {
            const val = a[i - 1] === b[j - 1] ? row[j - 1] : Math.min(row[j - 1], prev, row[j]) + 1;
            row[j - 1] = prev;
            prev = val;
        }
        row[b.length] = prev;
    }
    return row[b.length];
}

function generateSnippet(text: string, queryWords: string[], windowSize = 160): string {
    if (!text || queryWords.length === 0) return "";
    const lowerText = text.toLowerCase();
    let firstPos = -1;
    for (const word of queryWords) {
        const idx = lowerText.indexOf(word);
        if (idx !== -1 && (firstPos === -1 || idx < firstPos)) {
            firstPos = idx;
        }
    }
    let start = Math.max(0, firstPos === -1 ? 0 : firstPos - 40);
    let end = Math.min(text.length, start + windowSize);
    let snippet = (start > 0 ? "..." : "") + text.slice(start, end) + (end < text.length ? "..." : "");

    // Highlight whole words only (avoid highlighting letters inside other words)
    for (const word of queryWords) {
        if (!word) continue;
        const escaped = word.replace(/[.*+?^${}()|[\\]\\\\]/g, "\\$&");
        const regex = new RegExp(`\\b(${escaped})\\b`, "gi");
        snippet = snippet.replace(regex, "<mark>$1</mark>");
    }
    return snippet;
}
let cachedVocabulary: Array<{ term: string; docCount: number }> | null = null;
let lastVocabFetch = 0;

async function getVocabulary(): Promise<Array<{ term: string; docCount: number }>> {
    const now = Date.now();
    if (cachedVocabulary && now - lastVocabFetch < 300_000) {
        return cachedVocabulary;
    }
    try {
        const res = await db.execute(
            `SELECT term, doc as docCount
            FROM docs_vocab
            WHERE length(term) >= 3 AND doc >= 2
            ORDER BY doc DESC
            LIMIT 2000 `
        );
        cachedVocabulary = res.rows.map((row: any) => ({
            term: String(row.term),
            docCount: Number(row.docCount)
        }));
        lastVocabFetch = now;
        return cachedVocabulary;
    } catch (error) {
        return cachedVocabulary || [];
    }
}
async function suggestCorrectionDynamic(queryWord: string): Promise<string | null> {
    const word = queryWord.toLowerCase();
    const vocab = await getVocabulary();

    const existing = vocab.find((entry) => entry.term === word);
    if (existing && existing.docCount > 5) {
        return null;
    }
    let bestMatch: string | null = null;
    let minDistance = 3;
    let maxDocFreq = 0;

    for (const item of vocab) {
        if (Math.abs(item.term.length - word.length) > 2) continue;
        const dist = levenshteinDistance(word, item.term);
        if (dist <= 2) {
            if (dist < minDistance || (dist === minDistance && item.docCount > maxDocFreq)) {
                minDistance = dist;
                bestMatch = item.term;
                maxDocFreq = item.docCount;
            }
        }
    }
    if (bestMatch && minDistance <= 2) {
        return bestMatch;
    }
    return null;
}


type DocRow = {
    id: string;
    url: string;
    title: string;
    text: string;
    category: string | null;
};

// In-memory cache for category aggregation (refreshed every 60s)
let cachedCategories: Array<{ name: string; count: number }> | null = null;
let lastCategoryFetch = 0;

async function getDynamicCategories(): Promise<Array<{ name: string; count: number }>> {
    const now = Date.now();
    if (cachedCategories && now - lastCategoryFetch < 60000) {
        return cachedCategories;
    }
    try {
        const res = await db.execute(`
            SELECT category, COUNT(*) as count
            FROM documents
            WHERE category IS NOT NULL AND category != ''
            GROUP BY category
            ORDER BY count DESC
            LIMIT 25
        `);
        cachedCategories = res.rows.map((row: any) => ({
            name: String(row.category),
            count: Number(row.count),
        }));
        lastCategoryFetch = now;
        return cachedCategories;
    } catch {
        return cachedCategories || [];
    }
}

// ── In-Memory Sliding Window Rate Limiter ────────────────────────────────────
type RateLimitRecord = {
    count: number;
    resetTime: number;
};

const ipRateLimits = new Map<string, RateLimitRecord>();
const RATE_LIMIT_WINDOW_MS = 60_000; // 1 minute
const MAX_REQUESTS_PER_WINDOW = 60;  // Max 60 requests/minute per client IP

function checkRateLimit(ip: string): { allowed: boolean; remaining: number; retryAfterSec: number } {
    const now = Date.now();

    // Lazy cleanup of expired IPs if tracking map grows large
    if (ipRateLimits.size > 1000) {
        for (const [k, rec] of ipRateLimits.entries()) {
            if (now > rec.resetTime) ipRateLimits.delete(k);
        }
    }

    const record = ipRateLimits.get(ip);

    if (!record || now > record.resetTime) {
        ipRateLimits.set(ip, { count: 1, resetTime: now + RATE_LIMIT_WINDOW_MS });
        return { allowed: true, remaining: MAX_REQUESTS_PER_WINDOW - 1, retryAfterSec: 0 };
    }

    if (record.count >= MAX_REQUESTS_PER_WINDOW) {
        const retryAfterSec = Math.max(1, Math.ceil((record.resetTime - now) / 1000));
        return { allowed: false, remaining: 0, retryAfterSec };
    }

    record.count++;
    return {
        allowed: true,
        remaining: MAX_REQUESTS_PER_WINDOW - record.count,
        retryAfterSec: 0,
    };
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
    res.setHeader("Cache-Control", "s-maxage=30, stale-while-revalidate=120");
    res.setHeader("Access-Control-Allow-Origin", "*");

    // ── 1. Client IP & Rate Limiting Guard ─────────────────────────────────
    const forwarded = req.headers["x-forwarded-for"];
    const ip = typeof forwarded === "string"
        ? forwarded.split(",")[0].trim()
        : (req.socket?.remoteAddress || "127.0.0.1");

    const rate = checkRateLimit(ip);
    res.setHeader("X-RateLimit-Limit", String(MAX_REQUESTS_PER_WINDOW));
    res.setHeader("X-RateLimit-Remaining", String(rate.remaining));

    if (!rate.allowed) {
        res.setHeader("Retry-After", String(rate.retryAfterSec));
        return res.status(429).json({
            error: "Too many requests. Please slow down.",
            retryAfterSec: rate.retryAfterSec,
        });
    }

    const action = req.query.action as string | undefined;

    if (action === "categories") {
        const categories = await getDynamicCategories();
        return res.status(200).json({ categories });
    }

    let q = ((req.query.q as string) ?? "").trim();

    // ── 2. Input Validation (DoS & abuse protection) ───────────────────────
    if (q.length > 200) {
        return res.status(400).json({
            error: "Query too long. Maximum allowed length is 200 characters.",
        });
    }

    const mode = (req.query.mode as string) ?? "BM25";
    const category = (req.query.category as string) ?? undefined;

    // ── 3. Pagination Inputs ──────────────────────────────────────────────
    const rawPage = Number(req.query.page);
    const rawLimit = Number(req.query.limit);
    const page = Number.isInteger(rawPage) && rawPage > 0 ? Math.min(rawPage, 1000) : 1;
    const limit = Number.isInteger(rawLimit) && rawLimit > 0 ? Math.min(rawLimit, 50) : 10;

    const words = tokenize(q);
    const categories = await getDynamicCategories();

    if (words.length === 0) {
        return res.status(200).json({
            q,
            mode,
            category: category ?? "All",
            didYouMean: null,
            count: 0,
            page,
            limit,
            totalPages: 0,
            categories,
            results: [],
        });
    }

    // Check for typo correction in query words
    let didYouMean: string | null = null;
    for (const w of words) {
        if (w.length >= 4) {
            const suggestions = await suggestCorrectionDynamic(w);
            if (suggestions && suggestions !== w) {
                didYouMean = q.replace(new RegExp(`\\b${w}\\b`, "i"), suggestions);
                break;
            }
        }
    }

    // ── FTS5 full-text query (index lookup, not a full table scan) ──────────
    // Escape special FTS5 characters in each token and join with OR.
    const escapeFts = (w: string) => `"${w.replace(/"/g, '""')}"`;
    const ftsExpr = words.map(escapeFts).join(" OR ");

    let querySql: string;
    const queryArgs: string[] = [ftsExpr];

    if (category && category !== "All") {
        // Filter by category via a JOIN back to the real table
        querySql = `
            SELECT d.id, d.url, d.title, d.text, d.category
            FROM docs_fts
            JOIN documents d ON docs_fts.rowid = d.rowid
            WHERE docs_fts MATCH ?
              AND d.category = ?
            ORDER BY docs_fts.rank
            LIMIT 120
        `;
        queryArgs.push(category);
    } else {
        querySql = `
            SELECT d.id, d.url, d.title, d.text, d.category
            FROM docs_fts
            JOIN documents d ON docs_fts.rowid = d.rowid
            WHERE docs_fts MATCH ?
            ORDER BY docs_fts.rank
            LIMIT 120
        `;
    }

    const docsResult = await db.execute({ sql: querySql, args: queryArgs });
    const docs = docsResult.rows as unknown as DocRow[];
    const N = docs.length;

    if (N === 0) {
        return res.status(200).json({
            q,
            mode,
            category: category ?? "All",
            didYouMean,
            count: 0,
            categories,
            results: [],
        });
    }

    // BM25 Ranking with Title Boost
    let totalLength = 0;
    const docTokenFreqs: Array<{
        doc: DocRow;
        titleTokens: Set<string>;
        bodyFreqs: Record<string, number>;
        length: number;
    }> = [];

    const df: Record<string, number> = {};
    for (const w of words) df[w] = 0;

    for (const doc of docs) {
        const bodyTokens = tokenize(doc.text);
        const titleTokens = new Set(tokenize(doc.title));
        const bodyFreqs: Record<string, number> = {};

        for (const t of bodyTokens) {
            bodyFreqs[t] = (bodyFreqs[t] || 0) + 1;
        }

        const length = bodyTokens.length || 1;
        totalLength += length;

        for (const w of words) {
            if (bodyFreqs[w] || titleTokens.has(w)) {
                df[w] = (df[w] || 0) + 1;
            }
        }

        docTokenFreqs.push({ doc, titleTokens, bodyFreqs, length });
    }

    const avgdl = totalLength / (N || 1);
    const k1 = 1.2;
    const b = 0.75;

    const idf: Record<string, number> = {};
    for (const w of words) {
        const docCount = df[w] || 0;
        idf[w] = Math.log(1 + (N - docCount + 0.5) / (docCount + 0.5));
    }

    const scoredResults: Array<{
        documentId: string;
        title: string;
        url: string;
        score: number;
        snippet: string;
        category: string;
    }> = [];

    const lowerQuery = q.toLowerCase().trim();

    for (const { doc, titleTokens, bodyFreqs, length } of docTokenFreqs) {
        let score = 0;
        let matchedCount = 0;

        for (const w of words) {
            const tf = bodyFreqs[w] || 0;
            const inTitle = titleTokens.has(w);

            if (tf > 0 || inTitle) {
                matchedCount++;
                if (mode === "TF-IDF") {
                    score += (tf / length) * (idf[w] || 1);
                } else {
                    const numerator = tf * (k1 + 1);
                    const denominator = tf + k1 * (1 - b + b * (length / avgdl));
                    score += (idf[w] || 1) * (numerator / denominator);
                }

                // Title Boost
                if (inTitle) score += 6.0;

                // Category match boost
                if (doc.category && doc.category.toLowerCase().includes(w)) score += 3.0;
                if (doc.url.toLowerCase().includes(w)) score += 1.5;
            }
        }

        // Exact multi-word phrase boost
        if (words.length > 1) {
            if (doc.title.toLowerCase().includes(lowerQuery)) score += 8.0;
            else if (doc.text.toLowerCase().includes(lowerQuery)) score += 4.0;
        }

        if (score > 0) {
            scoredResults.push({
                documentId: doc.id,
                title: doc.title,
                url: doc.url,
                score,
                snippet: generateSnippet(doc.text, words),
                category: doc.category ?? "General",
            });
        }
    }

    scoredResults.sort((a, b) => b.score - a.score);

    const totalResults = scoredResults.length;
    const totalPages = Math.ceil(totalResults / limit);
    const startIndex = (page - 1) * limit;
    const paginatedResults = scoredResults.slice(startIndex, startIndex + limit);

    res.status(200).json({
        q,
        mode,
        category: category ?? "All",
        didYouMean,
        count: totalResults,
        page,
        limit,
        totalPages,
        categories,
        results: paginatedResults,
    });
}
