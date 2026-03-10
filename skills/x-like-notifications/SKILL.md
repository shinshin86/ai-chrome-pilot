---
name: x-like-notifications
description: Like selected unliked notifications on X (Twitter) through ai-chrome-pilot. Use when the user wants to open X notifications, identify reply or quote repost notifications, filter them by explicit criteria such as type, actor, text, date, or limit, and click like only on the matching items while avoiding accidental likes.
---

# X Like Notifications

Use ai-chrome-pilot to inspect X notifications, build a candidate list, and like only the notifications that match the user's criteria.

Keep the skill profile-agnostic. Ask for the profile name at runtime instead of hardcoding any specific profile.

Use this skill for action-taking. If the user only wants to inspect notifications first, use `x-get-notifications` instead.

## Prerequisites

- ai-chrome-pilot server is available in the current repo
- Google Chrome is installed
- The user is already logged in to X in the chosen Chrome profile
- The UI is expected to be Japanese; match labels such as `すべて`, `@ツイート`, `いいねする`, and `いいねしました`

If X shows a login screen, stop and use `x-login` first.

## Inputs To Confirm

Confirm these before acting:

- `profile_name`: default to `default` if the user did not specify
- `types`: `reply`, `quote`, or both
- `filters`: actor handle/name, text substring, date substring, and optional limit
- `mode`: `dry-run` or `execute`

If the user says only "like notifications" without enough detail, default to `dry-run` and present candidates first instead of clicking anything.

Recommended decision rule:

- Use `x-get-notifications` for read-only collection and review
- Use `x-like-notifications` only after the user has supplied clear like conditions

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

### 2. Open notifications

Navigate to notifications and wait for rendering:

```bash
curl -s -X POST http://127.0.0.1:3333/goto \
  -H 'Content-Type: application/json' \
  -d '{"url":"https://x.com/notifications"}'
sleep 2
```

Take a screenshot to confirm the user is logged in and the page loaded:

```bash
curl -s http://127.0.0.1:3333/screenshot -o /tmp/x_notifications.png
```

### 3. Inspect both notification tabs

Check both:

- `すべて`: quote reposts often appear here
- `@ツイート`: replies often appear here

Before any click, take a fresh `/snapshot` and use fresh refs from that snapshot only.

If the needed tab is not active, click the corresponding tab ref, then wait briefly and take another `/snapshot`.

### 4. Collect candidate notifications

Use `/snapshot` and limited scrolling to gather visible notifications. Repeat 2-3 times when needed:

```bash
curl -s http://127.0.0.1:3333/snapshot
curl -s -X POST http://127.0.0.1:3333/eval \
  -H 'Content-Type: application/json' \
  -d '{"js":"window.scrollBy(0, window.innerHeight * 2)"}'
sleep 1
```

Normalize each candidate with:

- `tab`: `all` or `mentions`
- `type`: `reply` if it contains `返信先:`, `quote` if it contains `引用`
- `actor`: display name and handle when visible
- `date`: visible date text such as `3月3日`
- `notification_text`: reply or quote text
- `original_post_text`: quoted or replied-to post text when visible
- `like_ref`: ref of the like button in the same article
- `like_state`: `liked` if the button says `いいねしました`, `unliked` if it says `いいねする`

Ignore likes, follows, reposts, and any article that cannot be matched confidently to a like button.

### 5. Apply filters conservatively

Only keep candidates that satisfy all user-specified filters.

Useful filter patterns:

- `types=reply`
- `types=quote`
- `actor contains @shinshin86`
- `text contains ひな祭り`
- `date contains 3月1日`
- `limit=2`

If multiple candidates still match and the user asked for one specific item, stop and show the narrowed list instead of clicking.

If no explicit filters were supplied, propose a candidate list grouped by reply and quote, then wait for confirmation unless the user clearly asked to like all unliked matches of a broad class such as "all replies".

### 6. Execute likes

In `dry-run` mode, do not click anything. Return the matched candidates with enough detail for the user to confirm.

In `execute` mode:

1. Click only candidates whose `like_state` is `unliked`
2. Click the `like_ref`, not a surrounding article or link
3. Wait `1` second after each click
4. Refresh `/snapshot` before the next click
5. Stop immediately if the page state becomes ambiguous

Example:

```bash
curl -s -X POST http://127.0.0.1:3333/act \
  -H 'Content-Type: application/json' \
  -d '{"ref":"<like_ref>","action":"click"}'
sleep 1
```

### 7. Verify and report

After clicking, verify by taking a new `/snapshot` or screenshot when possible.

Report:

- which candidates matched
- which ones were already liked and skipped
- which refs were clicked
- any verification gaps or transient connection errors

## Safety Rules

- Never hardcode a profile name
- Never like anything if the matching logic is ambiguous
- Prefer `dry-run` first unless the user clearly requested execution
- Use fresh refs from the latest `/snapshot`; do not reuse stale refs after scrolling or clicking
- Check both tabs before saying there are no matches
- If `Browser connection is closed` or `CDP client is not connected` appears, restart the server and re-verify
- If X appears in a non-Japanese locale, adapt the label matching before clicking

## Output Format

When reporting candidates in `dry-run`, include:

- `type`
- `actor`
- `date`
- `notification_text`
- `original_post_text` when visible
- `like_state`
- why the item matched the filters

When reporting `execute`, include:

- clicked items
- skipped items already liked
- items excluded by filters
- any verification gap
