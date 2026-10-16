import test from "node:test";
import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { spawn } from "node:child_process";
import { once } from "node:events";
import { build } from "esbuild";

const chromium = process.env.CHROMIUM_BIN || [
  "/opt/homebrew/bin/chromium",
  "/usr/bin/chromium",
  "/usr/bin/chromium-browser",
  "/usr/bin/google-chrome",
  "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
].find(existsSync);

test("跨日时间范围在宽屏和窄屏上保持原文可读、结果不溢出", {
  skip: chromium && typeof WebSocket !== "undefined" ? false : "Browser layout regression requires Node 22+ and Chromium (CHROMIUM_BIN)",
  timeout: 30_000,
}, async (t) => {
  const profile = await mkdtemp(join(tmpdir(), "time-translator-layout-"));
  const browser = spawn(chromium, [
    "--headless=new", "--no-first-run", "--disable-gpu", "--remote-debugging-port=0",
    `--user-data-dir=${profile}`, "about:blank",
  ], { stdio: "ignore" });
  let socket;
  t.after(async () => {
    socket?.close();
    if (browser.exitCode === null && browser.signalCode === null) {
      const exited = once(browser, "exit");
      browser.kill();
      await exited;
    }
    await rm(profile, { recursive: true, force: true });
  });
  let port;
  for (let attempt = 0; attempt < 80; attempt++) {
    try {
      port = (await readFile(join(profile, "DevToolsActivePort"), "utf8")).split("\n")[0];
      break;
    } catch {
      await new Promise(r => setTimeout(r, 100));
    }
  }
  assert.ok(port, "Chromium must start its debugging endpoint");
  const targets = await (await fetch(`http://127.0.0.1:${port}/json/list`)).json();
  socket = new WebSocket(targets.find(target => target.type === "page").webSocketDebuggerUrl);
  await once(socket, "open");
  const pending = new Map();
  let sequence = 0;
  socket.addEventListener("message", ({ data }) => {
    const response = JSON.parse(data);
    if (!response.id) return;
    const { resolve, reject } = pending.get(response.id);
    pending.delete(response.id);
    response.error ? reject(Error(response.error.message)) : resolve(response.result);
  });
  const send = (method, params = {}) => new Promise((resolve, reject) => {
    const id = ++sequence;
    pending.set(id, { resolve, reject });
    socket.send(JSON.stringify({ id, method, params }));
  });
  const evaluate = async (expression) => {
    const result = await send("Runtime.evaluate", { expression, awaitPromise: true, returnByValue: true });
    assert.equal(result.exceptionDetails, undefined, JSON.stringify(result.exceptionDetails));
    return result.result.value;
  };
  const bundle = await build({
    entryPoints: [resolve(new URL("../src/content.js", import.meta.url).pathname)],
    bundle: true, write: false, format: "iife", loader: { ".woff2": "dataurl" },
  });
  await send("Page.navigate", { url: "data:text/html,<html><body></body></html>" });
  await evaluate(`(() => {
    document.body.style.cssText = 'margin: 24px; padding-top: 350px; font: 18px system-ui';
    document.body.innerHTML = '<div id="time">Oct <var data-var="date">6</var>, <var data-var="time">16:33</var> - <var data-var="time">18:28</var> CEST</div>';
    window.chrome = {
      i18n: {getUILanguage: () => 'en'},
      storage: {
        local: {get: (key, callback) => { const value = key === 'settings' ? {settings:{}} : {}; callback?.(value); return Promise.resolve(value); }},
        onChanged: {addListener: () => {}}
      },
      runtime: {
        id: 'layout-test',
        onMessage: {addListener: listener => window.convertSelection = listener},
        sendMessage: (message, callback) => { window.selectedText = message.text; callback(window.modelResult); }
      }
    };
  })()`);
  await evaluate(bundle.outputFiles[0].text);
  for (const width of [900, 360]) {
    await send("Emulation.setDeviceMetricsOverride", { width, height: 700, deviceScaleFactor: 1, mobile: false });
    for (const displayText of [
      "2026/10/06（周二）22:33–2026/10/07（周三）00:28",
      "Tue, Oct 6, 2026, 22:33 – Wed, Oct 7, 2026, 00:28",
      "Tue, Oct 6, 2026, 22:33",
    ]) {
      await evaluate(`(() => {
        window.modelResult = ${JSON.stringify({ ok: true, displayText, sourceTimeZoneName: "CEST", sourceTimeZone: "UTC+02:00", targetTimeZone: "Asia/Shanghai", relation: "between", assumptions: [] })};
        const range = document.createRange(); range.selectNodeContents(document.querySelector('#time'));
        const selection = getSelection(); selection.removeAllRanges(); selection.addRange(range);
        window.convertSelection({type: 'SHOW_CONVERSION'});
      })()`);
      const layout = await evaluate(`(() => {
        const host = document.querySelector('#time-plain-tooltip-host'), root = host.shadowRoot;
        const card = root.querySelector('.card').getBoundingClientRect();
        const source = root.querySelector('.source'), sourceRect = source.getBoundingClientRect();
        const result = root.querySelector('.result');
        const resultRect = result.getBoundingClientRect();
        return {selected: window.selectedText, source: source.textContent, result: result.textContent, sourceWidth: sourceRect.width, sourceRight: sourceRect.right, cardHeight: card.height, resultRight: resultRect.right, resultLeft: resultRect.left, resultClipped: result.scrollWidth > result.clientWidth + 1 || result.scrollHeight > result.clientHeight + 1, cardRight: card.right, cardLeft: card.left};
      })()`);
      assert.equal(layout.selected, "Oct 6, 16:33 - 18:28 CEST");
      assert.equal(layout.source, layout.selected);
      assert.equal(layout.result, displayText, "full converted range stays visible without truncation");
      assert.equal(layout.resultClipped, false, "converted text must wrap rather than be hidden or ellipsized");
      assert.ok(layout.sourceWidth >= 60, `readable source column at ${width}px: ${JSON.stringify(layout)}`);
      assert.ok(layout.cardHeight < 160, "short time expression must not produce a tall character column");
      assert.ok(layout.resultLeft >= layout.sourceRight + 8, "converted range must not overlap the source column");
      assert.ok(layout.resultRight <= layout.cardRight - 8, "converted range must stay inside the card");
      assert.ok(layout.cardLeft >= 0 && layout.cardRight <= width, "card must stay inside the viewport");
    }
  }
});
