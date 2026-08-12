import { test } from "node:test";
import assert from "node:assert/strict";
import { URLFrontier } from "../src/crawler/url-frontier.ts";

test("add dedupes and size counts unique URLs", () => {
    const frontier = new URLFrontier();
    assert.ok(frontier.add("https://example.com"));
    assert.ok(frontier.add("https://example.com/about"));
    assert.ok(!frontier.add("https://example.com")); // duplicate
    assert.equal(frontier.size, 2);
});

test("has reports scheduled URLs", () => {
    const frontier = new URLFrontier();
    frontier.add("https://example.com");
    assert.ok(frontier.has("https://example.com"));
    assert.ok(!frontier.has("https://example.org"));
});

test("add treats root with/without trailing slash as the same", () => {
    const frontier = new URLFrontier();
    assert.ok(frontier.add("https://example.com"));
    assert.ok(!frontier.add("https://example.com/"));
    assert.equal(frontier.size, 1);
});
