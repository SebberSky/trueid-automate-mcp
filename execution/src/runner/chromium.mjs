import { realpathSync } from "node:fs";
import { dirname, join, sep } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { chromium } from "playwright";
import {
  assertionFailed,
  invalid,
  notFound,
  staleRef,
} from "../errors.mjs";

/**
 * @typedef {{
 *   strategy: 'role' | 'name' | 'text' | 'css' | 'testid',
 *   value: string,
 *   role?: string,
 *   expect?: 'any' | 'one'
 * }} ElementQuery
 */

const FIXTURES_ROOT = realpathSync(
  join(dirname(fileURLToPath(import.meta.url)), "../../test/fixtures"),
);

/**
 * @param {string} url
 * @returns {string}
 */
export function assertAllowedNavigationUrl(url) {
  let parsed;
  try {
    parsed = new URL(url);
  } catch {
    throw invalid("url must be an absolute URL.", { url });
  }

  if (parsed.protocol === "http:" || parsed.protocol === "https:") {
    return parsed.href;
  }

  if (parsed.protocol === "file:") {
    let targetPath;
    try {
      targetPath = realpathSync(fileURLToPath(parsed));
    } catch {
      throw invalid("file URL path does not exist or is not readable.", { url });
    }
    const rootWithSep = FIXTURES_ROOT.endsWith(sep)
      ? FIXTURES_ROOT
      : FIXTURES_ROOT + sep;
    if (targetPath !== FIXTURES_ROOT && !targetPath.startsWith(rootWithSep)) {
      throw invalid(
        "file URLs are limited to execution/test/fixtures in v1.",
        { url, allowedRoot: FIXTURES_ROOT },
      );
    }
    return pathToFileURL(targetPath).href;
  }

  throw invalid("Only http(s) and allowlisted file fixture URLs are allowed in v1.", {
    url,
  });
}

export class ChromiumRunner {
  /** @param {{ headless?: boolean, onDisconnected?: () => void }} [options] */
  constructor(options = {}) {
    this.headless = options.headless !== false;
    this.onDisconnected = options.onDisconnected;
    /** @type {import('playwright').Browser | null} */
    this.browser = null;
    /** @type {import('playwright').BrowserContext | null} */
    this.context = null;
    /** @type {import('playwright').Page | null} */
    this.page = null;
    this.screenRevision = 0;
    /** @type {Map<string, { locator: import('playwright').Locator, revision: number, label: string }>} */
    this.refs = new Map();
    this.refSeq = 0;
    this.closed = false;
  }

  async start() {
    this.browser = await chromium.launch({ headless: this.headless });
    this.browser.on("disconnected", () => {
      this.closed = true;
      this.page = null;
      this.context = null;
      this.browser = null;
      if (this.onDisconnected) {
        this.onDisconnected();
      }
    });
    this.context = await this.browser.newContext();
    this.page = await this.context.newPage();
  }

  async stop() {
    this.refs.clear();
    this.closed = true;
    const browser = this.browser;
    this.page = null;
    this.context = null;
    this.browser = null;
    if (browser?.isConnected()) {
      await browser.close().catch(() => {});
    }
  }

  /** @returns {import('playwright').Page} */
  requirePage() {
    if (!this.page || this.closed) {
      throw notFound("Session browser page is not available.");
    }
    return this.page;
  }

  /** @param {string} url */
  async navigate(url) {
    const page = this.requirePage();
    const safeUrl = assertAllowedNavigationUrl(url);
    await page.goto(safeUrl, { waitUntil: "domcontentloaded" });
    this.bumpRevision();
    return {
      url: page.url(),
      title: await page.title(),
      screenRevision: this.screenRevision,
    };
  }

  async inspect() {
    const page = this.requirePage();
    const snapshot = await page.locator("body").ariaSnapshot();
    return {
      url: page.url(),
      title: await page.title(),
      screenRevision: this.screenRevision,
      tree: snapshot,
      format: "aria-snapshot",
    };
  }

  /**
   * @param {ElementQuery} query
   */
  async query(query) {
    const page = this.requirePage();
    const locator = this.buildLocator(page, query);
    const count = await locator.count();
    if (query.expect === "one" && count !== 1) {
      throw invalid(
        `Expected exactly one match, found ${count}.`,
        { strategy: query.strategy, value: query.value, count },
        422,
      );
    }
    /** @type {Array<{ ref: string, label: string, index: number }>} */
    const matches = [];
    for (let i = 0; i < count; i += 1) {
      const item = locator.nth(i);
      const ref = `el_${++this.refSeq}`;
      const label = await describeLocator(item);
      this.refs.set(ref, {
        locator: item,
        revision: this.screenRevision,
        label,
      });
      matches.push({ ref, label, index: i });
    }
    return {
      screenRevision: this.screenRevision,
      count,
      matches,
    };
  }

