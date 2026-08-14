import * as cheerio from "cheerio";

export type ParsedPage = {
    title: string;
    text: string;
    links: string[];
    siteName?: string;
};

export function parsePage(html: string, baseUrl: string): ParsedPage {
    const $ = cheerio.load(html);

    const title = $("title").first().text().trim();

    // Extract site name from meta tags if available
    const siteName =
        $('meta[property="og:site_name"]').attr("content")?.trim() ||
        $('meta[name="application-name"]').attr("content")?.trim() ||
        $('meta[name="apple-mobile-web-app-title"]').attr("content")?.trim();

    // 1. Extract links first so crawler discovery isn't blocked by navigation stripping
    const url: string[] = [];
    $("a[href]").each((_, element) => {
        const href = $(element).attr("href");
        if (!href) {
            return;
        }
        try {
            const parsedUrl = new URL(href, baseUrl);
            if (parsedUrl.protocol === "http:" || parsedUrl.protocol === "https:") {
                url.push(parsedUrl.toString());
            }
        } catch {
            // skip malformed hrefs
        }
    });

    // 2. Remove noise and non-content tags before text extraction
    $("nav, header, footer, aside, script, style, noscript, .sidebar").remove();

    // 3. Prefer main content containers if present, fallback to body
    const mainContent = $("main, article, #content").first();
    const textTarget = mainContent.length ? mainContent : $("body");
    const text = textTarget.text().replace(/\s+/g, " ").trim();

    return { title, text, links: url, siteName: siteName || undefined };
}