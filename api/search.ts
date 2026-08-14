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
    const N = docs.length;

    // Calculate document lengths and average document length (for BM25)
    let totalLength = 0;
    const docTokenFreqs: Array<{
        doc: DocRow;
        titleTokens: Set<string>;
        bodyFreqs: Record<string, number>;
        length: number;
    }> = [];

    // Document frequencies (DF) for each query term
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

    // Calculate IDF for words
    const idf: Record<string, number> = {};
    for (const w of words) {
        const docCount = df[w] || 0;
        idf[w] = Math.log(1 + (N - docCount + 0.5) / (docCount + 0.5));
    }

    // Score documents
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
        let matchedTerms = 0;

        for (const w of words) {
            const tf = bodyFreqs[w] || 0;
            const inTitle = titleTokens.has(w);

            if (tf > 0 || inTitle) {
                matchedTerms++;

                if (mode === "TF-IDF") {
                    score += (tf / length) * (idf[w] || 1);
                } else {
                    // BM25 scoring formula
                    const numerator = tf * (k1 + 1);
                    const denominator = tf + k1 * (1 - b + b * (length / avgdl));
                    score += (idf[w] || 1) * (numerator / denominator);
                }

                // 🌟 TITLE BOOST: Matching the title gives a massive relevance boost!
                if (inTitle) {
                    score += 5.0;
                }

                // 🌟 URL / Category relevance boost
                if (doc.category && doc.category.toLowerCase().includes(w)) {
                    score += 3.0;
                }
                if (doc.url.toLowerCase().includes(w)) {
                    score += 1.5;
                }
            }
        }

        // 🌟 EXACT PHRASE BOOST: If full multi-word query appears in title or text
        if (words.length > 1) {
            if (doc.title.toLowerCase().includes(lowerQuery)) {
                score += 8.0;
            } else if (doc.text.toLowerCase().includes(lowerQuery)) {
                score += 4.0;
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

    // Sort by highest relevance score first
    scoredResults.sort((a, b) => b.score - a.score);

    // Did you mean?
    let didYouMean: string | null = null;
    if (scoredResults.length === 0) {
        for (const { doc } of docTokenFreqs) {
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
