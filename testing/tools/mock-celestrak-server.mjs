import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import path from "node:path";

const port = Number(process.env.PORT ?? 8787);
const fixturePath = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../fixtures/active.tle");
const tleData = await readFile(fixturePath, "utf8");

const server = createServer((request, response) => {
  const requestUrl = new URL(request.url ?? "/", `http://${request.headers.host ?? "localhost"}`);
  const isCelesTrakEndpoint = requestUrl.pathname === "/NORAD/elements/gp.php";

  response.setHeader("Access-Control-Allow-Origin", "*");
  response.setHeader("Access-Control-Allow-Methods", "GET, OPTIONS");
  response.setHeader("Access-Control-Allow-Headers", "Accept, Content-Type");

  if (request.method === "OPTIONS") {
    response.writeHead(204).end();
    return;
  }

  if (request.method !== "GET" || !isCelesTrakEndpoint) {
    response.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" }).end("Not found\n");
    return;
  }

  response.writeHead(200, {
    "Content-Type": "text/plain; charset=utf-8",
    "Cache-Control": "no-store"
  });
  response.end(tleData);
});

server.listen(port, "0.0.0.0", () => {
  console.log(`Mock CelesTrak server listening on http://localhost:${port}`);
  console.log(`Fixture: ${fixturePath}`);
});