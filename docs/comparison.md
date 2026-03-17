# Browser Automation Tool Comparison: This Project vs Playwright CLI vs Playwright MCP vs OpenClaw

[日本語版はこちら](comparison.ja.md)

## TL;DR

| If you want to...                          | Use                          |
| ------------------------------------------ | ---------------------------- |
| Lightweight setup with minimal dependencies / embed in other systems | **ai-chrome-pilot** |
| Quick browser ops from Claude Code / Codex | **Playwright CLI**           |
| Long-running autonomous exploration         | **Playwright MCP**           |
| Full agent infra + sandbox + secure ops     | **OpenClaw**                 |

## Overview

A comparison of four major approaches for controlling a browser from AI agents (e.g., Claude Code).

| Tool                                              | Developer       | Approach                              | Connection Method        |
| ------------------------------------------------- | --------------- | ------------------------------------- | ------------------------ |
| **This Project** (ai-chrome-pilot)                | Open Source     | CDP + Playwright (optional) + REST API| HTTP API (any client)    |
| **Playwright CLI**                                | Microsoft (OSS) | CLI commands                          | Direct Bash execution    |
| **Playwright MCP**                                | Microsoft (OSS) | Model Context Protocol                | MCP client               |
| **OpenClaw Browser Integration**                  | OpenClaw        | CDP + Playwright + Gateway HTTP API   | Agent tools / CLI        |

---

## 1. This Project (ai-chrome-pilot)

### Architecture

```
User → Claude Code → curl → Express REST API → CDP (+ Playwright) → Chrome
                                                 ↑
                                           Playwright is optional
```

Directly controls Chrome installed on the machine via CDP (Chrome DevTools Protocol). If `playwright-core` is installed, some operations (goto, click, type, dialog, wait) automatically leverage Playwright in a hybrid fashion. Supports ARIA snapshots and ref ID-based element interaction, eliminating the need for CSS selector guessing.

### Features

- ARIA snapshot + ref ID-based interaction (`/snapshot`, `/act`)
- Page navigation (`/goto`) / click (`/click`, `/act`) / text input (`/type`, `/act`)
- Drag / hover / select / key press (`/act`)
- JavaScript execution (`/eval`) / screenshot (`/screenshot`)
- Tab management (`/tabs`) / dialog handling (`/dialog`) / wait (`/wait`)
- Cookie management (`/cookies`)
- Profile persistence (cookies / localStorage / IndexedDB, etc.)
- Element occlusion detection (returns error when overlay covers the target)

### Advantages

- **Ref-based element interaction**: `/snapshot` lists all interactive elements with ref IDs. No CSS selector guessing needed; resilient to page structure changes
- **Optional Playwright**: Fully functional with CDP only; `npm install --omit=optional` for a lightweight install
- **Session persistence**: Browser state is saved to a profile, maintaining login state across restarts
- **Protocol-agnostic**: Any HTTP client works — no MCP or special tools required
- **Easy to customize**: Built on Express, making it straightforward to add custom endpoints or adapt to specific needs

### Limitations

- **Single session**: Manages one browser session at a time (but supports multiple tabs)
- **Manual initial login required**: Designed for users to log in manually, not fully automated authentication
- **No attach-to-existing-tab mode**: Operates a managed local Chrome profile; if you need to attach to an already-open browser tab, use a dedicated tool such as Playwright MCP or OpenClaw
- **No PDF generation**: Cannot export pages to PDF
- **No network/console monitoring**: Does not capture network requests or console logs

### Ideal Use Cases

- Browser operations from AI agents (Claude Code, etc.)
- Embedding as an HTTP API in other systems
- Building a custom browser control server
- Automating daily tasks (reusing logged-in sessions)

---

## 2. Playwright CLI

### Architecture

```
User → Claude Code → Bash (playwright-cli commands) → Playwright → Chrome
```

Executed directly as shell commands. Use `snapshot` to get the page's accessibility tree, then interact with elements using the returned element IDs (`e8`, `e12`, etc.).

### Key Commands

```bash
playwright-cli open <url> --headed    # Launch browser
playwright-cli snapshot               # Get page structure in YAML
playwright-cli fill <elementID> "text" # Text input
playwright-cli click <elementID>       # Click
playwright-cli press Enter             # Key press
playwright-cli screenshot              # Screenshot
playwright-cli state-save <name>       # Save auth state
playwright-cli state-load <name>       # Restore auth state
playwright-cli list                    # List active sessions
playwright-cli close                   # Close browser
```

