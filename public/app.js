if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('sw.js')
        .then(() => console.log('Service Worker Registered'));
}

// ページのタイプを判定（movie or music or all）
function detectPageType() {
    const pathname = window.location.pathname;
    if (pathname.includes('/movie')) {
        return 'movie';
    } else if (pathname.includes('/music')) {
        return 'music';
    }
    return 'all'; // /public の場合は両方表示
}

const pageType = detectPageType();

// ページタイプに応じて表示要素を制御
const DEFAULT_EVENT_NAME = '2026大宮祭';

function applyEventName(eventName) {
    const name = (eventName || '').trim() || DEFAULT_EVENT_NAME;
    const pageTitle = document.getElementById('page-title');
    if (pageTitle) pageTitle.textContent = name;

    const suffix = pageType === 'movie' ? 'MV' : pageType === 'music' ? 'DTM' : '作品配信システム';
    document.title = `${name} - ${suffix}`;
}

async function loadSiteConfig() {
    try {
        const response = await fetch('/site.json');
        if (!response.ok) {
            throw new Error('ネットワークエラーが発生しました');
        }
        const data = await response.json();
        applyEventName(data.event_name);
    } catch (error) {
        console.error('イベント名の読み込みに失敗しました:', error);
        applyEventName(DEFAULT_EVENT_NAME);
    }
}

function initializePageView() {
    const movieSection = document.getElementById('movie-section');
    const songSection = document.getElementById('song-section');

    if (pageType === 'movie') {
        if (songSection) songSection.classList.add('hidden');
    } else if (pageType === 'music') {
        if (movieSection) movieSection.classList.add('hidden');
    }
}

let hlsPlayer = null;

function destroyHls() {
    if (hlsPlayer) {
        hlsPlayer.destroy();
        hlsPlayer = null;
    }
}

function attachMovieSource(src) {
    destroyHls();
    detailVideo.removeAttribute('src');
    detailVideo.preload = 'metadata';

    const canPlayNative = detailVideo.canPlayType('application/vnd.apple.mpegurl');
    if (src.endsWith('.m3u8') && !canPlayNative && window.Hls && Hls.isSupported()) {
        hlsPlayer = new Hls();
        hlsPlayer.loadSource(src);
        hlsPlayer.attachMedia(detailVideo);
        return;
    }
    detailVideo.src = src;
}

async function loadMediaData() {
    try {
        const response = await fetch('/media_list.json');
        if (!response.ok) {
            throw new Error('ネットワークエラーが発生しました');
        }
        const data = await response.json();
        const movies = data.movies || [];
        const songs = data.songs || [];

        // ページタイプに応じてフィルタリングして表示
        if (pageType === 'movie') {
            renderMovies(movies);
        } else if (pageType === 'music') {
            renderSongs(songs);
        } else {
            // 両方表示
            renderMovies(movies);
            renderSongs(songs);
        }
    } catch (error) {
        console.error('データの読み込み・描画に失敗しました:', error);
    }
}

// ==========================================
// 1. リストの描画処理
// ==========================================

function renderMovies(movies) {
    const container = document.getElementById('movie-list');
    if (!container) return;

    movies.forEach(movie => {
        const card = document.createElement('div');
        card.className = 'card';
        card.innerHTML = `
            <img src="${movie.thumbnail_path}" alt="${movie.title} のサムネイル">
            <div class="card-content">
                <h3 class="card-title">${movie.title}</h3>
            </div>
        `;

        const imgElement = card.querySelector('img');
        card.addEventListener('click', () => showMovieDetail(movie, imgElement));
        container.appendChild(card);
    });
}

function renderSongs(songs) {
    const container = document.getElementById('song-list');
    if (!container) return;

    songs.forEach(song => {
        const card = document.createElement('div');
        card.className = 'card';
        card.innerHTML = `
            <img src="${song.cover_path}" alt="${song.title}">
            <div class="card-content">
                <h3 class="card-title">${song.title}</h3>
                <p style="margin:0; font-size:0.9rem; color:#666;">
                    ${song.is_album ? 'Album' : 'Single'}
                </p>
            </div>
        `;
        const imgElement = card.querySelector('img');
        card.addEventListener('click', () => showSongDetail(song, imgElement));
        container.appendChild(card);
    });
}


// ==========================================
// 2. 共通の変数・設定
// ==========================================

