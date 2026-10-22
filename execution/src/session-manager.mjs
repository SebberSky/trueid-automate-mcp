import { randomUUID } from "node:crypto";
import { assertSupported } from "./capability-registry.mjs";
import { conflict, invalid, notFound } from "./errors.mjs";
import { ChromiumRunner } from "./runner/chromium.mjs";

/**
 * @typedef {{
 *   id: string,
 *   platform: 'chromium',
 *   deviceId: string,
 *   clientId: string,
 *   createdAt: string,
 *   runner: ChromiumRunner
 * }} Session
 */

const CHROMIUM_DEVICE = {
  id: "chromium-local-1",
  platform: "chromium",
  label: "Local Chromium (Playwright)",
  concurrency: 1,
};

export class SessionManager {
  constructor() {
    /** @type {Map<string, Session>} */
    this.sessions = new Map();
    /** @type {Map<string, string>} deviceId -> sessionId | '__pending__' */
    this.leases = new Map();
    /** @type {Promise<void>} */
    this.leaseGate = Promise.resolve();
  }

  /**
   * Serialize lease mutations so check → start → commit cannot interleave.
   * @template T
   * @param {() => Promise<T>} fn
   * @returns {Promise<T>}
   */
  withLeaseLock(fn) {
    const run = this.leaseGate.then(fn, fn);
    this.leaseGate = run.then(
      () => undefined,
      () => undefined,
    );
    return run;
  }

  listDevices() {
    const leaseSessionId = this.leases.get(CHROMIUM_DEVICE.id) ?? null;
    return [
      {
        ...CHROMIUM_DEVICE,
        leased: Boolean(leaseSessionId),
        sessionId: leaseSessionId === "__pending__" ? null : leaseSessionId,
        pending: leaseSessionId === "__pending__",
      },
    ];
  }

  /**
   * @param {{ platform: string, headless?: boolean, clientId?: string }} input
   */
  createSession(input) {
    return this.withLeaseLock(() => this.createSessionLocked(input));
  }

  /**
   * @param {{ platform: string, headless?: boolean, clientId?: string }} input
   */
  async createSessionLocked(input) {
    if (input.platform !== "chromium") {
      throw invalid(
        `Platform "${input.platform}" is not available in vertical slice v1.`,
        { platform: input.platform, available: ["chromium"] },
      );
    }
    assertSupported("chromium", "session.create");

    const existing = this.leases.get(CHROMIUM_DEVICE.id);
    if (existing) {
      throw conflict("Chromium device is already leased.", {
        deviceId: CHROMIUM_DEVICE.id,
        sessionId: existing === "__pending__" ? null : existing,
        pending: existing === "__pending__",
      });
    }

    this.leases.set(CHROMIUM_DEVICE.id, "__pending__");
    const sessionId = randomUUID();
    const runner = new ChromiumRunner({
      headless: input.headless !== false,
      onDisconnected: () => {
        void this.dropSessionIfPresent(sessionId);
      },
    });

    try {
      await runner.start();
    } catch (err) {
      this.leases.delete(CHROMIUM_DEVICE.id);
      throw err;
    }

    const session = {
      id: sessionId,
      platform: /** @type {'chromium'} */ ("chromium"),
      deviceId: CHROMIUM_DEVICE.id,
      clientId: input.clientId?.trim() || "anonymous",
      createdAt: new Date().toISOString(),
      runner,
    };
    this.sessions.set(session.id, session);
    this.leases.set(session.deviceId, session.id);
    return this.publicSession(session);
  }

  /** @param {string} sessionId */
  async dropSessionIfPresent(sessionId) {
    const session = this.sessions.get(sessionId);
    if (!session) {
      if (this.leases.get(CHROMIUM_DEVICE.id) === "__pending__") {
        return;
      }
      return;
    }
    this.sessions.delete(sessionId);
    if (this.leases.get(session.deviceId) === sessionId) {
      this.leases.delete(session.deviceId);
    }
    await session.runner.stop().catch(() => {});
  }

  /** @param {string} sessionId */
  getSession(sessionId) {
    const session = this.sessions.get(sessionId);
    if (!session) {
      throw notFound(`Session not found: ${sessionId}`, { sessionId });
    }
    return session;
  }

  /** @param {string} sessionId */
  getPublicSession(sessionId) {
    return this.publicSession(this.getSession(sessionId));
  }

  /** @param {string} sessionId */
  releaseSession(sessionId) {
    return this.withLeaseLock(() => this.releaseSessionLocked(sessionId));
  }

  /** @param {string} sessionId */
  async releaseSessionLocked(sessionId) {
    assertSupported("chromium", "session.release");
    const session = this.sessions.get(sessionId);
    if (!session) {
      throw notFound(`Session not found: ${sessionId}`, { sessionId });
    }
    this.sessions.delete(sessionId);
    if (this.leases.get(session.deviceId) === sessionId) {
      this.leases.delete(session.deviceId);
    }
    await session.runner.stop();
  }

  /** @param {Session} session */
  publicSession(session) {
    return {
      id: session.id,
      platform: session.platform,
      deviceId: session.deviceId,
      clientId: session.clientId,
      createdAt: session.createdAt,
      screenRevision: session.runner.screenRevision,
    };
  }

  async disposeAll() {
    const ids = [...this.sessions.keys()];
    for (const id of ids) {
      await this.releaseSession(id).catch(() => {});
    }
    if (this.leases.get(CHROMIUM_DEVICE.id) === "__pending__") {
      this.leases.delete(CHROMIUM_DEVICE.id);
    }
  }
}

/** Shared process singleton for in-process REST tests. MCP talks HTTP to REST. */
export const sessions = new SessionManager();
