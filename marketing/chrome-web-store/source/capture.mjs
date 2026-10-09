import { createRequire } from "node:module";
import { createServer } from "node:http";
import { existsSync, readFileSync, mkdirSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
const source = path.dirname(fileURLToPath(import.meta.url));
const repo = process.env.FORTH_REPO || path.resolve(source, "../../..");
const require = createRequire(
  path.join(repo, "packages/browser-extension/package.json"),
);
const { chromium } = require("@playwright/test");
const root = path.join(repo, "packages/browser-extension/dist/chrome");
const folder = path.join(source, "captures");
mkdirSync(folder, { recursive: true });
const server = createServer((req, res) => {
  try {
    const file = path.resolve(
      root,
      "." + new URL(req.url, "http://localhost").pathname,
    );
    if (!file.startsWith(root + path.sep)) throw new Error("Invalid path");
    res.setHeader(
      "Content-Type",
      {
        ".html": "text/html",
        ".js": "text/javascript",
        ".css": "text/css",
        ".png": "image/png",
      }[path.extname(file)] || "application/octet-stream",
    );
    res.end(readFileSync(file));
  } catch {
    res.statusCode = 404;
    res.end();
  }
});
await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
const base = `http://127.0.0.1:${server.address().port}`;
let browser;
try {
  browser = await chromium.launch({
    headless: true,
    executablePath:
      process.env.CHROMIUM_PATH ||
      (existsSync("/usr/bin/chromium") ? "/usr/bin/chromium" : undefined),
  });
  const page = await browser.newPage({ viewport: { width: 420, height: 860 } });
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.addInitScript(() => {
    window.__locale = localStorage.getItem("marketing-locale") || "en";
    const events = () => {
      const listeners = new Set();
      return {
        addListener: (fn) => listeners.add(fn),
        removeListener: (fn) => listeners.delete(fn),
        emit: (...args) => listeners.forEach((fn) => fn(...args)),
      };
    };
    const state = {
      schemaVersion: 2,
      settings: {
        advancedModeDefault: false,
        redactSensitiveHeaders: true,
        requestLogLimit: 500,
        dftEnableCredentials: false,
        debugMode: false,
        maxRules: 100,
        autoCleanupDays: 30,
      },
      profiles: [],
      rules: [
        {
          id: "headers",
          name: "Staging headers",
          source: "user",
          enabled: true,
          match: {
            initiatorOrigins: ["https://app.example.com"],
            urlPattern: "https://api.example.com/*",
          },
          actions: [
            {
              type: "setRequestHeaders",
              headers: { "X-Environment": "staging" },
            },
          ],
          createdAt: 1,
          updatedAt: 1,
        },
      ],
      migration: { source: "fresh-install", migratedAt: 1 },
    };
    const zh = window.__locale === "zh-CN";
    const mockBody =
      '{\n  "project": "Forth",\n  "status": "ready",\n  "items": [1, 2, 3]\n}';
    const sampleRule = (id, name, actions, enabled = true) => ({
      id,
      name,
      actions,
      enabled,
      source: "user",
      match: {
        initiatorOrigins: ["https://app.example.com"],
        urlPattern: "https://api.example.com/*",
      },
      createdAt: 1,
      updatedAt: 1,
    });
    state.rules.unshift(
      sampleRule(
        "mock-projects",
        zh ? "项目接口 · 成功响应" : "Project API · success",
        [
          {
            type: "mockResponse",
            status: 200,
            headers: { "Content-Type": "application/json" },
            body: mockBody,
          },
        ],
      ),
    );
    state.rules.push(
      sampleRule(
        "cors-local",
        zh ? "本地开发 · 跨域修复" : "Local dev · CORS",
        [
          {
            type: "cors",
            allowCredentials: false,
            allowOrigin: "*",
            allowMethods: ["GET", "POST", "OPTIONS"],
            allowHeaders: [],
          },
        ],
      ),
    );
    state.rules.push(
      sampleRule(
        "delay-test",
        zh ? "慢网络 · 延迟 1 秒" : "Slow network · 1 second",
        [{ type: "delay", milliseconds: 1000 }],
        false,
      ),
    );
    const slow =
      new URLSearchParams(location.search).get("scenario") === "delay";
    let status = {
      phase: "connected",
      tabId: 17,
      captureEnabled: true,
      quickControls: {
        cors: !slow,
        credentials: false,
        disableCache: !slow,
        delayMs: slow ? 1000 : 0,
        failure: false,
      },
    };
    const data = {
      uiLanguage: window.__locale || "en",
      proxyAppState: state,
      popupPinnedRuleIds: ["headers"],
    };
    const messages = events();
    const changes = events();
    let entries = [];
    const entry = {
      id: "request-1",
      url: "https://api.example.com/projects/123",
      method: "GET",
      resourceType: "Fetch",
      startedAt: Date.now(),
      duration: 120,
      status: 200,
      outcome: "completed",
      matchedRuleIds: ["headers"],
      matchedRules: [{ id: "headers", name: "Staging headers" }],
      diagnostics: [],
      requestHeaders: { Accept: "application/json" },
      responseHeaders: { "Content-Type": "application/json" },
      changes: [{ label: "Request headers", after: "X-Environment: staging" }],
    };
    entries = [
      entry,
      {
        ...entry,
        id: "request-2",
        url: "https://api.example.com/projects",
        method: "POST",
        status: 201,
        duration: 84,
      },
      {
        ...entry,
        id: "request-3",
        url: "https://api.example.com/user",
        duration: 42,
        matchedRuleIds: [],
        matchedRules: [],
        changes: [],
      },
    ];
    window.__fixture = {
      repeat: () => {
        const rule = state.rules.find((r) => r.id === "mock-saved");
        entries = [
          {
            ...entry,
            id: "request-new",
            startedAt: Date.now() + 1,
            matchedRuleIds: ["mock-saved"],
            outcome: "mocked",
            status: 500,
            changes: [
              { label: "Local mock", after: "HTTP 500; server not contacted" },
            ],
          },
          ...entries,
        ];
        messages.emit({
          type: "advancedProxyLogChange",
          payload: { tabId: 17 },
        });
      },
      data,
      state,
    };
    const callback = (fn, ...args) => args.pop()(fn(...args));
    window.chrome = {
      runtime: {
        id: "mock-extension",
        getURL: (p) => `${location.origin}/${p}`,
        onMessage: messages,
        sendMessage: (message, done) => {
          let result;
          if (message.type === "getProxyState") result = state;
          if (message.type === "getAdvancedProxyStatus") result = status;
          if (message.type === "getAdvancedProxyLog")
            result = status.phase === "connected" ? entries : [];
          if (message.type === "enableAdvancedProxy") {
            status = { ...status, phase: "connected", captureEnabled: true };
            result = status;
            queueMicrotask(() =>
              messages.emit({
                type: "advancedProxyStatusChange",
                payload: { tabId: 17 },
              }),
            );
          }
          if (message.type === "disableAdvancedProxy") {
            status = { ...status, phase: "disabled", captureEnabled: false };
            result = status;
          }
          if (message.type === "saveProxyRule") {
            const input = message.payload.rule;
            const rule = {
              ...state.rules.find((r) => r.id === input.id),
              ...input,
              id: input.id || "mock-saved",
              createdAt: Date.now(),
              updatedAt: Date.now(),
            };
            state.rules = [
              ...state.rules.filter((r) => r.id !== rule.id),
              rule,
            ];
            result = { success: true, rule };
          }
          if (message.type === "clearAdvancedProxyLog") {
            entries = [];
            result = true;
          }
          if (message.type === "updateQuickControls") {
            status = {
              ...status,
              quickControls: message.payload.quickControls,
            };
            result = status;
          }
          done(result);
        },
      },
      tabs: {
        get: (...args) =>
          callback(
            () => ({ id: 17, url: "https://app.example.com/dashboard" }),
            ...args,
          ),
        query: (...args) =>
          callback(
            () => [{ id: 17, url: "https://app.example.com/dashboard" }],
            ...args,
          ),
        onUpdated: events(),
        onRemoved: events(),
        onActivated: events(),
      },
      storage: {
        onChanged: changes,
        local: {
          get: (keys, done) => {
            const wanted =
              typeof keys === "string"
                ? [keys]
                : Array.isArray(keys)
                  ? keys
                  : Object.keys(data);
            done(
              Object.fromEntries(
                wanted.filter((k) => k in data).map((k) => [k, data[k]]),
              ),
            );
          },
          set: (values, done) => {
            Object.assign(data, values);
            done?.();
          },
        },
      },
    };
  });

  for (const locale of ["en", "zh-CN"]) {
    await page.goto(`${base}/src/popup/index.html?tabId=17`);
    await page.evaluate(
      (locale) => localStorage.setItem("marketing-locale", locale),
      locale,
    );
    await page.setViewportSize({ width: 360, height: 550 });
    await page.goto(`${base}/src/popup/index.html?tabId=17`);
    await page
      .getByRole("switch", {
        name: locale === "en" ? "CORS repair" : "CORS 修复",
        exact: true,
      })
      .waitFor();
    await page.screenshot({
      animations: "disabled",
      path: `${folder}/popup-${locale}.png`,
      fullPage: true,
    });
    await page.goto(`${base}/src/popup/index.html?tabId=17&scenario=delay`);
    await page
      .getByRole("switch", {
        name: locale === "en" ? "Request delay" : "请求延迟",
        exact: true,
      })
      .waitFor();
    await page.screenshot({
      animations: "disabled",
      path: `${folder}/popup-delay-${locale}.png`,
      fullPage: true,
    });
    await page.setViewportSize({ width: 520, height: 780 });
    await page.goto(`${base}/src/sidepanel/index.html?tabId=17`);
    await page
      .getByRole("button", {
        name: /GET https:\/\/api\.example\.com\/projects\/123/,
      })
      .click();
    await page
      .getByRole("heading", {
        name: locale === "en" ? "Applied changes" : "已应用的修改",
        exact: true,
      })
      .waitFor();
    await page.evaluate(() => window.scrollTo(0, 0));
    await page.screenshot({
      animations: "disabled",
      path: `${folder}/inspector-${locale}.png`,
      fullPage: true,
    });
    await page.setViewportSize({ width: 1120, height: 590 });
    await page.goto(`${base}/src/options/index.html`);

    await page.locator('[data-rule-select="mock-projects"]').click();

    await page
      .getByRole("tab", {
        name: locale === "en" ? "Actions" : "动作",
        exact: true,
      })
      .click();
    const body = page.getByLabel(locale === "en" ? "Response body" : "响应体", {
      exact: true,
    });
    await body.fill(
      '{\n  "project": "Forth",\n  "status": "ready",\n  "items": [1, 2, 3]\n}',
    );
    await body.blur();
    const editor = body.locator("..").locator("..");
    await editor.screenshot({
      animations: "disabled",
      path: `${folder}/json-editor-${locale}.png`,
    });
    const rect = await editor.boundingBox();
    await page.screenshot({
      animations: "disabled",
      path: `${folder}/json-detail-${locale}.png`,
      clip: { x: rect.x, y: rect.y, width: 420, height: 180 },
    });
    await page.screenshot({
      animations: "disabled",
      path: `${folder}/workspace-${locale}.png`,
    });
    await page
      .getByRole("tab", {
        name: locale === "en" ? "Match" : "匹配",
        exact: true,
      })
      .click();
    await page.screenshot({
      animations: "disabled",
      path: `${folder}/matching-${locale}.png`,
    });
    console.log(
      `Captured ${locale}: popup, inspector, mock editor, matching and delay`,
    );
  }
  if (errors.length) throw new Error(errors.join("\n"));
  console.log("CAPTURE OK: current Chrome production UI with sample data.");
} finally {
  await browser?.close();
  server.closeAllConnections();
  await new Promise((resolve) => server.close(resolve));
}
