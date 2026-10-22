import { startServer } from "./server.mjs";

const { port, hostname } = await startServer();
console.log(`TrueID Automate execution listening on http://${hostname}:${port}`);
console.log("Vertical slice: chromium via Playwright library (not Playwright MCP).");
console.log("v1: no auth — loopback bind only unless AUTOMATE_ALLOW_NON_LOOPBACK=1.");
console.log("MCP clients should set AUTOMATE_API_BASE to this URL and run `npm run mcp`.");
