# ぶつかりおじさんバスター

突っ込んでくるおじさんに体当たりを返してぶっとばすブラウザゲームです。
通常モード（全5ステージ、21エリア）と、距離でランキングを競うエンドレスモードがあります。

公開先: https://butsukari-ojisan-buster.kirakun.com

## 構成

| 場所 | 中身 |
|---|---|
| `public/` | ゲーム本体（HTML、CSS、JS）。依存ライブラリなし |
| `public/js/rules.js` | 判定、おじさんの動きと仕掛け、ステージの構成、距離の計算 |
| `public/js/art.js` | おじさんと主人公の絵、駅のホームの背景、演出の部品 |
| `public/js/scenes.js` | 商店街、電気街、オフィス街、飲み屋横丁の背景 |
| `worker/` | Cloudflare Workers。`/api/*` のランキング API と、`public/` の配信 |
| `migrations/` | D1 のテーブル定義 |
| `tests/` | 判定と入力検査のテスト |

## 手元で動かす

コマンドは PowerShell でも Git Bash でも動きます。

ランキングも含めて確かめる場合:

```bash
npm install
```

```bash
npm run db:migrate:local
```

```bash
npm run dev:worker
```

http://localhost:8787 を開きます。データは `.wrangler/` に保存され、Cloudflare には送られません。

ゲームだけを確かめる場合は `npm run dev` で http://localhost:4173 を開きます。
`public/index.html` を直接開いても遊べます。どちらもランキングは「この端末」だけになります。

テスト:

```bash
npm test
```

## 本番に反映する

コマンドは `butsukari-ojisan` フォルダで実行します。`migrations/` にファイルが増えたときは、先に 1 つ目を実行します。

```bash
npm run db:migrate:remote
```

```bash
npm run deploy
```

Cloudflare のダッシュボードでは、`kirakun.com` の「SSL/TLS」→「Edge Certificates」→「Always Use HTTPS」をオンにしておきます。

## 共有画像を作り直す

SNS のリンクカードの画像 `public/og.png` は `tools/og.html` から作ります。`tools/og.html` を Chrome で開いて確かめ、次のコマンドで書き出します（Git Bash で、`butsukari-ojisan` フォルダで実行します）。

```bash
"/c/Program Files/Google/Chrome/Application/chrome.exe" --headless=new --disable-gpu --hide-scrollbars --window-size=1200,630 --virtual-time-budget=8000 --screenshot="$(pwd -W)/public/og.png" "file:///$(pwd -W)/tools/og.html"
```

## ランキングの運用

上位の確認:

```bash
npx wrangler d1 execute butsukari-ojisan-buster --remote --command "SELECT name, distance, flown, level, max_combo FROM scores ORDER BY distance DESC LIMIT 20"
```

荒らしの締め出し。1 行目で今後の記録と名前の変更を断り、2 行目でランキングから消します（名前の部分は置き換えます）。

```bash
npx wrangler d1 execute butsukari-ojisan-buster --remote --command "INSERT OR IGNORE INTO bans (player_hash, reason, created_at) SELECT player_hash, 'manual', unixepoch() * 1000 FROM scores WHERE name = 'ここに名前'"
```

```bash
npx wrangler d1 execute butsukari-ojisan-buster --remote --command "DELETE FROM scores WHERE name = 'ここに名前'"
```

一覧は最大 30 秒キャッシュされるので、消してから反映されるまで少しかかります。
禁止する言葉は `worker/validate.mjs` の `NG_CONTAINS` と `NG_EXACT` で増やせます。
同じ接続元から何度も来る場合は、Cloudflare の WAF で接続元を止めます。

### 不正対策でしていること

- サーバーが遊び始めの時刻を覚え、経過時間に合わない距離を断ります。距離、人数、レベル、コンボの関係も確かめます（`worker/validate.mjs`）。
- 1 回の遊びにつき、記録は 1 回しか送れません。
- API は同じ接続元につき 1 分 60 回まで、遊びの開始は 1 分 20 回まで、記録の送信と名前の変更は 1 分 10 回までです。IPv6 は /48 全体でも 1 分 600 回までです。
- 新しいプレイヤーは 1 日に、同じ接続元から 100 人、IPv6 の /48 全体で 300 人、サイト全体で 3000 人までです。
- 名前は使える文字を絞り、見えない文字、URL、禁止語、他の人と同じ名前を断ります。
- 上位の一覧はキャッシュし、データは毎日 3:30 に掃除します（上位 3000 人より下で 30 日以上更新のない記録と、古い一時データ）。
- プレイヤーの識別子は端末に保存した乱数で、サーバーにはハッシュだけを保存します。接続元はその日かぎりのハッシュで数え、翌日には消します。

### 防げないこと

ゲームはブラウザで動くので、計算された記録が本物のプレイかどうかをサーバーが完全に見分けることはできません。
上の検査をすり抜ける範囲の偽の記録や、自動操作のプレイは送れてしまいます。見つけたら上のコマンドで締め出します。
ログインもないため、端末のデータを消すと別のプレイヤーとして扱われます。
