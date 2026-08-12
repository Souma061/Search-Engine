import { URLFrontier } from "./url-frontier.ts";
import { fetchPage } from "./fetcher.ts";
import { parsePage } from "./parser.ts";
import type { Document } from "../indexer/document.ts";
import { RobotsChecker } from "./robots.ts";
import { RateLimiter } from "./ratel-limiter.ts";
import { WorkerPool } from "./worker-pool.ts";

type DocumentSink = {
    add(document: Document): void;
};

export type CrawlConfig = {
    maxPages: number;
    maxDepth: number;
    rateLimitMs: number;
    timeoutMs: number;
    maxRetries: number;
    concurrency: number;
};

export async function crawl(
    seedUrl: string,
    documentStore: DocumentSink,
    config: CrawlConfig,
): Promise<void> {
    const frontier = new URLFrontier();

    const seed = new URL(seedUrl);
    const allowedHost = seed.host;

    const limiter = new RateLimiter(
        config.rateLimitMs,
    );

    const pool = new WorkerPool(
        config.concurrency,
    );

    /*
     * Fetch robots.txt once for the seed host.
     * If robots.txt is missing, allow crawling.
     */
    const robotsUrl = new URL(
        "/robots.txt",
        seedUrl,
    ).toString();

    let robots: RobotsChecker;

    try {
        await limiter.wait(robotsUrl);

        const robotsResponse = await fetch(
            robotsUrl,
        );

        const robotsText = robotsResponse.ok
            ? await robotsResponse.text()
            : "";

        robots = new RobotsChecker(robotsText);
    } catch (error) {
        console.warn(
            `Could not fetch robots.txt for ${allowedHost}.`,
        );

        console.warn(error);

        // No robots.txt available → allow crawling.
        robots = new RobotsChecker("");
    }

    /*
     * Number of pages that have been reserved for crawling.
     *
     * This prevents concurrent workers from exceeding maxPages.
     */
    let pagesReserved = 0;

    const crawlPage = async (
        url: string,
        depth: number,
    ): Promise<void> => {
        /*
         * Robots check happens before consuming a page slot.
         */
        if (!robots.canCrawl(url)) {
            console.log(
                `Blocked by robots.txt: ${url}`,
            );

            return;
        }

        /*
         * Reserve a page slot atomically from the
         * JavaScript event loop before starting the fetch.
         */
        if (pagesReserved >= config.maxPages) {
            return;
        }

        pagesReserved++;

        console.log(`Crawling: ${url}`);

        let html: string;

        try {
            await limiter.wait(url);

            html = await fetchPage(
                url,
                config.timeoutMs,
                config.maxRetries,
            );
        } catch (error) {
            console.error(
                `Failed to fetch: ${url}`,
            );

            console.error(error);

            return;
        }

        let page;

        try {
            page = parsePage(html, url);
        } catch (error) {
            console.error(
                `Failed to parse: ${url}`,
            );

            console.error(error);

            return;
        }

        const document: Document = {
            id: url,
            url,
            title: page.title,
            text: page.text,
        };

        documentStore.add(document);

        console.log(
            `Title: ${page.title}`,
        );

        console.log(
            `Links found: ${page.links.length}`,
        );

        /*
         * Stop discovering deeper links once maxDepth
         * is reached.
         */
        if (depth >= config.maxDepth) {
            return;
        }

        for (const link of page.links) {
            let linkUrl: URL;

            try {
                linkUrl = new URL(link);
            } catch {
                continue;
            }

            /*
             * Stay on the same host.
             */
            if (linkUrl.host !== allowedHost) {
                continue;
            }

            const normalizedUrl =
                linkUrl.toString();

            /*
             * Frontier handles deduplication.
             */
            if (!frontier.add(normalizedUrl)) {
                continue;
            }

            pool.submit(() =>
                crawlPage(
                    normalizedUrl,
                    depth + 1,
                ),
            );
        }
    };

    /*
     * Seed starts at depth 0.
     */
    if (frontier.add(seedUrl)) {
        pool.submit(() =>
            crawlPage(seedUrl, 0),
        );
    }

    /*
     * Wait until:
     *
     * queue === empty
     * AND
     * active workers === 0
     */
    await pool.done();
}
