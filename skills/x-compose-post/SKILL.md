---
name: x-compose-post
description: Compose and send posts on X (Twitter) through ai-chrome-pilot. Use when the user wants to create a normal post, reply, quote post, or scheduled post, optionally with images, while choosing the correct mode from explicit inputs and verifying the result after submission.
---

# X Compose Post

Use ai-chrome-pilot to create X posts from one unified workflow, then branch into `post`, `reply`, `quote`, or `schedule` mode.

Prefer this skill for broad post-creation tasks. Use `x-schedule-post` when a schedule-only flow is explicitly needed, and use `x-quote-post` when the user already knows the exact post they want to quote.

Keep the skill profile-agnostic. Use `default` unless the user explicitly requested another profile.

## Prerequisites

- ai-chrome-pilot server is available in the current repo
- Google Chrome is installed
- The user is already logged in to X in the chosen Chrome profile
- Prefer `HEADLESS=0` for real submission flows so the visible composer state can be inspected
- The UI is expected to be Japanese; match labels such as `ポストする`, `返信`, `引用する`, `ポストを予約`, `確認する`, and `予約設定`

If X shows a login screen, stop and use `x-login` first.

## Inputs To Resolve

Resolve these before acting:

- `profile_name`: default to `default` if unspecified
- `mode`: one of `post`, `reply`, `quote`, `schedule`
- `post_text`: required in all modes
- `target`: required for `reply` and `quote`
  - accept URL, actor/date/text tuple, or another explicit locator
- `schedule`: required for `schedule`
  - year, month, day, hour, minute
- `image`: optional attachment path when the user provided one

Default resolution rules:

- If `profile_name` is unspecified, use `default` without asking
- If the request is a normal post and includes `post_text`, execute directly
- If the request is a scheduled post and includes `post_text` plus the full schedule, execute directly
- If the request is `reply` or `quote`, ask only when the target post is not specific enough to identify safely

If the target post is not specific enough for `reply` or `quote`, stop and ask for clarification or first use a read-only skill to identify the exact target.

## Mode Selection

- `post`
  - Create a normal post from X home or the post composer
- `reply`
  - Open the target post and use the inline reply composer or reply modal
- `quote`
  - Open the target post, open the repost menu, and choose `引用する`
- `schedule`
  - Start from a normal post composer, then open the schedule dialog and finalize via `予約設定`

## Common Workflow

### 1. Ensure the server is running

Check health:

```bash
curl -s http://127.0.0.1:3333/health
```

If not running, start it with the requested profile:

```bash
HEADLESS=0 PROFILE_NAME=<profile_name> npx tsx src/index.ts
```

### 2. Open the right page

- `post` or `schedule`
  - navigate to `https://x.com`
- `reply` or `quote`
  - navigate directly to the target post URL when available
  - otherwise find the target post first and only continue when the target is unambiguous

After navigation:

```bash
sleep 2
curl -s http://127.0.0.1:3333/screenshot -o /tmp/x_compose_check.png
```

### 3. Always take a fresh snapshot before acting

Use:

```bash
curl -s http://127.0.0.1:3333/snapshot
```

Refs change after navigation, dialog open/close, scrolling, and submission. Never reuse stale refs.

### 4. Enter the post text safely

Find the active `textbox "ポスト本文"` and focus it, but do not assume that `/act type` alone is enough for X.

Observed failure mode:

- `/act type` can make the submit button look enabled while the actual X composer state is still out of sync
- the visible page may appear filled, but `[data-testid="tweetTextarea_0"]` can still be empty or mismatched

Use this approach for real submission flows:

1. Use `/snapshot` and `/act click` to focus the correct composer
2. Prefer `Playwright over CDP` to connect to the already-open Chrome instance on `http://127.0.0.1:9222`
3. Enter text with `page.keyboard.type()` instead of relying on `/act type`
4. Verify the DOM text exactly matches the intended post before clicking any submit button

Minimal pattern:

```bash
curl -s -X POST http://127.0.0.1:3333/act \
  -H 'Content-Type: application/json' \
  -d '{"ref":"<textbox_ref>","action":"click"}'
```

