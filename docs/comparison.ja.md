# ブラウザ自動化ツール比較: このプロジェクト vs Playwright CLI vs Playwright MCP vs OpenClaw

[English version](comparison.md)

## TL;DR

| やりたいこと                                     | おすすめ                     |
| ------------------------------------------------ | ---------------------------- |
| 軽量・シンプルにブラウザ自動化を始めたい / 他システムに組み込みたい | **ai-chrome-pilot** |
| Claude Code / Codex から手軽にブラウザ操作       | **Playwright CLI**           |
| 長時間の自律的な探索操作                          | **Playwright MCP**           |
| エージェント基盤 + サンドボックス + セキュアな運用 | **OpenClaw**                 |

## 概要

AI エージェント（Claude Code 等）からブラウザを操作する主要な4つのアプローチを比較する。

| ツール                                                | 開発元          | アプローチ                          | 接続方式                 |
| ----------------------------------------------------- | --------------- | ----------------------------------- | ------------------------ |
| **このプロジェクト** (ai-chrome-pilot) | オープンソース  | CDP + Playwright (optional) + REST API | HTTP API（任意のクライアント） |
| **Playwright CLI**                                    | Microsoft (OSS) | CLI コマンド                        | Bash 直接実行            |
| **Playwright MCP**                                    | Microsoft (OSS) | Model Context Protocol              | MCP クライアント         |
| **OpenClaw ブラウザ統合**                             | OpenClaw        | CDP + Playwright + Gateway HTTP API | エージェントツール / CLI |

---

## 1. このプロジェクト (ai-chrome-pilot)

### 仕組み

```
ユーザー → Claude Code → curl → Express REST API → CDP (+ Playwright) → Chrome
                                                      ↑
                                                Playwright はオプション
```

PC にインストール済みの Chrome を CDP (Chrome DevTools Protocol) で直接制御。`playwright-core` がインストール済みなら一部操作（goto, click, type, dialog, wait）で自動的に Playwright を活用するハイブリッド方式。ARIA スナップショットと ref ID ベースの要素操作に対応し、CSS セレクタの推測が不要。

### 提供する機能

- ARIA スナップショット + ref ID ベース操作 (`/snapshot`, `/act`)
- ページ遷移 (`/goto`) / クリック (`/click`, `/act`) / テキスト入力 (`/type`, `/act`)
- ドラッグ / ホバー / セレクト / キー入力 (`/act`)
- JavaScript 実行 (`/eval`) / スクリーンショット (`/screenshot`)
- タブ管理 (`/tabs`) / ダイアログ処理 (`/dialog`) / 待機 (`/wait`)
- Cookie 管理 (`/cookies`)
- プロファイル永続化（Cookie / localStorage / IndexedDB 等）
- Chrome 拡張リレーモード（既存タブへのアタッチ）
- 要素遮蔽検知（オーバーレイが被っている場合にエラーを返す）

### 優位性

- **ref ベースの要素操作**: `/snapshot` でページの全操作可能要素が ref ID 付きで一覧される。CSS セレクタの推測が不要で、ページ構造の変更に強い
- **Playwright オプション**: `playwright-core` なしでも CDP のみで全操作可能。`npm install --omit=optional` で軽量にインストールできる
- **セッション永続化**: プロファイルにブラウザ状態を保存し、ログイン状態を次回起動時も維持
- **プロトコル非依存**: 任意の HTTP クライアントで動作する。MCP や専用ツールは不要
- **カスタマイズが容易**: Express サーバーなので、独自エンドポイントの追加や用途に合わせた改造がしやすい
- **Chrome 拡張リレー**: 既存のログイン済みブラウザタブをそのまま操作可能

### 制約

- **単一セッション**: 同時に1つのブラウザセッションしか管理（ただしタブは複数管理可能）
- **初回の手動ログインが必要**: 完全自動化ではなく、ログインはユーザーが行う設計
- **PDF 生成非対応**: ページの PDF エクスポートは未実装
- **ネットワーク / コンソール監視なし**: ネットワークリクエストやコンソールログのキャプチャは非対応

### 適したユースケース

