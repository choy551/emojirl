import { defineConfig, type Plugin } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import type { IncomingMessage, ServerResponse } from "node:http";
import path from "path";

function readBody(req: IncomingMessage): Promise<Uint8Array> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    req.on("data", (chunk: Buffer) => chunks.push(Buffer.from(chunk)));
    req.on("end", () => resolve(new Uint8Array(Buffer.concat(chunks))));
    req.on("error", reject);
  });
}

/** Serves the same city-share handlers as the Vercel `/api` routes during `pnpm dev`. */
function cityShareDevApi(): Plugin {
  return {
    name: "city-share-dev-api",
    configureServer(server) {
      server.middlewares.use(async (req: IncomingMessage, res: ServerResponse, next: () => void) => {
        const pathOnly = req.url?.split("?")[0] ?? "";
        if (pathOnly !== "/api/share-status" && pathOnly !== "/api/cities" && !pathOnly.startsWith("/api/cities/")) {
          next();
          return;
        }
        try {
          const mod = await server.ssrLoadModule("/src/server/cityShareHttp.ts") as {
            handleCityShare: (request: Request) => Promise<Response>;
          };
          const method = req.method ?? "GET";
          const headers = new Headers();
          for (const [key, value] of Object.entries(req.headers)) {
            if (typeof value === "string") headers.set(key, value);
            else if (Array.isArray(value)) headers.set(key, value.join(", "));
          }
          const body = method === "GET" || method === "HEAD" ? undefined : await readBody(req);
          const request = new Request(new URL(req.url ?? pathOnly, `http://${req.headers.host ?? "127.0.0.1"}`), {
            method,
            headers,
            body: body && body.byteLength > 0 ? body : undefined,
          });
          const response = await mod.handleCityShare(request);
          res.statusCode = response.status;
          response.headers.forEach((value, key) => {
            if (key !== "content-encoding") res.setHeader(key, value);
          });
          res.end(Buffer.from(await response.arrayBuffer()));
        } catch (err) {
          console.error("city share dev api failed", err instanceof Error ? err.name : "error");
          res.statusCode = 503;
          res.setHeader("content-type", "application/json");
          res.end(JSON.stringify({ online: false, error: "online features unavailable" }));
        }
      });
    },
  };
}

export default defineConfig({
  plugins: [
    react(),
    tailwindcss(),
    cityShareDevApi(),
  ],
  ssr: {
    external: ["@neondatabase/serverless"],
  },
  resolve: {
    alias: {
      "@": path.resolve(import.meta.dirname, "src"),
    },
    dedupe: ["react", "react-dom"],
  },
});
