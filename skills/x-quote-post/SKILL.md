---
name: x-quote-post
description: Quote a specific post on X (Twitter) through ai-chrome-pilot. Use when the target post is already known and the user wants a focused quote-post workflow with safe composer input and post-submission verification.
---

# X Quote Post

Use ai-chrome-pilot to quote a specific X post from a direct target URL or another unambiguous locator.

Prefer this skill when the user clearly wants to quote one known post and does not need the broader `x-compose-post` multi-mode workflow.

Keep the skill profile-agnostic. Use `default` unless the user explicitly requested another profile.

## Prerequisites

- ai-chrome-pilot server is available in the current repo
- Google Chrome is installed
- The user is already logged in to X in the chosen Chrome profile
- Prefer `HEADLESS=0` for real submission flows so the visible composer state can be inspected
- The UI is expected to be Japanese; match labels such as `引用する` and `ポストする`

If X shows a login screen, stop and use `x-login` first.

## Inputs To Resolve

Resolve these before acting:

- `profile_name`: default to `default` if unspecified
- `target_url`: preferred when available
- `target`: if not using a URL, accept another explicit locator such as actor/date/text tuple
- `post_text`: required

Default resolution rules:

- If `profile_name` is unspecified, use `default` without asking
- If `target_url` and `post_text` are already provided, execute directly
- Ask follow-up questions only when the target post is not specific enough to identify safely

Never guess the target post. If multiple similar posts could match, stop and ask for clarification.

## Workflow

### 1. Ensure the server is running

Check health:

```bash
curl -s http://127.0.0.1:3333/health
```

If not running, start it with the requested profile:

```bash
HEADLESS=0 PROFILE_NAME=<profile_name> npx tsx src/index.ts
```

### 2. Open the target post

If the user supplied a direct URL, navigate to it:

```bash
curl -s -X POST http://127.0.0.1:3333/goto \
  -H 'Content-Type: application/json' \
  -d '{"url":"<target_url>"}'
```

After navigation:

```bash
sleep 2
curl -s http://127.0.0.1:3333/screenshot -o /tmp/x_quote_target.png
curl -s http://127.0.0.1:3333/snapshot
```

Confirm the target post is the one the user intended before continuing.

### 3. Open the quote composer

Take a fresh snapshot and click the repost button on the target post, then choose `引用する`.

Typical sequence:

```bash
curl -s -X POST http://127.0.0.1:3333/act \
  -H 'Content-Type: application/json' \
  -d '{"ref":"<repost_button_ref>","action":"click"}'
sleep 1
curl -s http://127.0.0.1:3333/snapshot
curl -s -X POST http://127.0.0.1:3333/act \
  -H 'Content-Type: application/json' \
  -d '{"ref":"<quote_menuitem_ref>","action":"click"}'
```

After the quote composer opens, take a fresh snapshot again.

### 4. Enter the quote text safely

Do not assume that `/act type` alone is enough for X.

Observed failure mode:

- `/act type` can make the submit button look enabled while the actual X composer state is still out of sync
- the visible page may appear filled, but `[data-testid="tweetTextarea_0"]` can still be empty or mismatched

Use this approach for real submission flows:

1. Use `/snapshot` and `/act click` to focus the visible quote composer
2. Prefer `Playwright over CDP` to connect to the already-open Chrome instance on `http://127.0.0.1:9222`
3. Enter text with `page.keyboard.type()`
4. Verify the visible composer DOM exactly matches the intended text before clicking submit

Minimal pattern:

```bash
curl -s -X POST http://127.0.0.1:3333/act \
  -H 'Content-Type: application/json' \
  -d '{"ref":"<quote_textbox_ref>","action":"click"}'
```

```bash
node -e "const { chromium } = require('playwright-core'); (async () => {
  const expected = '<post_text>';
  const browser = await chromium.connectOverCDP('http://127.0.0.1:9222');
  const pages = browser.contexts().flatMap(c => c.pages());
  const page = pages.find(p => p.url().startsWith('https://x.com/')) || pages[0];
  const composer = page.locator('[data-testid=\"tweetTextarea_0\"]:visible').first();
  await composer.click();
  // Use the current platform's Select All shortcut before replacing text.
  await page.keyboard.press('Meta+A');
  await page.keyboard.press('Backspace');
  await page.keyboard.type(expected, { delay: 60 });
  const ok = await page.evaluate(text => {
    const nodes = [...document.querySelectorAll('[data-testid=\"tweetTextarea_0\"]')];
    const visible = nodes.find(n => !!(n.offsetWidth || n.offsetHeight || n.getClientRects().length));
    return (visible?.innerText || '') === text;
  }, expected);
  console.log(JSON.stringify({ ok }));
  await browser.close();
})().catch(err => { console.error(err); process.exit(1); });"
```

If the environment is not macOS, replace `Meta+A` with the platform's Select All equivalent such as `Control+A`.

Before submit, verify at least these conditions:

- the visible `[data-testid="tweetTextarea_0"]` `innerText` exactly equals the intended text
- the quote-post submit button is enabled

Use `/act type` only as a light first try. If `/act type` and the DOM text disagree, stop and switch to the CDP keyboard path instead of submitting.

### 5. Submit the quote post

Click the visible quote-post submit button such as `button "ポストする"`.

Take a fresh snapshot before clicking if the dialog or composer layout changed.

### 6. Verify the quote post

After submission, verify both:

- the new post text appears on the profile or current timeline
- the quoted target post is attached to that new post

Useful checks:

```bash
curl -s -X POST http://127.0.0.1:3333/eval \
  -H 'Content-Type: application/json' \
  -d '{"js":"document.location.href"}'
```

```bash
curl -s -X POST http://127.0.0.1:3333/eval \
  -H 'Content-Type: application/json' \
  -d '{"js":"document.body.innerText.includes(<expected_text_json>)"}'
```

If the profile is easier to verify than the current page, navigate to the profile and inspect the latest post list there.

## Safety Rules

- Never hardcode a profile name
- Never guess the target post
- Prefer direct target URLs when the user supplied them
- Use fresh refs from the latest `/snapshot`
- Re-check the typed text in the actual visible composer DOM before clicking submit
- If `/act type` appears to work visually but the DOM text does not match, do not submit
- Prefer `Playwright over CDP` with `page.keyboard.type()` for quote composer text entry when a real submission will happen
- If `Browser connection is closed` or `CDP client is not connected` appears, restart the server and re-verify before resuming
- Never attempt automatic login or credential entry

## Output Format

Report:

- target post used
- text that was entered
- whether the action was submitted or only prepared
- verification result
- any gaps, fallbacks, or retries used
