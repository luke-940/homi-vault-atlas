import { createServer } from "node:http";
import { readFile, stat } from "node:fs/promises";
import { resolve, extname, sep } from "node:path";
const port = Number(process.argv[process.argv.indexOf("--port") + 1]) || 4173;
const root = resolve("dist");
const mime = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".glb": "model/gltf-binary",
  ".webp": "image/webp",
  ".png": "image/png",
  ".woff2": "font/woff2",
  ".txt": "text/plain; charset=utf-8",
};
createServer(async (req, res) => {
  try {
    const pathname = decodeURIComponent(
      new URL(req.url, "http://localhost").pathname,
    );
    const p = resolve(
      root,
      "." + (pathname.endsWith("/") ? pathname + "index.html" : pathname),
    );
    if (!p.startsWith(root + sep)) {
      res.writeHead(403);
      return res.end();
    }
    const s = await stat(p);
    if (!s.isFile()) throw Error("not-file");
    res.writeHead(200, {
      "Content-Type": mime[extname(p)] || "application/octet-stream",
      "Cache-Control": "no-store",
    });
    res.end(await readFile(p));
  } catch {
    res.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" });
    res.end("찾을 수 없는 자료입니다.");
  }
}).listen(port, "127.0.0.1", () =>
  console.log(`Atlas preview http://127.0.0.1:${port}`),
);
