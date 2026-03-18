#!/usr/bin/env node

import fs from 'node:fs';
import process from 'node:process';

function parseArgs(argv) {
  const args = {};
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (!arg.startsWith('--')) {
      continue;
    }
    const key = arg.slice(2);
    const next = argv[i + 1];
    if (!next || next.startsWith('--')) {
      args[key] = 'true';
      continue;
    }
    args[key] = next;
    i += 1;
  }
  return args;
}

function sanitizePrefix(value) {
  return value.replace(/[^a-zA-Z0-9_-]+/g, '_').replace(/_+/g, '_').replace(/^_|_$/g, '');
}

function splitScheduledName(name) {
  const match = name.match(/^(?<scheduledAt>.+?に送信されます)\s*(?<text>[\s\S]*)$/);
  return {
    scheduledAt: match?.groups?.scheduledAt ?? name,
    text: match?.groups?.text ?? ''
  };
}

function extractItems(snapshot) {
  const refs = Array.isArray(snapshot?.refs) ? snapshot.refs : [];
  const seen = new Set();
  const items = [];

  for (const ref of refs) {
    if (ref?.role !== 'button' || typeof ref?.name !== 'string') {
      continue;
    }
    if (!/^\d{4}年.*に送信されます/.test(ref.name)) {
      continue;
    }

    const { scheduledAt, text } = splitScheduledName(ref.name);
    const dedupeKey = `${scheduledAt}\u0000${text}`;
    if (seen.has(dedupeKey)) {
      continue;
    }
    seen.add(dedupeKey);

    items.push({
      index: items.length + 1,
      ref: ref.ref ?? '',
      scheduledAt,
      text
    });
  }

  return items;
}

function buildMarkdown(stamp, items) {
  const lines = [`# X Scheduled Posts (${stamp})`, '', `count: ${items.length}`, ''];

  for (const item of items) {
    lines.push(`${item.index}. ${item.scheduledAt}`);
    lines.push(`   ${item.text}`);
    lines.push('');
  }

  return lines.join('\n');
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  const prefix = sanitizePrefix(args.prefix || 'x_scheduled_posts');
  const stamp = args.stamp || new Date().toISOString().slice(0, 10);
  const input = fs.readFileSync(0, 'utf8');

  if (!input.trim()) {
    throw new Error('stdin is empty');
  }

  const snapshot = JSON.parse(input);
  const items = extractItems(snapshot);

  const snapshotFile = `${prefix}_snapshot_${stamp}.json`;
  const listJsonFile = `${prefix}_list_${stamp}.json`;
  const listMdFile = `${prefix}_list_${stamp}.md`;

  fs.writeFileSync(snapshotFile, input);
  fs.writeFileSync(
    listJsonFile,
    `${JSON.stringify({ generatedAt: stamp, count: items.length, items }, null, 2)}\n`
  );
  fs.writeFileSync(listMdFile, `${buildMarkdown(stamp, items)}\n`);

  globalThis.console.log(
    JSON.stringify(
      {
        ok: true,
        count: items.length,
        files: {
          snapshot: snapshotFile,
          listJson: listJsonFile,
          listMarkdown: listMdFile
        },
        first: items[0] ?? null,
        last: items.at(-1) ?? null
      },
      null,
      2
    )
  );
}

main();
