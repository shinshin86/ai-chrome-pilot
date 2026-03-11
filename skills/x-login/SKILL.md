---
name: x-login
description: Log in to X (Twitter) via browser. Launches the ai-chrome-pilot server, navigates to X, and asks the user to log in manually so the session is persisted to a profile. Use this as a prerequisite before any X posting or interaction skills.
compatibility: Requires ai-chrome-pilot server (npx tsx src/index.ts) and Google Chrome installed
---

# X (Twitter) Login

Log in to X via ai-chrome-pilot and persist the session to a browser profile.

## Prerequisites

- ai-chrome-pilot project is set up
- Google Chrome is installed on the machine

## Steps

### 1. Resolve the profile name

Use `default` unless the user explicitly requested another profile. The profile determines where browser data is stored (`~/.ai-chrome-pilot/profiles/<profile_name>/`).

### 2. Start the server

Launch the server with the display enabled so the user can interact with the browser.

```bash
HEADLESS=0 PROFILE_NAME=<profile_name> npx tsx src/index.ts &
```

- `HEADLESS=0` is required because the user needs to see the browser to log in manually.

### 3. Verify server is ready

```bash
sleep 3 && curl -s http://127.0.0.1:3333/health
```

Expect `{"ok":true}`.

### 4. Navigate to X

```bash
curl -s -X POST http://127.0.0.1:3333/goto \
  -H 'Content-Type: application/json' \
  -d '{"url":"https://x.com"}'
```

### 5. Check login status

Take a screenshot and verify whether the user is already logged in.

```bash
sleep 2 && curl -s http://127.0.0.1:3333/screenshot -o /tmp/x_login_check.png
```

View `/tmp/x_login_check.png` with the Read tool.

### 6. Request manual login if needed

If not logged in, ask the user to log in manually in the opened browser window. Never attempt to enter credentials automatically.

Example message:
> The Chrome browser window is open. Please log in to X in the browser. Let me know when you're done.

### 7. Confirm login

After the user reports login is complete, take another screenshot to verify.

### 8. Explain session persistence

After successful login, inform the user:
- The session is persisted in `~/.ai-chrome-pilot/profiles/<profile_name>/`
- Next time, launching with the same `PROFILE_NAME` will restore the logged-in state
- All browser data (cookies, localStorage, IndexedDB, etc.) is retained

## Important notes

- Do not ask which profile to use unless the user explicitly needs a non-`default` profile
- Always ask the user to log in manually. Never auto-fill passwords or authentication credentials.
- Do not use `EPHEMERAL=1` if the session needs to be persisted.
