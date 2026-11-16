import { test } from "node:test";
import assert from "node:assert/strict";
import { installErrorHooks, MAX_ERRORS } from "../lib/errors.js";

// A small stand-in for the browser window
function createFakeWindow({ fetchImpl } = {}) {
  const listeners = {};

  class FakeXHR {
    constructor() {
      this.handlers = {};
      this.status = 0;
      this.statusText = "";
      this.responseURL = "";
    }
    open() {}
    send() {}
    addEventListener(type, fn) {
      (this.handlers[type] ||= []).push(fn);
    }
    finish(status, statusText) {
      this.status = status;
      this.statusText = statusText;
      (this.handlers.load || []).forEach((fn) => fn());
    }
    fail() {
      (this.handlers.error || []).forEach((fn) => fn());
    }
  }

  return {
    console: { error: () => {} },
    fetch: fetchImpl ?? (async () => ({ ok: true, status: 200 })),
    XMLHttpRequest: FakeXHR,
    addEventListener: (type, fn) => (listeners[type] ||= []).push(fn),
    dispatch: (type, event) => (listeners[type] || []).forEach((fn) => fn(event))
  };
}

test("records console.error calls and still calls the original", () => {
  const win = createFakeWindow();
  let originalCalled = false;
  win.console.error = () => (originalCalled = true);
  const errors = installErrorHooks(win);

  win.console.error("Boom", { code: 42 });

  assert.equal(originalCalled, true);
  assert.equal(errors[0].type, "CONSOLE_ERROR");
  assert.equal(errors[0].message, 'Boom {"code":42}');
});

test("records Error objects with their stack", () => {
  const win = createFakeWindow();
  const errors = installErrorHooks(win);
  win.console.error(new Error("broken"));
  assert.match(errors[0].message, /Error: broken\n\s+at /);
});

test("records failed fetch responses", async () => {
  const win = createFakeWindow({
    fetchImpl: async () => ({ ok: false, status: 500, statusText: "Server Error", url: "https://api/x" })
  });
  const errors = installErrorHooks(win);
  await win.fetch("https://api/x");
  assert.equal(errors[0].message, "500 Server Error at https://api/x");
});

test("records fetch network failures and rethrows them", async () => {
  const win = createFakeWindow({
    fetchImpl: async () => {
      throw new TypeError("Failed to fetch");
    }
  });
  const errors = installErrorHooks(win);
  await assert.rejects(win.fetch("https://down/x"), /Failed to fetch/);
  assert.equal(errors[0].message, "fetch failed: https://down/x (Failed to fetch)");
});

test("ignores successful fetch responses", async () => {
  const win = createFakeWindow();
  const errors = installErrorHooks(win);
  await win.fetch("https://api/ok");
  assert.equal(errors.length, 0);
});

test("records XHR HTTP errors and network failures", () => {
  const win = createFakeWindow();
  const errors = installErrorHooks(win);

  const notFound = new win.XMLHttpRequest();
  notFound.open("get", "/api/missing");
  notFound.send();
  notFound.finish(404, "Not Found");

  const offline = new win.XMLHttpRequest();
  offline.open("POST", "/api/save");
  offline.send();
  offline.fail();

  const ok = new win.XMLHttpRequest();
  ok.open("GET", "/api/ok");
  ok.send();
  ok.finish(200, "OK");

  assert.deepEqual(
    errors.map((e) => e.message),
    ["404 Not Found at /api/missing (XHR GET)", "XHR POST /api/save failed (network error)"]
  );
});

test("records uncaught errors and unhandled rejections", () => {
  const win = createFakeWindow();
  const errors = installErrorHooks(win);

  win.dispatch("error", { message: "x is undefined", filename: "app.js", lineno: 3, colno: 7 });
  win.dispatch("unhandledrejection", { reason: "nope" });

  assert.equal(errors[0].type, "UNCAUGHT_ERROR");
  assert.equal(errors[0].message, "x is undefined at app.js:3:7");
  assert.equal(errors[1].type, "UNHANDLED_REJECTION");
  assert.equal(errors[1].message, "nope");
});

test("hides secrets inside error messages", () => {
  const win = createFakeWindow();
  const errors = installErrorHooks(win);
  win.console.error("Bad key AKIA" + "IOSFODNN7EXAMPLE");
  assert.equal(errors[0].message, "Bad key [HIDDEN_AWS_KEY]");
});

test(`keeps only the last ${MAX_ERRORS} errors`, () => {
  const win = createFakeWindow();
  const errors = installErrorHooks(win);
  for (let i = 0; i < MAX_ERRORS + 5; i++) win.console.error(`error ${i}`);
  assert.equal(errors.length, MAX_ERRORS);
  assert.equal(errors[0].message, "error 5");
});

test("installing twice does not double-record", () => {
  const win = createFakeWindow();
  installErrorHooks(win);
  const errors = installErrorHooks(win);
  win.console.error("once");
  assert.equal(errors.length, 1);
});
