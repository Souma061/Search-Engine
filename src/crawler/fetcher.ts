export async function fetchPage(
    url: string,
    timeoutMs = 10_000,
    maxRetries = 2,
): Promise<string> {
    for (let attempt = 0; attempt <= maxRetries; attempt++) {
        try {
            return await fetchPageOnce(url, timeoutMs);
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
): Promise<string> {
    const controller = new AbortController();

    const timeout = setTimeout(() => {
        controller.abort();
    }, timeoutMs);

    try {
        const response = await fetch(url, {
            signal: controller.signal,
        });

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

        return await response.text();
    } finally {
        clearTimeout(timeout);
    }
}