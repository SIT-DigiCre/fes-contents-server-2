# fes-contents-server

大宮祭・芝浦祭の展示において、楽曲や映像を配信するためのWebアプリケーシンです

# 実行手順

配信は Docker 上の Nginx が行います。ホストに Python や ffmpeg は不要です。

見出しのイベント名はリポジトリ直下の `config.json` で変えます。別のイベントで使うときは `event_name` を書き換えてから生成してください。

```json
{
  "event_name": "2026大宮祭"
}
```

作品を置いたあと、静的ファイルを生成します。映像は複数ビットレートの HLS、一覧は `public/media_list.json`、イベント名は `public/site.json` になります。

```
docker compose run --rm generator
```

配信を開始します。HTTPSを使う場合は、事前にCloudflare APIトークンを設定します。

```
copy .env.example .env
```

`.env` の `CLOUDFLARE_API_TOKEN` には、`digicre.net` ゾーンに限定した次の権限を持つトークンを設定してください。

- Zone:Read
- DNS:Edit

その後、配信を開始します。

```
docker compose up -d
```

`sfes26.digicre.net` のDNS Challengeで証明書を取得し、証明書の更新もCaddyが自動で行います。インターネット経由でアクセスする場合は、ルーターのTCP 80/443をこのPCへ転送してください。

会場内だけで使う場合、公開DNSの `sfes26.digicre.net` は会場内PCへ到達できないため、会場のDNSまたは各端末のhosts設定で、この名前をこのPCのLAN内IPへ解決させる必要があります。Caddyが証明書を取得した後は、端末から `https://sfes26.digicre.net/` を開きます。

作品を追加・差し替えたあとは、もう一度 `docker compose run --rm generator` を実行してください。再実行するまで一覧とHLSは古いままです。変更のないmp4はスキップされます。

作品ファイルと生成物は Git に含めず、各環境のローカルに置いてください。

# 作品の追加

ファイル名（拡張子を除いた部分）が作品タイトルになります。対応する JSON が無い場合は、生成時に雛形が作られます。`duration` はメディアファイルから計算して上書きされます。

## 映像

`movies/タイトル.mp4` を置きます。サムネイル `movies/タイトル.jpg` が無い場合は、生成時に動画から作られます。`youtube_id` が無い作品は `public/hls/タイトル/` に HLS 化され、一覧の再生パスは `master.m3u8` になります。

任意で同名の `movies/タイトル.json` を置けます。

```json
{
  "year": "2026年",
  "description": "作品のキャプション",
  "creators": "名前 (Director)",
  "youtube_id": "任意のYouTube動画ID"
}
```

`youtube_id` は任意です。

## シングル

`songs/タイトル.wav`（`.mp3` または `.m4a` でも可）を置きます。ジャケットは同名の `.jpg` / `.jpeg` / `.png` があればそれを使い、無ければ既定のアイコンになります。

任意で同名の `songs/タイトル.json` を置けます。

```json
{
  "year": "2026年",
  "description": "作品のキャプション",
  "artist": "名前 (作曲)"
}
```

## アルバム

`songs/アルバム名/` フォルダを作り、その中にトラック（`.wav` / `.mp3` / `.m4a`）を置きます。フォルダ内の `.jpg` / `.jpeg` / `.png` がジャケットになります。

メタデータは `songs/アルバム名/info.json` です。

```json
{
  "year": "2026年",
  "description": "アルバムのキャプション",
  "artist": "名前 (作曲)"
}
```

トラックが1つ以上あるフォルダだけ、アルバムとして一覧に載ります。
