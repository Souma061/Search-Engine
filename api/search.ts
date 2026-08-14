import type { VercelRequest, VercelResponse } from "@vercel/node";
import { createClient } from "@libsql/client";

const db = createClient({
    url: (process.env.TURSO_DATABASE_URL ?? "").trim(),
    authToken: (process.env.TURSO_AUTH_TOKEN ?? "").trim(),
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
        if (token.length === 1 && !/[a-z0-9]/i.test(token)) continue;
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
    for (const word of queryWords) {
        if (!word) continue;
        const regex = new RegExp(`(${word.replace(/[.*+?^${}()|[\\]\\\\]/g, "\\$&")})`, "gi");
        snippet = snippet.replace(regex, "<mark>$1</mark>");
    }
    return snippet;
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

export default async function handler(req: VercelRequest, res: VercelResponse) {
    // Enable edge caching headers
    res.setHeader("Cache-Control", "s-maxage=3600, stale-while-revalidate=86400");
    res.setHeader("Access-Control-Allow-Origin", "*");

    const action = req.query.action as string | undefined;

    if (action === "categories") {
        const categories = await getDynamicCategories();
        return res.status(200).json({ categories });
    }

    const q = (req.query.q as string) ?? "";
    const mode = (req.query.mode as string) ?? "BM25";
    const category = (req.query.category as string) ?? undefined;

    const words = tokenize(q);

    const categories = await getDynamicCategories();

    if (words.length === 0) {
        return res.status(200).json({
            q,
            mode,
            category: category ?? "All",
            didYouMean: null,
            count: 0,
            categories,
            results: [],
        });
    }

    // Fast Indexed SQL Query: Fetch ONLY matching documents using DB indexes instead of scanning all 1,300+ docs
    let querySql = "SELECT id, url, title, text, category FROM documents WHERE ";
    const queryArgs: string[] = [];

    const conditions: string[] = [];
    if (category && category !== "All") {
        conditions.push("category = ?");
        queryArgs.push(category);
    }

    // Match query terms in title, text, or category
    const wordConditions: string[] = [];
    for (const w of words) {
        wordConditions.push("(title LIKE ? OR text LIKE ? OR category LIKE ?)");
        queryArgs.push(`%${w}%`, `%${w}%`, `%${w}%`);
    }
    conditions.push(`(${wordConditions.join(" OR ")})`);

    querySql += conditions.join(" AND ") + " LIMIT 120";

    const docsResult = await db.execute({ sql: querySql, args: queryArgs });
    const docs = docsResult.rows as unknown as DocRow[];
    const N = docs.length;

    if (N === 0) {
        // Find "Did You Mean" from sample docs if 0 results
        let didYouMean: string | null = null;
        for (const cat of categories) {
            for (const w of words) {
                if (levenshteinDistance(w, cat.name.toLowerCase()) === 1) {
                    didYouMean = cat.name;
                    break;
                }
            }
            if (didYouMean) break;
        }

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

    // BM25 Ranking with Title Boost on the candidate set
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

        for (const w of words) {
            const tf = bodyFreqs[w] || 0;
            const inTitle = titleTokens.has(w);

            if (tf > 0 || inTitle) {
                if (mode === "TF-IDF") {
                    score += (tf / length) * (idf[w] || 1);
                } else {
                    const numerator = tf * (k1 + 1);
                    const denominator = tf + k1 * (1 - b + b * (length / avgdl));
                    score += (idf[w] || 1) * (numerator / denominator);
                }

                // Title Boost
                if (inTitle) score += 5.0;

                // Category match boost
                if (doc.category && doc.category.toLowerCase().includes(w)) score += 3.0;
                if (doc.url.toLowerCase().includes(w)) score += 1.5;
            }
        }

        // Phrase boost
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

    res.status(200).json({
        q,
        mode,
        category: category ?? "All",
        didYouMean: null,
        count: scoredResults.length,
        categories,
        results: scoredResults.slice(0, 30),
    });
}
