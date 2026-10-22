#!/usr/bin/env node
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import { AppError } from "./errors.mjs";
import { RestClient, defaultApiBase } from "./rest-client.mjs";

function toolResult(data) {
  return {
    content: [{ type: "text", text: JSON.stringify(data, null, 2) }],
  };
}

function toolError(err) {
  const payload =
    err instanceof AppError
      ? err.toJSON()
      : { error: { code: "internal", message: String(err?.message ?? err) } };
  return {
    isError: true,
    content: [{ type: "text", text: JSON.stringify(payload, null, 2) }],
  };
}

const api = new RestClient(defaultApiBase());

const server = new McpServer({
  name: "trueid-automate",
  version: "0.1.0",
});

server.tool(
  "health",
  "Execution service health for the Chromium vertical slice.",
  {},
  async () => {
    try {
      return toolResult(await api.request("/v1/health"));
    } catch (err) {
      return toolError(err);
    }
  },
);

server.tool(
  "list_capabilities",
  "Return capability registry (optional platform filter).",
  { platform: z.enum(["chromium", "ios", "android"]).optional() },
  async ({ platform }) => {
    try {
      const q = platform ? `?platform=${encodeURIComponent(platform)}` : "";
      return toolResult(await api.request(`/v1/capabilities${q}`));
    } catch (err) {
      return toolError(err);
    }
  },
);

server.tool(
  "list_devices",
  "List local automation devices and lease state.",
  {},
  async () => {
    try {
      return toolResult(await api.request("/v1/devices"));
    } catch (err) {
      return toolError(err);
    }
  },
);

server.tool(
  "session_create",
  "Create a Chromium session and lease the local browser slot (via REST).",
  {
    platform: z.literal("chromium").default("chromium"),
    headless: z.boolean().optional(),
    clientId: z.string().optional(),
  },
  async (args) => {
    try {
      return toolResult(
        await api.request("/v1/sessions", { method: "POST", body: args }),
      );
    } catch (err) {
      return toolError(err);
    }
  },
);

server.tool(
  "session_get",
  "Get session status.",
  { sessionId: z.string() },
  async ({ sessionId }) => {
    try {
      return toolResult(await api.request(`/v1/sessions/${sessionId}`));
    } catch (err) {
      return toolError(err);
    }
  },
);

server.tool(
  "session_release",
  "Release a session and free the device lease.",
  { sessionId: z.string() },
  async ({ sessionId }) => {
    try {
      await api.request(`/v1/sessions/${sessionId}`, { method: "DELETE" });
      return toolResult({ released: true, sessionId });
    } catch (err) {
      return toolError(err);
    }
  },
);

server.tool(
  "navigate",
  "Navigate the session page to an absolute URL.",
  { sessionId: z.string(), url: z.string().min(1) },
  async ({ sessionId, url }) => {
    try {
      return toolResult(
        await api.request(`/v1/sessions/${sessionId}/navigate`, {
          method: "POST",
          body: { url },
        }),
      );
    } catch (err) {
      return toolError(err);
    }
  },
);

server.tool(
  "screen_inspect",
  "Read an accessibility-oriented snapshot of the current page.",
  { sessionId: z.string() },
  async ({ sessionId }) => {
    try {
      return toolResult(await api.request(`/v1/sessions/${sessionId}/screen`));
    } catch (err) {
      return toolError(err);
    }
  },
);

server.tool(
  "element_find",
  "Query elements. Use expect=one when exactly one match is required.",
  {
    sessionId: z.string(),
    strategy: z.enum(["role", "name", "text", "css", "testid"]),
    value: z.string(),
    role: z.string().optional(),
    expect: z.enum(["any", "one"]).optional(),
  },
  async ({ sessionId, ...query }) => {
    try {
      return toolResult(
        await api.request(`/v1/sessions/${sessionId}/elements/query`, {
          method: "POST",
          body: query,
        }),
      );
    } catch (err) {
      return toolError(err);
    }
  },
);

server.tool(
  "ui_click",
  "Click an element ref from element_find (same screen revision).",
  { sessionId: z.string(), ref: z.string() },
  async ({ sessionId, ref }) => {
    try {
      return toolResult(
        await api.request(`/v1/sessions/${sessionId}/actions`, {
          method: "POST",
          body: { type: "click", ref },
        }),
      );
    } catch (err) {
      return toolError(err);
    }
  },
);

server.tool(
  "ui_type",
  "Type into an element ref. Clears existing value by default. Do not log secrets.",
  {
    sessionId: z.string(),
    ref: z.string(),
    text: z.string(),
    clear: z.boolean().optional(),
  },
  async ({ sessionId, ref, text, clear }) => {
    try {
      return toolResult(
        await api.request(`/v1/sessions/${sessionId}/actions`, {
          method: "POST",
          body: { type: "type", ref, text, clear },
        }),
      );
    } catch (err) {
      return toolError(err);
    }
  },
);

server.tool(
  "assert_ui",
  "Assert visibility or exact text; fails the tool on mismatch.",
  {
    sessionId: z.string(),
    type: z.enum(["visible", "text"]),
    ref: z.string(),
    text: z.string().optional(),
  },
  async ({ sessionId, type, ref, text }) => {
    try {
      return toolResult(
        await api.request(`/v1/sessions/${sessionId}/assert`, {
          method: "POST",
          body: { type, ref, text },
        }),
      );
    } catch (err) {
      return toolError(err);
    }
  },
);

server.tool(
  "screenshot",
  "Capture a PNG screenshot (page or element). Returns base64 in v1 — treat as sensitive.",
  {
    sessionId: z.string(),
    target: z.enum(["page", "element"]).optional(),
    ref: z.string().optional(),
  },
  async ({ sessionId, target, ref }) => {
    try {
      return toolResult(
        await api.request(`/v1/sessions/${sessionId}/screenshots`, {
          method: "POST",
          body: { target, ref },
        }),
      );
    } catch (err) {
      return toolError(err);
    }
  },
);

const transport = new StdioServerTransport();
await server.connect(transport);

process.stdin.on("end", () => process.exit(0));
process.stdin.on("close", () => process.exit(0));
