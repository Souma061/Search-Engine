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

export type CategoryInfo = {
    name: string;
    count?: number;
};

export type SearchResponse = {
    q: string;
    mode: string;
    category: string;
    didYouMean: string | null;
    count: number;
    categories?: CategoryInfo[];
    results: SearchResult[];
};

export function App() {
    const [query, setQuery] = useState("");
    const [mode, setMode] = useState("BM25");
    const [category, setCategory] = useState("");
    const [categories, setCategories] = useState<CategoryInfo[]>([]);
    const [results, setResults] = useState<SearchResult[]>([]);
    const [didYouMean, setDidYouMean] = useState<string | null>(null);
    const [count, setCount] = useState<number | null>(null);
    const [elapsedMs, setElapsedMs] = useState<string | null>(null);
    const [loading, setLoading] = useState(false);
    const [searchedQuery, setSearchedQuery] = useState("");

    // Dynamically load available categories on mount
    useEffect(() => {
        fetch("/search?action=categories")
            .then((res) => res.json())
            .then((data) => {
                if (data.categories && Array.isArray(data.categories)) {
                    setCategories(data.categories);
                }
            })
            .catch(() => {});
    }, []);

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
            const apiCategory = searchCategory && searchCategory !== "All" ? `&category=${encodeURIComponent(searchCategory)}` : "";
            const res = await fetch(`/search?q=${encodeURIComponent(trimmed)}&mode=${searchMode}${apiCategory}`);
            const data: SearchResponse = await res.json();
            const timeTaken = (performance.now() - start).toFixed(1);

            setResults(data.results || []);
            setDidYouMean(data.didYouMean || null);
            setCount(data.count || 0);
            setElapsedMs(timeTaken);
            setSearchedQuery(trimmed);

            if (data.categories && Array.isArray(data.categories) && data.categories.length > 0) {
                setCategories(data.categories);
            }
        } catch (err) {
            console.error("Search failed:", err);
        } finally {
            setLoading(false);
        }
    }, []);

    // Initial search on mount if query params exist in URL
    useEffect(() => {
        const params = new URLSearchParams(window.location.search);
        const qParam = params.get("q") || "";
        const catParam = params.get("category") || "";
        if (catParam) setCategory(catParam);
        if (qParam) {
            setQuery(qParam);
            performSearch(qParam, mode, catParam);
        }
    }, [mode, performSearch]);

    const handleSubmit = (e: React.FormEvent) => {
        e.preventDefault();
        performSearch(query, mode, category);
    };

    const handleCategoryClick = (catName: string) => {
        const next = catName === "All" || category === catName ? "" : catName;
        setCategory(next);
        if (query.trim()) {
            performSearch(query, mode, next);
        }
    };

    const handleDidYouMeanClick = (suggested: string) => {
        setQuery(suggested);
        performSearch(suggested, mode, category);
    };

    return (
        <div className="search-container">
            <header className="header">
                <h1 className="logo">DevDocs</h1>
                <p className="subtitle">Developer Search Engine for Web & AI Documentation</p>
            </header>

            <form onSubmit={handleSubmit} className="search-form">
                <div className="search-input-wrapper">
                    <span className="search-icon">🔍</span>
                    <input
                        type="text"
                        className="search-input"
                        placeholder="Search React, PyTorch, Angular, FastAPI, Node.js docs..."
                        value={query}
                        onChange={(e) => setQuery(e.target.value)}
                        autoFocus
                    />
                    <select
                        className="mode-select"
                        value={mode}
                        onChange={(e) => setMode(e.target.value)}
                        aria-label="Search Mode"
                    >
                        <option value="BM25">BM25</option>
                        <option value="TF-IDF">TF-IDF</option>
                        <option value="PHRASE">Phrase</option>
                    </select>
                    <button type="submit" className="search-submit-btn">
                        Search
                    </button>
                </div>

                <div className="categories-bar">
                    <button
                        type="button"
                        className={`category-chip ${category === "" ? "active" : ""}`}
                        onClick={() => handleCategoryClick("All")}
                    >
                        All
                    </button>
                    {categories.map((cat) => {
                        const isActive = category === cat.name;
                        return (
                            <button
                                key={cat.name}
                                type="button"
                                className={`category-chip ${isActive ? "active" : ""}`}
                                onClick={() => handleCategoryClick(cat.name)}
                            >
                                {cat.name} {cat.count ? `(${cat.count})` : ""}
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
