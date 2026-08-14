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

async function getDynamicCategories(): Promise<Array<{ name: string; count: number }>> {
    try {
        const res = await db.execute(`
            SELECT category, COUNT(*) as count 
            FROM documents 
            WHERE category IS NOT NULL AND category != ''
            GROUP BY category 
            ORDER BY count DESC 
            LIMIT 25
        `);
        return res.rows.map((row: any) => ({
            name: String(row.category),
            count: Number(row.count),
        }));
    } catch {
        return [];
    }
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
    const action = req.query.action as string | undefined;

    if (action === "categories") {
        const categories = await getDynamicCategories();
        return res.status(200).json({ categories });
    }

    const q = (req.query.q as string) ?? "";
    const mode = (req.query.mode as string) ?? "BM25";
    const category = (req.query.category as string) ?? undefined;

    const [categories, docsResult] = await Promise.all([
        getDynamicCategories(),
        (async () => {
            let query = "SELECT id, url, title, text, category FROM documents";
            const args: string[] = [];
            if (category && category !== "All") {
                query += " WHERE category = ?";
                args.push(category);
            }
            return db.execute({ sql: query, args });
        })(),
    ]);

    const words = tokenize(q);
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

    const docs = docsResult.rows as unknown as DocRow[];

    // Score documents
    const scoredResults: Array<{
        documentId: string;
        title: string;
        url: string;
        score: number;
        snippet: string;
        category: string;
    }> = [];

    for (const doc of docs) {
        const docTokens = tokenize(doc.title + " " + doc.text);
        const docTokenSet = new Set(docTokens);
        let score = 0;
        for (const word of words) {
            if (docTokenSet.has(word)) {
                score += 2.5;
            }
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

    // Did you mean?
    let didYouMean: string | null = null;
    if (scoredResults.length === 0) {
        for (const doc of docs) {
            const allTokens = tokenize(doc.title + " " + doc.text);
            for (const t of allTokens) {
                for (const w of words) {
                    if (levenshteinDistance(w, t) === 1) {
                        didYouMean = t;
                        break;
                    }
                }
                if (didYouMean) break;
            }
            if (didYouMean) break;
        }
    }

    res.status(200).json({
        q,
        mode,
        category: category ?? "All",
        didYouMean,
        count: scoredResults.length,
        categories,
        results: scoredResults,
    });
}
