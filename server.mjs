import http from "node:http";
import {readFile} from "node:fs/promises";
import path from "node:path";
import {pathToFileURL} from "node:url";

const SITE = "crawler-test-site";
const TYPES = {".html": "text/html", ".txt": "text/plain"};

export function createTestServer() {
    return http.createServer(async (req, res) => {
        const url = new URL(req.url, `http://${req.headers.host}`);

        if (url.pathname === "/slow") {
            await new Promise(resolve => setTimeout(resolve, Number(process.env.SLOW_MS ?? 15_000)));
            res.end("<html><body>Slow page</body></html>");
            return;
        }

        const name = url.pathname === "/" ? "/index.html" : url.pathname;
        const ext = path.extname(name);
        res.setHeader("content-type", TYPES[ext] ?? "application/octet-stream");
        try {
            res.end(await readFile(path.join(SITE, name)));
        } catch {
            res.statusCode = 404;
            res.end("Not found");
        }
    });
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
    createTestServer().listen(3000, () => console.log("serving on http://localhost:3000"));
}