```bash
node -e "const { chromium } = require('playwright-core'); (async () => {
  const expected = '<post_text>';
  const browser = await chromium.connectOverCDP('http://127.0.0.1:9222');
  const pages = browser.contexts().flatMap(c => c.pages());
  const page = pages.find(p => p.url().startsWith('https://x.com/')) || pages[0];
  const composer = page.locator('[data-testid=\"tweetTextarea_0\"]');
  await composer.click();
  // Use the current platform's Select All shortcut before replacing text.
  await page.keyboard.press('Meta+A');
  await page.keyboard.press('Backspace');
  await page.keyboard.type(expected, { delay: 60 });
  const ok = await page.evaluate(text => {
    const composerNode = document.querySelector('[data-testid=\"tweetTextarea_0\"]');
    return (composerNode?.innerText || '') === text;
  }, expected);
  console.log(JSON.stringify({ ok }));
  await browser.close();
})().catch(err => { console.error(err); process.exit(1); });"
```

If the environment is not macOS, replace `Meta+A` with the platform's Select All equivalent such as `Control+A`.

Before submit, verify at least these conditions:

- `[data-testid="tweetTextarea_0"]` `innerText` exactly equals the intended text
- the relevant submit button is enabled

Use `/act type` only as a light first try or for non-critical preparation. If `/act type` and the DOM text disagree, stop and switch to the CDP keyboard path instead of submitting.

### 5. Attach an image when requested

Only do this when the user explicitly provided an image path and the current task requires it. Use the current UI controls and re-snapshot after opening any media picker or modal.

## Mode-Specific Steps

### `post`

1. Open X home if not already there
2. Focus the main composer
3. Enter `post_text` using the safe text-entry path above
4. Optionally attach an image
5. Click `button "ポストする"`

### `reply`

1. Open the target post
2. Find either the inline reply textbox or the `button "<N> 件の返信。返信する"` trigger
3. Open the reply composer if needed
4. Enter `post_text` using the safe text-entry path above
5. Optionally attach an image
6. Click `button "返信"`

### `quote`

1. Open the target post
2. Click the repost button such as `button "<N> 件のリポスト件。リポスト"`
3. In the menu, click `menuitem "引用する"`
4. Enter `post_text` using the safe text-entry path above
5. Optionally attach an image
6. Click `button "ポストする"`

### `schedule`

1. Open X home
2. Enter `post_text` using the safe text-entry path above
3. Optionally attach an image
4. Click `button "ポストを予約"`
5. In the schedule dialog, set month, day, year, hour, and minute using `select`
6. Click `button "確認する"` or `button "更新"` to apply the schedule
7. Back on the composer, click `button "予約設定"` to finalize
8. Verify the scheduled post in the drafts or scheduled list

## Verification

After submission, verify according to mode:

- `post`
  - check the profile or current timeline for the exact text
- `reply`
  - check the reply count or the reply under the target post
- `quote`
  - check the profile or current page for the quote text and quoted target
- `schedule`
  - check the scheduled posts list for text and date/time

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

```bash
curl -s -X POST http://127.0.0.1:3333/eval \
  -H 'Content-Type: application/json' \
  -d '{"js":"({text:document.querySelector(\"[data-testid=\\\"tweetTextarea_0\\\"]\")?.innerText || \"\", disabled:document.querySelector(\"[data-testid=\\\"tweetButtonInline\\\"]\")?.disabled ?? null})"}'
```

## Safety Rules

- Never hardcode a profile name
- Never guess the target post for `reply` or `quote`
- Do not ask for an extra confirmation immediately before submission when the mode, text, and target are already explicit
- Prefer direct target URLs when the user supplied them
- Stop when multiple similar posts match and the target is ambiguous
- Use fresh refs from the latest `/snapshot`
- Re-check the typed text in the actual composer DOM before clicking any submit button
- If `/act type` appears to work visually but the DOM text does not match, do not submit
- Prefer `Playwright over CDP` with `page.keyboard.type()` for X composer text entry when a real submission will happen
- If `Browser connection is closed` or `CDP client is not connected` appears, restart the server and re-verify before resuming
- Never attempt automatic login or credential entry

## Output Format

Report:

- selected `mode`
- target post used, when applicable
- text that was entered
- whether the action was submitted or only prepared
- verification result
- any gaps, fallbacks, or retries used