### Advantages

- **No selector guessing**: `snapshot` returns all interactive elements as `e8: textbox "Search"`. Use element IDs directly for operations
- **Token efficient**: Playwright team benchmarks show ~1/4 token usage vs MCP (27,000 vs 114,000 tokens). Data is saved to disk, not the context window
- **Auth state save/restore**: `state-save` / `state-load` saves cookies & localStorage for cross-session login persistence
- **High compatibility with Claude Code**: Runs as Bash commands, usable from Claude Code with no special setup
- **Full Playwright access**: Not constrained by context size limitations like MCP

### Limitations

- **Stateless per command**: Each command runs independently; multi-step operations require repeated `snapshot` → action cycles
- **Initial setup**: Requires global installation and browser setup
- **Long sessions**: Not a persistent connection, so complex long-running workflows may be less ideal compared to MCP

### Ideal Use Cases

- Browser operations from AI coding agents (Claude Code, Codex, etc.)
- Automating and scripting routine tasks
- Token-cost-sensitive scenarios
- Managing authentication across multiple sites

---

## 3. Playwright MCP

### Architecture

```
User → Claude Code (MCP client) → MCP Protocol → Playwright MCP Server → Chrome
```

Connects AI agents to the browser via Model Context Protocol. Passes the accessibility tree as structured data to the LLM, enabling page comprehension without vision models or screenshots.

### Key Features (26 tools)

Notable tools:

- `navigate` — Page navigation
- `page_snapshot` — Accessibility tree retrieval
- `click` / `type` / `fill` — Element interaction
- `press_key` — Keyboard input
- `handle_dialog` — Dialog handling
- `screenshot` — Screenshot capture
- Others: PDF generation, network monitoring, console monitoring, session recording & tracing, etc.

### Advantages

- **Persistent browser connection**: Maintains session state, enabling complex multi-step operations without losing state
- **Structured page analysis**: Uses accessibility tree for accurate page comprehension without screenshots or vision models
- **Strong at exploratory tasks**: Agents can adaptively operate while understanding page structure; handles unexpected navigation or errors flexibly
- **Browser extension mode**: Can connect to existing logged-in browser tabs, inheriting manually established sessions
- **Rich feature set**: 26 tools covering basic operations to PDF generation and network monitoring

### Limitations

- **High token consumption**: All tool schemas are loaded into context on connection. ~4x token usage compared to CLI
- **Requires MCP-compatible client**: Only usable with AI agents that support the MCP protocol
- **Shadow DOM limitations**: Accessibility tree may not expose elements inside Shadow DOM (current issue as of 2026)
- **Complex setup**: Requires MCP server configuration and client-side connection setup

### Ideal Use Cases

- Long-running autonomous browser operations (workflows spanning hours to days)
- Exploratory tasks (page structure not known in advance)
- Leveraging existing logged-in browsers
- Advanced features (PDF generation, network monitoring, etc.)

---

## 4. OpenClaw Browser Integration

### Architecture

```
User → OpenClaw Agent → Gateway (loopback HTTP API) → CDP → Chrome
                                                        ↑
                                                  Playwright (for advanced operations only)
```

OpenClaw uses CDP as the foundation, employing Playwright only for advanced operations (click/type/snapshot/PDF, etc.) in a hybrid architecture. It does not use Playwright CLI or Playwright MCP, building its own browser control layer instead.

### Two Operating Modes

1. **OpenClaw-managed browser (`openclaw` profile)**
   - A dedicated isolated Chrome profile launched by OpenClaw
   - Completely separated from personal browser; a safe agent operation environment
   - No Chrome extension needed; the Gateway's control server operates via CDP directly

2. **Chrome extension relay mode (`chrome` profile)**
   - Mode for controlling existing Chrome tabs
   - Chrome MV3 extension attaches to tabs via `chrome.debugger`
   - Communicates with Gateway via local relay (default: `http://127.0.0.1:18792`)
   - Badge shows `ON` to indicate attachment status

### Key Commands & API