const listView = document.getElementById('list-view');
// どのアニメーション元画像かを記憶しておく変数
let activeCardImg = null;
// 一覧ページのスクロール位置を記憶する変数
let scrollPosition = 0;

// 一覧ページのスクロール位置を保存しておく関数
function saveScrollPosition() {
    scrollPosition = window.scrollY || document.documentElement.scrollTop;
    console.log('スクロール位置保存:', scrollPosition);
}

function restoreScrollPosition() {
    console.log('スクロール位置復元:', scrollPosition);
    window.scrollTo(0, scrollPosition);
}


// ==========================================
// 3. 動画プレイヤー（Movie）の制御ロジック
// ==========================================

const detailView = document.getElementById('detail-view');
const detailTitle = document.getElementById('detail-title');
const detailVideo = document.getElementById('detail-video');
const movieBackButton = document.getElementById('movie-back-button');

const btnPlayPause = document.getElementById('btn-play-pause');
const btnFullscreen = document.getElementById('btn-fullscreen');
const volumeSlider = document.getElementById('volume-slider');
const videoContainer = document.getElementById('video-container');

const videoControls = document.querySelector('.video-controls');
const playPauseIcon = document.getElementById('play-pause-icon');
let controlsTimeout;

function resetControlsTimer() {
    videoControls.classList.remove('controls-hidden');
    clearTimeout(controlsTimeout);
    controlsTimeout = setTimeout(() => {
        videoControls.classList.add('controls-hidden');
    }, 3000);
}

// ユーザーアクションでタイマーをリセット
videoContainer.addEventListener('click', resetControlsTimer);
videoContainer.addEventListener('mousemove', resetControlsTimer);
videoContainer.addEventListener('touchstart', resetControlsTimer, { passive: true });

function showMovieDetail(movie, imgElement) {
    activeCardImg = imgElement;
    // 一覧ページのスクロール位置を保存
    saveScrollPosition();

    const updateDOM = () => {
        listView.classList.add('hidden');
        detailView.classList.remove('hidden');

        // JSONのデータを反映
        detailTitle.textContent = movie.title;
        document.getElementById('detail-creators').textContent = movie.creators || '未設定';
        document.getElementById('detail-duration').textContent = movie.duration || '00:00';
        document.getElementById('detail-year').textContent = movie.year || '2026年';
        document.getElementById('detail-caption').textContent = movie.description || 'キャプションはありません。';

        // YouTubeIDがあるかチェック
        const youtubeContainer = document.getElementById('youtube-container');
        const videoContainerElem = document.getElementById('video-container');
        if (movie.youtube_id && movie.youtube_id.trim() !== '') {
            // YouTube埋め込み（rel=0でおすすめ動画を非表示、modestbranding=1でYouTubeへのリンク要素を最小化）
            youtubeContainer.innerHTML = `<iframe width="100%" height="100%" src="https://www.youtube.com/embed/${encodeURIComponent(movie.youtube_id)}?rel=0&modestbranding=1" title="${movie.title}" frameborder="0" allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; fullscreen" allowfullscreen style="position: absolute; top: 0; left: 0; width: 100%; height: 100%;"></iframe>`;
            youtubeContainer.style.display = 'block';
            videoContainerElem.style.display = 'none';
        } else {
            // 従来のvideo タグを使用
            youtubeContainer.style.display = 'none';
            youtubeContainer.innerHTML = '';
            videoContainerElem.style.display = '';
            
            detailVideo.poster = movie.thumbnail_path;
            attachMovieSource(movie.file_path);

            playPauseIcon.src = 'images/play.svg';
            detailVideo.volume = volumeSlider.value;
        }
        
        resetControlsTimer();
    };

    if (!document.startViewTransition) {
        updateDOM();
        return;
    }
    activeCardImg.style.viewTransitionName = 'hero-video';
    document.startViewTransition(() => {
        updateDOM();
    });
}

btnPlayPause.addEventListener('click', (e) => {
    e.stopPropagation();
    if (detailVideo.paused) {
        detailVideo.play();
        playPauseIcon.src = 'images/pause.svg';
    } else {
        detailVideo.pause();
        playPauseIcon.src = 'images/play.svg';
    }
    resetControlsTimer();
});

