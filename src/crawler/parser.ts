import * as cheerio from "cheerio";

type ParsedPage = {
    title: string;
    text: string;
    links: string[];
}

export function parsePage(html: string, baseUrl: string): ParsedPage {
    const $ = cheerio.load(html);

    const title = $("title").first().text().trim();
    const text = $("body").text().replace(/\s+/g, " ").trim();
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
    return {title, text, links: url};
}