---
name: x-schedule-post
description: Schedule a post on X (Twitter) and verify it was successfully scheduled. Uses the ai-chrome-pilot server to control the browser, set the post text and date/time, and confirm the scheduled post appears in the scheduled posts list.
compatibility: Requires ai-chrome-pilot server (npx tsx src/index.ts) and Google Chrome installed
---

# X (Twitter) Schedule Post

Schedule a post on X via ai-chrome-pilot and verify it appears in the scheduled posts list.

## Prerequisites

- ai-chrome-pilot server is running
- User is logged in to X (if not, run the `x-login` skill first)

## Required inputs

Ask the user for:
- **Post text**: The text to post
- **Scheduled date/time**: Year, month, day, hour, and minute
- **Image** (optional): An image to attach

## Steps

### 1. Verify server is running

```bash
curl -s http://127.0.0.1:3333/health
```

If not running, start it:

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

### 3. Enter post text

Use `/snapshot` to find the post text box ref.

```bash
curl -s http://127.0.0.1:3333/snapshot
```

Look for `textbox "ポスト本文"` (Post text), click it, then type the text.

```bash
curl -s -X POST http://127.0.0.1:3333/act \
  -H 'Content-Type: application/json' \
  -d '{"ref":"<textbox_ref>","action":"click"}'

sleep 1

curl -s -X POST http://127.0.0.1:3333/act \
  -H 'Content-Type: application/json' \
  -d '{"ref":"<textbox_ref>","action":"type","value":"<post_text>"}'
```

### 4. Open the schedule dialog

Click `button "ポストを予約"` (Schedule post).

```bash
curl -s -X POST http://127.0.0.1:3333/act \
  -H 'Content-Type: application/json' \
  -d '{"ref":"<schedule_button_ref>","action":"click"}'
```

After `sleep 1`, use `/snapshot` to inspect the schedule dialog elements.

### 5. Set the date and time

Use the `/act` `select` action on each combobox in the dialog. Add `sleep 1` between each operation.

```bash
# Month (e.g. "2月" for February)
curl -s -X POST http://127.0.0.1:3333/act \
  -H 'Content-Type: application/json' \
  -d '{"ref":"<month_combobox_ref>","action":"select","values":["<N>月"]}'

# Day (e.g. "28")
curl -s -X POST http://127.0.0.1:3333/act \
  -H 'Content-Type: application/json' \
  -d '{"ref":"<day_combobox_ref>","action":"select","values":["<DD>"]}'

# Year (e.g. "2026")
curl -s -X POST http://127.0.0.1:3333/act \
  -H 'Content-Type: application/json' \
  -d '{"ref":"<year_combobox_ref>","action":"select","values":["<YYYY>"]}'

# Hour in 24-hour format (e.g. "20")
curl -s -X POST http://127.0.0.1:3333/act \
  -H 'Content-Type: application/json' \
  -d '{"ref":"<hour_combobox_ref>","action":"select","values":["<HH>"]}'

# Minute (e.g. "00")
curl -s -X POST http://127.0.0.1:3333/act \
  -H 'Content-Type: application/json' \
  -d '{"ref":"<minute_combobox_ref>","action":"select","values":["<MM>"]}'
```

### 6. Confirm the date/time change

After setting the date and time, click the confirmation button at the top right of the dialog.

- For a new schedule: look for `button "確認する"` (Confirm)
- When updating an existing schedule: look for `button "更新"` (Update)

```bash
curl -s -X POST http://127.0.0.1:3333/act \
  -H 'Content-Type: application/json' \
  -d '{"ref":"<confirm_or_update_button_ref>","action":"click"}'
```

**Critical**: If this button is not clicked, the date/time changes will not be applied. Always use `/snapshot` to find the correct ref before clicking.

### 7. Submit the scheduled post

After the dialog closes and the home screen returns, click `button "予約設定"` (Schedule settings) to finalize the scheduled post.

```bash
curl -s -X POST http://127.0.0.1:3333/act \
  -H 'Content-Type: application/json' \
  -d '{"ref":"<schedule_submit_ref>","action":"click"}'
```

### 8. Verify the scheduled post

Confirm the post appears in the scheduled posts list:

1. Click `link "ポストする"` (Post) in the side menu
2. Click `button "下書き"` (Drafts)
3. Click `tab "予約済み"` (Scheduled)
4. Use `/snapshot` to verify the post text and scheduled date/time are correct

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

### 9. Close the dialog and return to home

After verification, close the dialog to return to the home screen.

- Click `button "戻る"` (Back) or `button "閉じる"` (Close) as needed
- Repeat until all dialogs are closed

### 10. Stop the server (if requested by the user)

```bash
kill $(lsof -ti:3333) 2>/dev/null
kill $(lsof -ti:9222) 2>/dev/null
```

## Important notes

- Add `sleep 1-2` between operations to wait for page loads
- Always use `/snapshot` before each action to get fresh refs (refs change when the page navigates or dialogs open/close)
- X's UI is dynamic; use both snapshots and screenshots to identify the correct elements
- After setting the date/time, **always** click the "確認する" (Confirm) or "更新" (Update) button to apply the changes
