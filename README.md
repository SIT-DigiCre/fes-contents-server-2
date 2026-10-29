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

配信を開始します。会場の端末からは `http://<このPCのIP>/` を開きます。

```
docker compose up web
```

作品を追加・差し替えたあとは、もう一度 `docker compose run --rm generator` を実行してください。再実行するまで一覧と HLS は古いままです。変更のない mp4 はスキップされます。

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