- AI エージェント（Claude Code 等）からのブラウザ操作
- HTTP API として他システムに組み込む
- カスタム要件に合わせたブラウザ制御サーバーの土台にする
- 日常業務の自動化（ログイン済みセッションの再利用）

---

## 2. Playwright CLI

### 仕組み

```
ユーザー → Claude Code → Bash (playwright-cli コマンド) → Playwright → Chrome
```

シェルコマンドとして直接実行する。`snapshot` でページのアクセシビリティツリーを取得し、返された要素ID（`e8`, `e12` 等）を使って操作する。

### 主なコマンド

```bash
playwright-cli open <url> --headed    # ブラウザ起動
playwright-cli snapshot               # ページ構造をYAML形式で取得
playwright-cli fill <要素ID> "テキスト" # テキスト入力
playwright-cli click <要素ID>          # クリック
playwright-cli press Enter             # キー入力
playwright-cli screenshot              # スクリーンショット
playwright-cli state-save <名前>       # 認証状態を保存
playwright-cli state-load <名前>       # 認証状態を復元
playwright-cli list                    # アクティブセッション一覧
playwright-cli close                   # ブラウザ終了
```

### 優位性

- **セレクタ推測が不要**: `snapshot` を実行するとページ上の全操作可能要素が `e8: textbox "検索"` のように一覧で返る。その要素IDをそのまま使って操作できる
- **トークン効率が高い**: Playwright チームのベンチマークで MCP 比 約1/4 のトークン消費（27,000 vs 114,000トークン）。データはディスクに保存され、コンテキストウィンドウを圧迫しない
- **認証状態の保存・復元**: `state-save` / `state-load` で Cookie・LocalStorage を保存でき、ログイン状態を跨いで利用可能
- **Claude Code との高い親和性**: Bash コマンドとして実行するため、特別な設定なしに Claude Code から直接利用できる
- **Playwright の全機能にアクセス可能**: MCP のようにコンテキストサイズの制約で機能を絞る必要がない

### 制約

- **コマンドごとにステートレス**: 各コマンドは独立して実行されるため、複数ステップの操作では毎回 `snapshot` → 操作 の繰り返しになる
- **初期セットアップ**: グローバルインストールとブラウザのインストールが必要
- **長時間セッション**: 永続接続ではないため、長時間に渡る複雑な操作フローでは MCP に劣る場合がある

### 適したユースケース

- AI コーディングエージェント（Claude Code, Codex 等）からのブラウザ操作
- 定型作業のスキル化・自動化
- トークンコストを抑えたい場合
- 複数サイトの認証管理が必要な場合

---

## 3. Playwright MCP

### 仕組み

```
ユーザー → Claude Code (MCP クライアント) → MCP Protocol → Playwright MCP Server → Chrome
```

Model Context Protocol を通じて AI エージェントとブラウザを接続する。アクセシビリティツリーを構造化データとして LLM に渡し、ビジョンモデルやスクリーンショットなしでページを理解できる。

### 主な機能（26ツール）

代表的なもの:

- `navigate` - ページ遷移
- `page_snapshot` - アクセシビリティツリー取得
- `click` / `type` / `fill` - 要素操作
- `press_key` - キーボード操作
- `handle_dialog` - ダイアログ処理
- `screenshot` - スクリーンショット
- その他: PDF生成、ネットワーク監視、コンソール監視、セッション記録・トレース等

### 優位性

- **永続的なブラウザ接続**: セッションを保持し続けるため、複数ステップの複雑な操作でも状態が途切れない
- **構造化データによるページ解析**: アクセシビリティツリーを使い、スクリーンショットやビジョンモデルなしでページ内容を正確に把握
- **探索的な操作に強い**: エージェントがページ構造を理解しながら適応的に操作を進められる。想定外の画面遷移やエラーにも柔軟に対応
- **ブラウザ拡張モード**: 既存のログイン済みブラウザタブに接続できる。手動でログインした状態をそのまま自動化に引き継げる
- **豊富な機能**: 26個のツールで、基本操作からPDF生成、ネットワーク監視まで幅広くカバー

### 制約

