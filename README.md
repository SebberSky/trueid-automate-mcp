# TrueID Automate MCP

Public capability research and a searchable catalogue for designing an automation MCP server.

**Website:** https://automation-mcp-tool-index.chawapon-rr.chatgpt.site

## Current scope

149 tools from Appium, Maestro, Playwright and Mobile MCP, with 32 comparison groups and per-tool functional notes. This repository currently contains the research website and comparison logic; it does not yet implement an automation MCP server.

The review distinguishes overlapping functionality from fully equivalent functionality. Tools are hidden only when a reviewed exact-equivalence group has evidence and matching contracts across functions, targets, inputs, outputs and support. Subsets, supersets and uncertain comparisons remain visible.

Current source-based result: **149 retained, 0 confirmed exact duplicates hidden**. Of these, 126 have related/partially overlapping counterparts, 5 require more evidence, and 18 have no matched counterpart in this catalogue. These labels are analytical findings, not runtime compatibility guarantees.

## Run

Requires Node.js 22 or later. No package installation is needed.

```sh
npm run build
npm test
npm run preview
```

Open the URL printed by the preview command. The generated `dist/index.html` also works as a standalone offline file.

## Files

- `data/catalog.json`: original tool names, descriptions and source links.
- `data/capability-review.json`: criteria, per-tool functions, differences and comparison groups.
- `src/index.html`: UI template.
- `src/review.mjs`: conservative filtering logic.
- `scripts/build.mjs`: embeds the data and logic in a standalone HTML file.
- `test/review.test.mjs`: coverage and regression tests for deduplication.
- `.openai/hosting.json`: public Sites deployment identity.

The public website is read-only and does not require visitor authentication.

## Sources and attribution

Research snapshot: 22 October 2026. Primary sources are linked per tool and pinned to upstream revisions where available. The capability review also checked the 64 source/document files referenced by the catalogue.

- [Appium MCP](https://github.com/appium/appium-mcp)
- [Maestro MCP](https://github.com/mobile-dev-inc/maestro-docs/blob/main/introduction/get-started/maestro-mcp.md)
- [Playwright MCP](https://github.com/microsoft/playwright-mcp)
- [Mobile MCP](https://github.com/mobile-next/mobile-mcp)
- [Mobilewright / Mobile MCP architecture](https://mobilenext.ai/docs/architecture/)

Upstream tools and projects retain their respective licenses. The MIT license here covers this repository's original website, comparison code and authored research material.

## License

[MIT](LICENSE) — Copyright (c) 2026 SebberSky.