btnFullscreen.addEventListener('click', (e) => {
    e.stopPropagation();
    const isFullscreen = document.fullscreenElement || document.webkitFullscreenElement;

    if (!isFullscreen) {
        if (videoContainer.requestFullscreen) {
            videoContainer.requestFullscreen().catch(err => console.error(err));
        } else if (videoContainer.webkitRequestFullscreen) {
            videoContainer.webkitRequestFullscreen();
        } else if (detailVideo.webkitEnterFullscreen) {
            detailVideo.webkitEnterFullscreen();
        }
    } else {
        if (document.exitFullscreen) {
            document.exitFullscreen();
        } else if (document.webkitExitFullscreen) {
            document.webkitExitFullscreen();
        }
    }
    resetControlsTimer();
});

const handleFullscreenChange = () => {
    const isFullscreen = document.fullscreenElement || document.webkitFullscreenElement;
    if (isFullscreen) {
        btnFullscreen.textContent = '✖';
    } else {
        btnFullscreen.textContent = '⛶';
    }
};

document.addEventListener('fullscreenchange', handleFullscreenChange);
document.addEventListener('webkitfullscreenchange', handleFullscreenChange);

volumeSlider.addEventListener('input', (e) => {
    e.stopPropagation();
    detailVideo.volume = e.target.value;
    resetControlsTimer();
});

movieBackButton.addEventListener('click', () => {
    detailVideo.pause();
    destroyHls();
    detailVideo.removeAttribute('src');
    detailVideo.load();
    if (document.fullscreenElement || document.webkitFullscreenElement) {
        if (document.exitFullscreen) document.exitFullscreen();
        else if (document.webkitExitFullscreen) document.webkitExitFullscreen();
    }

    const updateDOM = () => {
        detailView.classList.add('hidden');
        listView.classList.remove('hidden');
        // DOMの更新と同時にスクロール位置を復元
        restoreScrollPosition();
    };

    if (!document.startViewTransition) {
        updateDOM();
        if (activeCardImg) activeCardImg.style.viewTransitionName = '';
        return;
    }

    const transition = document.startViewTransition(() => {
        updateDOM();
    });

    transition.finished.finally(() => {
        if (activeCardImg) {
            activeCardImg.style.viewTransitionName = '';
            activeCardImg = null;
        }
    });
});


// ==========================================
// 4. 音声プレイヤー（Song）の制御ロジック
// ==========================================

const songDetailView = document.getElementById('song-detail-view');
const songBackButton = document.getElementById('song-back-button');
const detailAudio = document.getElementById('detail-audio');

const btnAudioPlayPause = document.getElementById('btn-audio-play-pause');
const audioPlayIcon = document.getElementById('audio-play-icon');
const audioVolumeSlider = document.getElementById('audio-volume-slider');
const audioSeekBar = document.getElementById('audio-seek-bar');
const timeCurrent = document.getElementById('audio-time-current');
const timeDuration = document.getElementById('audio-time-duration');
const trackListContainer = document.getElementById('album-track-list');

