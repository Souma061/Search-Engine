import { test } from "node:test";
import assert from "node:assert/strict";
import { createSearchHandler, type SearchDatabase } from "../api/search.ts";
import { createHealthHandler, type HealthDatabase } from "../api/healthCheck.ts";

// Hermetic mock database — tests never touch the real Turso instance.
const mockDb: SearchDatabase = {
    execute: async (statement: string | { sql: string }) => {
        const sql = typeof statement === "string" ? statement : statement.sql;
        if (sql.includes("docs_vocab") || sql.includes("GROUP BY category")) {
            return { rows: [] } as any;
        }
        return {
            rows: [
                {
                    id: "https://react.dev/reference/react",
                    url: "https://react.dev/reference/react",
                    title: "React Reference",
                    text: "react components let you build user interfaces with state and hooks",
                    category: "React",
                },
            ],
        } as any;
    },
};

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

    await createSearchHandler(mockDb)(req, res);

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
        // regression: unescaped regex metacharacters used to throw in generateSnippet
        'c++',
        'node.js',
    ];

    for (const q of dangerousQueries) {
        const req: any = {
            query: { q },
            headers: {},
            socket: { remoteAddress: `10.0.0.${Math.floor(Math.random() * 200)}` },
        };
        const res = createMockRes();

        await createSearchHandler(mockDb)(req, res);

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

    await createSearchHandler(mockDb)(req, res);

    assert.equal(res.getStatus(), 200);
    assert.equal(res.getBody().page, 1); // clamped to min 1
    assert.equal(res.getBody().limit, 50); // clamped to max 50
});

test("Error Handling: Rate limiter triggers 429 on abuse", async () => {
    const testIp = "192.168.99.99";
    let hitRateLimit = false;

    // Fire 65 requests rapidly from same IP with fresh request objects
    for (let i = 0; i < 65; i++) {
        const req: any = {
            query: { q: "" },
            headers: { "x-forwarded-for": testIp },
            socket: { remoteAddress: testIp },
        };
        const res = createMockRes();
        await createSearchHandler(mockDb)(req, res);
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
    const healthDb: HealthDatabase = {
        execute: async () => ({ rows: [{ count: 42 }] } as any),
    };
    const req: any = {};
    const res = createMockRes();

    await createHealthHandler(healthDb)(req, res);

    const status = res.getStatus();
    const body = res.getBody();

    assert.equal(status, 200);
    assert.equal(body.status, "healthy");
    assert.equal(body.documentIndexed, 42);
    assert.ok(body.timestamp);
});
