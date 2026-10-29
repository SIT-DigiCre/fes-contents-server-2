import json
import math
import os
import shutil
import subprocess
from pathlib import Path

import cv2
import mutagen

MOVIES_DIR = Path(os.environ.get("MOVIES_DIR", "movies"))
SONGS_DIR = Path(os.environ.get("SONGS_DIR", "songs"))
PUBLIC_DIR = Path(os.environ.get("PUBLIC_DIR", "public"))
CONFIG_PATH = Path(os.environ.get("CONFIG_PATH", "config.json"))
CATALOG_PATH = PUBLIC_DIR / "media_list.json"
SITE_PATH = PUBLIC_DIR / "site.json"
HLS_DIR = PUBLIC_DIR / "hls"
DEFAULT_EVENT_NAME = "2026大宮祭"

AUDIO_EXTS = {".wav", ".mp3", ".m4a"}
IMAGE_EXTS = [".jpg", ".jpeg", ".png"]

# height, video bitrate, bandwidth hint for the master playlist
LADDER = (
    (360, "800k", 1_000_000),
    (720, "2800k", 3_200_000),
    (1080, "5000k", 5_500_000),
)
AUDIO_BITRATE = "128k"
SEGMENT_SECONDS = 6


def format_duration(seconds):
    if seconds <= 0 or math.isnan(seconds):
        return "00:00"
    minutes = int(seconds // 60)
    secs = int(seconds % 60)
    return f"{minutes:02d}:{secs:02d}"


def get_video_info(video_path):
    cap = cv2.VideoCapture(str(video_path))
    if not cap.isOpened():
        return 0.0, 0, 0
    fps = cap.get(cv2.CAP_PROP_FPS)
    frame_count = cap.get(cv2.CAP_PROP_FRAME_COUNT)
    width = int(cap.get(cv2.CAP_PROP_FRAME_WIDTH))
    height = int(cap.get(cv2.CAP_PROP_FRAME_HEIGHT))
    cap.release()
    duration = frame_count / fps if fps > 0 else 0.0
    return duration, width, height


def get_audio_duration(audio_path):
    try:
        audio = mutagen.File(str(audio_path))
        if audio is not None and audio.info is not None:
            return float(audio.info.length)
    except Exception as exc:
        print(f"音声長さ取得エラー ({audio_path.name}): {exc}")
    return 0.0


def generate_thumbnail(video_path, thumb_path):
    if thumb_path.exists():
        return
    print(f"サムネイルを生成中: {thumb_path}")
    cap = cv2.VideoCapture(str(video_path))
    cap.set(cv2.CAP_PROP_POS_MSEC, 1000)
    ok, frame = cap.read()
    if not ok:
        cap.set(cv2.CAP_PROP_POS_FRAMES, 0)
        ok, frame = cap.read()
    if ok:
        success, buffer = cv2.imencode(".jpg", frame)
        if success:
            thumb_path.write_bytes(buffer.tobytes())
            print("  -> サムネイルを作成しました")
    else:
        print(f"  -> 警告: 映像を読み込めませんでした ({video_path.name})")
    cap.release()


def get_or_create_metadata(target_path, media_type="movie", duration_str="00:00"):
    json_path = target_path.with_suffix(".json") if target_path.is_file() else target_path / "info.json"
    default_data = {
        "year": "2026年",
        "description": "ここに作品のキャプション（解説）を入力してください。",
        "duration": duration_str,
    }
    if media_type == "movie":
        default_data["creators"] = "ダミー太郎 (Director) / 映像花子 (Illustrator)"
    else:
        default_data["artist"] = "ダミーアーティスト (作曲) / ボーカル花子"

    if json_path.exists():
        try:
            data = json.loads(json_path.read_text(encoding="utf-8"))
        except Exception as exc:
            print(f"JSON読み込みエラー ({json_path}): {exc}")
            return default_data
        for key, value in default_data.items():
            data.setdefault(key, value)
        data["duration"] = duration_str
    else:
        print(f"メタデータを新規作成します: {json_path}")
        data = default_data

    try:
        json_path.write_text(json.dumps(data, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    except Exception as exc:
        print(f"JSON書き込みエラー ({json_path}): {exc}")
    return data


def public_url(path, root):
    return "/" + path.relative_to(root).as_posix()


def find_image(path_obj, root, is_file=False):
    if is_file:
        for ext in IMAGE_EXTS:
            image = path_obj.with_suffix(ext)
            if image.exists():
                return public_url(image, root)
    else:
        for ext in IMAGE_EXTS:
            found = list(path_obj.glob(f"*{ext}")) + list(path_obj.glob(f"*{ext.upper()}"))
            if found:
                return public_url(found[0], root)
    return "/icon.png"


def audio_mime(path):
    ext = path.suffix.lower()
    if ext == ".wav":
        return "audio/wav"
    if ext == ".m4a":
        return "audio/mp4"
    return "audio/mpeg"


def even(value):
    value = int(value)
    return value if value % 2 == 0 else value - 1


def hls_output_dir(title):
    return HLS_DIR / title


def hls_is_fresh(source, output_dir):
    master = output_dir / "master.m3u8"
    if not master.exists():
        return False
    return master.stat().st_mtime >= source.stat().st_mtime


def build_hls(source, title, source_width, source_height):
    output_dir = hls_output_dir(title)
    if hls_is_fresh(source, output_dir):
        print(f"HLS をスキップ（更新なし）: {title}")
        return f"/hls/{title}/master.m3u8"

    if output_dir.exists():
        shutil.rmtree(output_dir)
    output_dir.mkdir(parents=True)

    rungs = [rung for rung in LADDER if source_height <= 0 or rung[0] <= source_height]
    if not rungs:
        rungs = [LADDER[0]]

    print(f"HLS を生成中: {title} ({', '.join(str(r[0]) + 'p' for r in rungs)})")
    for height, video_bitrate, _bandwidth in rungs:
        if source_height > 0 and source_width > 0:
            width = even(source_width * height / source_height)
        else:
            width = even(height * 16 / 9)
        variant_dir = output_dir / f"{height}p"
        variant_dir.mkdir()
        playlist = variant_dir / "index.m3u8"
        command = [
            "ffmpeg",
            "-y",
            "-i",
            str(source),
            "-vf",
            f"scale={width}:{height}",
            "-c:v",
            "libx264",
            "-preset",
            "veryfast",
            "-b:v",
            video_bitrate,
            "-maxrate",
            video_bitrate,
            "-bufsize",
            video_bitrate,
            "-c:a",
            "aac",
            "-b:a",
            AUDIO_BITRATE,
            "-ac",
            "2",
            "-hls_time",
            str(SEGMENT_SECONDS),
            "-hls_playlist_type",
            "vod",
            "-hls_segment_filename",
            str(variant_dir / "seg_%03d.ts"),
            str(playlist),
        ]
        subprocess.run(command, check=True)

    lines = ["#EXTM3U", "#EXT-X-VERSION:3"]
    for height, _video_bitrate, bandwidth in rungs:
        if source_height > 0 and source_width > 0:
            width = even(source_width * height / source_height)
        else:
            width = even(height * 16 / 9)
        lines.append(f"#EXT-X-STREAM-INF:BANDWIDTH={bandwidth},RESOLUTION={width}x{height}")
        lines.append(f"{height}p/index.m3u8")
    (output_dir / "master.m3u8").write_text("\n".join(lines) + "\n", encoding="utf-8")
    return f"/hls/{title}/master.m3u8"


def build_movies():
    movies = []
    if not MOVIES_DIR.exists():
        return movies
    for file_path in sorted(MOVIES_DIR.iterdir(), key=lambda path: path.name):
        if not file_path.is_file() or file_path.suffix.lower() != ".mp4":
            continue
        thumb = file_path.with_suffix(".jpg")
        generate_thumbnail(file_path, thumb)
        duration, width, height = get_video_info(file_path)
        meta = get_or_create_metadata(file_path, "movie", format_duration(duration))
        youtube_id = str(meta.get("youtube_id") or "").strip()
        if youtube_id:
            media_path = public_url(file_path, MOVIES_DIR.parent)
        else:
            media_path = build_hls(file_path, file_path.stem, width, height)
        movie = {
            "title": file_path.stem,
            "file_name": file_path.name,
            "file_path": media_path,
            "thumbnail_path": public_url(thumb, MOVIES_DIR.parent),
        }
        movie.update(meta)
        movies.append(movie)
    return movies


def build_songs():
    songs = []
    if not SONGS_DIR.exists():
        return songs
    for path in sorted(SONGS_DIR.iterdir(), key=lambda item: item.name):
        if path.is_dir():
            tracks = []
            total_sec = 0.0
            for audio_file in sorted(path.iterdir(), key=lambda item: item.name):
                if audio_file.is_file() and audio_file.suffix.lower() in AUDIO_EXTS:
                    tracks.append({
                        "title": audio_file.stem,
                        "file_path": public_url(audio_file, SONGS_DIR.parent),
                        "type": audio_mime(audio_file),
                    })
                    total_sec += get_audio_duration(audio_file)
            if not tracks:
                continue
            meta = get_or_create_metadata(path, "song", format_duration(total_sec))
            song = {
                "is_album": True,
                "title": path.name,
                "cover_path": find_image(path, SONGS_DIR.parent, is_file=False),
                "tracks": tracks,
            }
            song.update(meta)
            songs.append(song)
        elif path.is_file() and path.suffix.lower() in AUDIO_EXTS:
            duration = get_audio_duration(path)
            meta = get_or_create_metadata(path, "song", format_duration(duration))
            song = {
                "is_album": False,
                "title": path.stem,
                "file_path": public_url(path, SONGS_DIR.parent),
                "type": audio_mime(path),
                "cover_path": find_image(path, SONGS_DIR.parent, is_file=True),
            }
            song.update(meta)
            songs.append(song)
    return songs


def load_event_name():
    if not CONFIG_PATH.is_file():
        print(f"設定ファイルが無いため既定のイベント名を使います: {DEFAULT_EVENT_NAME}")
        return DEFAULT_EVENT_NAME
    try:
        data = json.loads(CONFIG_PATH.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError) as exc:
        print(f"設定ファイルを読めないため既定のイベント名を使います: {exc}")
        return DEFAULT_EVENT_NAME
    name = str(data.get("event_name", "")).strip()
    if not name:
        print(f"event_name が空のため既定のイベント名を使います: {DEFAULT_EVENT_NAME}")
        return DEFAULT_EVENT_NAME
    return name


def main():
    MOVIES_DIR.mkdir(exist_ok=True)
    SONGS_DIR.mkdir(exist_ok=True)
    PUBLIC_DIR.mkdir(exist_ok=True)
    HLS_DIR.mkdir(exist_ok=True)

    event_name = load_event_name()
    SITE_PATH.write_text(
        json.dumps({"event_name": event_name}, ensure_ascii=False, indent=2) + "\n",
        encoding="utf-8",
    )
    print(f"イベント名を書きました: {event_name}")

    catalog = {"movies": build_movies(), "songs": build_songs()}
    CATALOG_PATH.write_text(
        json.dumps(catalog, ensure_ascii=False, indent=2) + "\n",
        encoding="utf-8",
    )
    print(
        f"配信リストを書きました: {CATALOG_PATH} "
        f"（映像 {len(catalog['movies'])} / 音声 {len(catalog['songs'])}）"
    )


if __name__ == "__main__":
    main()