```bash
# Browser management
openclaw browser start
openclaw browser open https://example.com
openclaw browser resize 1280 720

# Page structure retrieval (ref ID-based)
openclaw browser snapshot --interactive
# → ref=12: textbox "Search"
# → ref=23: button "Submit"

# Operations using ref IDs
openclaw browser click 12
openclaw browser type 23 "text" --submit
openclaw browser press Enter
openclaw browser hover 44
openclaw browser drag 10 11
openclaw browser select 9 OptionA OptionB

# Screenshot & PDF
openclaw browser screenshot
openclaw browser pdf

# Other
openclaw browser navigate https://example.com
openclaw browser dialog --accept
openclaw browser wait --text "Done"
openclaw browser evaluate --fn '(el) => el.textContent' --ref 7
openclaw browser console --level error
```

### Gateway HTTP API

A local loopback HTTP API is also exposed:

| Endpoint                                                                        | Purpose                    |
| ------------------------------------------------------------------------------- | -------------------------- |
| `GET /` / `POST /start` / `POST /stop`                                         | Status / start / stop      |
| `GET /tabs` / `POST /tabs/open` / `POST /tabs/focus` / `DELETE /tabs/:targetId`| Tab management             |
| `GET /snapshot` / `POST /screenshot`                                            | Page capture               |
| `POST /navigate` / `POST /act`                                                 | Navigation & interaction   |
| `POST /hooks/file-chooser` / `POST /hooks/dialog`                              | Hook handling              |

### Authentication Design

- **Manual login by design**: Credentials are not passed to agents. Users log in manually in the `openclaw` profile, and agents inherit that session
- **Session persistence**: Login state is maintained in the isolated profile. Cookie/Storage operations are available via CLI/API
- **Automated login discouraged**: To avoid account lockouts from anti-bot measures

```bash
# Manual login flow
openclaw browser start
openclaw browser open https://x.com
# → User logs in manually via browser UI
# → Agent can then operate with the logged-in session
```

### Playwright's Role

Playwright is an **optional dependency** in OpenClaw:

| Operation                           | Without Playwright | With Playwright |
| ----------------------------------- | :----------------: | :-------------: |
| Tab management (list/open/close)    |         o          |        o        |
| ARIA snapshot (basic)               |         o          |        o        |
| Basic screenshot                    |         o          |        o        |
| click / type / drag / select        |         x          |        o        |
| AI snapshot / Role snapshot         |         x          |        o        |
| Element screenshot                  |         x          |        o        |
| PDF generation                      |         x          |        o        |
| navigate / act                      |         x          |        o        |

Returns 501 error when Playwright is not installed; only available operations function.

### Advantages

