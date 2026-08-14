import { URLFrontier } from "./url-frontier.ts";
import { fetchPage } from "./fetcher.ts";
import { parsePage } from "./parser.ts";
import type { Document } from "../indexer/document.ts";
import type { DocumentMetadata } from "../store/sqlite-document-store.ts";
import { RobotsChecker } from "./robots.ts";
import { RateLimiter } from "./ratel-limiter.ts";
import { WorkerPool } from "./worker-pool.ts";

import { fetchSitemap } from "./sitemap.ts";
import { detectCategory } from "../indexer/category.ts";

type DocumentSink = {
    add(document: Document): void | Promise<void>;
    getMetadata?(id: string): DocumentMetadata | undefined | Promise<DocumentMetadata | undefined>;
    touchCrawled?(id: string, statusCode?: number): void | Promise<void>;
    delete?(id: string): boolean | Promise<boolean>;
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

    const limiter = new RateLimiter(config.rateLimitMs);
    const pool = new WorkerPool(config.concurrency);

    /*
     * Fetch robots.txt once for the seed host.
     * If robots.txt is missing, allow crawling.
     */
    const robotsUrl = new URL("/robots.txt", seedUrl).toString();
    let robots: RobotsChecker;

    try {
        await limiter.wait(robotsUrl);
        const robotsResponse = await fetch(robotsUrl);
        const robotsText = robotsResponse.ok ? await robotsResponse.text() : "";
        robots = new RobotsChecker(robotsText);
    } catch (error) {
        console.warn(`Could not fetch robots.txt for ${allowedHost}.`);
        console.warn(error);
        robots = new RobotsChecker("");
    }

    let pagesReserved = 0;

    const crawlPage = async (url: string, depth: number): Promise<void> => {
        if (!robots.canCrawl(url)) {
            console.log(`Blocked by robots.txt: ${url}`);
            return;
        }

        if (pagesReserved >= config.maxPages) {
            return;
        }

        pagesReserved++;
        console.log(`Crawling: ${url}`);

        const cachedMeta = await documentStore.getMetadata?.(url);

        let fetchResult;

        try {
            await limiter.wait(url);
            fetchResult = await fetchPage(url, {
                timeoutMs: config.timeoutMs,
                maxRetries: config.maxRetries,
                etag: cachedMeta?.etag,
                lastModified: cachedMeta?.lastModified,
            });
        } catch (error) {
            console.error(`Failed to fetch: ${url}`);
            console.error(error);
            return;
        }

        // 304 Not Modified: page is unchanged!
        if (fetchResult.status === 304) {
            console.log(`Unchanged (304): ${url}`);
            await documentStore.touchCrawled?.(url, 304);
            return;
        }

        // 404 Found or 410 Gone: purge deleted page!
        if (fetchResult.status === 404 || fetchResult.status === 410) {
            console.log(`Purged deleted page (${fetchResult.status}): ${url}`);
            await documentStore.delete?.(url);
            return;
        }

        let page;
        try {
            page = parsePage(fetchResult.text, url);
        } catch (error) {
            console.error(`Failed to parse: ${url}`);
            console.error(error);
            return;
        }

        const document: Document = {
            id: url,
            url,
            title: page.title,
            text: page.text,
            etag: fetchResult.etag,
            lastModified: fetchResult.lastModified,
            lastCrawledAt: Date.now(),
            statusCode: 200,
            category: detectCategory(url),
        };

        await documentStore.add(document);

        console.log(`Title: ${page.title}`);
        console.log(`Links found: ${page.links.length}`);

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

            if (linkUrl.host !== allowedHost) {
                continue;
            }

            const normalizedUrl = linkUrl.toString();

            if (!frontier.add(normalizedUrl)) {
                continue;
            }

            pool.submit(() => crawlPage(normalizedUrl, depth + 1));
        }
    };

    // Seed sitemap.xml URLs if available
    const sitemapEntries = await fetchSitemap(seedUrl);
    for (const entry of sitemapEntries) {
        if (frontier.add(entry.url)) {
            pool.submit(() => crawlPage(entry.url, 0));
        }
    }

    if (frontier.add(seedUrl)) {
        pool.submit(() => crawlPage(seedUrl, 0));
    }

    await pool.done();
}
