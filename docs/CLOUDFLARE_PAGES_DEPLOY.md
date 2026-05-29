# Cloudflare Pages デプロイ

## 根本方針（重要）

本番は **GitHub Actions → Wrangler の 1 本** でデプロイする。

| 経路 | 推奨 |
|------|------|
| `main` への push → `.github/workflows/deploy-pages.yml` | ✅ これだけ使う |
| Cloudflare Dashboard の「Git 連携ビルド」 | ❌ **無効化する**（二重デプロイの原因） |
| 手元の `npm run deploy:pages` | 緊急復旧・検証用 |

Dashboard ビルドと Actions / 手元デプロイが混在すると、HTML が新しい `page-*.js` を指すのに CDN 上は壊れた旧ファイル（HTTP 500）が残ることがある。ログに `Uploaded N files (440 already uploaded)` と出る場合は典型。

## チェックリスト（初回のみ）

- [ ] Cloudflare Dashboard の Git 連携ビルドを無効化（下記）
- [ ] GitHub Secrets: `CLOUDFLARE_API_TOKEN`, `CLOUDFLARE_ACCOUNT_ID`
- [ ] `main` に push 後、Actions の Deploy Pages が緑で smoke まで通る
- [ ] 以降は Dashboard から手動ビルドしない（二重デプロイ防止）

## 初回セットアップ

### 1. Cloudflare Dashboard で Git ビルドを止める

Workers & Pages → プロジェクト `wispo` → **Settings** → **Builds**

- **Production branch**: `main` のままでよい
- **Build command** / **Build output**: 空にするか、ビルドを実行しない設定にする  
  （「Connected to Git」で push のたびに Dashboard が `out` を上書きしないようにする）
- 確実な方法: Git 連携を切り、デプロイは Actions のみにする

### 2. GitHub リポジトリ Secrets

| Secret | 内容 |
|--------|------|
| `CLOUDFLARE_API_TOKEN` | [API トークン](https://dash.cloudflare.com/profile/api-tokens)（Account · Cloudflare Pages · Edit） |
| `CLOUDFLARE_ACCOUNT_ID` | Dashboard 右サイドバーまたは Workers & Pages の URL 内の Account ID |

### 3. 動作確認

`main` に push すると workflow が走る。

1. Wrangler が返す **deployment URL**（`https://<hash>.wispo.pages.dev`）で smoke
2. 続けて **https://wispo.pages.dev** を最大 12 回・10 秒間隔で再試行

CI の smoke が 404 で落ちた場合、デプロイ自体は成功していることが多い（本番エイリアスの反映待ち）。Actions を **Re-run** するか、数分後にブラウザで確認する。

## ビルドごとのアセットハッシュ（自動バスト）

手動で `PAGES_DEPLOY_ASSET_BUST = 14` のように増やす必要はない。

- `next.config.js` が `GITHUB_SHA` / `CF_PAGES_COMMIT_SHA` から `NEXT_PUBLIC_ASSET_BUST` を埋め込む
- `src/lib/pagesAssetBust.ts` を layout / フラッグゲッサー系から参照し、チャンク内容を毎コミットで変える
- 旧方式の `globals.css` の `--deploy-asset-bust` 手動インクリメントは廃止

## ローカルからデプロイ（緊急復旧）

```bash
npm run deploy:pages
```

内部で `build` → `verify:pages-out` → `wrangler pages deploy` → `smoke:pages-production` を実行する。

初回のみ:

```bash
npx wrangler login
```

## 症状と対処

### Application error / 背景とフッターだけ

1. ブラウザの Network で HTML が参照する `/_next/static/chunks/.../page-*.js` のステータスを確認（**500** なら CDN 破損）
2. `npm run deploy:pages` で Wrangler 直デプロイ
3. Dashboard の Git ビルドが再度走っていないか確認

### CSS が無スタイル

`/_next/static/css/*.css` が 500 のときも同様。`deploy:pages` で復旧。

### エクスプローラー「データの取得に失敗しました」

`/assets/flag-guesser/iso-3166.json` または `flag_difficulty.json` が **404** のとき。HTML/JS はあるが `public/assets/` が CDN に載っていない不完全デプロイ。`deploy:pages` で復旧。smoke は上記 JSON の存在も検証する。

### CI の smoke が 404（デプロイ直後・JS/CSS）

`wispo.pages.dev` の HTML が新しい `page-*.js` を指しているのに JS だけ 404、という状態。デプロイ完了から本番エイリアスへ反映されるまで数十秒〜2 分かかることがある。workflow は deployment URL を先に検証し、本番は再試行する。それでも失敗したら **Re-run failed jobs** でよい。

## スクリプト一覧

| コマンド | 用途 |
|----------|------|
| `npm run verify:pages-out` | `out/` 内 HTML が参照する静的ファイルとフラッグゲッサー JSON の存在・サイズ検証（デプロイ前） |
| `npm run smoke:pages-production` | 本番 URL の JS/CSS とフラッグゲッサー JSON（`iso-3166` / `flag_difficulty` 等）が 200 か検証（デプロイ後） |
| `npm run deploy:pages` | 上記を含むフルデプロイ |

`SITE_URL` を変えれば smoke の対象をプレビュー URL にできる。

```bash
SITE_URL=https://xxxx.wispo.pages.dev npm run smoke:pages-production
```

## Dashboard ビルド設定（参考・使わない場合）

| 項目 | 値 |
|------|-----|
| Framework preset | なし |
| Build command | （空・未使用推奨） |
| Build output directory | `out` |
| Production branch | `main` |
