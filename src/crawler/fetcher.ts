export type FetchResult = {
    status: number;
    text: string;
    etag?: string;
    lastModified?: string;
};

export type FetchOptions = {
    timeoutMs?: number;
    maxRetries?: number;
    etag?: string;
    lastModified?: string;
};

export async function fetchPage(
    url: string,
    options: FetchOptions = {},
): Promise<FetchResult> {
    const timeoutMs = options.timeoutMs ?? 10_000;
    const maxRetries = options.maxRetries ?? 2;

    for (let attempt = 0; attempt <= maxRetries; attempt++) {
        try {
            return await fetchPageOnce(url, timeoutMs, options);
        } catch (error) {
            if (attempt === maxRetries) {
                throw error;
            }

            const delayMs = 500 * 2 ** attempt;

            console.warn(
                `Fetch failed for ${url}. Retrying in ${delayMs}ms...`,
            );

            await new Promise((resolve) =>
                setTimeout(resolve, delayMs),
            );
        }
    }

    throw new Error("Unreachable");
}

async function fetchPageOnce(
    url: string,
    timeoutMs: number,
    options: FetchOptions,
): Promise<FetchResult> {
    const controller = new AbortController();

    const timeout = setTimeout(() => {
        controller.abort();
    }, timeoutMs);

    const headers: Record<string, string> = {
        "User-Agent": "DevDocsBot/1.0 (+https://github.com/Souma061/Search-Engine; developer documentation crawler)",
        "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
    };
    if (options.etag) {
        headers["If-None-Match"] = options.etag;
    }
    if (options.lastModified) {
        headers["If-Modified-Since"] = options.lastModified;
    }

    try {
        const response = await fetch(url, {
            signal: controller.signal,
            headers,
        });

        // 304 Not Modified — unchanged page
        if (response.status === 304) {
            return { status: 304, text: "" };
        }

        // 404 / 410 — deleted page
        if (response.status === 404 || response.status === 410) {
            return { status: response.status, text: "" };
        }

        if (!response.ok) {
            throw new Error(
                `Failed to fetch page ${url}: ${response.status} ${response.statusText}`,
            );
        }

        const contentType = response.headers.get("content-type");

        if (contentType && !contentType.includes("text/html")) {
            throw new Error(
                `Unsupported content type for ${url}: ${contentType}`,
            );
        }

        const text = await response.text();
        const etag = response.headers.get("etag") ?? undefined;
        const lastModified = response.headers.get("last-modified") ?? undefined;

        return { status: 200, text, etag, lastModified };
    } finally {
        clearTimeout(timeout);
    }
}