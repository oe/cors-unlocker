import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { createServer } from "node:http";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const source = path.dirname(fileURLToPath(import.meta.url));
const root = path.dirname(source);
const repo = process.env.FORTH_REPO || path.resolve(source, "../../..");
const require = createRequire(
  path.join(repo, "packages/browser-extension/package.json"),
);
const { chromium } = require("@playwright/test");
const design = JSON.parse(
  readFileSync(path.join(source, "design.json"), "utf8"),
);
const mimeTypes = {
  ".html": "text/html",
  ".json": "application/json",
  ".png": "image/png",
  ".ttf": "font/ttf",
  ".otf": "font/otf",
};

const assets = [
  {
    format: "screenshot",
    locale: "en",
    file: "screenshots/en/product-1280x800.png",
  },
  {
    format: "screenshot",
    locale: "zh-CN",
    file: "screenshots/zh-CN/product-1280x800.png",
  },
  { format: "small", locale: "en", file: "promo/product-440x280.png" },
  { format: "marquee", locale: "en", file: "promo/product-1400x560.png" },
];

const server = createServer((request, response) => {
  try {
    const file = path.resolve(
      source,
      "." + new URL(request.url, "http://localhost").pathname,
    );
    if (!file.startsWith(source + path.sep)) throw new Error("Invalid path");
    response.setHeader(
      "Content-Type",
      mimeTypes[path.extname(file)] || "application/octet-stream",
    );
    response.end(readFileSync(file));
  } catch {
    response.statusCode = 404;
    response.end();
  }
});

function checkPng(buffer, width, height) {
  assert.equal(
    buffer.subarray(0, 8).toString("hex"),
    "89504e470d0a1a0a",
    "PNG signature",
  );
  assert.equal(buffer.toString("ascii", 12, 16), "IHDR", "PNG header");
  assert.equal(buffer.readUInt32BE(16), width, "PNG width");
  assert.equal(buffer.readUInt32BE(20), height, "PNG height");
  assert.equal(buffer[24], 8, "8 bits per channel");
  assert.equal(buffer[25], 2, "RGB without alpha");
}

async function load(page, asset) {
  const { width, height } = design.formats[asset.format];
  await page.setViewportSize({ width, height });
  const url = new URL(
    "/layout.html",
    `http://127.0.0.1:${server.address().port}`,
  );
  url.searchParams.set("format", asset.format);
  url.searchParams.set("locale", asset.locale);
  await page.goto(url.href);
  await page.waitForSelector("body[data-ready=true]");
  await page.evaluate(() => document.fonts.ready);
  await page
    .locator("img")
    .evaluateAll((images) => Promise.all(images.map((img) => img.decode())));
  return { width, height };
}

await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
let browser;
try {
  browser = await chromium.launch({
    headless: true,
    executablePath:
      process.env.CHROMIUM_PATH ||
      (existsSync("/usr/bin/chromium") ? "/usr/bin/chromium" : undefined),
  });
  const page = await browser.newPage({ deviceScaleFactor: 1 });
  const preview = await browser.newPage({ deviceScaleFactor: 0.5 });
  const errors = [];
  for (const current of [page, preview])
    current.on("pageerror", (error) => errors.push(error.message));
  mkdirSync(path.join(root, "qa"), { recursive: true });
  const checks = [];

  for (const asset of assets) {
    const { width, height } = await load(page, asset);
    const overflow = await page
      .locator("h1,.brand,.subhead,.platform")
      .evaluateAll((elements) =>
        elements
          .filter((element) => getComputedStyle(element).display !== "none")
          .map((element) => ({
            text: element.textContent,
            rect: element.getBoundingClientRect().toJSON(),
            overflow: element.scrollWidth > element.clientWidth,
          }))
          .filter(
            ({ rect, overflow }) =>
              overflow ||
              rect.left < 0 ||
              rect.top < 0 ||
              rect.right > innerWidth ||
              rect.bottom > innerHeight,
          ),
      );
    assert.deepEqual(overflow, [], "Copy must fit the canvas");
    const geometry = await page.locator(".screen").evaluate((element) => ({
      transform: getComputedStyle(element).transform,
      perspective: getComputedStyle(element).perspective,
      rect: element.getBoundingClientRect().toJSON(),
    }));
    assert.equal(geometry.transform, "none", "Straight-on UI");
    assert.equal(geometry.perspective, "none", "No perspective");
    const rect = geometry.rect;
    assert(
      rect.left >= 0 &&
        rect.top >= 0 &&
        rect.right <= width &&
        rect.bottom <= height,
      "The complete UI window must fit the canvas",
    );
    const png = await page.screenshot({ type: "png", omitBackground: false });
    checkPng(png, width, height);
    const output = path.join(root, asset.file);
    mkdirSync(path.dirname(output), { recursive: true });
    writeFileSync(output, png);
    checks.push({
      file: asset.file,
      width,
      height,
      channels: 3,
      hasAlpha: false,
      overflow,
      geometry,
    });

    await load(preview, asset);
    const half = await preview.screenshot({
      type: "png",
      scale: "device",
      omitBackground: false,
    });
    checkPng(half, width / 2, height / 2);
    writeFileSync(
      path.join(root, "qa", `${asset.format}-${asset.locale}-half.png`),
      half,
    );
  }

  assert.deepEqual(errors, [], "Rendering errors");
  writeFileSync(
    path.join(root, "qa/checks.json"),
    JSON.stringify(checks, null, 2) + "\n",
  );
  console.log(
    `Exported and verified ${checks.length} Chrome Web Store images.`,
  );
} finally {
  await browser?.close();
  server.closeAllConnections();
  await new Promise((resolve) => server.close(resolve));
}
