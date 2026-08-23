import * as cheerio from "cheerio";

export type SitemapEntry = {
    url: string;
    lastMod?: string;
};

export function parseSitemap(xml: string): SitemapEntry[] {
    const $ = cheerio.load(xml, { xmlMode: true });
    const entries: SitemapEntry[] = [];

    $("url").each((_, element) => {
        const loc = $(element).find("loc").text().trim();
        const lastmod = $(element).find("lastmod").text().trim();

        if (loc && (loc.startsWith("http://") || loc.startsWith("https://"))) {
            entries.push({
                url: loc,
                lastMod: lastmod || undefined,
            });
        }
    });

    return entries;
}

export async function fetchSitemap(seedUrl: string): Promise<SitemapEntry[]> {
    const sitemapUrl = new URL("/sitemap.xml", seedUrl).toString();

    try {
        const res = await fetch(sitemapUrl, {
            headers: { "User-Agent": "DevDocsBot/1.0" },
            signal: AbortSignal.timeout(8_000),
        });
        if (!res.ok) return [];

        const xml = await res.text();
        return parseSitemap(xml);
    } catch {
        return [];
    }
}
