import { defineConfig, type Plugin } from "vite";
import react from "@vitejs/plugin-react";
import searchHandler from "./api/search.ts";
import healthHandler from "./api/healthCheck.ts";

function searchApiPlugin(): Plugin {
  return {
    name: "search-api",
    configureServer(server) {
      server.middlewares.use(async (req, res, next) => {
        const url = new URL(req.url || "", `http://${req.headers.host || "localhost"}`);

        if (url.pathname === "/health" || url.pathname === "/api/health" || url.pathname === "/api/healthCheck") {
          const customReq: any = req;
          const customRes: any = res;
          customRes.status = (code: number) => {
            res.statusCode = code;
            return customRes;
          };
          customRes.json = (data: any) => {
            res.setHeader("Content-Type", "application/json");
            res.end(JSON.stringify(data));
            return customRes;
          };
          try {
            await healthHandler(customReq, customRes);
          } catch (err) {
            res.statusCode = 500;
            res.setHeader("Content-Type", "application/json");
            res.end(JSON.stringify({ status: "unhealthy", error: String(err) }));
          }
          return;
        }

        if (url.pathname === "/search" || url.pathname === "/api/search") {
          const query: Record<string, string> = {};
          url.searchParams.forEach((val, key) => {
            query[key] = val;
          });
          const customReq: any = req;
          customReq.query = query;

          const customRes: any = res;
          customRes.status = (code: number) => {
            res.statusCode = code;
            return customRes;
          };
          customRes.json = (data: any) => {
            res.setHeader("Content-Type", "application/json");
            res.end(JSON.stringify(data));
            return customRes;
          };

          try {
            await searchHandler(customReq, customRes);
          } catch (err) {
            console.error("API handler error:", err);
            res.statusCode = 500;
            res.setHeader("Content-Type", "application/json");
            res.end(JSON.stringify({ error: "Internal Server Error" }));
          }
          return;
        }
        next();
      });
    },
  };
}

export default defineConfig({
  plugins: [react(), searchApiPlugin()],
  server: {
    port: 3000,
  },
});
