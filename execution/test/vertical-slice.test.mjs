import assert from "node:assert/strict";
import { pathToFileURL } from "node:url";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { after, describe, test } from "node:test";
import { AppError } from "../src/errors.mjs";
import { automationService } from "../src/service.mjs";
import { sessions } from "../src/session-manager.mjs";
import { createApp, assertLoopbackBind } from "../src/server.mjs";
import { RestClient } from "../src/rest-client.mjs";
import { assertAllowedNavigationUrl } from "../src/runner/chromium.mjs";

const fixtureUrl = pathToFileURL(
  join(dirname(fileURLToPath(import.meta.url)), "fixtures/demo.html"),
).href;

describe("chromium vertical slice", () => {
  after(async () => {
    await sessions.disposeAll();
  });

  test("service loop: session → navigate → inspect → find → type/click → assert → screenshot → release", async () => {
    const session = await automationService.createSession({
      platform: "chromium",
      headless: true,
      clientId: "slice-test",
    });
    assert.equal(session.platform, "chromium");

    const nav = await automationService.navigate(session.id, { url: fixtureUrl });
    assert.match(nav.title, /TrueID Automate Demo/);

    const screen = await automationService.screen(session.id);
    assert.match(screen.tree, /Username|textbox|Sign in/i);

    const userField = await automationService.query(session.id, {
      strategy: "testid",
      value: "login_edittext_username",
      expect: "one",
    });
    assert.equal(userField.count, 1);
    const typedAt = userField.screenRevision;
    await automationService.action(session.id, {
      type: "type",
      ref: userField.matches[0].ref,
      text: "ada",
    });

    // inspect must not invalidate refs by itself — but type already bumped revision
    const afterType = await automationService.getSession(session.id);
    assert.ok(afterType.screenRevision > typedAt);

    const submit = await automationService.query(session.id, {
      strategy: "testid",
      value: "login_button_submit",
      expect: "one",
    });
    await automationService.action(session.id, {
      type: "click",
      ref: submit.matches[0].ref,
    });

    const result = await automationService.query(session.id, {
      strategy: "testid",
      value: "login_label_result",
      expect: "one",
    });
    const inspect = await automationService.screen(session.id);
    assert.equal(inspect.screenRevision, result.screenRevision);
    await automationService.assert(session.id, {
      type: "visible",
      ref: result.matches[0].ref,
    });
    await automationService.assert(session.id, {
      type: "text",
      ref: result.matches[0].ref,
      text: "Welcome, ada",
    });

    const shot = await automationService.screenshot(session.id, { target: "page" });
    assert.equal(shot.contentType, "image/png");
    assert.ok(shot.byteLength > 100);
    assert.ok(shot.data.length > 100);

    await automationService.releaseSession(session.id);
    assert.throws(
      () => automationService.getSession(session.id),
      (err) => err instanceof AppError && err.status === 404,
    );
  });

  test("device lease: second session is rejected until release", async () => {
    const first = await automationService.createSession({
      platform: "chromium",
      clientId: "lease-a",
    });
    await assert.rejects(
      () =>
        automationService.createSession({
          platform: "chromium",
          clientId: "lease-b",
        }),
      (err) => err instanceof AppError && err.status === 409,
    );
    await automationService.releaseSession(first.id);
    const second = await automationService.createSession({
      platform: "chromium",
      clientId: "lease-b",
    });
    await automationService.releaseSession(second.id);
  });

  test("concurrent createSession: only one lease wins", async () => {
    const results = await Promise.allSettled([
      automationService.createSession({ platform: "chromium", clientId: "race-a" }),
      automationService.createSession({ platform: "chromium", clientId: "race-b" }),
      automationService.createSession({ platform: "chromium", clientId: "race-c" }),
    ]);
    const fulfilled = results.filter((r) => r.status === "fulfilled");
    const rejected = results.filter((r) => r.status === "rejected");
    assert.equal(fulfilled.length, 1);
    assert.equal(rejected.length, 2);
    for (const r of rejected) {
      assert.equal(/** @type {AppError} */ (r.reason).status, 409);
    }
    const winner = /** @type {PromiseFulfilledResult<any>} */ (fulfilled[0]).value;
    await automationService.releaseSession(winner.id);
  });

  test("stale ref after mutation returns 409", async () => {
    const session = await automationService.createSession({
      platform: "chromium",
      clientId: "stale",
    });
    await automationService.navigate(session.id, { url: fixtureUrl });
    const found = await automationService.query(session.id, {
      strategy: "testid",
      value: "login_button_submit",
      expect: "one",
    });
    const ref = found.matches[0].ref;
    await automationService.action(session.id, { type: "click", ref });
    await assert.rejects(
      () => automationService.action(session.id, { type: "click", ref }),
      (err) => err instanceof AppError && err.code === "stale_ref",
    );
    await automationService.releaseSession(session.id);
  });

  test("file URL outside fixtures is rejected; fixture file URL allowed", () => {
    assert.equal(assertAllowedNavigationUrl(fixtureUrl), fixtureUrl);
    assert.throws(
      () => assertAllowedNavigationUrl("file:///etc/passwd"),
      (err) => err instanceof AppError && err.status === 400,
    );
  });

  test("non-loopback bind refused without opt-in", () => {
    assert.throws(
      () => assertLoopbackBind("0.0.0.0"),
      (err) => err instanceof AppError,
    );
    assert.doesNotThrow(() => assertLoopbackBind("127.0.0.1"));
  });

  test("unsupported platform and capability stay explicit", async () => {
    await assert.rejects(
      () => automationService.createSession({ platform: "ios" }),
      (err) => err instanceof AppError && err.status === 400,
    );
    const caps = automationService.capabilities("ios");
    assert.equal(caps.found, true);
    assert.equal(caps.actions["*"].support, "unsupported");
  });

  test("HTTP app + RestClient (MCP path) share the same lease domain", async () => {
    const app = createApp();
    const base = "http://automate.local";
    /** @type {typeof fetch} */
    const fetchImpl = async (input, init) => {
      const url = typeof input === "string" ? input : input.url;
      const path = url.replace(base, "");
      return app.request(path, init);
    };
    const previousFetch = globalThis.fetch;
    globalThis.fetch = fetchImpl;

    try {
      const api = new RestClient(base);
      const session = await api.request("/v1/sessions", {
        method: "POST",
        body: { platform: "chromium", clientId: "mcp-http" },
      });
      assert.ok(session.id);

      await assert.rejects(
        () =>
          api.request("/v1/sessions", {
            method: "POST",
            body: { platform: "chromium", clientId: "mcp-http-2" },
          }),
        (err) => err instanceof AppError && err.status === 409,
      );

      await api.request(`/v1/sessions/${session.id}/navigate`, {
        method: "POST",
        body: { url: fixtureUrl },
      });
      const found = await api.request(`/v1/sessions/${session.id}/elements/query`, {
        method: "POST",
        body: {
          strategy: "role",
          role: "button",
          value: "Sign in",
          expect: "one",
        },
      });
      assert.equal(found.count, 1);

      await api.request(`/v1/sessions/${session.id}`, { method: "DELETE" });
    } finally {
      globalThis.fetch = previousFetch;
    }
  });
});
