# TrueID Automate Execution (Chromium vertical slice)

Owned REST API + MCP tools + Chromium runner. The runner uses the **Playwright library** (Apache-2.0) under our service layer. This is **not** Playwright MCP, Appium MCP, Maestro MCP, or Mobile MCP wrapped as a backend.

## Scope (v0.1)

Supported loop on **Chromium only**:

1. Create session / lease device  
2. Navigate  
3. Inspect accessibility snapshot  
4. Find element (`role` / `name` / `text` / `css` / `testid`)  
5. Click / type  
6. Assert visible / text  
7. Screenshot  
8. Release session  

iOS and Android return explicit `unsupported`. Element refs bind to a screen revision; after a mutation you must query again (stale refs → `409 stale_ref`).

## Run

```sh
cd execution
npm install
npx playwright install chromium
npm test
npm start          # REST on http://127.0.0.1:8787
npm run mcp        # MCP stdio server (same service layer)
```

**v1 security (by design):** no authentication. Default bind is loopback (`127.0.0.1`). Non-loopback binds require `AUTOMATE_ALLOW_NON_LOOPBACK=1`. `file://` navigation is limited to `execution/test/fixtures`. `clientId` is a lease label only — not an access token.

MCP talks to REST over HTTP (`AUTOMATE_API_BASE`, default `http://127.0.0.1:8787`). Start REST first (`npm start`), then `npm run mcp` so both share one lease domain.

Do not expose this process as a public device-control endpoint without auth and network controls.

## Contracts

- OpenAPI: `../docs/contracts/openapi-v1.yaml`
- Capability registry: `../docs/contracts/capability-registry-v1.json`
- ADR: `../docs/adr/001-chromium-vertical-slice.md`

## License note

Playwright is Apache-2.0. Keep version pins and upstream notices when redistributing. Do not treat this as approval to vendor FSL-licensed MobileCLI/DeviceKit.