function showSongDetail(song, imgElement) {
    activeCardImg = imgElement;
    // 一覧ページのスクロール位置を保存
    saveScrollPosition();

    const updateDOM = () => {
        listView.classList.add('hidden');
        songDetailView.classList.remove('hidden');

        document.getElementById('song-detail-title').textContent = song.title;
        document.getElementById('song-detail-artist').textContent = song.artist || '未設定';
        document.getElementById('song-detail-format').textContent = song.is_album ? 'Album' : 'Single';
        
        // 追加: JSONから取得した長さ情報を反映
        document.getElementById('song-detail-duration').textContent = song.duration || '00:00';
        
        document.getElementById('song-detail-year').textContent = song.year || '2026年';
        document.getElementById('song-detail-caption').textContent = song.description || 'キャプションはありません。';
        
        document.getElementById('song-detail-art').src = song.cover_path;
        
        detailAudio.volume = audioVolumeSlider.value;
        audioPlayIcon.src = 'images/play.svg';

        // 以下略 (トラックリストの処理などはそのまま)

        const centerView = document.getElementById('song-detail-center');
        trackListContainer.innerHTML = '';

        if (song.is_album) {
            centerView.classList.remove('hidden');
            song.tracks.forEach((track, index) => {
                const li = document.createElement('li');
                li.className = 'track-item';
                li.textContent = `${index + 1}. ${track.title}`;

                li.addEventListener('click', () => {
                    document.querySelectorAll('.track-item').forEach(el => el.classList.remove('active'));
                    li.classList.add('active');
                    loadAudio(track.file_path, true);
                });
                trackListContainer.appendChild(li);
            });
            // 初期状態は1曲目をセット
            trackListContainer.firstChild.classList.add('active');
            loadAudio(song.tracks[0].file_path, false);
        } else {
            centerView.classList.add('hidden');
            loadAudio(song.file_path, false);
        }

        // audio-controls-areaがトラックリストより上にある場合、下げる
        setTimeout(() => {
            const audioControlsArea = document.querySelector('.audio-controls-area');
            const centerView = document.getElementById('song-detail-center');

            if (!centerView.classList.contains('hidden')) {
                // トラックリストが表示されている場合
                const trackList = document.getElementById('album-track-list');
                if (trackList && trackList.children.length > 0) {
                    const trackListRect = trackList.getBoundingClientRect();
                    const audioControlsRect = audioControlsArea.getBoundingClientRect();

                    // トラックリストの最下部がaudio-controls-areaの最下部より下にある場合、audio-controls-areaを下げる
                    const trackListBottom = trackListRect.bottom;
                    const audioControlsBottom = audioControlsRect.bottom;

                    if (trackListBottom > audioControlsBottom) {
                        const diff = trackListBottom - audioControlsBottom;
                        audioControlsArea.style.marginTop = (parseFloat(window.getComputedStyle(audioControlsArea).marginTop) + diff) + 'px';
                    }
                }
            }
        }, 0);
    };

    if (!document.startViewTransition) {
        updateDOM();
        return;
    }
    activeCardImg.style.viewTransitionName = 'hero-audio';
    document.startViewTransition(() => {
        updateDOM();
    });
}

function loadAudio(src, autoPlay) {
    detailAudio.src = src;
    detailAudio.load();
    if (autoPlay) {
        detailAudio.play();
        audioPlayIcon.src = 'images/pause.svg';
    } else {
        audioPlayIcon.src = 'images/play.svg';
    }
}

btnAudioPlayPause.addEventListener('click', () => {
    if (detailAudio.paused) {
        detailAudio.play();
        audioPlayIcon.src = 'images/pause.svg';
    } else {
        detailAudio.pause();
        audioPlayIcon.src = 'images/play.svg';
    }
});

audioVolumeSlider.addEventListener('input', (e) => {
    detailAudio.volume = e.target.value;
});

const formatTime = (seconds) => {
    if (isNaN(seconds)) return "0:00";
    const m = Math.floor(seconds / 60);
    const s = Math.floor(seconds % 60).toString().padStart(2, '0');
    return `${m}:${s}`;
};

detailAudio.addEventListener('loadedmetadata', () => {
    audioSeekBar.max = detailAudio.duration;
    timeDuration.textContent = formatTime(detailAudio.duration);
});

detailAudio.addEventListener('timeupdate', () => {
    if (!audioSeekBar.matches(':active')) {
        audioSeekBar.value = detailAudio.currentTime;
    }
    timeCurrent.textContent = formatTime(detailAudio.currentTime);
});

audioSeekBar.addEventListener('input', (e) => {
    detailAudio.currentTime = e.target.value;
});

detailAudio.addEventListener('ended', () => {
    audioPlayIcon.src = 'images/play.svg';
});

songBackButton.addEventListener('click', () => {
    detailAudio.pause();

    // audio-controls-areaのマージンをリセット
    const audioControlsArea = document.querySelector('.audio-controls-area');
    if (audioControlsArea) {
        audioControlsArea.style.marginTop = '0';
    }

    const updateDOM = () => {
        songDetailView.classList.add('hidden');
        listView.classList.remove('hidden');
        // DOMの更新と同時にスクロール位置を復元
        restoreScrollPosition();
    };

    if (!document.startViewTransition) {
        updateDOM();
        if (activeCardImg) activeCardImg.style.viewTransitionName = '';
        return;
    }

    const transition = document.startViewTransition(() => {
        updateDOM();
    });

    transition.finished.finally(() => {
        if (activeCardImg) {
            activeCardImg.style.viewTransitionName = '';
            activeCardImg = null;
        }
    });
});


// ==========================================
// 5. アプリケーション初期化
// ==========================================

// ページビューを初期化（セクション表示制御）
initializePageView();

function startApp() {
    loadSiteConfig();
    loadMediaData();
}

if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', startApp);
} else {
    startApp();
}