- **トークン消費が大きい**: 接続時に全ツールのスキーマがコンテキストに読み込まれる。CLI 比で約4倍のトークン消費
- **MCP 対応クライアントが必要**: MCP プロトコルに対応した AI エージェントでないと利用できない
- **Shadow DOM の制約**: アクセシビリティツリーでは Shadow DOM 内の要素が見えない場合がある（2026年現在の課題）
- **セットアップの複雑さ**: MCP サーバーの設定とクライアント側の接続設定が必要

### 適したユースケース

- 長時間の自律的なブラウザ操作（数時間〜数日に及ぶワークフロー）
- 探索的な操作（事前にページ構造がわからない場合）
- 既存のログイン済みブラウザをそのまま活用したい場合
- 高度な機能（PDF生成、ネットワーク監視等）が必要な場合

---

## 4. OpenClaw ブラウザ統合

### 仕組み

```
ユーザー → OpenClaw エージェント → Gateway (loopback HTTP API) → CDP → Chrome
                                                                    ↑
                                                              Playwright（高度な操作時のみ）
```

OpenClaw は CDP を基盤としつつ、高度な操作（click/type/snapshot/PDF 等）でのみ Playwright を利用するハイブリッドアーキテクチャ。Playwright CLI や Playwright MCP は使わず、独自のブラウザ制御レイヤーを構築している。

### 2つの動作モード

1. **OpenClaw 管理ブラウザ（`openclaw` プロファイル）**
   - OpenClaw が起動する専用の隔離 Chrome プロファイル
   - 個人ブラウザとは完全に分離され、エージェント専用の安全な操作環境
   - Chrome 拡張不要で、Gateway 内の制御サーバーが CDP で直接操作

2. **Chrome 拡張リレーモード（`chrome` プロファイル）**
   - 既存の Chrome タブを制御するモード
   - Chrome MV3 拡張が `chrome.debugger` でタブにアタッチ
   - ローカルリレー（デフォルト `http://127.0.0.1:18792`）経由で Gateway と連携
   - バッジ `ON` でアタッチ状態を確認可能

### 主なコマンド・API

```bash
# ブラウザ起動・管理
openclaw browser start
openclaw browser open https://example.com
openclaw browser resize 1280 720

# ページ構造の取得（ref ID ベース）
openclaw browser snapshot --interactive
# → ref=12: textbox "検索"
# → ref=23: button "送信"

# ref ID を使った操作
openclaw browser click 12
openclaw browser type 23 "テキスト" --submit
openclaw browser press Enter
openclaw browser hover 44
openclaw browser drag 10 11
openclaw browser select 9 OptionA OptionB

# スクリーンショット・PDF
openclaw browser screenshot
openclaw browser pdf

# その他
openclaw browser navigate https://example.com
openclaw browser dialog --accept
openclaw browser wait --text "Done"
openclaw browser evaluate --fn '(el) => el.textContent' --ref 7
openclaw browser console --level error
```

### Gateway HTTP API

ローカルのループバック HTTP API も公開される：

| エンドポイント                                                                  | 用途                   |
| ------------------------------------------------------------------------------- | ---------------------- |
| `GET /` / `POST /start` / `POST /stop`                                          | ステータス・起動・停止 |
| `GET /tabs` / `POST /tabs/open` / `POST /tabs/focus` / `DELETE /tabs/:targetId` | タブ管理               |
| `GET /snapshot` / `POST /screenshot`                                            | ページ取得             |
| `POST /navigate` / `POST /act`                                                  | ページ遷移・操作       |
| `POST /hooks/file-chooser` / `POST /hooks/dialog`                               | フック処理             |

### 認証の仕組み

- **手動ログインが基本**: エージェントに認証情報を渡さない設計。ユーザーが `openclaw` プロファイルで手動ログインし、エージェントがそのセッションを引き継ぐ
- **セッション永続化**: 隔離プロファイルにログイン状態が保持される。Cookie/Storage の操作も CLI/API から可能
- **自動ログイン非推奨**: アンチボット対策によるアカウントロックのリスクを回避するため

```bash
# 手動ログインの流れ
openclaw browser start
openclaw browser open https://x.com
# → ユーザーがブラウザ UI で手動ログイン
# → 以降、エージェントがログイン済みセッションで操作可能
```

### Playwright の位置づけ

OpenClaw では Playwright は**オプション依存**：

