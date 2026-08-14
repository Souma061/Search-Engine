import React, { useState, useEffect, useCallback } from "react";
import "./App.css";

export type SearchResult = {
    documentId: string;
    title: string;
    url: string;
    score: number;
    snippet: string;
    category?: string;
};

export type SearchResponse = {
    q: string;
    mode: string;
    category: string;
    didYouMean: string | null;
    count: number;
    results: SearchResult[];
};

const CATEGORIES = ["All", "MDN", "React", "Node.js", "TypeScript", "Express", "Next.js"];

export function App() {
    const [query, setQuery] = useState("");
    const [mode, setMode] = useState("BM25");
    const [category, setCategory] = useState("");
    const [results, setResults] = useState<SearchResult[]>([]);
    const [didYouMean, setDidYouMean] = useState<string | null>(null);
    const [count, setCount] = useState<number | null>(null);
    const [elapsedMs, setElapsedMs] = useState<string | null>(null);
    const [loading, setLoading] = useState(false);
    const [searchedQuery, setSearchedQuery] = useState("");

    const performSearch = useCallback(async (searchQuery: string, searchMode: string, searchCategory: string) => {
        const trimmed = searchQuery.trim();
        if (!trimmed) return;

        setLoading(true);
        const start = performance.now();

        // Sync URL query params without reloading
        const urlParams = new URLSearchParams();
        urlParams.set("q", trimmed);
        if (searchCategory) urlParams.set("category", searchCategory);
        window.history.pushState({}, "", `/?${urlParams.toString()}`);

        try {
            const apiCategory = searchCategory ? `&category=${encodeURIComponent(searchCategory)}` : "";
            const res = await fetch(`/search?q=${encodeURIComponent(trimmed)}&mode=${searchMode}${apiCategory}`);
            const data: SearchResponse = await res.json();
            const timeTaken = (performance.now() - start).toFixed(1);

            setResults(data.results || []);
            setDidYouMean(data.didYouMean || null);
            setCount(data.count || 0);
            setElapsedMs(timeTaken);
            setSearchedQuery(trimmed);
        } catch (err) {
            console.error("Search failed:", err);
        } finally {
            setLoading(false);
        }
    }, []);

    // Initial search load from URL params
    useEffect(() => {
        const params = new URLSearchParams(window.location.search);
        const initialQ = params.get("q");
        const initialCat = params.get("category") || "";

        if (initialCat) setCategory(initialCat);
        if (initialQ) {
            setQuery(initialQ);
            performSearch(initialQ, mode, initialCat);
        }
    }, [performSearch, mode]);

    const handleSubmit = (e: React.FormEvent) => {
        e.preventDefault();
        performSearch(query, mode, category);
    };

    const handleCategoryClick = (cat: string) => {
        const nextCat = cat === "All" ? "" : cat;
        setCategory(nextCat);
        if (query.trim()) {
            performSearch(query, mode, nextCat);
        }
    };

    const handleDidYouMeanClick = (suggestion: string) => {
        setQuery(suggestion);
        performSearch(suggestion, mode, category);
    };

    return (
        <div className="app-container">
            <header className="app-header">
                <h1 className="logo-title">DevDocs</h1>
                <div className="logo-subtitle">Developer Search Engine for Web Documentation</div>
            </header>

            <form className="search-form" onSubmit={handleSubmit}>
                <div className="search-bar-pill">
                    <span className="search-icon">🔍</span>
                    <input
                        type="text"
                        className="search-input"
                        placeholder="Search JS, React, Node, TS docs..."
                        value={query}
                        onChange={(e) => setQuery(e.target.value)}
                        autoFocus
                    />
                    <select
                        className="search-mode-select"
                        value={mode}
                        onChange={(e) => setMode(e.target.value)}
                    >
                        <option value="BM25">BM25</option>
                        <option value="TFIDF">TF-IDF</option>
                        <option value="PHRASE">Phrase</option>
                    </select>
                    <button type="submit" className="search-submit-btn">
                        Search
                    </button>
                </div>

                <div className="categories-bar">
                    {CATEGORIES.map((cat) => {
                        const isActive = cat === "All" ? category === "" : category === cat;
                        return (
                            <button
                                key={cat}
                                type="button"
                                className={`category-chip ${isActive ? "active" : ""}`}
                                onClick={() => handleCategoryClick(cat)}
                            >
                                {cat}
                            </button>
                        );
                    })}
                </div>
            </form>

            {loading && <div className="loading-spinner">Searching documentation...</div>}

            {count !== null && !loading && (
                <div className="results-metrics">
                    About {count} results ({elapsedMs} ms)
                </div>
            )}

            {didYouMean && !loading && (
                <div className="did-you-mean-banner">
                    Did you mean:{" "}
                    <button
                        type="button"
                        className="did-you-mean-link"
                        onClick={() => handleDidYouMeanClick(didYouMean)}
                    >
                        {didYouMean}
                    </button>
                    ?
                </div>
            )}

            {!loading && count === 0 && searchedQuery && (
                <div className="empty-results">
                    No results found for '{searchedQuery}'. Try different keywords or select 'All' categories.
                </div>
            )}

            {!loading && results.length > 0 && (
                <ul className="results-list">
                    {results.map((item) => (
                        <li key={item.documentId} className="result-card">
                            <div className="result-header">
                                <a
                                    href={item.url}
                                    target="_blank"
                                    rel="noreferrer"
                                    className="result-title"
                                >
                                    {item.title}
                                </a>
                                {item.category && <span className="result-badge">{item.category}</span>}
                                <span className="result-score">[{item.score.toFixed(3)}]</span>
                            </div>
                            <a
                                href={item.url}
                                target="_blank"
                                rel="noreferrer"
                                className="result-url"
                            >
                                {item.url}
                            </a>
                            {item.snippet && (
                                <div
                                    className="result-snippet"
                                    dangerouslySetInnerHTML={{ __html: item.snippet }}
                                />
                            )}
                        </li>
                    ))}
                </ul>
            )}
        </div>
    );
}
