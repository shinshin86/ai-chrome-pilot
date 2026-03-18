---
name: x-get-scheduled-posts
description: Inspect the scheduled posts list on X (Twitter) through ai-chrome-pilot without creating or modifying posts. Use when the user wants a read-only inventory of currently scheduled posts, wants to know what is queued in a profile, or wants to export that list to files in the current directory.
---

# X Get Scheduled Posts

Use ai-chrome-pilot to open X's scheduled-posts list, collect the currently queued posts, and optionally export the result to files.

Keep this skill read-only. Do not create, edit, reschedule, or delete posts here.

Keep the skill profile-agnostic. Use `default` unless the user explicitly requested another profile.

## Prerequisites

- ai-chrome-pilot server is available in the current repo
- Google Chrome is installed
- The user is already logged in to X in the chosen Chrome profile
- The UI is expected to be Japanese; match labels such as `ポストする`, `下書き`, `予約済み`, `戻る`, and `閉じる`

If X shows a login screen, stop and use `x-login` first.

## Inputs To Resolve

Resolve these before acting:

- `profile_name`: default to `default` if unspecified
- `export`: `true` only when the user asked to save files
- `output_prefix`: optional file prefix when exporting
- `output_dir`: optional target directory when exporting

Default resolution rules:

- If `profile_name` is unspecified, use `default` without asking
- If the user asked to "一覧を見る", default to read-only inspection with no file export
- If the user asked to save or write out the list, default `export=true`
- If `output_prefix` is unspecified, use `<profile_name>_scheduled_posts`
- If `output_dir` is unspecified, write to the current directory

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

### 2. Open X home

```bash
curl -s -X POST http://127.0.0.1:3333/goto \
  -H 'Content-Type: application/json' \
  -d '{"url":"https://x.com"}'
sleep 2
```

Take a fresh snapshot before every click:

```bash
curl -s http://127.0.0.1:3333/snapshot
```

### 3. Open the scheduled posts list

Use fresh refs from the current snapshot only.

1. Click `link "ポストする"`
2. Take a new snapshot
3. Click `button "下書き"`
4. Take a new snapshot
5. Click `tab "予約済み"`
6. Wait `1-2` seconds and take another snapshot

Example actions:

```bash
curl -s -X POST http://127.0.0.1:3333/act \
  -H 'Content-Type: application/json' \
  -d '{"ref":"<post_link_ref>","action":"click"}'
```

```bash
curl -s -X POST http://127.0.0.1:3333/act \
  -H 'Content-Type: application/json' \
  -d '{"ref":"<draft_button_ref>","action":"click"}'
```

```bash
curl -s -X POST http://127.0.0.1:3333/act \
  -H 'Content-Type: application/json' \
  -d '{"ref":"<scheduled_tab_ref>","action":"click"}'
```

### 4. Collect scheduled entries

From the latest `/snapshot`, inspect the `refs` array and keep only entries that satisfy all of these:

- `role === "button"`
- `name` starts with a Japanese year such as `2026年`
- `name` contains `に送信されます`

Split each entry into:

- `scheduledAt`: the leading `...に送信されます`
- `text`: the remaining post body

De-duplicate by `scheduledAt + text`.

If the visible list looks incomplete and the user asked for an exhaustive pass, scroll and merge 1-2 more snapshots:

```bash
curl -s -X POST http://127.0.0.1:3333/eval \
  -H 'Content-Type: application/json' \
  -d '{"js":"window.scrollBy(0, window.innerHeight * 2)"}'
sleep 1
curl -s http://127.0.0.1:3333/snapshot
```

### 5. Export to files when requested

Prefer the bundled helper script. It reads the scheduled-posts snapshot from stdin and writes:

- `<prefix>_snapshot_<stamp>.json`
- `<prefix>_list_<stamp>.json`
- `<prefix>_list_<stamp>.md`

Run it from the target directory, or `cd` there first.

```bash
STAMP=$(date +%F)
PREFIX=<resolved_prefix>
curl -s http://127.0.0.1:3333/snapshot | \
  node skills/x-get-scheduled-posts/scripts/export_scheduled_posts.js \
    --prefix "$PREFIX" \
    --stamp "$STAMP"
```

If the current harness makes `curl > file` unreliable, keep using the pipeline above instead of shell redirection.

### 6. Report results

Return:

- total `count`
- first scheduled item
- last scheduled item
- whether the result is a partial or exhaustive pass
- exported file paths, when applicable

## Safety Rules

- Never create, edit, or delete a scheduled post in this skill
- Do not click `編集` unless the user explicitly requested an edit workflow
- Use fresh refs from the latest `/snapshot`
- Stop if X shows a login screen or the scheduled list cannot be identified confidently
- If `Browser connection is closed` or `CDP client is not connected` appears, restart the server and reopen the scheduled list before continuing

