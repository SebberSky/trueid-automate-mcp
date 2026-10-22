import { AppError } from "./errors.mjs";

/**
 * Thin HTTP client so MCP and other frontends share the REST lease domain.
 */
export class RestClient {
  /** @param {string} baseUrl */
  constructor(baseUrl) {
    this.baseUrl = baseUrl.replace(/\/$/, "");
  }

  /**
   * @param {string} path
   * @param {{ method?: string, body?: unknown }} [options]
   */
  async request(path, options = {}) {
    const method = options.method ?? "GET";
    const response = await fetch(`${this.baseUrl}${path}`, {
      method,
      headers:
        options.body === undefined
          ? undefined
          : { "content-type": "application/json" },
      body: options.body === undefined ? undefined : JSON.stringify(options.body),
    });

    if (response.status === 204) {
      return null;
    }

    const text = await response.text();
    const data = text ? JSON.parse(text) : null;
    if (!response.ok) {
      const err = data?.error;
      throw new AppError(
        err?.code ?? "http_error",
        err?.message ?? `HTTP ${response.status}`,
        response.status,
        err?.details ?? {},
      );
    }
    return data;
  }
}

export function defaultApiBase() {
  return process.env.AUTOMATE_API_BASE ?? "http://127.0.0.1:8787";
}
