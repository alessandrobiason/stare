import { spawnSync } from "node:child_process";
import { chmodSync, mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";

const checker = resolve("tools/ci/check-screenshots.mjs");
let directory: string;
function put(path: string, data: string | Buffer) {
  const file = join(directory, path);
  mkdirSync(dirname(file), { recursive: true });
  writeFileSync(file, data);
}
function png(width: number, height: number): Buffer {
  const data = Buffer.alloc(33);
  Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]).copy(data);
  data.write("IHDR", 12);
  data.writeUInt32BE(width, 16);
  data.writeUInt32BE(height, 20);
  return data;
}
function check() { return spawnSync(process.execPath, [checker], { cwd: directory, encoding: "utf8" }); }

beforeEach(() => {
  directory = mkdtempSync(join(tmpdir(), "stare-screenshots-"));
  put("testing/screenshots/scenes.ts", 'export const SHOT_SCENES = [{ id: "02-tap" }];');
  for (const locale of ["en", "it"]) {
    put(`src/i18n/strings/${locale}.ts`, "");
    put(`tools/screenshots/.capture/${locale}/02-tap.png`, png(1090, Math.round(932 * 1090 / 430)));
    for (const [width, height] of [[1206, 2622], [1179, 2556]]) {
      put(`docs/app-store/${width}x${height}/${locale}/02-tap.png`, png(width, height));
    }
  }
});
afterEach(() => rmSync(directory, { recursive: true, force: true }));

test("accepts the complete captured and composed listing", () => {
  const result = check();
  expect(result.status).toBe(0);
  expect(result.stdout).toContain("Verified 4 App Store frames");
});

test("blocks a renderer fallback when an app capture is missing", () => {
  rmSync(join(directory, "tools/screenshots/.capture/it/02-tap.png"));
  expect(check().status).not.toBe(0);
});

test("blocks the wrong App Store dimensions and incomplete language sets", () => {
  put("docs/app-store/1179x2556/it/02-tap.png", png(1206, 2622));
  const result = check();
  expect(result.status).not.toBe(0);
  expect(result.stderr).toContain("1179 × 2556");
  rmSync(join(directory, "docs/app-store/1179x2556/it/02-tap.png"));
  expect(check().status).not.toBe(0);
});

// The convenience command may request publishing, but must never execute it locally.
test("the OTA convenience command dispatches the gated workflow with literal arguments", () => {
  put("bin/git", '#!/bin/sh\nif [ "$1" = symbolic-ref ]; then echo main; fi\n');
  put("bin/gh", '#!/bin/sh\nprintf "%s\\n" "$@" > "$STARE_TEST_REQUEST"\n');
  chmodSync(join(directory, "bin/git"), 0o755);
  chmodSync(join(directory, "bin/gh"), 0o755);
  const request = join(directory, "request.txt");
  const message = 'A fix with "quotes" and $(literal)';
  const result = spawnSync("bash", [resolve("tools/ota-update.sh"), message], {
    encoding: "utf8",
    env: { ...process.env, PATH: `${join(directory, "bin")}:${process.env.PATH}`, STARE_TEST_REQUEST: request }
  });
  expect(result.status).toBe(0);
  expect(readFileSync(request, "utf8").trim().split("\n")).toEqual([
    "workflow", "run", "pipeline.yml", "--ref", "main", "-f", "operation=ota",
    "-f", "ota_branch=production", "-f", `message=${message}`
  ]);
});
