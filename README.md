# ai-chrome-pilot

![Logo](https://github.com/shinshin86/ai-chrome-pilot/blob/main/images/logo.png)

[日本語版はこちら](README.ja.md)

A lightweight browser automation server for AI agents, powered by Chrome DevTools Protocol (CDP).
Minimal dependencies, easy to embed — automatically detects and launches your local Chrome, exposing browser operations as an HTTP API.

Supports ARIA snapshots and ref ID-based element interaction — no CSS selector guessing required.

## Features

- **Ref-based element interaction**: Use `/snapshot` to list all interactive elements with ref IDs, then use `/act` with a ref to operate on them
- **Optional Playwright**: Automatically uses `playwright-core` for some operations if installed (fully functional with CDP only)
- **Session persistence**: Saves cookies, localStorage, IndexedDB, etc. to a profile directory, preserving login state across restarts
- **Element occlusion detection**: Returns an error when a click target is obscured by an overlay or popup

## Disclaimer

> **This is an experimental project.** Unexpected behavior may occur. Please use it with that understanding.
>
> **This tool allows AI agents to control a real browser.** AI agents may perform unintended actions — such as clicking wrong buttons, navigating to unexpected pages, or submitting forms — without explicit user approval. Use with caution, especially on production sites or when logged in to important accounts. Always monitor agent behavior and consider using `EPHEMERAL=1` or a dedicated profile to limit the blast radius of unintended actions.

## Prerequisites

- Node.js 20+
- Chrome, Chromium, Edge, or Brave installed locally

## Setup

```bash
npm install
```

`playwright-core` is an optional dependency. To install without Playwright:

```bash
npm install --omit=optional
```

## Starting the Server

```bash
# Headed mode (default, with session persistence)
npm run dev

# Headless mode
HEADLESS=1 npm run dev

# Ephemeral session (no session persistence)
EPHEMERAL=1 npm run dev
```

After starting, verify with `curl -s http://127.0.0.1:3333/health` — you should get `{"ok":true}`.

## API Reference

### Snapshot & Ref-based Operations (Recommended)

| Endpoint    | Method | Body                                                    | Response                 |
| ----------- | ------ | ------------------------------------------------------- | ------------------------ |
| `/snapshot` | GET    | -                                                       | `{ ok, snapshot, refs }` |
| `/act`      | POST   | `{ "ref": "e1", "action": "click" }`                    | `{ ok: true }`           |
| `/act`      | POST   | `{ "ref": "e3", "action": "type", "value": "text" }`    | `{ ok: true }`           |
| `/act`      | POST   | `{ "ref": "e1", "action": "drag", "targetRef": "e2" }`  | `{ ok: true }`           |
| `/act`      | POST   | `{ "ref": "e5", "action": "select", "values": ["v1"] }` | `{ ok: true }`           |
| `/act`      | POST   | `{ "ref": "e1", "action": "press", "key": "Enter" }`    | `{ ok: true }`           |

Available actions for `/act`: `click`, `type`, `clear`, `focus`, `scroll`, `hover`, `drag`, `select`, `press`

### Basic Operations (CSS Selector-based)

These endpoints use CSS selectors directly. The ref-based API above is recommended for most use cases.

| Endpoint      | Method | Body                                   | Response             |
| ------------- | ------ | -------------------------------------- | -------------------- |
| `/health`     | GET    | -                                      | `{ ok: true }`       |
| `/goto`       | POST   | `{ "url": "..." }`                     | `{ ok, url, title }` |
| `/click`      | POST   | `{ "selector": "..." }`                | `{ ok: true }`       |
| `/type`       | POST   | `{ "selector": "...", "text": "..." }` | `{ ok: true }`       |
| `/eval`       | POST   | `{ "js": "..." }`                      | `{ ok, result }`     |
| `/screenshot` | GET    | -                                      | PNG binary           |

### Tab Management

| Endpoint          | Method | Body                    | Response                       |
| ----------------- | ------ | ----------------------- | ------------------------------ |
| `/tabs`           | GET    | -                       | `{ ok, tabs }`                 |
| `/tabs/open`      | POST   | `{ "url": "..." }` (optional, default: `about:blank`) | `{ ok, targetId, title, url }` |
| `/tabs/focus`     | POST   | `{ "targetId": "..." }` | `{ ok: true }`                 |
| `/tabs/:targetId` | DELETE | -                       | `{ ok: true }`                 |

### Dialog & Wait

| Endpoint  | Method | Body                                           | Response                           |
| --------- | ------ | ---------------------------------------------- | ---------------------------------- |
| `/dialog` | GET    | -                                              | `{ ok, pending, type?, message? }` |
| `/dialog` | POST   | `{ "accept": true, "promptText": "..." }`      | `{ ok: true }`                     |
| `/wait`   | POST   | `{ "text": "..." }` or `{ "selector": "..." }` (+ optional `timeout` in ms) | `{ ok: true }`                     |

### Cookie Management

| Endpoint   | Method | Body                                 | Response          |
| ---------- | ------ | ------------------------------------ | ----------------- |
| `/cookies` | GET    | -                                    | `{ ok, cookies }` |
| `/cookies` | POST   | `{ "cookies": [...] }`               | `{ ok: true }`    |
| `/cookies` | DELETE | `{ "name": "...", "domain": "..." }` or `{}` (clear all) | `{ ok: true }`    |

## Usage Examples

```bash
# Navigate to a page
curl -s -X POST http://127.0.0.1:3333/goto \
  -H 'Content-Type: application/json' \
  -d '{"url":"https://www.google.com"}'

# Get a snapshot of interactive elements
curl -s http://127.0.0.1:3333/snapshot
```

The snapshot response includes an ARIA tree with ref IDs and a structured refs array:

```json
{
  "ok": true,
  "snapshot": "- navigation\n  - link \"About\" [ref=e1]\n  - link \"Store\" [ref=e2]\n- search\n  - textbox \"Search\" [ref=e3]\n  - button \"Google Search\" [ref=e5]",
  "refs": [
    { "ref": "e1", "role": "link", "name": "About", "backendNodeId": 42 },
    { "ref": "e3", "role": "textbox", "name": "Search", "backendNodeId": 58 },
    { "ref": "e5", "role": "button", "name": "Google Search", "backendNodeId": 73 }
  ]
}
```

Use the ref IDs from the snapshot to interact with elements:

```bash
# Type text using a ref
curl -s -X POST http://127.0.0.1:3333/act \
  -H 'Content-Type: application/json' \
  -d '{"ref":"e3","action":"type","value":"search query"}'

# Click using a ref
curl -s -X POST http://127.0.0.1:3333/act \
  -H 'Content-Type: application/json' \
  -d '{"ref":"e5","action":"click"}'

# Take a screenshot
curl -s http://127.0.0.1:3333/screenshot -o screenshot.png
```

## Environment Variables

| Variable           | Default                      | Description                              |
| ------------------ | ---------------------------- | ---------------------------------------- |
| `CONTROL_PORT`     | 3333                         | HTTP server port                         |
| `CDP_PORT`         | 9222                         | CDP port                                 |
| `HEADLESS`         | 0                            | Headless mode (1=enabled)                |
| `NO_SANDBOX`       | 0                            | Disable sandbox                          |
| `EVALUATE_ENABLED` | 1                            | Enable /eval endpoint                    |
| `CHROME_PATH`      | (auto)                       | Chrome executable path                   |
| `PROFILE_NAME`     | default                      | Profile name                             |
| `PROFILE_DIR`      | ~/.ai-chrome-pilot/profiles/ | Profile directory                        |
| `USER_DATA_DIR`    | (unset)                      | Explicit Chrome user data dir (overrides profile-based path selection) |
| `EPHEMERAL`        | 0                            | Ephemeral session (1=enabled, no persist)|

## Profiles & Session Management

By default, browser state (cookies, localStorage, IndexedDB, Service Workers, etc.) is persisted to `~/.ai-chrome-pilot/profiles/default/`.

```bash
# Use a work profile
PROFILE_NAME=work npm run dev

# Ephemeral session (won't persist any data)
EPHEMERAL=1 npm run dev
```

If you need to attach to an already-open browser tab instead of using a managed profile, use a dedicated tool such as Playwright MCP or OpenClaw. This project intentionally focuses on a single managed local Chrome profile.

## Development

```bash
npm run dev      # Start dev server
npm run build    # TypeScript build
npm run test     # Run tests (vitest)
npm run lint     # ESLint
npm run format   # Prettier
```

## Security Note on `/eval`

The `/eval` endpoint executes arbitrary JavaScript in the page context. Disable it in untrusted environments:

```bash
EVALUATE_ENABLED=0 npm run dev
```

## Using with AI Agents (Claude Code, etc.)

This server is designed to be operated by AI coding agents via `curl`. Below are tips for effective agent-driven browser automation.

### Starting and Stopping

Start the server in the background before issuing commands:

```bash
# Start (headless recommended for agent use)
HEADLESS=1 npx tsx src/index.ts &

# Verify
curl -s http://127.0.0.1:3333/health

# Stop
kill $(lsof -ti:3333) 2>/dev/null
kill $(lsof -ti:9222) 2>/dev/null
```

### Recommended Workflow

1. **Always start with `/snapshot`** — it returns all interactive elements with ref IDs, so the agent doesn't need to guess CSS selectors
2. **Use `/act` with ref IDs** — more reliable than CSS selector-based `/click` or `/type`
3. **Wait after navigation or clicks** — add a 2-3 second pause before taking a snapshot or screenshot, to allow the page to settle
4. **Use `/screenshot` to verify visual state** — save to a temp file and inspect when the page structure is unclear from the snapshot alone
5. **Use `/eval` to extract text** — when screenshots are hard to parse, run JavaScript to extract specific text content from the DOM

### Handling Common Issues

- **Popups and overlays**: If a click fails with an occlusion error, check `/snapshot` for modal dialogs or overlays that need to be dismissed first
- **Unexpected tabs**: After clicking links, check `/tabs` to see if a new tab opened. Use `/tabs/focus` to switch to it, or close unwanted tabs with `DELETE /tabs/:targetId`
- **Stale snapshots**: Always take a fresh `/snapshot` after any action that changes the page (navigation, click, type)
- **Google search tip**: Navigate directly to `https://www.google.com/search?q=...` via `/goto` to avoid consent popups

### Session Persistence

Login state is preserved across server restarts by default (profile stored in `~/.ai-chrome-pilot/profiles/default/`). After a manual login, the agent can reuse the session in subsequent runs. Use `EPHEMERAL=1` to start with a clean session.

## Troubleshooting

### Chrome not found

Specify `CHROME_PATH` explicitly:

```bash
CHROME_PATH='/Applications/Google Chrome.app/Contents/MacOS/Google Chrome' npm run dev
```

### Port conflict

Change `CDP_PORT` or `CONTROL_PORT`.

### Sandbox error on Linux

Use `NO_SANDBOX=1` if necessary (understand the security implications before using).

## Agent Skills

This project includes [Agent Skills](https://agentskills.io/) in the `skills/` directory that enable AI agents to automate common X (Twitter) workflows:

| Skill | Description |
| ----- | ----------- |
| `x-login` | Log in to X via browser (delegates manual login to the user, persists session) |
| `x-schedule-post` | Schedule a post on X and verify it in the scheduled posts list |
| `x-get-scheduled-posts` | Inspect X scheduled posts in read-only mode and optionally export the current queue |
| `x-get-notifications` | Retrieve X notifications and filter for replies / quote reposts |

### Using with Claude Code

Copy the skills into `.claude/skills/` (this directory is gitignored):

```bash
mkdir -p .claude/skills
cp -r skills/* .claude/skills/
```

### Using with other agents

Other agent products may look for skills in different locations. Refer to the agent's documentation for the correct path, and copy or symlink the `skills/` directory accordingly.

## CI

GitHub Actions (`.github/workflows/ci.yml`) runs `npm run lint` and `npm run test`.

## License

MIT
