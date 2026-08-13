import request from "supertest";
import { createSearchApp } from "../search-api.ts";
import type { Document } from "../src/indexer/document.ts";

describe("Search API Supertest", () => {
    it("should respond with HTML UI on / and JSON search results on /search", async () => {
        const docs: Document[] = [
            {
                id: "doc-1",
                url: "http://example.com/react",
                title: "React useState Guide",
                text: "Learn how to use the useState hook in React components.",
            },
        ];

        const app = createSearchApp(docs);

        // 1. Test GET / HTML UI endpoint
        const uiRes = await request(app).get("/").expect(200);
        expect(uiRes.text).toContain("<title>Search</title>");

        // 2. Test GET /search JSON endpoint with BM25
        const searchRes = await request(app)
            .get("/search?q=useState&mode=BM25")
            .expect(200)
            .expect("Content-Type", /json/);

        expect(searchRes.body.q).toBe("useState");
        expect(searchRes.body.mode).toBe("BM25");
        expect(searchRes.body.count).toBe(1);
        expect(searchRes.body.results[0].title).toBe("React useState Guide");
        expect(searchRes.body.results[0].snippet).toContain("<mark>useState</mark>");

        // 3. Test 404 handler
        await request(app).get("/unknown-route").expect(404);
    });
});
