# ai-chrome-pilot

![Logo](https://github.com/shinshin86/ai-chrome-pilot/blob/main/images/logo.png)

[English version](README.md)

AI エージェント向けの軽量ブラウザ自動化サーバー。Chrome DevTools Protocol (CDP) を利用し、最小限の依存関係で動作します。
PC にインストール済みの Google Chrome を自動検出して起動し、HTTP API としてブラウザ操作を公開します。

ARIA スナップショットと ref ID ベースの要素操作に対応し、CSS セレクタの推測なしでページ要素を操作できます。

## 特徴

- **ref ベースの要素操作**: `/snapshot` でページの操作可能な要素を ref ID 付きで一覧取得し、`/act` で ref を指定して操作
- **Playwright オプション**: `playwright-core` がインストール済みなら一部操作を自動的に Playwright で実行（なくても CDP のみで全操作可能）
- **セッション永続化**: Cookie / localStorage / IndexedDB 等をプロファイルに保存し、ログイン状態を維持
- **要素遮蔽検知**: クリック時にオーバーレイ等で要素が隠れている場合はエラーを返す

## 注意事項

> **本プロジェクトは実験的なプロジェクトです。** 予期せぬ動作が起こり得る可能性があることをご了承の上ご利用ください。
>
> また、**このツールは AI エージェントに実際のブラウザを操作させます。** AI エージェントは意図しない操作（誤ったボタンのクリック、予期しないページへの遷移、フォームの送信など）をユーザーの明示的な承認なしに行う可能性があります。本番サイトや重要なアカウントにログインした状態での使用には十分ご注意ください。エージェントの動作を常に監視し、`EPHEMERAL=1` や専用プロファイルを使用して影響範囲を限定することを推奨します。

## 前提条件

- Node.js 20 以上
- ローカルに Chrome / Chromium / Edge / Brave のいずれかがインストール済み

## セットアップ

```bash
npm install
```

`playwright-core` はオプション依存です。Playwright なしで使う場合：

```bash
npm install --omit=optional
```

## 起動

```bash
# 画面付き（デフォルト、セッション永続化あり）
npm run dev

# ヘッドレス（画面なし）
HEADLESS=1 npm run dev

# 一時セッション（セッションを保持しない）
EPHEMERAL=1 npm run dev
```

起動後 `curl -s http://127.0.0.1:3333/health` で `{"ok":true}` が返れば準備完了です。

## API 一覧

### スナップショット & ref ベース操作（推奨）

| Endpoint    | Method | Body                                                      | Response                 |
| ----------- | ------ | --------------------------------------------------------- | ------------------------ |
| `/snapshot` | GET    | -                                                         | `{ ok, snapshot, refs }` |
| `/act`      | POST   | `{ "ref": "e1", "action": "click" }`                      | `{ ok: true }`           |
| `/act`      | POST   | `{ "ref": "e3", "action": "type", "value": "テキスト" }`  | `{ ok: true }`           |
| `/act`      | POST   | `{ "ref": "e1", "action": "drag", "targetRef": "e2" }`    | `{ ok: true }`           |
| `/act`      | POST   | `{ "ref": "e5", "action": "select", "values": ["opt1"] }` | `{ ok: true }`           |
| `/act`      | POST   | `{ "ref": "e1", "action": "press", "key": "Enter" }`      | `{ ok: true }`           |

`/act` のアクション: `click`, `type`, `clear`, `focus`, `scroll`, `hover`, `drag`, `select`, `press`

### 基本操作（CSS セレクタベース）

CSS セレクタを直接指定する API です。多くの場合、上記の ref ベース API の利用を推奨します。

| Endpoint      | Method | Body                                   | Response             |
| ------------- | ------ | -------------------------------------- | -------------------- |
| `/health`     | GET    | -                                      | `{ ok: true }`       |
| `/goto`       | POST   | `{ "url": "..." }`                     | `{ ok, url, title }` |
| `/click`      | POST   | `{ "selector": "..." }`                | `{ ok: true }`       |
| `/type`       | POST   | `{ "selector": "...", "text": "..." }` | `{ ok: true }`       |
| `/eval`       | POST   | `{ "js": "..." }`                      | `{ ok, result }`     |
| `/screenshot` | GET    | -                                      | PNG binary           |

### タブ管理

| Endpoint          | Method | Body                    | Response                       |
| ----------------- | ------ | ----------------------- | ------------------------------ |
| `/tabs`           | GET    | -                       | `{ ok, tabs }`                 |
| `/tabs/open`      | POST   | `{ "url": "..." }`（省略可。デフォルト: `about:blank`） | `{ ok, targetId, title, url }` |
| `/tabs/focus`     | POST   | `{ "targetId": "..." }` | `{ ok: true }`                 |
| `/tabs/:targetId` | DELETE | -                       | `{ ok: true }`                 |

### ダイアログ・待機

| Endpoint  | Method | Body                                           | Response                           |
| --------- | ------ | ---------------------------------------------- | ---------------------------------- |
| `/dialog` | GET    | -                                              | `{ ok, pending, type?, message? }` |
| `/dialog` | POST   | `{ "accept": true, "promptText": "..." }`      | `{ ok: true }`                     |
| `/wait`   | POST   | `{ "text": "..." }` or `{ "selector": "..." }`（`timeout` ミリ秒を任意指定可） | `{ ok: true }`                     |

### Cookie 管理

| Endpoint   | Method | Body                                 | Response          |
| ---------- | ------ | ------------------------------------ | ----------------- |
| `/cookies` | GET    | -                                    | `{ ok, cookies }` |
| `/cookies` | POST   | `{ "cookies": [...] }`               | `{ ok: true }`    |
| `/cookies` | DELETE | `{ "name": "...", "domain": "..." }` または `{}`（全削除） | `{ ok: true }`    |

## 使用例

```bash
# ページ遷移
curl -s -X POST http://127.0.0.1:3333/goto \
  -H 'Content-Type: application/json' \
  -d '{"url":"https://www.google.com"}'

# スナップショットで操作可能な要素を確認
curl -s http://127.0.0.1:3333/snapshot
```

スナップショットのレスポンスには、ref ID 付きの ARIA ツリーと構造化された refs 配列が含まれます：

```json
{
  "ok": true,
  "snapshot": "- navigation\n  - link \"About\" [ref=e1]\n  - link \"Store\" [ref=e2]\n- search\n  - textbox \"検索\" [ref=e3]\n  - button \"Google 検索\" [ref=e5]",
  "refs": [
    { "ref": "e1", "role": "link", "name": "About", "backendNodeId": 42 },
    { "ref": "e3", "role": "textbox", "name": "検索", "backendNodeId": 58 },
    { "ref": "e5", "role": "button", "name": "Google 検索", "backendNodeId": 73 }
  ]
}
```

スナップショットの ref ID を使って要素を操作します：

```bash
# ref を使ってテキスト入力
curl -s -X POST http://127.0.0.1:3333/act \
  -H 'Content-Type: application/json' \
  -d '{"ref":"e3","action":"type","value":"検索ワード"}'

# ref を使ってクリック
curl -s -X POST http://127.0.0.1:3333/act \
  -H 'Content-Type: application/json' \
  -d '{"ref":"e5","action":"click"}'

# スクリーンショット取得
curl -s http://127.0.0.1:3333/screenshot -o screenshot.png
```

## 環境変数

| Variable           | Default                      | Description                                   |
| ------------------ | ---------------------------- | --------------------------------------------- |
| `CONTROL_PORT`     | 3333                         | HTTP サーバーポート                           |
| `CDP_PORT`         | 9222                         | CDP ポート                                    |
| `HEADLESS`         | 0                            | ヘッドレスモード (1=有効)                     |
| `NO_SANDBOX`       | 0                            | サンドボックス無効化                          |
| `EVALUATE_ENABLED` | 1                            | /eval エンドポイント有効化                    |
| `CHROME_PATH`      | (auto)                       | Chrome 実行ファイルパス                       |
| `PROFILE_NAME`     | default                      | プロファイル名                                |
| `PROFILE_DIR`      | ~/.ai-chrome-pilot/profiles/ | プロファイルディレクトリ                      |
| `USER_DATA_DIR`    | (unset)                      | Chrome の user data dir を明示指定（profile ベースのパス選択より優先） |
| `EPHEMERAL`        | 0                            | 一時セッション (1=有効、セッション保持しない) |

## プロファイルとセッション管理

デフォルトでブラウザの状態（Cookie、localStorage、IndexedDB、Service Worker 等）は `~/.ai-chrome-pilot/profiles/default/` に永続化されます。

```bash
# 仕事用プロファイル
PROFILE_NAME=work npm run dev

# テスト用の一時セッション（プロファイルを汚さない）
EPHEMERAL=1 npm run dev
```

既に開いているブラウザタブへアタッチしたい場合は、Playwright MCP や OpenClaw などの専用ツールを利用してください。このプロジェクトは、管理対象のローカル Chrome プロファイルを一つ扱う構成に意図的に絞っています。

## 開発

```bash
npm run dev      # 開発サーバー起動
npm run build    # TypeScript ビルド
npm run test     # テスト実行 (vitest)
npm run lint     # ESLint
npm run format   # Prettier
```

## `/eval` の注意

`/eval` はページコンテキストで任意 JavaScript を実行するため危険です。信頼できない入力を受け取る環境では無効化してください。

```bash
EVALUATE_ENABLED=0 npm run dev
```

## AI エージェントからの利用（Claude Code 等）

このサーバーは AI コーディングエージェントが `curl` 経由で操作することを想定しています。以下はエージェントによるブラウザ自動操作のコツです。

### 起動と停止

コマンド実行前にサーバーをバックグラウンドで起動します：

```bash
# 起動（エージェント利用時はヘッドレス推奨）
HEADLESS=1 npx tsx src/index.ts &

# 確認
curl -s http://127.0.0.1:3333/health

# 停止
kill $(lsof -ti:3333) 2>/dev/null
kill $(lsof -ti:9222) 2>/dev/null
```

### 推奨ワークフロー

1. **まず `/snapshot` を実行する** — 操作可能な全要素が ref ID 付きで返されるため、CSS セレクタの推測が不要
2. **`/act` で ref ID を指定して操作する** — CSS セレクタベースの `/click` や `/type` より確実
3. **遷移やクリック後は 2-3 秒待つ** — ページの描画完了前にスナップショットやスクリーンショットを取ると不完全な結果になる
4. **`/screenshot` で画面を目視確認する** — スナップショットだけではページの状態が分かりにくい場合に、一時ファイルに保存して確認する
5. **`/eval` でテキストを抽出する** — スクリーンショットから読み取りにくい情報は、JavaScript で DOM から直接テキストを取得する

### よくある問題への対処

- **ポップアップやオーバーレイ**: クリックが遮蔽エラーになった場合、`/snapshot` でモーダルやオーバーレイを確認し、先にそれを閉じる
- **意図しないタブ**: リンクをクリックした後、`/tabs` で新しいタブが開いていないか確認する。`/tabs/focus` で切り替え、不要なタブは `DELETE /tabs/:targetId` で閉じる
- **古いスナップショット**: ページが変化する操作（遷移、クリック、入力）の後は必ず新しい `/snapshot` を取得する
- **Google 検索のコツ**: `/goto` で `https://www.google.com/search?q=...` に直接遷移すると、同意ポップアップを回避できる

### セッション永続化

デフォルトでログイン状態はサーバー再起動後も維持されます（プロファイルは `~/.ai-chrome-pilot/profiles/default/` に保存）。手動ログイン後、エージェントは次回以降そのセッションを再利用できます。クリーンなセッションで開始するには `EPHEMERAL=1` を使用してください。

## トラブルシュート

### Chrome が見つからない

`CHROME_PATH` を明示指定してください。

```bash
CHROME_PATH='/Applications/Google Chrome.app/Contents/MacOS/Google Chrome' npm run dev
```

### ポート競合

`CDP_PORT` または `CONTROL_PORT` を変更してください。

### Linux で sandbox エラー

必要に応じて `NO_SANDBOX=1` を利用してください（セキュリティリスクを理解した上で使用）。

## Agent Skills

このプロジェクトには、X (Twitter) の定型操作を自動化するための [Agent Skills](https://agentskills.io/) が `skills/` ディレクトリに含まれています。

| Skill | Description |
| ----- | ----------- |
| `x-login` | ブラウザで X にログイン（ログイン操作はユーザーが手動実施、セッションを永続化） |
| `x-schedule-post` | X の予約投稿を作成し、予約済み一覧で確認 |
| `x-get-notifications` | X の通知を取得し、返信/引用リポストを抽出 |

### Claude Code で使う

`.claude/skills/`（gitignore 対象）へ skills をコピーしてください。

```bash
mkdir -p .claude/skills
cp -r skills/* .claude/skills/
```

### 他エージェントで使う

エージェント製品ごとに参照する skills の配置先が異なる場合があります。各製品のドキュメントに従って `skills/` をコピーまたはシンボリックリンクしてください。

## CI

GitHub Actions (`.github/workflows/ci.yml`) で `npm run lint` と `npm run test` を実行します。

## ライセンス

MIT
