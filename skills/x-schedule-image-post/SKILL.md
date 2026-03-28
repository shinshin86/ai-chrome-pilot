---
name: x-schedule-image-post
description: Schedule a post with an image and AI-generated content label on X (Twitter). Use this when scheduling posts that include local image files and need the "AI-generated" disclosure toggle enabled.
compatibility: Requires ai-chrome-pilot server (npx tsx src/index.ts) and Google Chrome installed
---

# X (Twitter) Schedule Image Post with AI Label

Schedule a post on X with an attached image and the "AI-generated" content disclosure label, then verify it appears in the scheduled posts list.

## Prerequisites

- ai-chrome-pilot server is running
- User is logged in to X (if not, run the `x-login` skill first)
- Prefer `HEADLESS=0` for real scheduling flows so the visible composer state can be inspected

## Required inputs

- **Post text**: The text to post
- **Image path**: Absolute path to a local image file (PNG, JPEG, WEBP, or GIF)
- **Scheduled date/time**: Year, month, day, hour, and minute

Optional inputs:

- **Profile name**: Chrome profile to use (default: `default`)
- **AI label**: Whether to enable the "AI-generated" content disclosure (default: `true`)

Default resolution rules:

- Use `default` unless the user explicitly requested another profile
- AI label is enabled by default; disable only if the user explicitly opts out
- If all required inputs are provided, execute directly without an extra confirmation step
- Ask follow-up questions only when required inputs are missing

## Steps

### 1. Verify server is running

```bash
curl -s http://127.0.0.1:3333/health
```

If not running, start it with the resolved profile:

```bash
HEADLESS=0 PROFILE_NAME=<profile_name> npx tsx src/index.ts &
sleep 3 && curl -s http://127.0.0.1:3333/health
```

### 2. Navigate to X home

```bash
curl -s -X POST http://127.0.0.1:3333/goto \
  -H 'Content-Type: application/json' \
  -d '{"url":"https://x.com"}'
```

After `sleep 2`, take a screenshot to confirm the user is logged in.

### 3. Enter post text safely

Use `/snapshot` to find the post text box ref.

```bash
curl -s http://127.0.0.1:3333/snapshot
```

Look for `textbox "ポスト本文"` (Post text), click it, then treat `/act type` only as an initial convenience path.

```bash
curl -s -X POST http://127.0.0.1:3333/act \
  -H 'Content-Type: application/json' \
  -d '{"ref":"<textbox_ref>","action":"click"}'
```

For scheduling that will actually be submitted, prefer the same text-entry strategy as `x-compose-post`:

- connect to the existing Chrome instance with `Playwright over CDP`
- enter text with `page.keyboard.type()`
- verify `[data-testid="tweetTextarea_0"]` exactly matches the intended text before attaching media or opening the schedule dialog

Do not rely on the visible composer alone. X can show an enabled action state while the actual composer DOM is still out of sync.

### 4. Attach the image

Use the `/file-input` endpoint to set the image file on the hidden file input element.

```bash
curl -s -X POST http://127.0.0.1:3333/file-input \
  -H 'Content-Type: application/json' \
  -d '{"files":["<image_path>"]}'
```

After `sleep 2`, take a screenshot to verify the image preview appears in the composer.

### 5. Enable the AI-generated content label

After attaching the image, the toolbar refs will change. Take a fresh snapshot.

```bash
curl -s http://127.0.0.1:3333/snapshot
```

1. Click `button "コンテンツ開示"` (Content disclosure) in the toolbar.

```bash
curl -s -X POST http://127.0.0.1:3333/act \
  -H 'Content-Type: application/json' \
  -d '{"ref":"<content_disclosure_ref>","action":"click"}'
```

2. After `sleep 1`, take a snapshot. Find `switch "AIで生成 ..."` and click it to enable.

```bash
curl -s -X POST http://127.0.0.1:3333/act \
  -H 'Content-Type: application/json' \
  -d '{"ref":"<ai_switch_ref>","action":"click"}'
```

3. Click `button "完了"` (Done) to close the disclosure panel.

```bash
curl -s -X POST http://127.0.0.1:3333/act \
  -H 'Content-Type: application/json' \
  -d '{"ref":"<done_button_ref>","action":"click"}'
```

### 6. Open the schedule dialog

Take a fresh snapshot, then click `button "ポストを予約"` (Schedule post).

```bash
curl -s -X POST http://127.0.0.1:3333/act \
  -H 'Content-Type: application/json' \
  -d '{"ref":"<schedule_button_ref>","action":"click"}'
```

After `sleep 1`, use `/snapshot` to inspect the schedule dialog elements.

### 7. Set the date and time

Use the `/act` `select` action on each combobox in the dialog. Add `sleep 1` between each operation.

