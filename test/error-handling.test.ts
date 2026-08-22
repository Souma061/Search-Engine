import { test } from "node:test";
import assert from "node:assert/strict";
import searchHandler from "../api/search.ts";
import healthHandler from "../api/healthCheck.ts";

function createMockRes() {
    let statusCode = 200;
    let jsonBody: any = null;
    const headers: Record<string, string> = {};

    const res: any = {
        setHeader: (name: string, value: string) => {
            headers[name.toLowerCase()] = value;
            return res;
        },
        status: (code: number) => {
            statusCode = code;
            return res;
        },
        json: (data: any) => {
            jsonBody = data;
            return res;
        },
        getStatus: () => statusCode,
        getBody: () => jsonBody,
        getHeaders: () => headers,
    };
    return res;
}

test("Error Handling: Query exceeding max length returns 400", async () => {
    const longQuery = "a".repeat(250);
    const req: any = {
        query: { q: longQuery },
        headers: {},
        socket: { remoteAddress: "192.168.1.1" },
    };
    const res = createMockRes();

    await searchHandler(req, res);

    assert.equal(res.getStatus(), 400);
    assert.match(res.getBody().error, /Query too long/);
});

test("Error Handling: Special FTS5 characters do not crash query engine", async () => {
    const dangerousQueries = [
        '"""',
        'react AND OR NOT',
        '(((((())))))',
        'SELECT * FROM documents;',
        '../../../etc/passwd',
    ];

    for (const q of dangerousQueries) {
        const req: any = {
            query: { q },
            headers: {},
            socket: { remoteAddress: `10.0.0.${Math.floor(Math.random() * 200)}` },
        };
        const res = createMockRes();

        await searchHandler(req, res);

        // Should return 200 with safe results, not 500 error
        assert.equal(res.getStatus(), 200);
        assert.ok(Array.isArray(res.getBody().results));
    }
});

test("Error Handling: Invalid pagination values are safely sanitized", async () => {
    const req: any = {
        query: { q: "react", page: "-5", limit: "99999" },
        headers: {},
        socket: { remoteAddress: "10.0.1.1" },
    };
    const res = createMockRes();

    await searchHandler(req, res);

    assert.equal(res.getStatus(), 200);
    assert.equal(res.getBody().page, 1); // clamped to min 1
    assert.equal(res.getBody().limit, 50); // clamped to max 50
});

test("Error Handling: Rate limiter triggers 429 on abuse", async () => {
    const testIp = "192.168.99.99";
    const req: any = {
        query: { q: "" },
        headers: {},
        socket: { remoteAddress: testIp },
    };

    let hitRateLimit = false;

    // Fire 65 requests rapidly from same IP
    for (let i = 0; i < 65; i++) {
        const res = createMockRes();
        await searchHandler(req, res);
        if (res.getStatus() === 429) {
            hitRateLimit = true;
            assert.ok(res.getHeaders()["retry-after"]);
            assert.match(res.getBody().error, /Too many requests/);
            break;
        }
    }

    assert.ok(hitRateLimit, "Expected rate limit (429) to trigger after 60 requests");
});

test("Error Handling: Health check handles request and reports status", async () => {
    const req: any = {};
    const res = createMockRes();

    await healthHandler(req, res);

    const status = res.getStatus();
    const body = res.getBody();

    assert.ok(status === 200 || status === 503);
    assert.ok(body.status === "healthy" || body.status === "unhealthy");
    assert.ok(body.timestamp);
});
