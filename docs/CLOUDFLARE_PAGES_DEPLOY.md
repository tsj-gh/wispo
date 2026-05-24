# Cloudflare Pages デプロイ

## ビルド設定（Dashboard → Settings → Builds）

| 項目 | 値 |
|------|-----|
| Framework preset | なし |
| Build command | `npm run build` |
| Build output directory | `out` |
| Production branch | `main` |

## CSS / JS が 500・「already uploaded」だけ増えるとき

Pages はファイル内容のハッシュでアップロードを省略する。過去の失敗デプロイで **CDN 上の実体だけ壊れている** と、ログに 502 がなくても次のような 500 になり得る。

- `/_next/static/css/*.css`（トップが無スタイル）
- `/_next/static/chunks/app/lab/flag-guesser/page-*.js`（フラッグゲッサーが Application error）

対処:

1. 該当バンドルが変わるようソースを 1 行変えて **チャンクのハッシュを変え**、Git から再デプロイする  
2. またはローカルで `npm run deploy:pages`（Wrangler で `out` を直接アップロード）

デプロイ後は Network で、HTML が参照する `page-*.js` が **200** か必ず確認する。

デプロイログで `Uploaded N files (440 already uploaded)` と出たら、壊れたキャッシュを引きずっている疑いが強い。

## ローカルから直接デプロイ（Wrangler）

```bash
npm run build
npx wrangler login   # 初回のみ
npm run deploy:pages
```

プロジェクト名が `wispo` でない場合は `package.json` の `deploy:pages` を修正する。
