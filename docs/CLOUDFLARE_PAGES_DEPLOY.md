# Cloudflare Pages デプロイ

## ビルド設定（Dashboard → Settings → Builds）

| 項目 | 値 |
|------|-----|
| Framework preset | なし |
| Build command | `npm run build` |
| Build output directory | `out` |
| Production branch | `main` |

## CSS が 500・「already uploaded」だけ増えるとき

Pages はファイル内容のハッシュでアップロードを省略する。過去の失敗デプロイで **CDN 上の実体だけ壊れている** と、ログに 502 がなくても `/_next/static/css/*.css` が 500 になり得る。

対処:

1. `globals.css` などスタイルを 1 行変えて **CSS ハッシュを変え**、Git から再デプロイする  
2. またはローカルで `npm run deploy:pages`（Wrangler で `out` を直接アップロード）

デプロイログで `Uploaded N files (440 already uploaded)` と出たら、壊れたキャッシュを引きずっている疑いが強い。

## ローカルから直接デプロイ（Wrangler）

```bash
npm run build
npx wrangler login   # 初回のみ
npm run deploy:pages
```

プロジェクト名が `wispo` でない場合は `package.json` の `deploy:pages` を修正する。
