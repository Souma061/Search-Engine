import { test } from "node:test";
import assert from "node:assert/strict";
import { parsePage } from "../src/crawler/parser.ts";

test("parsePage extracts links before stripping nav", () => {
    const html = `
        <!DOCTYPE html>
        <html>
        <head>
            <title>Test Page</title>
            <style>body { color: red; }</style>
        </head>
        <body>
            <header>
                <nav>
                    <a href="/docs/intro">Intro Link</a>
                </nav>
            </header>
            <main>
                <h1>Main Content Title</h1>
                <p>This is the actual documentation content for useState.</p>
            </main>
            <footer>
                <p>Copyright 2026</p>
                <a href="/privacy">Privacy</a>
            </footer>
            <script>console.log("analytics");</script>
        </body>
        </html>
    `;

    const result = parsePage(html, "http://localhost:3000");

    // Title extracted
    assert.equal(result.title, "Test Page");

    // Both nav and footer links extracted for crawler discovery
    assert.deepStrictEqual(result.links, [
        "http://localhost:3000/docs/intro",
        "http://localhost:3000/privacy",
    ]);

    // Noise elements stripped from body text
    assert.ok(!result.text.includes("color: red")); // CSS stripped
    assert.ok(!result.text.includes("analytics")); // JS script stripped
    assert.ok(!result.text.includes("Intro Link")); // Header nav text stripped
    assert.ok(!result.text.includes("Copyright 2026")); // Footer text stripped

    // Main content preserved
    assert.ok(result.text.includes("This is the actual documentation content for useState."));
});
