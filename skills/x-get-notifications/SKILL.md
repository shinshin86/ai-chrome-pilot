---
name: x-get-notifications
description: Inspect notifications on X (Twitter) through ai-chrome-pilot and extract replies or quote reposts without performing likes or other engagement actions. Use when the user wants a read-only pass over X notifications, a candidate list for later review, or a safe pre-check before using another skill such as x-like-notifications.
compatibility: Requires ai-chrome-pilot server (npx tsx src/index.ts) and Google Chrome installed
---

# X (Twitter) Get Notifications

Retrieve notifications from X via ai-chrome-pilot, filtering for replies and quote reposts.

Keep this skill read-only. Do not like, repost, reply, or otherwise engage with notifications here.

## Prerequisites

- ai-chrome-pilot server is running
- User is logged in to X (if not, run the `x-login` skill first)

## Steps

### 1. Resolve the profile name

Use `default` unless the user explicitly requested another profile. This determines which browser profile to load.

### 2. Verify server is running

```bash
curl -s http://127.0.0.1:3333/health
```

If not running, start it with the resolved profile:

```bash
HEADLESS=0 PROFILE_NAME=<profile_name> npx tsx src/index.ts &
sleep 3 && curl -s http://127.0.0.1:3333/health
```

### 3. Navigate to notifications page

```bash
curl -s -X POST http://127.0.0.1:3333/goto \
  -H 'Content-Type: application/json' \
  -d '{"url":"https://x.com/notifications"}'
```

After `sleep 2`, take a screenshot to confirm the page loaded and the user is logged in.

```bash
sleep 2 && curl -s http://127.0.0.1:3333/screenshot -o /tmp/x_notifications.png
```

View `/tmp/x_notifications.png` with the Read tool.

### 4. Ensure the "All" tab is selected

Use `/snapshot` to check the current tab. The "すべて" (All) tab should be selected by default. If the "確認済み" (Verified) tab is active instead, click "すべて".

```bash
curl -s http://127.0.0.1:3333/snapshot
```

### 5. Collect notifications via snapshot

Get the snapshot of the notifications page:

```bash
curl -s http://127.0.0.1:3333/snapshot
```

Review the snapshot output. Notifications appear as `article` elements in the snapshot tree.

### 6. Scroll to load more notifications

To get more notifications, scroll down the page and take another snapshot:

```bash
curl -s -X POST http://127.0.0.1:3333/eval \
  -H 'Content-Type: application/json' \
  -d '{"js":"window.scrollBy(0, window.innerHeight * 2)"}'
```

After `sleep 1`, take another snapshot. Repeat 2-3 times to gather sufficient notifications.

### 7. Filter for replies and quote reposts

From the collected snapshot data, filter notifications by these criteria:

- **Replies**: `article` elements that contain `返信先:` (reply to) in their text content
- **Quote reposts**: `article` elements that contain `引用` (quote) in their text content

Ignore other notification types (likes, follows, etc.).

### 8. Present results to the user

Summarize the filtered notifications:

- For each reply: show who replied, the reply text, and the original post context
- For each quote repost: show who quoted, the quote text, and the original post

Group results by type (replies first, then quote reposts).

If the user later wants to act on some of these notifications, hand off to `x-act-on-notifications` with explicit filters such as action, type, actor, text substring, date, or limit.

### 9. Stop the server (if requested by the user)

```bash
kill $(lsof -ti:3333) 2>/dev/null
kill $(lsof -ti:9222) 2>/dev/null
```

## Important notes

- Do not ask which profile to use unless the user explicitly needs a non-`default` profile
- Add `sleep 1-2` between operations to wait for page loads
- Always use `/snapshot` before each action to get fresh refs
- The notifications page may require scrolling to load all notifications (infinite scroll)
- X's UI is dynamic; notification formats may vary slightly
- If the page shows a login prompt, run the `x-login` skill first
