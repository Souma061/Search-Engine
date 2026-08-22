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
    page: number;
    limit: number;
    totalPages: number;
    categories?: CategoryInfo[];
    results: SearchResult[];
    error?: string;
    retryAfterSec?: number;
};

export function App() {
    const [query, setQuery] = useState("");
    const [mode, setMode] = useState("BM25");
    const [category, setCategory] = useState("");
    const [categories, setCategories] = useState<CategoryInfo[]>([]);
    const [results, setResults] = useState<SearchResult[]>([]);
    const [didYouMean, setDidYouMean] = useState<string | null>(null);
    const [count, setCount] = useState<number | null>(null);
    const [page, setPage] = useState(1);
    const [totalPages, setTotalPages] = useState(0);
    const [elapsedMs, setElapsedMs] = useState<string | null>(null);
    const [loading, setLoading] = useState(false);
    const [searchedQuery, setSearchedQuery] = useState("");
    const [rateLimitWarning, setRateLimitWarning] = useState<string | null>(null);

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

    const performSearch = useCallback(
        async (searchQuery: string, searchMode: string, searchCategory: string, targetPage = 1) => {
            const trimmed = searchQuery.trim();
            if (!trimmed) return;

            setLoading(true);
            setRateLimitWarning(null);
            const start = performance.now();

            // Sync URL query params without reloading
            const urlParams = new URLSearchParams();
            urlParams.set("q", trimmed);
            if (searchCategory) urlParams.set("category", searchCategory);
            if (targetPage > 1) urlParams.set("page", String(targetPage));
            window.history.pushState({}, "", `/?${urlParams.toString()}`);

            try {
                const apiCategory = searchCategory && searchCategory !== "All" ? `&category=${encodeURIComponent(searchCategory)}` : "";
                const res = await fetch(
                    `/search?q=${encodeURIComponent(trimmed)}&mode=${searchMode}&page=${targetPage}&limit=10${apiCategory}`
                );

                if (res.status === 429) {
                    const errorData = await res.json();
                    setRateLimitWarning(
                        `Rate limit exceeded: ${errorData.error || "Please wait"} (retry in ${errorData.retryAfterSec || 30}s)`
                    );
                    setLoading(false);
                    return;
                }

                if (!res.ok) {
                    const errorData = await res.json().catch(() => ({}));
                    setRateLimitWarning(errorData.error || "An error occurred while searching.");
                    setLoading(false);
                    return;
                }

                const data: SearchResponse = await res.json();
                const timeTaken = (performance.now() - start).toFixed(1);

                setResults(data.results || []);
                setDidYouMean(data.didYouMean || null);
                setCount(data.count || 0);
                setPage(data.page || targetPage);
                setTotalPages(data.totalPages || 0);
                setElapsedMs(timeTaken);
                setSearchedQuery(trimmed);

                if (data.categories && Array.isArray(data.categories) && data.categories.length > 0) {
                    setCategories(data.categories);
                }

                // Smooth scroll back to top of results on page change
                if (targetPage > 1) {
                    window.scrollTo({ top: 180, behavior: "smooth" });
                }
            } catch (err) {
                console.error("Search failed:", err);
                setRateLimitWarning("Failed to connect to the search server. Please check your connection.");
            } finally {
                setLoading(false);
            }
        },
        []
    );

    // Initial search on mount if query params exist in URL
    useEffect(() => {
        const params = new URLSearchParams(window.location.search);
        const qParam = params.get("q") || "";
        const catParam = params.get("category") || "";
        const pageParam = Number(params.get("page")) || 1;

        if (catParam) setCategory(catParam);
        if (qParam) {
            setQuery(qParam);
            performSearch(qParam, mode, catParam, pageParam);
        }
    }, [mode, performSearch]);

    const handleSubmit = (e: React.FormEvent) => {
        e.preventDefault();
        setPage(1);
        performSearch(query, mode, category, 1);
    };

    const handleCategoryClick = (catName: string) => {
        const next = catName === "All" || category === catName ? "" : catName;
        setCategory(next);
        setPage(1);
        if (query.trim()) {
            performSearch(query, mode, next, 1);
        }
    };

    const handleDidYouMeanClick = (suggested: string) => {
        setQuery(suggested);
        setPage(1);
        performSearch(suggested, mode, category, 1);
    };

    const handlePageChange = (newPage: number) => {
        if (newPage < 1 || newPage > totalPages || newPage === page) return;
        setPage(newPage);
        performSearch(query || searchedQuery, mode, category, newPage);
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
                        maxLength={200}
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

            {rateLimitWarning && (
                <div className="rate-limit-banner">
                    ⚠️ {rateLimitWarning}
                </div>
            )}

            {loading && <div className="loading-spinner">Searching documentation...</div>}

            {count !== null && !loading && (
                <div className="results-metrics">
                    About {count} results ({elapsedMs} ms) — Page {page} of {totalPages || 1}
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

            {!loading && count === 0 && searchedQuery && !rateLimitWarning && (
                <div className="empty-results">
                    No results found for '{searchedQuery}'. Try different keywords or select 'All' categories.
                </div>
            )}

            {!loading && results.length > 0 && (
                <>
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

                    {/* Pagination Bar */}
                    {totalPages > 1 && (
                        <div className="pagination-bar">
                            <button
                                type="button"
                                className="page-nav-btn"
                                disabled={page <= 1}
                                onClick={() => handlePageChange(page - 1)}
                            >
                                ← Prev
                            </button>

                            <div className="page-numbers">
                                {Array.from({ length: totalPages }, (_, i) => i + 1)
                                    .filter((p) => p === 1 || p === totalPages || Math.abs(p - page) <= 2)
                                    .map((p, idx, arr) => {
                                        const prevPage = arr[idx - 1];
                                        return (
                                            <React.Fragment key={p}>
                                                {prevPage && p - prevPage > 1 && (
                                                    <span className="page-ellipsis">...</span>
                                                )}
                                                <button
                                                    type="button"
                                                    className={`page-num-btn ${p === page ? "active" : ""}`}
                                                    onClick={() => handlePageChange(p)}
                                                >
                                                    {p}
                                                </button>
                                            </React.Fragment>
                                        );
                                    })}
                            </div>

                            <button
                                type="button"
                                className="page-nav-btn"
                                disabled={page >= totalPages}
                                onClick={() => handlePageChange(page + 1)}
                            >
                                Next →
                            </button>
                        </div>
                    )}
                </>
            )}
        </div>
    );
}