| 操作                                        | Playwright なし | Playwright あり |
| ------------------------------------------- | :-------------: | :-------------: |
| タブ管理（一覧/開く/閉じる）                |        o        |        o        |
| ARIA スナップショット（基本）               |        o        |        o        |
| 基本スクリーンショット                      |        o        |        o        |
| click / type / drag / select                |        x        |        o        |
| AI スナップショット / Role スナップショット |        x        |        o        |
| 要素スクリーンショット                      |        x        |        o        |
| PDF 生成                                    |        x        |        o        |
| navigate / act                              |        x        |        o        |

Playwright 未インストール時は 501 エラーが返り、利用可能な操作のみが動作する。

### 優位性

- **CDP + Playwright のハイブリッド**: Playwright が必須ではなく、CDP だけで基本操作が可能。依存を最小化しつつ、必要に応じて Playwright の高度な機能を利用
- **隔離されたブラウザプロファイル**: 個人ブラウザと完全に分離された `openclaw` プロファイルで、安全にエージェント操作を実行
- **手動ログイン + セッション再利用**: アンチボット対策を回避しつつ、ログイン済みセッションをエージェントが引き継ぐ現実的な設計
- **ref ベースの要素操作**: snapshot で各要素に ref ID が振られ、CSS セレクタの推測が不要（Playwright CLI の `e8` 方式と同様の発想を独自実装）
- **Chrome 拡張リレー**: 既存のブラウザタブにアタッチして操作できる。手動で開いたタブをそのままエージェントに引き渡し可能
- **サンドボックス対応**: サンドボックス環境でのホストブラウザ制御に対応し、セキュリティを考慮した設計
- **豊富な操作**: click/type に加え、drag、select、hover、file upload、dialog 処理、console 監視など実用的な操作を網羅

### 制約

- **OpenClaw エコシステムに依存**: OpenClaw の Gateway やエージェント基盤が必要。単体のツールとしては利用できない
- **初回の手動ログインが必要**: 完全自動化はできず、ユーザーの介入が必要
- **セッション期限**: Cookie の有効期限が切れた場合は再ログインが必要

### 適したユースケース

- 日常業務の自動化（複数サイトへのログイン済みセッションを活用）
- OpenClaw エージェントを通じたブラウザ操作の本格運用
- セキュリティを考慮したブラウザ自動化（隔離プロファイル + 手動認証）
- 定型業務のスキル化と反復実行

---

## このプロジェクトと OpenClaw の関係

このプロジェクト（ai-chrome-pilot）は、OpenClaw ブラウザ統合の**核となるアーキテクチャ（CDP + Playwright + HTTP API）を参考に、同等の機能を独立した REST API サーバーとして実装**したものである。

```
ai-chrome-pilot:
  Express REST API → CDP (+ Playwright) → Chrome
  ・ARIA スナップショット + ref ID ベース操作
  ・Playwright オプション（自動検知 + ハイブリッド）
  ・プロファイル永続化（Cookie / localStorage / IndexedDB）
  ・Chrome 拡張リレーモード
  ・要素遮蔽検知

OpenClaw:
  Gateway HTTP API → CDP (+ Playwright) → Chrome
  ・ref ID ベース操作（snapshot 連携）
  ・手動ログイン + セッション管理
  ・Chrome 拡張リレー
  ・サンドボックス対応
  ・エージェント基盤との統合
```

主な違いは、OpenClaw が専用エージェント基盤（Gateway + CLI）との統合を前提とするのに対し、ai-chrome-pilot は `curl` や任意の HTTP クライアントから単体で利用できる点にある。

---

## 総合比較

比較表の凡例: **o** = 対応, **x** = 非対応, **◎** = 優れている, **○** = 良い, **△** = 限定的

### 機能比較

