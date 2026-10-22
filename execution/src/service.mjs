import { assertSupported, getCapabilities } from "./capability-registry.mjs";
import { sessions } from "./session-manager.mjs";

export const automationService = {
  health() {
    return {
      ok: true,
      slice: "chromium-v1",
      time: new Date().toISOString(),
    };
  },

  capabilities(platform) {
    return getCapabilities(platform);
  },

  devices() {
    return { devices: sessions.listDevices() };
  },

  /** @param {{ platform: string, headless?: boolean, clientId?: string }} body */
  createSession(body) {
    return sessions.createSession(body);
  },

  /** @param {string} sessionId */
  getSession(sessionId) {
    return sessions.getPublicSession(sessionId);
  },

  /** @param {string} sessionId */
  releaseSession(sessionId) {
    return sessions.releaseSession(sessionId);
  },

  /**
   * @param {string} sessionId
   * @param {{ url: string }} body
   */
  async navigate(sessionId, body) {
    const session = sessions.getSession(sessionId);
    assertSupported(session.platform, "navigate");
    return session.runner.navigate(body.url);
  },

  /** @param {string} sessionId */
  async screen(sessionId) {
    const session = sessions.getSession(sessionId);
    assertSupported(session.platform, "screen.inspect");
    return session.runner.inspect();
  },

  /**
   * @param {string} sessionId
   * @param {import('./runner/chromium.mjs').ElementQuery} body
   */
  async query(sessionId, body) {
    const session = sessions.getSession(sessionId);
    assertSupported(session.platform, "element.query");
    return session.runner.query(body);
  },

  /**
   * @param {string} sessionId
   * @param {{ type: 'click' | 'type', ref?: string, text?: string, clear?: boolean }} body
   */
  async action(sessionId, body) {
    const session = sessions.getSession(sessionId);
    if (body.type === "click") {
      assertSupported(session.platform, "action.click");
    } else if (body.type === "type") {
      assertSupported(session.platform, "action.type");
    }
    return session.runner.action(body);
  },

  /**
   * @param {string} sessionId
   * @param {{ type: 'visible' | 'text', ref?: string, text?: string }} body
   */
  async assert(sessionId, body) {
    const session = sessions.getSession(sessionId);
    if (body.type === "visible") {
      assertSupported(session.platform, "assert.visible");
    } else if (body.type === "text") {
      assertSupported(session.platform, "assert.text");
    }
    return session.runner.assert(body);
  },

  /**
   * @param {string} sessionId
   * @param {{ target?: 'page' | 'element', ref?: string }} body
   */
  async screenshot(sessionId, body) {
    const session = sessions.getSession(sessionId);
    if ((body.target ?? "page") === "element") {
      assertSupported(session.platform, "screenshot.element");
    } else {
      assertSupported(session.platform, "screenshot.page");
    }
    return session.runner.screenshot(body);
  },
};
