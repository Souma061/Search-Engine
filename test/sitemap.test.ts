import { test } from "node:test";
import assert from "node:assert/strict";
import { parseSitemap } from "../src/crawler/sitemap.ts";

test("parseSitemap extracts loc URLs and lastmod timestamps from XML", () => {
    const xml = `<?xml version="1.0" encoding="UTF-8"?>
    <urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
        <url>
            <loc>https://react.dev/reference/react/useState</loc>
            <lastmod>2026-08-10T12:00:00Z</lastmod>
        </url>
        <url>
            <loc>https://react.dev/reference/react/useMemo</loc>
            <lastmod>2026-08-12T14:30:00Z</lastmod>
        </url>
    </urlset>`;

    const entries = parseSitemap(xml);

    assert.equal(entries.length, 2);
    assert.equal(entries[0].url, "https://react.dev/reference/react/useState");
    assert.equal(entries[0].lastMod, "2026-08-10T12:00:00Z");

    assert.equal(entries[1].url, "https://react.dev/reference/react/useMemo");
    assert.equal(entries[1].lastMod, "2026-08-12T14:30:00Z");
});
