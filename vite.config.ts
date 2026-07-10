import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import fs from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import http from "node:http";

const __dirname = dirname(fileURLToPath(import.meta.url));

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [
    react(),
    {
      name: "serve-dashboard-and-api",
      configureServer(server) {
        server.middlewares.use((req, res, next) => {
          // Serve the dashboard HTML directly (before SPA fallback)
          if (req.url === "/dashboard" || req.url === "/dashboard/") {
            const filePath = resolve(__dirname, "public", "dashboard", "index.html");
            const html = fs.readFileSync(filePath, "utf-8");
            res.setHeader("Content-Type", "text/html; charset=utf-8");
            res.statusCode = 200;
            res.end(html);
            return;
          }

          // Proxy /api requests to Express (handles direct browser
          // navigations like resume/cover-letter downloads that the
          // SPA history fallback would otherwise intercept).
          if (req.url?.startsWith("/api")) {
            const proxyReq = http.request(
              {
                hostname: "localhost",
                port: 3001,
                path: req.url,
                method: req.method,
                headers: req.headers,
              },
              (proxyRes) => {
                res.writeHead(proxyRes.statusCode || 200, proxyRes.headers);
                proxyRes.pipe(res, { end: true });
              }
            );
            proxyReq.on("error", () => {
              res.statusCode = 502;
              res.end("Backend server unavailable");
            });
            req.pipe(proxyReq, { end: true });
            return;
          }

          next();
        });
      },
    },
  ],
});

