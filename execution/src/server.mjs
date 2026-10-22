import { serve } from "@hono/node-server";
import { Hono } from "hono";
import { AppError, invalid } from "./errors.mjs";
import { automationService } from "./service.mjs";
import { sessions } from "./session-manager.mjs";

const LOOPBACK = new Set(["127.0.0.1", "localhost", "::1"]);

/**
 * @param {{ service?: typeof automationService }} [options]
 */
export function createApp(options = {}) {
  const svc = options.service ?? automationService;
  const app = new Hono();

  app.onError((err, c) => {
    if (err instanceof AppError) {
      return c.json(err.toJSON(), /** @type {any} */ (err.status));
    }
    console.error(err);
    return c.json(
      {
        error: {
          code: "internal",
          message: "Internal server error",
          details: {},
        },
      },
      500,
    );
  });

  app.get("/v1/health", (c) => c.json(svc.health()));

  app.get("/v1/capabilities", (c) => {
    const platform = c.req.query("platform") ?? undefined;
    return c.json(svc.capabilities(platform));
  });

  app.get("/v1/devices", (c) => c.json(svc.devices()));

  app.post("/v1/sessions", async (c) => {
    const body = await c.req.json();
    const session = await svc.createSession(body);
    return c.json(session, 201);
  });

  app.get("/v1/sessions/:sessionId", (c) => {
    return c.json(svc.getSession(c.req.param("sessionId")));
  });

  app.delete("/v1/sessions/:sessionId", async (c) => {
    await svc.releaseSession(c.req.param("sessionId"));
    return c.body(null, 204);
  });

  app.post("/v1/sessions/:sessionId/navigate", async (c) => {
    const body = await c.req.json();
    return c.json(await svc.navigate(c.req.param("sessionId"), body));
  });

  app.get("/v1/sessions/:sessionId/screen", async (c) => {
    return c.json(await svc.screen(c.req.param("sessionId")));
  });

  app.post("/v1/sessions/:sessionId/elements/query", async (c) => {
    const body = await c.req.json();
    return c.json(await svc.query(c.req.param("sessionId"), body));
  });

  app.post("/v1/sessions/:sessionId/actions", async (c) => {
    const body = await c.req.json();
    return c.json(await svc.action(c.req.param("sessionId"), body));
  });

  app.post("/v1/sessions/:sessionId/assert", async (c) => {
    const body = await c.req.json();
    return c.json(await svc.assert(c.req.param("sessionId"), body));
  });

  app.post("/v1/sessions/:sessionId/screenshots", async (c) => {
    const body = (await c.req.json().catch(() => ({}))) ?? {};
    const artifact = await svc.screenshot(c.req.param("sessionId"), body);
    return c.json(artifact, 201);
  });

  return app;
}

/**
 * @param {string} hostname
 */
export function assertLoopbackBind(hostname) {
  const allowNonLoopback = process.env.AUTOMATE_ALLOW_NON_LOOPBACK === "1";
  if (LOOPBACK.has(hostname) || allowNonLoopback) {
    return;
  }
  throw invalid(
    `Refusing to bind to "${hostname}" without AUTOMATE_ALLOW_NON_LOOPBACK=1. v1 has no auth.`,
    { hostname },
  );
}

/**
 * @param {{ port?: number, hostname?: string }} [options]
 */
export async function startServer(options = {}) {
  const port = options.port ?? Number(process.env.PORT ?? 8787);
  const hostname = options.hostname ?? process.env.HOST ?? "127.0.0.1";
  assertLoopbackBind(hostname);
  const app = createApp();
  const server = serve({ fetch: app.fetch, port, hostname });

  const shutdown = async () => {
    await sessions.disposeAll();
    server.close();
  };
  process.once("SIGINT", () => {
    void shutdown().finally(() => process.exit(0));
  });
  process.once("SIGTERM", () => {
    void shutdown().finally(() => process.exit(0));
  });

  return { app, server, port, hostname };
}