  /**
   * @param {{ type: 'click' | 'type', ref?: string, text?: string, clear?: boolean }} action
   */
  async action(action) {
    if (action.type === "click") {
      const entry = this.resolveRef(action.ref);
      await entry.locator.click({ timeout: 5_000 });
      this.bumpRevision();
      return { ok: true, type: "click", screenRevision: this.screenRevision };
    }
    if (action.type === "type") {
      if (typeof action.text !== "string") {
        throw invalid("type action requires text.");
      }
      const entry = this.resolveRef(action.ref);
      if (action.clear !== false) {
        await entry.locator.fill(action.text, { timeout: 5_000 });
      } else {
        await entry.locator.pressSequentially(action.text, { timeout: 5_000 });
      }
      this.bumpRevision();
      return { ok: true, type: "type", screenRevision: this.screenRevision };
    }
    throw invalid(`Unknown action type: ${action.type}`);
  }

  /**
   * @param {{ type: 'visible' | 'text', ref?: string, text?: string }} assert
   */
  async assert(assert) {
    if (assert.type === "visible") {
      const entry = this.resolveRef(assert.ref);
      const visible = await entry.locator.isVisible();
      if (!visible) {
        throw assertionFailed(`Element ${assert.ref} is not visible.`, {
          ref: assert.ref,
          label: entry.label,
        });
      }
      return { ok: true, type: "visible", ref: assert.ref };
    }
    if (assert.type === "text") {
      const entry = this.resolveRef(assert.ref);
      const actual = ((await entry.locator.textContent()) ?? "").trim();
      const expected = (assert.text ?? "").trim();
      if (actual !== expected) {
        throw assertionFailed("Text assertion failed.", {
          ref: assert.ref,
          expected,
          actual,
        });
      }
      return { ok: true, type: "text", ref: assert.ref, text: actual };
    }
    throw invalid(`Unknown assert type: ${assert.type}`);
  }

  /**
   * @param {{ target?: 'page' | 'element', ref?: string }} options
   */
  async screenshot(options = {}) {
    const page = this.requirePage();
    const target = options.target ?? "page";
    let buffer;
    if (target === "page") {
      buffer = await page.screenshot({ type: "png", fullPage: false });
    } else if (target === "element") {
      const entry = this.resolveRef(options.ref);
      buffer = await entry.locator.screenshot({ type: "png" });
    } else {
      throw invalid(`Unknown screenshot target: ${target}`);
    }
    return {
      contentType: "image/png",
      encoding: "base64",
      data: buffer.toString("base64"),
      byteLength: buffer.byteLength,
      target,
    };
  }

  bumpRevision() {
    this.screenRevision += 1;
  }

  /** @param {string | undefined} ref */
  resolveRef(ref) {
    if (!ref) {
      throw invalid("ref is required.");
    }
    const entry = this.refs.get(ref);
    if (!entry) {
      throw notFound(`Unknown element ref: ${ref}`, { ref });
    }
    if (entry.revision !== this.screenRevision) {
      throw staleRef(ref, this.screenRevision);
    }
    return entry;
  }

  /**
   * @param {import('playwright').Page} page
   * @param {ElementQuery} query
   */
  buildLocator(page, query) {
    switch (query.strategy) {
      case "role": {
        const role = query.role ?? query.value;
        if (query.role) {
          return page.getByRole(/** @type {import('playwright').ARIARole} */ (role), {
            name: query.value,
          });
        }
        return page.getByRole(/** @type {import('playwright').ARIARole} */ (role));
      }
      case "name":
        return page.getByRole("button", { name: query.value }).or(
          page.getByRole("link", { name: query.value }),
        ).or(page.getByLabel(query.value));
      case "text":
        return page.getByText(query.value, { exact: true });
      case "css":
        return page.locator(query.value);
      case "testid":
        return page.getByTestId(query.value);
      default:
        throw invalid(`Unknown strategy: ${query.strategy}`);
    }
  }
}

/** @param {import('playwright').Locator} locator */
async function describeLocator(locator) {
  try {
    const text = ((await locator.innerText({ timeout: 500 })) ?? "").trim();
    if (text) {
      return text.slice(0, 80);
    }
  } catch {
    // fall through
  }
  try {
    const testId = await locator.getAttribute("data-testid");
    if (testId) {
      return `testid:${testId}`;
    }
  } catch {
    // fall through
  }
  return "element";
}