| 機能                         | このプロジェクト |   Playwright CLI    |     Playwright MCP     |              OpenClaw               |
| ---------------------------- | :--------------: | :-----------------: | :--------------------: | :---------------------------------: |
| ページ遷移                   |        o         |          o          |           o            |                  o                  |
| クリック / テキスト入力      |        o         |          o          |           o            |                  o                  |
| スクリーンショット           |        o         |          o          |           o            |                  o                  |
| ページ構造の自動解析         | o (snapshot + ref ID) |    o (snapshot)     |   o (page_snapshot)    |        o (snapshot + ref ID)        |
| 認証状態の保存・復元         | o (プロファイル永続化) | o (state-save/load) | o (persistent profile) | o (隔離プロファイル + 手動ログイン) |
| 複数セッション管理           | o (マルチプロファイル) |          o          |           o            |       o (マルチプロファイル)        |
| JavaScript 実行              |    o (/eval)     |          o          |           o            |            o (evaluate)             |
| PDF 生成                     |        x         |          o          |           o            |                  o                  |
| ネットワーク監視             |        x         |          x          |           o            |             o (console)             |
| ダイアログ処理               |    o (/dialog)   |          x          |           o            |             o (dialog)              |
| 既存ブラウザタブ接続         | o (Chrome 拡張リレー) |          x          |     o (拡張モード)     |        o (Chrome 拡張リレー)        |
| ドラッグ / ホバー / セレクト |    o (/act)      |          x          |           x            |                  o                  |
| ファイルアップロード         |        x         |          x          |           x            |                  o                  |
| サンドボックス対応           |        x         |          x          |           x            |                  o                  |
| Playwright なしでの動作      |    o (全操作)    |          x          |           x            |          o (基本操作のみ)           |

### 非機能比較

| 観点               | このプロジェクト | Playwright CLI | Playwright MCP |       OpenClaw       |
| ------------------ | :--------------: | :------------: | :------------: | :------------------: |
| セットアップ容易性 |      ◎ ^1        |       ○        |       △        |   △ (Gateway 必要)   |
| トークン効率       | ○ (ref ベース)   |     ◎ ^2       |       △        |    ○ (ref ベース)    |
| コード理解の容易さ |      ○ ^3        |   △ (大規模)   |   △ (大規模)   |      △ (大規模)      |
| カスタマイズ性     |      ◎ ^4        |       ○        |       ○        |          ○           |
| 長時間セッション   | ◎ (プロファイル永続) |       ○        |       ◎        | ◎ (プロファイル永続) |
| エラー耐性         |   ○ (遮蔽検知)   |       ○        |       ◎        |          ◎           |
| 認証のセキュリティ | ○ (プロファイル隔離) |       ○        |       ○        | ◎ (隔離 + 手動認証)  |
| 日常業務の自動化   |        ○         |       ○        |       ○        |          ◎           |

> ^1 `npm install && npm run dev` のみで起動可能。外部サーバーや MCP 設定は不要
> ^2 Playwright チームのベンチマーク: タスクあたり約 27k トークン vs MCP の約 114k トークン
> ^3 約 2k 行（TypeScript）。Playwright CLI / MCP / OpenClaw はそれぞれ 10k 行以上
> ^4 Express サーバーなのでルートやミドルウェアの追加にフレームワーク制約がない

### 選択ガイド

```
軽量・シンプルにブラウザ自動化を始めたい / 他システムに組み込みたい
  → ai-chrome-pilot

Claude Code から手軽にブラウザ操作したい / 定型作業をスキル化したい
  → Playwright CLI

長時間の複雑な自律操作 / 探索的なタスク
  → Playwright MCP

エージェント基盤との統合 / サンドボックス対応 / セキュアな本格運用
  → OpenClaw ブラウザ統合
```

---

## 参考リンク

- [OpenClaw ブラウザツール ドキュメント](https://github.com/openclaw/openclaw) - OpenClaw のブラウザ統合機能
- [Microsoft Playwright MCP (GitHub)](https://github.com/microsoft/playwright-mcp)
- [Playwright CLI vs. MCP: Browser Automation for Coding Agents | Better Stack](https://betterstack.com/community/guides/ai/playwright-cli-vs-mcp-browser/)
- [Playwright CLI: The Token-Efficient Alternative | TestCollab](https://testcollab.com/blog/playwright-cli)
- [Why less is more: The Playwright proliferation problem with MCP | Speakeasy](https://www.speakeasy.com/blog/playwright-tool-proliferation)
- [6 most popular Playwright MCP servers for AI testing in 2026 | Bug0](https://bug0.com/blog/playwright-mcp-servers-ai-testing)