- **CDP + Playwright hybrid**: Playwright is not required; basic operations work with CDP alone. Minimizes dependencies while offering advanced Playwright features on demand
- **Isolated browser profile**: The `openclaw` profile is completely separated from the personal browser for safe agent operations
- **Manual login + session reuse**: Avoids anti-bot measures while letting agents inherit logged-in sessions — a practical design
- **Ref-based element interaction**: Snapshot assigns ref IDs to each element; no CSS selector guessing needed (similar concept to Playwright CLI's `e8` format, independently implemented)
- **Chrome extension relay**: Attach to and operate existing browser tabs; hand off manually opened tabs to agents
- **Sandbox support**: Supports host browser control from sandboxed environments with security-conscious design
- **Rich operations**: Beyond click/type — includes drag, select, hover, file upload, dialog handling, console monitoring, and more

### Limitations

- **OpenClaw ecosystem dependency**: Requires OpenClaw's Gateway and agent infrastructure; cannot be used as a standalone tool
- **Manual initial login required**: Cannot fully automate authentication; requires user intervention
- **Session expiration**: Re-login needed when cookies expire

### Ideal Use Cases

- Automating daily tasks (leveraging logged-in sessions across multiple sites)
- Production browser operations through OpenClaw agents
- Security-conscious browser automation (isolated profiles + manual authentication)
- Scripting and repeating routine workflows

---

## Relationship Between This Project and OpenClaw

This project (ai-chrome-pilot) is an **independent REST API server implementation inspired by the core architecture (CDP + Playwright + HTTP API) of OpenClaw's browser integration**, providing equivalent functionality.

```
ai-chrome-pilot:
  Express REST API → CDP (+ Playwright) → Chrome
  - ARIA snapshot + ref ID-based interaction
  - Optional Playwright (auto-detect + hybrid)
  - Profile persistence (cookies / localStorage / IndexedDB)
  - Element occlusion detection

OpenClaw:
  Gateway HTTP API → CDP (+ Playwright) → Chrome
  - ref ID-based interaction (snapshot integration)
  - Manual login + session management
  - Chrome extension relay
  - Sandbox support
  - Agent infrastructure integration
```

The key difference: OpenClaw is designed for integration with its dedicated agent infrastructure (Gateway + CLI), while ai-chrome-pilot can be used standalone from `curl` or any HTTP client.

---

## Comprehensive Comparison

Legend for comparison tables: **o** = supported, **x** = not supported, **◎** = excellent, **○** = good, **△** = limited

### Feature Comparison

| Feature                         | This Project         | Playwright CLI      | Playwright MCP         | OpenClaw                            |
| ------------------------------- | :------------------: | :-----------------: | :--------------------: | :---------------------------------: |
| Page navigation                 | o                    | o                   | o                      | o                                   |
| Click / text input              | o                    | o                   | o                      | o                                   |
| Screenshot                      | o                    | o                   | o                      | o                                   |
| Automatic page structure analysis | o (snapshot + ref ID) | o (snapshot)      | o (page_snapshot)      | o (snapshot + ref ID)               |
| Auth state save/restore         | o (profile persistence) | o (state-save/load) | o (persistent profile) | o (isolated profile + manual login) |
| Multiple session management     | o (multi-profile)    | o                   | o                      | o (multi-profile)                   |
| JavaScript execution            | o (/eval)            | o                   | o                      | o (evaluate)                        |
| PDF generation                  | x                    | o                   | o                      | o                                   |
| Network monitoring              | x                    | x                   | o                      | o (console)                         |
| Dialog handling                 | o (/dialog)          | x                   | o                      | o (dialog)                          |
| Existing browser tab connection | x                    | x                   | o (extension mode)     | o (Chrome ext relay)                |
| Drag / hover / select           | o (/act)             | x                   | x                      | o                                   |
| File upload                     | x                    | x                   | x                      | o                                   |
| Sandbox support                 | x                    | x                   | x                      | o                                   |
| Works without Playwright        | o (all operations)   | x                   | x                      | o (basic operations only)           |

### Non-functional Comparison

| Aspect               | This Project          | Playwright CLI | Playwright MCP | OpenClaw                |
| -------------------- | :-------------------: | :------------: | :------------: | :---------------------: |
| Setup ease           | ◎ ^1                  | ○              | △              | △ (requires Gateway)    |
| Token efficiency     | ○ (ref-based)         | ◎ ^2           | △              | ○ (ref-based)           |
| Code comprehensibility | ○ ^3                | △ (large)      | △ (large)      | △ (large)               |
| Customizability      | ◎ ^4                  | ○              | ○              | ○                       |
| Long sessions        | ◎ (profile persist)   | ○              | ◎              | ◎ (profile persist)     |
| Error resilience     | ○ (occlusion detect)  | ○              | ◎              | ◎                       |
| Auth security        | ○ (profile isolation) | ○              | ○              | ◎ (isolation + manual)  |
| Daily task automation | ○                    | ○              | ○              | ◎                       |

> ^1 `npm install && npm run dev` only; no external server or MCP config required
> ^2 Playwright team benchmark: ~27k tokens vs MCP's ~114k tokens per task
> ^3 ~2k LOC (TypeScript); Playwright CLI / MCP / OpenClaw are each 10k+ LOC
> ^4 Plain Express server; add routes or middleware with no framework constraints

### Selection Guide

```
Lightweight setup with minimal dependencies / embed in other systems
  → ai-chrome-pilot

Want quick browser control from Claude Code / script routine tasks
  → Playwright CLI

Long-running complex autonomous operations / exploratory tasks
  → Playwright MCP

Agent infrastructure integration / sandbox support / secure production use
  → OpenClaw Browser Integration
```

---

## Reference Links

- [OpenClaw Browser Tools Documentation](https://github.com/openclaw/openclaw) — OpenClaw browser integration
- [Microsoft Playwright MCP (GitHub)](https://github.com/microsoft/playwright-mcp)
- [Playwright CLI vs. MCP: Browser Automation for Coding Agents | Better Stack](https://betterstack.com/community/guides/ai/playwright-cli-vs-mcp-browser/)
- [Playwright CLI: The Token-Efficient Alternative | TestCollab](https://testcollab.com/blog/playwright-cli)
- [Why less is more: The Playwright proliferation problem with MCP | Speakeasy](https://www.speakeasy.com/blog/playwright-tool-proliferation)
- [6 most popular Playwright MCP servers for AI testing in 2026 | Bug0](https://bug0.com/blog/playwright-mcp-servers-ai-testing)
