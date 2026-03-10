---
name: x-like-notifications
description: Like selected unliked notifications on X (Twitter) through ai-chrome-pilot. Use this as a compatibility trigger when the user explicitly asks to like notifications; prefer x-act-on-notifications for the generalized notification action workflow that also supports bookmark and repost.
---

# X Like Notifications

Treat this as the compatibility alias for `x-act-on-notifications` with `action=like`.

Use the same workflow and safety rules as `x-act-on-notifications`, but fix the action to `like`.

When this skill triggers:

1. Use `x-act-on-notifications`
2. Set `action=like`
3. Keep the user's remaining filters unchanged

Examples:

- "通知にいいねして"
  - route to `x-act-on-notifications` with `action=like`
- "shinshin86 の引用通知だけいいねして"
  - route to `x-act-on-notifications` with `action=like`, `types=quote`, `actor contains @shinshin86`

If the user instead wants bookmark or repost, do not use this skill. Use `x-act-on-notifications` directly.
