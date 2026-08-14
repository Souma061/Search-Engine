import type { VercelRequest, VercelResponse } from "@vercel/node";

export type Document = {
    id: string;
    url: string;
    title: string;
    text: string;
    category?: string;
};

export type SearchResult = {
    documentId: string;
    title: string;
    url: string;
    score: number;
    snippet: string;
    category?: string;
};

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

const documents: Document[] = [
    {
        id: "https://react.dev/reference/react/useState",
        url: "https://react.dev/reference/react/useState",
        title: "useState – React Docs",
        text: "useState is a React Hook that lets you add state variables to functional components. Pass initial state to useState and call setFn to update value.",
        category: "React",
    },
    {
        id: "https://react.dev/reference/react/useMemo",
        url: "https://react.dev/reference/react/useMemo",
        title: "useMemo – React Docs",
        text: "useMemo is a React Hook that lets you cache the result of a calculation between re-renders in functional components.",
        category: "React",
    },
    {
        id: "https://developer.mozilla.org/en-US/docs/Web/API/Fetch_API",
        url: "https://developer.mozilla.org/en-US/docs/Web/API/Fetch_API",
        title: "Fetch API - Web APIs | MDN",
        text: "The Fetch API provides a JavaScript interface for accessing and manipulating parts of the HTTP protocol, such as requests and responses with async await.",
        category: "MDN",
    },
    {
        id: "https://nodejs.org/api/fs.html",
        url: "https://nodejs.org/api/fs.html",
        title: "File System | Node.js v20 API Documentation",
        text: "The node:fs module enables interacting with the file system in a way modeled on standard POSIX functions. fs.readFile reads entire file asynchronously.",
        category: "Node.js",
    },
    {
        id: "https://www.typescriptlang.org/docs/handbook/2/generics.html",
        url: "https://www.typescriptlang.org/docs/handbook/2/generics.html",
        title: "Documentation - Generics | TypeScript",
        text: "A major part of software engineering is building components that not only have well-defined and consistent APIs, but are also reusable using TypeScript generics.",
        category: "TypeScript",
    },
    {
        id: "https://expressjs.com/en/4x/api.html",
        url: "https://expressjs.com/en/4x/api.html",
        title: "Express 4.x API Reference",
        text: "The app object conventionally denotes the Express application. Create it by calling the top-level express() function exported by the Express module.",
        category: "Express",
    },
    {
        id: "https://nextjs.org/docs/app/building-your-application/routing",
        url: "https://nextjs.org/docs/app/building-your-application/routing",
        title: "Routing: Getting Started | Next.js Docs",
        text: "Next.js uses a file-system based router where folders define routes. Each folder in app directory represents a route segment mapped to URL path.",
        category: "Next.js",
    },
];

export default function handler(req: VercelRequest, res: VercelResponse) {
    const q = (req.query.q as string) ?? "";
    const mode = (req.query.mode as string) ?? "BM25";
    const category = (req.query.category as string) ?? undefined;

    const words = tokenize(q);
    if (words.length === 0) {
        return res.status(200).json({ q, mode, category: category ?? "All", didYouMean: null, count: 0, results: [] });
    }

    let filteredDocs = documents;
    if (category) {
        filteredDocs = documents.filter(d => d.category === category);
    }

    const scoredResults: SearchResult[] = [];
    for (const doc of filteredDocs) {
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

    let didYouMean: string | null = null;
    if (scoredResults.length === 0) {
        for (const doc of documents) {
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
        results: scoredResults,
    });
}