```bash
# Month (e.g. "4月" for April)
curl -s -X POST http://127.0.0.1:3333/act \
  -H 'Content-Type: application/json' \
  -d '{"ref":"<month_combobox_ref>","action":"select","values":["<N>月"]}'

# Day (e.g. "2")
curl -s -X POST http://127.0.0.1:3333/act \
  -H 'Content-Type: application/json' \
  -d '{"ref":"<day_combobox_ref>","action":"select","values":["<DD>"]}'

# Year (e.g. "2026")
curl -s -X POST http://127.0.0.1:3333/act \
  -H 'Content-Type: application/json' \
  -d '{"ref":"<year_combobox_ref>","action":"select","values":["<YYYY>"]}'

# Hour in 24-hour format (e.g. "12")
curl -s -X POST http://127.0.0.1:3333/act \
  -H 'Content-Type: application/json' \
  -d '{"ref":"<hour_combobox_ref>","action":"select","values":["<HH>"]}'

# Minute (e.g. "00")
curl -s -X POST http://127.0.0.1:3333/act \
  -H 'Content-Type: application/json' \
  -d '{"ref":"<minute_combobox_ref>","action":"select","values":["<MM>"]}'
```

### 8. Confirm the date/time change

After setting the date and time, click the confirmation button at the top right of the dialog.

- For a new schedule: look for `button "確認する"` (Confirm)
- When updating an existing schedule: look for `button "更新"` (Update)

```bash
curl -s -X POST http://127.0.0.1:3333/act \
  -H 'Content-Type: application/json' \
  -d '{"ref":"<confirm_or_update_button_ref>","action":"click"}'
```

**Critical**: If this button is not clicked, the date/time changes will not be applied. Always use `/snapshot` to find the correct ref before clicking.

### 9. Submit the scheduled post

After the dialog closes and the home screen returns, click `button "予約設定"` (Schedule settings) to finalize the scheduled post.

```bash
curl -s -X POST http://127.0.0.1:3333/act \
  -H 'Content-Type: application/json' \
  -d '{"ref":"<schedule_submit_ref>","action":"click"}'
```

### 10. Verify the scheduled post

Confirm the post appears in the scheduled posts list:

1. Click `link "ポストする"` (Post) in the side menu
2. Click `button "下書き"` (Drafts)
3. Click `tab "予約済み"` (Scheduled)
4. Scroll down if needed to find the post
5. Use `/snapshot` to verify the post text and scheduled date/time are correct

```bash
# Add sleep 1 between each action

# 1. Click the post button
curl -s -X POST http://127.0.0.1:3333/act \
  -H 'Content-Type: application/json' \
  -d '{"ref":"<post_button_ref>","action":"click"}'

# 2. Click the drafts button
curl -s -X POST http://127.0.0.1:3333/act \
  -H 'Content-Type: application/json' \
  -d '{"ref":"<draft_button_ref>","action":"click"}'

# 3. Click the scheduled tab
curl -s -X POST http://127.0.0.1:3333/act \
  -H 'Content-Type: application/json' \
  -d '{"ref":"<scheduled_tab_ref>","action":"click"}'

# 4. Check the snapshot
curl -s http://127.0.0.1:3333/snapshot
```

If the post text and scheduled time match, report success to the user.

### 11. Close the dialog and return to home

After verification, close the dialog to return to the home screen.

- Click `button "戻る"` (Back) or `button "閉じる"` (Close) as needed
- Repeat until all dialogs are closed

### 12. Stop the server (if requested by the user)

```bash
kill $(lsof -ti:3333) 2>/dev/null
kill $(lsof -ti:9222) 2>/dev/null
```

## Batch scheduling

When scheduling multiple posts in a batch:

1. Navigate to X home once at the start
2. For each post, repeat steps 3-9 (text → image → AI label → schedule → submit)
3. After each post is submitted, take a fresh snapshot before starting the next one — the composer resets to the home timeline
4. Verify all posts at the end by checking the scheduled posts list once (step 10)

This avoids repeated navigation and verification overhead.

## Important notes

- Do not ask which profile to use unless the user explicitly needs a non-`default` profile
- Add `sleep 1-2` between operations to wait for page loads
- Always use `/snapshot` before each action to get fresh refs (refs change when the page navigates or dialogs open/close)
- X's UI is dynamic; use both snapshots and screenshots to identify the correct elements
- After setting the date/time, **always** click the "確認する" (Confirm) or "更新" (Update) button to apply the changes
- The `/file-input` endpoint accepts an array of file paths; for single image posts, pass one path
- The AI label toggle is in the "コンテンツ開示" (Content disclosure) panel; the switch is labeled "AIで生成"
- Before final submission, verify the composer DOM text still matches the intended scheduled text
- If `/act type` appears to work visually but `[data-testid="tweetTextarea_0"]` does not match, stop and switch to the CDP keyboard path instead of scheduling
