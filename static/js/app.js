/**
 * Kedai Musik - Mobile Web & PWA Player Controller
 * 100% Ad-Free YouTube Music & Video Experience
 */

document.addEventListener('DOMContentLoaded', () => {
  // ------------------------------------------------------------------------
  // State Management
  // ------------------------------------------------------------------------
  const state = {
    currentTrack: null,
    queue: [],
    history: [],
    favorites: JSON.parse(localStorage.getItem('kedaimusik_favorites') || localStorage.getItem('vibetube_favorites') || '[]'),
    searchHistory: JSON.parse(localStorage.getItem('kedaimusik_search_history') || localStorage.getItem('vibetube_search_history') || '[]'),
    isPlaying: false,
    mode: 'audio', // 'audio' | 'video'
    isShuffle: false,
    repeatMode: 'off', // 'off' | 'all' | 'one'
    playbackSpeed: 1.0,
    sleepTimerSeconds: 0,
    sleepTimerInterval: null,
    sleepAtSongEnd: false,
    syncedLyrics: [],
    plainLyrics: '',
    currentCategory: 'indo',
    searchQuery: '',
    searchLimit: 40,
    currentSearchResults: [],
    isUsingYtFallback: false,
    ytPlayer: null,
    ytPlayerReady: false,
    ytSyncInterval: null,
    deferredPrompt: null
  };

  // ------------------------------------------------------------------------
  // DOM Elements
  // ------------------------------------------------------------------------
  const audioEl = document.getElementById('htmlAudioPlayer');
  const videoEl = document.getElementById('htmlVideoPlayer');

  // Mini Player
  const miniPlayer = document.getElementById('miniPlayer');
  const miniProgressLine = document.getElementById('miniProgressLine');
  const miniThumb = document.getElementById('miniThumb');
  const miniTitle = document.getElementById('miniTitle');
  const miniArtist = document.getElementById('miniArtist');
  const miniPlayIcon = document.getElementById('miniPlayIcon');
  const miniBtnPlay = document.getElementById('miniBtnPlay');
  const miniBtnNext = document.getElementById('miniBtnNext');
  const miniBtnLike = document.getElementById('miniBtnLike');
  const miniPlayerClickable = document.getElementById('miniPlayerClickable');
  const miniVisualizer = document.getElementById('miniVisualizer');

  // Full Player Modal
  const fullPlayerModal = document.getElementById('fullPlayerModal');
  const btnCloseFullPlayer = document.getElementById('btnCloseFullPlayer');
  const playerDragHandle = document.getElementById('playerDragHandle');
  const btnModeAudio = document.getElementById('btnModeAudio');
  const btnModeVideo = document.getElementById('btnModeVideo');
  const audioDisplay = document.getElementById('audioDisplay');
  const videoDisplay = document.getElementById('videoDisplay');
  const fullArtwork = document.getElementById('fullArtwork');
  const waveVisualizer = document.getElementById('waveVisualizer');
  const fullPlayerTitle = document.getElementById('fullPlayerTitle');
  const fullPlayerArtist = document.getElementById('fullPlayerArtist');
  const btnFullLike = document.getElementById('btnFullLike');
  const fullPlayIcon = document.getElementById('fullPlayIcon');
  const btnFullPlay = document.getElementById('btnFullPlay');
  const btnPrev = document.getElementById('btnPrev');
  const btnNext = document.getElementById('btnNext');
  const btnShuffle = document.getElementById('btnShuffle');
  const btnRepeat = document.getElementById('btnRepeat');
  const repeatBadge = document.getElementById('repeatBadge');
  const playerSpinner = document.getElementById('playerSpinner');

  // Seekbar & Times
  const seekBarContainer = document.getElementById('seekBarContainer');
  const seekFill = document.getElementById('seekFill');
  const seekThumb = document.getElementById('seekThumb');
  const currentTimeEl = document.getElementById('currentTime');
  const totalDurationEl = document.getElementById('totalDuration');

  // Toolbars
  const btnToggleLyrics = document.getElementById('btnToggleLyrics');
  const lyricsSheet = document.getElementById('lyricsSheet');
  const btnCloseLyrics = document.getElementById('btnCloseLyrics');
  const lyricsContainer = document.getElementById('lyricsContainer');
  const btnSleepTimer = document.getElementById('btnSleepTimer');
  const sleepTimerBadge = document.getElementById('sleepTimerBadge');
  const btnDownloadCurrent = document.getElementById('btnDownloadCurrent');
  const btnPlaybackSpeed = document.getElementById('btnPlaybackSpeed');
  const speedDisplay = document.getElementById('speedDisplay');

  // Navigation & Views
  const navItems = document.querySelectorAll('.nav-item');
  const viewSections = document.querySelectorAll('.view-section');

  // Search
  const searchInput = document.getElementById('searchInput');
  const btnClearSearch = document.getElementById('btnClearSearch');
  const suggestionsList = document.getElementById('suggestionsList');
  const searchSuggestionsBox = document.getElementById('searchSuggestionsBox');
  const searchResultsSection = document.getElementById('searchResultsSection');
  const searchResultsList = document.getElementById('searchResultsList');
  const resultsCount = document.getElementById('resultsCount');
  const historySection = document.getElementById('historySection');
  const historyList = document.getElementById('historyList');
  const btnClearHistory = document.getElementById('btnClearHistory');
  const searchTags = document.querySelectorAll('.search-tag');

  // Home / Trending
  const homeSongList = document.getElementById('homeSongList');
  const categoryPills = document.querySelectorAll('.cat-pill');
  const categoryTitle = document.getElementById('categoryTitle');
  const btnPlayAllCategory = document.getElementById('btnPlayAllCategory');

  // Queue & Favorites
  const queueList = document.getElementById('queueList');
  const queueCount = document.getElementById('queueCount');
  const btnClearQueue = document.getElementById('btnClearQueue');
  const recentlyPlayedList = document.getElementById('recentlyPlayedList');
  const favoritesList = document.getElementById('favoritesList');
  const favoritesCount = document.getElementById('favoritesCount');
  const btnPlayAllFavorites = document.getElementById('btnPlayAllFavorites');

  // Modals & PWA
  const modalQr = document.getElementById('modalQr');
  const btnConnectQr = document.getElementById('btnConnectQr');
  const btnCloseQrModal = document.getElementById('btnCloseQrModal');
  const btnOpenQrModal = document.getElementById('btnOpenQrModal');
  const btnCopyUrl = document.getElementById('btnCopyUrl');
  const mobileUrlText = document.getElementById('mobileUrlText');
  const modalSleepTimer = document.getElementById('modalSleepTimer');
  const btnCloseSleepModal = document.getElementById('btnCloseSleepModal');
  const btnOpenSleepTimerModal = document.getElementById('btnOpenSleepTimerModal');
  const sleepTimerStatus = document.getElementById('sleepTimerStatus');
  const timerOptions = document.querySelectorAll('.timer-opt');
  const btnInstallPwa = document.getElementById('btnInstallPwa');
  const toastEl = document.getElementById('toast');

  let isSeeking = false;
  let searchDebounceTimer = null;

  // ------------------------------------------------------------------------
  // Toast Helper
  // ------------------------------------------------------------------------
  function showToast(msg, duration = 2500) {
    toastEl.textContent = msg;
    toastEl.classList.remove('hidden');
    clearTimeout(toastEl._timer);
    toastEl._timer = setTimeout(() => {
      toastEl.classList.add('hidden');
    }, duration);
  }

  // ------------------------------------------------------------------------
  // Audio & Video Player Core
  // ------------------------------------------------------------------------
  function getActiveMediaElement() {
    return state.mode === 'video' ? videoEl : audioEl;
  }

  function stopMediaElement(media) {
    if (!media) return;
    try {
      media.pause();
      media.removeAttribute('src');
      media.load();
    } catch (e) {}
  }

  // Safe "set src + resume at position" for mobile browsers.
  // Assigning currentTime right after src= is a race condition on
  // Android/iOS WebView: metadata is not loaded yet, so the seek throws or
  // the element silently restarts from 0 (and play() can reject). This
  // waits for 'loadedmetadata' before seeking.
  function assignSrcAndSeek(media, url, resumeTime, resumePlay) {
    media.src = url;
    media.playbackRate = state.playbackSpeed;

    const doSeek = () => {
      try { media.currentTime = resumeTime || 0; } catch (e) {}
      if (resumePlay) {
        media.play()
          .then(() => {
            state.isPlaying = true;
            updatePlaybackUI(true);
          })
          .catch(err => {
            console.warn('Resume play error:', err);
            state.isPlaying = false;
            updatePlaybackUI(false);
          });
      }
    };

    if (media.readyState >= 1) {
      // Metadata already available (e.g. mode switch while playing)
      doSeek();
    } else {
      media.addEventListener('loadedmetadata', doSeek, { once: true });
      // Also kick off the buffer so the spinner disappears as soon as possible
      media.load();
    }
  }

  function playTrack(track, autoStart = true) {
    if (!track || !track.id) return;
    
    audioEl._retries = 0;
    videoEl._retries = 0;
    
    state.currentTrack = track;
    addToHistory(track);
    updateTrackMetadataUI(track);
    miniPlayer.classList.remove('hidden');

    playerSpinner.classList.remove('hidden');
    fullPlayIcon.classList.add('hidden');

    if (state.isUsingYtFallback) {
      fallbackToYouTubePlayer(track);
      setupMediaSession(track);
      fetchLyrics(track);
      renderQueue();
      renderFavorites();
      return;
    }

    if (state.mode === 'video') {
      stopMediaElement(audioEl);
      const videoStreamUrl = `/api/stream/${track.id}?type=video`;
      assignSrcAndSeek(videoEl, videoStreamUrl, 0, autoStart);
    } else {
      stopMediaElement(videoEl);
      const audioStreamUrl = `/api/stream/${track.id}?type=audio`;
      assignSrcAndSeek(audioEl, audioStreamUrl, 0, autoStart);
    }

    setupMediaSession(track);
    fetchLyrics(track);
    renderQueue();
    renderFavorites();
  }

  function togglePlayPause() {
    if (!state.currentTrack) {
      if (state.queue.length > 0) {
        playTrack(state.queue[0]);
      }
      return;
    }

    if (state.isUsingYtFallback && state.ytPlayer && typeof state.ytPlayer.getPlayerState === 'function') {
      const pState = state.ytPlayer.getPlayerState();
      if (pState === YT.PlayerState.PLAYING) {
        state.ytPlayer.pauseVideo();
        state.isPlaying = false;
        updatePlaybackUI(false);
      } else {
        state.ytPlayer.playVideo();
        state.isPlaying = true;
        updatePlaybackUI(true);
      }
      return;
    }

    const activeMedia = getActiveMediaElement();

    if (activeMedia.paused) {
      activeMedia.play()
        .then(() => {
          state.isPlaying = true;
          updatePlaybackUI(true);
        })
        .catch(console.error);
    } else {
      activeMedia.pause();
      state.isPlaying = false;
      updatePlaybackUI(false);
    }
  }

  function updatePlaybackUI(isPlaying) {
    playerSpinner.classList.add('hidden');
    
    if (isPlaying) {
      fullPlayIcon.innerHTML = '<rect x="6" y="4" width="4" height="16"/><rect x="14" y="4" width="4" height="16"/>';
      miniPlayIcon.innerHTML = '<rect x="6" y="4" width="4" height="16"/><rect x="14" y="4" width="4" height="16"/>';
      fullArtwork.classList.add('spinning');
      waveVisualizer.classList.add('active');
      miniVisualizer.classList.remove('hidden');
    } else {
      fullPlayIcon.innerHTML = '<polygon points="5 3 19 12 5 21 5 3"/>';
      miniPlayIcon.innerHTML = '<polygon points="5 3 19 12 5 21 5 3"/>';
      fullArtwork.classList.remove('spinning');
      waveVisualizer.classList.remove('active');
      miniVisualizer.classList.add('hidden');
    }
    
    fullPlayIcon.classList.remove('hidden');

    if ('mediaSession' in navigator) {
      navigator.mediaSession.playbackState = isPlaying ? 'playing' : 'paused';
    }
  }

  function updateTrackMetadataUI(track) {
    const thumbUrl = track.thumbnail || `/static/icons/favicon.svg`;
    
    miniThumb.src = thumbUrl;
    miniTitle.textContent = track.title;
    miniArtist.textContent = track.artist || 'Artis';

    fullArtwork.src = thumbUrl;
    fullPlayerTitle.textContent = track.title;
    fullPlayerArtist.textContent = track.artist || 'Artis';

    const isLiked = state.favorites.some(f => f.id === track.id);
    updateLikeButtons(isLiked);
  }

  function updateLikeButtons(isLiked) {
    if (isLiked) {
      btnFullLike.classList.add('liked');
      btnFullLike.innerHTML = '<svg viewBox="0 0 24 24" width="24" height="24" fill="#ec4899" stroke="#ec4899" stroke-width="2"><path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"/></svg>';
      miniBtnLike.innerHTML = '<svg viewBox="0 0 24 24" width="20" height="20" fill="#ec4899" stroke="#ec4899" stroke-width="2"><path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"/></svg>';
    } else {
      btnFullLike.classList.remove('liked');
      btnFullLike.innerHTML = '<svg viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor" stroke-width="2"><path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"/></svg>';
      miniBtnLike.innerHTML = '<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2"><path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"/></svg>';
    }
  }

  function toggleLikeCurrentTrack() {
    if (!state.currentTrack) return;
    const idx = state.favorites.findIndex(f => f.id === state.currentTrack.id);
    if (idx >= 0) {
      state.favorites.splice(idx, 1);
      updateLikeButtons(false);
      showToast('Dihapus dari Favorit');
    } else {
      state.favorites.unshift(state.currentTrack);
      updateLikeButtons(true);
      showToast('❤️ Disimpan ke Favorit');
    }
    localStorage.setItem('kedaimusik_favorites', JSON.stringify(state.favorites));
    localStorage.setItem('vibetube_favorites', JSON.stringify(state.favorites));
    renderFavorites();
  }

  function playNextTrack() {
    if (state.queue.length === 0) return;
    
    const currentIndex = state.queue.findIndex(t => t.id === state.currentTrack?.id);
    let nextIndex = 0;

    if (state.isShuffle) {
      nextIndex = Math.floor(Math.random() * state.queue.length);
    } else if (currentIndex >= 0 && currentIndex < state.queue.length - 1) {
      nextIndex = currentIndex + 1;
    } else if (state.repeatMode === 'all') {
      nextIndex = 0;
    } else {
      showToast('Antrean selesai diputar');
      return;
    }

    playTrack(state.queue[nextIndex]);
  }

  function playPrevTrack() {
    const activeMedia = getActiveMediaElement();
    if (activeMedia.currentTime > 4) {
      activeMedia.currentTime = 0;
      return;
    }

    if (state.queue.length === 0) return;
    const currentIndex = state.queue.findIndex(t => t.id === state.currentTrack?.id);
    let prevIndex = state.queue.length - 1;

    if (currentIndex > 0) {
      prevIndex = currentIndex - 1;
    }

    playTrack(state.queue[prevIndex]);
  }

  // Switch between Audio and Video mode seamlessly
  function setMode(newMode) {
    if (state.mode === newMode) return;

    const oldMedia = state.mode === 'video' ? videoEl : audioEl;
    const currentTime = oldMedia.currentTime || 0;
    const wasPlaying = !oldMedia.paused;

    state.mode = newMode;

    if (newMode === 'audio') {
      btnModeAudio.classList.add('active');
      btnModeVideo.classList.remove('active');
      audioDisplay.classList.remove('hidden');
      videoDisplay.classList.add('hidden');

      stopMediaElement(videoEl);

      if (state.currentTrack) {
        assignSrcAndSeek(audioEl, `/api/stream/${state.currentTrack.id}?type=audio`, currentTime, wasPlaying);
      }
    } else {
      btnModeVideo.classList.add('active');
      btnModeAudio.classList.remove('active');
      videoDisplay.classList.remove('hidden');
      audioDisplay.classList.add('hidden');

      stopMediaElement(audioEl);

      if (state.currentTrack) {
        assignSrcAndSeek(videoEl, `/api/stream/${state.currentTrack.id}?type=video`, currentTime, wasPlaying);
      }
    }
  }

  // ------------------------------------------------------------------------
  // Web MediaSession API (Background Audio on Android & iOS!)
  // ------------------------------------------------------------------------
  function setupMediaSession(track) {
    if (!('mediaSession' in navigator)) return;

    const thumb = track.thumbnail || `${window.location.origin}/static/icons/icon-512.png`;

    navigator.mediaSession.metadata = new MediaMetadata({
      title: track.title,
      artist: track.artist || 'Kedai Musik',
      album: 'Kedai Musik Bebas Iklan',
      artwork: [
        { src: thumb, sizes: '96x96', type: 'image/jpeg' },
        { src: thumb, sizes: '128x128', type: 'image/jpeg' },
        { src: thumb, sizes: '192x192', type: 'image/jpeg' },
        { src: thumb, sizes: '256x256', type: 'image/jpeg' },
        { src: thumb, sizes: '512x512', type: 'image/jpeg' },
      ]
    });

    navigator.mediaSession.playbackState = 'playing';

    navigator.mediaSession.setActionHandler('play', () => {
      const activeMedia = getActiveMediaElement();
      activeMedia.play().then(() => {
        state.isPlaying = true;
        updatePlaybackUI(true);
      }).catch(console.error);
    });

    navigator.mediaSession.setActionHandler('pause', () => {
      const activeMedia = getActiveMediaElement();
      activeMedia.pause();
      state.isPlaying = false;
      updatePlaybackUI(false);
    });

    navigator.mediaSession.setActionHandler('stop', () => {
      const activeMedia = getActiveMediaElement();
      activeMedia.pause();
      state.isPlaying = false;
      updatePlaybackUI(false);
    });

    navigator.mediaSession.setActionHandler('previoustrack', () => playPrevTrack());
    navigator.mediaSession.setActionHandler('nexttrack', () => playNextTrack());

    navigator.mediaSession.setActionHandler('seekto', (details) => {
      const activeMedia = getActiveMediaElement();
      if (details.seekTime && activeMedia.duration) {
        activeMedia.currentTime = details.seekTime;
        updateMediaSessionPosition(activeMedia);
      }
    });

    navigator.mediaSession.setActionHandler('seekbackward', (details) => {
      const activeMedia = getActiveMediaElement();
      activeMedia.currentTime = Math.max(0, activeMedia.currentTime - (details.seekOffset || 10));
      updateMediaSessionPosition(activeMedia);
    });

    navigator.mediaSession.setActionHandler('seekforward', (details) => {
      const activeMedia = getActiveMediaElement();
      activeMedia.currentTime = Math.min(activeMedia.duration || 0, activeMedia.currentTime + (details.seekOffset || 10));
      updateMediaSessionPosition(activeMedia);
    });
  }

  function updateMediaSessionPosition(media) {
    if (!('mediaSession' in navigator) || !('setPositionState' in navigator.mediaSession)) return;
    if (media && media.duration && !isNaN(media.duration) && media.duration > 0) {
      try {
        navigator.mediaSession.setPositionState({
          duration: media.duration,
          playbackRate: media.playbackRate || 1.0,
          position: Math.min(media.currentTime, media.duration)
        });
      } catch (e) {}
    }
  }

  // ------------------------------------------------------------------------
  // Background Playback / Screen Lock Manager (Putar saat Layar Mati / Kunci)
  // ------------------------------------------------------------------------
  let switchedToAudioForBackground = false;

  document.addEventListener('visibilitychange', () => {
    if (document.hidden) {
      // Ponsel dikunci atau layar dimatikan atau pindah aplikasi
      if (state.mode === 'video' && state.isPlaying && state.currentTrack) {
        // Video otomatis di-pause oleh Android/iOS saat layar mati.
        // Pindahkan posisi ke audio agar lagu TETAP BERPUTAR di latar belakang!
        const currentPos = videoEl.currentTime || 0;
        switchedToAudioForBackground = true;

        stopMediaElement(videoEl);
        assignSrcAndSeek(audioEl, `/api/stream/${state.currentTrack.id}?type=audio`, currentPos, true);
      }
    } else {
      // Ponsel dibuka kembali / layar menyala
      if (switchedToAudioForBackground && state.mode === 'video' && state.currentTrack) {
        switchedToAudioForBackground = false;
        const currentPos = audioEl.currentTime || 0;
        const wasPlaying = !audioEl.paused;

        stopMediaElement(audioEl);
        assignSrcAndSeek(videoEl, `/api/stream/${state.currentTrack.id}?type=video`, currentPos, wasPlaying);
      }
    }
  });

  // ------------------------------------------------------------------------
  // Synchronized Media Event Handlers (Audio & Video)
  // ------------------------------------------------------------------------
  [audioEl, videoEl].forEach(media => {
    media.addEventListener('timeupdate', () => {
      const isActive = (state.mode === 'video' && media === videoEl) || (state.mode === 'audio' && media === audioEl);
      if (!isActive || isSeeking) return;

      const cur = media.currentTime || 0;
      const dur = media.duration || 0;

      if (dur > 0) {
        const pct = (cur / dur) * 100;
        seekFill.style.width = `${pct}%`;
        seekThumb.style.left = `${pct}%`;
        miniProgressLine.style.width = `${pct}%`;
        currentTimeEl.textContent = formatDuration(cur);
        totalDurationEl.textContent = formatDuration(dur);
        updateMediaSessionPosition(media);
      }

      syncLyricsWithTime(cur);
    });

    media.addEventListener('ended', () => {
      const isActive = (state.mode === 'video' && media === videoEl) || (state.mode === 'audio' && media === audioEl);
      if (!isActive) return;

      if (state.sleepAtSongEnd) {
        state.sleepAtSongEnd = false;
        showToast('💤 Waktu tidur tiba, musik berhenti.');
        return;
      }

      if (state.repeatMode === 'one') {
        media.currentTime = 0;
        media.play();
      } else {
        playNextTrack();
      }
    });

    media.addEventListener('playing', () => {
      state.isPlaying = true;
      updatePlaybackUI(true);
    });

    media.addEventListener('pause', () => {
      const isActive = (state.mode === 'video' && media === videoEl) || (state.mode === 'audio' && media === audioEl);
      if (isActive) {
        state.isPlaying = false;
        updatePlaybackUI(false);
      }
    });

    media.addEventListener('waiting', () => {
      playerSpinner.classList.remove('hidden');
      fullPlayIcon.classList.add('hidden');
    });

    media.addEventListener('error', () => {
      // 1. MUST be the currently active media element
      const activeMedia = getActiveMediaElement();
      if (media !== activeMedia) return;

      // 2. MUST have a valid non-empty src attribute
      const srcAttr = media.getAttribute('src');
      if (!srcAttr || srcAttr.trim() === '' || srcAttr === window.location.href) return;

      // 3. Ignore MEDIA_ERR_ABORTED (code 1)
      const err = media.error;
      const code = err ? err.code : 0;
      if (code === 1) return;

      // 4. If media is already actively playing, DO NOT show error!
      if (!media.paused && media.currentTime > 0) return;

      // 5. Automatic self-healing retry (up to 3x) before showing error toast.
      //    1st-2nd: refresh the proxy stream with a fresh token.
      //    3rd: fall back to the direct Google CDN URL (bypasses proxy limits).
      if (media._retries < 3 && state.currentTrack) {
        media._retries = (media._retries || 0) + 1;
        console.warn('Playback error detected, retry', media._retries, 'with fresh token...');

        if (media._retries < 3) {
          fetch(`/api/playback/${state.currentTrack.id}?type=${state.mode}`)
            .then(res => res.json())
            .then(data => {
              if (data.success && data.proxy_url) {
                media.src = `${data.proxy_url}&_r=${Date.now()}`;
                media.play().catch(() => {});
              } else {
                tryDirectFallback(media);
              }
            })
            .catch(() => tryDirectFallback(media));
        } else {
          tryDirectFallback(media);
        }
        return;
      }

      console.warn('Active media error code:', code);
      playerSpinner.classList.add('hidden');
      fullPlayIcon.classList.remove('hidden');
      showToast('⚠️ Gagal memuat track, coba pilih lagu lain.');
    });

    function tryDirectFallback(media) {
      fetch(`/api/playback/${state.currentTrack.id}?type=${state.mode}`)
        .then(res => res.json())
        .then(data => {
          if (data.success && data.url) {
            media.src = data.url;
            media.play().catch(() => fallbackToYouTubePlayer(state.currentTrack));
          } else {
            fallbackToYouTubePlayer(state.currentTrack);
          }
        })
        .catch(() => {
          fallbackToYouTubePlayer(state.currentTrack);
        });
    }
  });

  // ------------------------------------------------------------------------
  // Seek Bar Interaction
  // ------------------------------------------------------------------------
  function seekToPosition(e) {
    const rect = seekBarContainer.getBoundingClientRect();
    const clientX = e.touches ? e.touches[0].clientX : e.clientX;
    const clickX = Math.max(0, Math.min(clientX - rect.left, rect.width));
    const pct = clickX / rect.width;
    
    seekFill.style.width = `${pct * 100}%`;
    seekThumb.style.left = `${pct * 100}%`;

    if (state.isUsingYtFallback && state.ytPlayer && typeof state.ytPlayer.getDuration === 'function') {
      const dur = state.ytPlayer.getDuration() || 0;
      if (dur > 0) {
        state.ytPlayer.seekTo(pct * dur, true);
        currentTimeEl.textContent = formatDuration(pct * dur);
      }
      return;
    }

    const activeMedia = getActiveMediaElement();
    if (activeMedia.duration) {
      activeMedia.currentTime = pct * activeMedia.duration;
    }
  }

  seekBarContainer.addEventListener('mousedown', (e) => {
    isSeeking = true;
    seekToPosition(e);
  });

  seekBarContainer.addEventListener('touchstart', (e) => {
    isSeeking = true;
    seekToPosition(e);
  }, { passive: true });

  window.addEventListener('mousemove', (e) => {
    if (isSeeking) seekToPosition(e);
  });

  window.addEventListener('touchmove', (e) => {
    if (isSeeking) seekToPosition(e);
  }, { passive: true });

  window.addEventListener('mouseup', () => { isSeeking = false; });
  window.addEventListener('touchend', () => { isSeeking = false; });

  // ------------------------------------------------------------------------
  // Synced Lyrics (LRCLIB)
  // ------------------------------------------------------------------------
  function fetchLyrics(track) {
    lyricsContainer.innerHTML = '<p class="lyrics-placeholder">Mencari lirik lagu...</p>';
    state.syncedLyrics = [];
    state.plainLyrics = '';

    fetch(`/api/lyrics?title=${encodeURIComponent(track.title)}&artist=${encodeURIComponent(track.artist || '')}`)
      .then(res => res.json())
      .then(data => {
        if (data.found && data.synced) {
          parseLrcLyrics(data.synced);
        } else if (data.found && data.plain) {
          state.plainLyrics = data.plain;
          renderPlainLyrics(data.plain);
        } else {
          lyricsContainer.innerHTML = '<p class="lyrics-placeholder">Lirik tidak ditemukan untuk lagu ini.</p>';
        }
      })
      .catch(() => {
        lyricsContainer.innerHTML = '<p class="lyrics-placeholder">Gagal memuat lirik.</p>';
      });
  }

  function parseLrcLyrics(lrcText) {
    const lines = lrcText.split('\n');
    const parsed = [];
    const timeRegex = /\[(\d{2}):(\d{2})\.(\d{2,3})\](.*)/;

    lines.forEach(line => {
      const match = timeRegex.exec(line);
      if (match) {
        const mins = parseInt(match[1]);
        const secs = parseInt(match[2]);
        const ms = parseInt(match[3]);
        const totalSeconds = mins * 60 + secs + (ms / 100);
        const text = match[4].trim();
        if (text) {
          parsed.push({ time: totalSeconds, text });
        }
      }
    });

    state.syncedLyrics = parsed;
    renderSyncedLyrics(parsed);
  }

  function renderSyncedLyrics(lyrics) {
    lyricsContainer.innerHTML = '';
    lyrics.forEach((item, idx) => {
      const p = document.createElement('p');
      p.className = 'lyric-line';
      p.dataset.time = item.time;
      p.dataset.idx = idx;
      p.textContent = item.text;
      p.addEventListener('click', () => {
        const activeMedia = getActiveMediaElement();
        activeMedia.currentTime = item.time;
      });
      lyricsContainer.appendChild(p);
    });
  }

  function renderPlainLyrics(plainText) {
    lyricsContainer.innerHTML = '';
    const lines = plainText.split('\n');
    lines.forEach(l => {
      const p = document.createElement('p');
      p.className = 'lyric-line';
      p.textContent = l || ' ';
      lyricsContainer.appendChild(p);
    });
  }

  function syncLyricsWithTime(currentTime) {
    if (!state.syncedLyrics.length) return;

    let activeIdx = -1;
    for (let i = 0; i < state.syncedLyrics.length; i++) {
      if (currentTime >= state.syncedLyrics[i].time) {
        activeIdx = i;
      } else {
        break;
      }
    }

    if (activeIdx >= 0) {
      const lines = lyricsContainer.querySelectorAll('.lyric-line');
      lines.forEach((line, idx) => {
        if (idx === activeIdx) {
          if (!line.classList.contains('active')) {
            line.classList.add('active');
            line.scrollIntoView({ behavior: 'smooth', block: 'center' });
          }
        } else {
          line.classList.remove('active');
        }
      });
    }
  }

  // ------------------------------------------------------------------------
  // Sleep Timer Controller
  // ------------------------------------------------------------------------
  function setSleepTimer(minutes) {
    clearInterval(state.sleepTimerInterval);
    state.sleepAtSongEnd = false;

    if (minutes === 'end') {
      state.sleepAtSongEnd = true;
      sleepTimerBadge.textContent = 'Akhir Lagu';
      sleepTimerStatus.textContent = 'Berhenti saat lagu ini selesai';
      showToast('💤 Timer diatur: Berhenti di akhir lagu ini');
      modalSleepTimer.classList.add('hidden');
      return;
    }

    const minNum = parseInt(minutes);
    if (minNum <= 0) {
      state.sleepTimerSeconds = 0;
      sleepTimerBadge.textContent = 'Timer';
      sleepTimerStatus.textContent = 'Mati (Tidak aktif)';
      showToast('Timer tidur dimatikan');
      modalSleepTimer.classList.add('hidden');
      return;
    }

    state.sleepTimerSeconds = minNum * 60;
    updateSleepTimerUI();
    showToast(`💤 Timer diatur: ${minNum} Menit`);
    modalSleepTimer.classList.add('hidden');

    state.sleepTimerInterval = setInterval(() => {
      state.sleepTimerSeconds--;
      if (state.sleepTimerSeconds <= 0) {
        clearInterval(state.sleepTimerInterval);
        getActiveMediaElement().pause();
        state.isPlaying = false;
        updatePlaybackUI(false);
        sleepTimerBadge.textContent = 'Timer';
        sleepTimerStatus.textContent = 'Mati (Tidak aktif)';
        showToast('💤 Waktu tidur habis, musik berhenti otomatis.');
      } else {
        updateSleepTimerUI();
      }
    }, 1000);
  }

  function updateSleepTimerUI() {
    const mins = Math.floor(state.sleepTimerSeconds / 60);
    const secs = state.sleepTimerSeconds % 60;
    const txt = `${mins}m ${secs}s`;
    sleepTimerBadge.textContent = `${mins}m`;
    sleepTimerStatus.textContent = `Aktif: Berhenti dalam ${txt}`;
  }

  // ------------------------------------------------------------------------
  // Home & Trending Songs Loader
  // ------------------------------------------------------------------------
  function loadTrendingSongs(category) {
    state.currentCategory = category;
    homeSongList.innerHTML = `
      <div class="skeleton-list">
        <div class="skeleton-item"></div>
        <div class="skeleton-item"></div>
        <div class="skeleton-item"></div>
        <div class="skeleton-item"></div>
        <div class="skeleton-item"></div>
      </div>
    `;

    fetch(`/api/trending?category=${category}`)
      .then(res => res.json())
      .then(tracks => {
        if (!tracks || tracks.length === 0) {
          homeSongList.innerHTML = '<div class="empty-state"><p>Tidak ada lagu ditemukan.</p></div>';
          return;
        }

        renderSongList(tracks, homeSongList, (track) => {
          state.queue = [...tracks];
          playTrack(track);
        });
      })
      .catch(err => {
        console.error('Trending fetch error:', err);
        homeSongList.innerHTML = '<div class="empty-state"><p>Gagal memuat musik trending.</p></div>';
      });
  }

  // ------------------------------------------------------------------------
  // Search Controller
  // ------------------------------------------------------------------------
  function executeSearch(query, isLoadMore = false) {
    if (!query) return;
    
    if (!isLoadMore) {
      state.searchQuery = query;
      state.searchLimit = 50;
      state.currentSearchResults = [];

      if (!state.searchHistory.includes(query)) {
        state.searchHistory.unshift(query);
        if (state.searchHistory.length > 8) state.searchHistory.pop();
        localStorage.setItem('kedaimusik_search_history', JSON.stringify(state.searchHistory));
        localStorage.setItem('vibetube_search_history', JSON.stringify(state.searchHistory));
        renderSearchHistory();
      }

      suggestionsList.classList.add('hidden');
      searchSuggestionsBox.classList.add('hidden');
      searchResultsSection.classList.remove('hidden');

      searchResultsList.innerHTML = `
        <div class="skeleton-list">
          <div class="skeleton-item"></div>
          <div class="skeleton-item"></div>
          <div class="skeleton-item"></div>
          <div class="skeleton-item"></div>
        </div>
      `;
    }

    const currentLimit = state.searchLimit;

    fetch(`/api/search?q=${encodeURIComponent(query)}&limit=${currentLimit}`)
      .then(res => res.json())
      .then(results => {
        if (!results || results.length === 0 || results.error) {
          if (!isLoadMore) {
            searchResultsList.innerHTML = '<div class="empty-state"><p>Lagu tidak ditemukan.</p></div>';
            resultsCount.textContent = '0 lagu';
          }
          return;
        }

        state.currentSearchResults = results;
        resultsCount.textContent = `${results.length} lagu ditemukan`;

        renderSongList(results, searchResultsList, (track) => {
          state.queue = [...results];
          playTrack(track);
        });

        // Tombol Muat Lebih Banyak Lagu (seberapa adanya hasil di YouTube)
        if (results.length >= 20 && results.length < 100) {
          const loadMoreContainer = document.createElement('div');
          loadMoreContainer.className = 'load-more-container';
          loadMoreContainer.style.padding = '20px 0 32px 0';
          loadMoreContainer.style.textAlign = 'center';

          const loadMoreBtn = document.createElement('button');
          loadMoreBtn.className = 'btn-load-more';
          loadMoreBtn.innerHTML = `
            <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" style="vertical-align:middle; margin-right:6px;">
              <polyline points="7 13 12 18 17 13"/>
              <polyline points="7 6 12 11 17 6"/>
            </svg>
            Tampilkan Lebih Banyak Lagu (${results.length}+)
          `;
          loadMoreBtn.style.background = 'linear-gradient(135deg, rgba(124, 58, 237, 0.3), rgba(236, 72, 153, 0.3))';
          loadMoreBtn.style.border = '1px solid rgba(167, 139, 250, 0.5)';
          loadMoreBtn.style.color = '#ffffff';
          loadMoreBtn.style.padding = '12px 28px';
          loadMoreBtn.style.borderRadius = '999px';
          loadMoreBtn.style.fontSize = '14px';
          loadMoreBtn.style.fontWeight = '600';
          loadMoreBtn.style.cursor = 'pointer';
          loadMoreBtn.style.boxShadow = '0 4px 15px rgba(124, 58, 237, 0.3)';
          loadMoreBtn.style.transition = 'all 0.2s ease';

          loadMoreBtn.addEventListener('click', () => {
            loadMoreBtn.disabled = true;
            loadMoreBtn.innerHTML = '⏳ Sedang memuat lagu tambahan...';
            state.searchLimit += 30;
            executeSearch(state.searchQuery, true);
          });

          loadMoreContainer.appendChild(loadMoreBtn);
          searchResultsList.appendChild(loadMoreContainer);
        }
      })
      .catch(err => {
        console.error('Search error:', err);
        if (!isLoadMore) {
          searchResultsList.innerHTML = '<div class="empty-state"><p>Pencarian gagal, coba lagi.</p></div>';
        }
      });
  }

  function fetchSearchSuggestions(keyword) {
    if (!keyword) {
      suggestionsList.classList.add('hidden');
      return;
    }

    fetch(`/api/suggestions?q=${encodeURIComponent(keyword)}`)
      .then(res => res.json())
      .then(suggestions => {
        if (!suggestions || suggestions.length === 0) {
          suggestionsList.classList.add('hidden');
          return;
        }

        suggestionsList.innerHTML = '';
        suggestions.forEach(item => {
          const div = document.createElement('div');
          div.className = 'suggestion-item';
          div.innerHTML = `
            <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2">
              <circle cx="11" cy="11" r="8"/>
              <line x1="21" y1="21" x2="16.65" y2="16.65"/>
            </svg>
            <span>${item}</span>
          `;
          div.addEventListener('click', () => {
            searchInput.value = item;
            executeSearch(item);
          });
          suggestionsList.appendChild(div);
        });
        suggestionsList.classList.remove('hidden');
      })
      .catch(() => {
        suggestionsList.classList.add('hidden');
      });
  }

  function renderSearchHistory() {
    if (state.searchHistory.length === 0) {
      historySection.classList.add('hidden');
      return;
    }

    historySection.classList.remove('hidden');
    historyList.innerHTML = '';
    state.searchHistory.forEach(item => {
      const div = document.createElement('div');
      div.className = 'history-item';
      div.innerHTML = `
        <span>${item}</span>
        <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2">
          <line x1="7" y1="17" x2="17" y2="7"/>
          <polyline points="7 7 17 7 17 17"/>
        </svg>
      `;
      div.addEventListener('click', () => {
        searchInput.value = item;
        executeSearch(item);
      });
      historyList.appendChild(div);
    });
  }

  // ------------------------------------------------------------------------
  // Reusable Song List Renderer
  // ------------------------------------------------------------------------
  function renderSongList(tracks, container, onPlayCallback) {
    container.innerHTML = '';

    tracks.forEach((track) => {
      const isNowPlaying = state.currentTrack && state.currentTrack.id === track.id;
      const isLiked = state.favorites.some(f => f.id === track.id);
      const card = document.createElement('div');
      card.className = `song-card ${isNowPlaying ? 'now-playing' : ''}`;

      card.innerHTML = `
        <div class="song-left">
          <div class="thumb-wrap">
            <img src="${track.thumbnail}" alt="${track.title}" loading="lazy">
            <div class="thumb-play-overlay">
              <svg viewBox="0 0 24 24" width="18" height="18" fill="#fff">
                <polygon points="5 3 19 12 5 21 5 3"/>
              </svg>
            </div>
          </div>
          <div class="song-info">
            <div class="song-title">${track.title}</div>
            <div class="song-sub">
              <span>${track.artist || 'Artis'}</span>
              ${track.views ? `<span class="song-dot">•</span><span>${track.views}</span>` : ''}
            </div>
          </div>
        </div>
        <div class="song-right">
          <span class="song-duration">${track.duration_formatted || '0:00'}</span>
          <button class="icon-btn-action btn-add-queue" title="Tambah ke Antrean" aria-label="Tambah ke Antrean">
            <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2">
              <line x1="12" y1="5" x2="12" y2="19"/>
              <line x1="5" y1="12" x2="19" y2="12"/>
            </svg>
          </button>
          <button class="icon-btn-action btn-fav ${isLiked ? 'liked' : ''}" title="Suka" aria-label="Suka">
            <svg viewBox="0 0 24 24" width="18" height="18" fill="${isLiked ? '#ec4899' : 'none'}" stroke="${isLiked ? '#ec4899' : 'currentColor'}" stroke-width="2">
              <path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"/>
            </svg>
          </button>
        </div>
      `;

      card.querySelector('.song-left').addEventListener('click', () => {
        onPlayCallback(track);
      });

      card.querySelector('.btn-add-queue').addEventListener('click', (e) => {
        e.stopPropagation();
        addToQueue(track);
      });

      card.querySelector('.btn-fav').addEventListener('click', (e) => {
        e.stopPropagation();
        toggleFavorite(track, card.querySelector('.btn-fav'));
      });

      container.appendChild(card);
    });
  }

  function addToQueue(track) {
    if (!state.queue.some(t => t.id === track.id)) {
      state.queue.push(track);
      renderQueue();
      showToast(`Ditambahkan ke Antrean: ${track.title.slice(0, 24)}...`);
    } else {
      showToast('Lagu sudah ada di antrean');
    }
  }

  function toggleFavorite(track, btnElement) {
    const idx = state.favorites.findIndex(f => f.id === track.id);
    if (idx >= 0) {
      state.favorites.splice(idx, 1);
      btnElement.classList.remove('liked');
      btnElement.innerHTML = '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2"><path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"/></svg>';
      showToast('Dihapus dari Favorit');
    } else {
      state.favorites.unshift(track);
      btnElement.classList.add('liked');
      btnElement.innerHTML = '<svg viewBox="0 0 24 24" width="18" height="18" fill="#ec4899" stroke="#ec4899" stroke-width="2"><path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"/></svg>';
      showToast('❤️ Disimpan ke Favorit');
    }
    localStorage.setItem('kedaimusik_favorites', JSON.stringify(state.favorites));
    localStorage.setItem('vibetube_favorites', JSON.stringify(state.favorites));
    renderFavorites();
  }

  function addToHistory(track) {
    state.history = state.history.filter(t => t.id !== track.id);
    state.history.unshift(track);
    if (state.history.length > 20) state.history.pop();
    renderRecentlyPlayed();
  }

  function renderQueue() {
    queueCount.textContent = state.queue.length;
    if (state.queue.length === 0) {
      queueList.innerHTML = `
        <div class="empty-state">
          <svg viewBox="0 0 24 24" width="48" height="48" fill="none" stroke="currentColor" stroke-width="1.5">
            <path d="M8 6h13M8 12h13M8 18h13M3 6h.01M3 12h.01M3 18h.01"/>
          </svg>
          <p>Antrean masih kosong</p>
          <span>Pilih lagu dari Beranda atau Pencarian untuk ditambahkan ke antrean.</span>
        </div>
      `;
      return;
    }

    renderSongList(state.queue, queueList, (track) => {
      playTrack(track);
    });
  }

  function renderFavorites() {
    favoritesCount.textContent = state.favorites.length;
    if (state.favorites.length === 0) {
      favoritesList.innerHTML = `
        <div class="empty-state">
          <svg viewBox="0 0 24 24" width="48" height="48" fill="none" stroke="currentColor" stroke-width="1.5">
            <path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"/>
          </svg>
          <p>Belum ada lagu favorit</p>
          <span>Tekan ikon hati ❤️ pada lagu atau di player untuk menyimpannya di sini.</span>
        </div>
      `;
      return;
    }

    renderSongList(state.favorites, favoritesList, (track) => {
      state.queue = [...state.favorites];
      playTrack(track);
    });
  }

  function renderRecentlyPlayed() {
    if (state.history.length === 0) {
      recentlyPlayedList.innerHTML = '';
      return;
    }

    renderSongList(state.history.slice(0, 10), recentlyPlayedList, (track) => {
      playTrack(track);
    });
  }

  // ------------------------------------------------------------------------
  // Utilities & Formatters
  // ------------------------------------------------------------------------
  function formatDuration(seconds) {
    if (!seconds || isNaN(seconds)) return "0:00";
    const sec = Math.floor(seconds);
    const mins = Math.floor(sec / 60);
    const secs = sec % 60;
    return `${mins}:${secs < 10 ? '0' : ''}${secs}`;
  }

  // ------------------------------------------------------------------------
  // Event Listeners Setup
  // ------------------------------------------------------------------------

  // Navigation tab switching
  navItems.forEach(item => {
    item.addEventListener('click', () => {
      const targetTab = item.dataset.tab;
      navItems.forEach(n => n.classList.remove('active'));
      viewSections.forEach(v => v.classList.remove('active'));

      item.classList.add('active');
      const targetSection = document.getElementById(targetTab);
      if (targetSection) targetSection.classList.add('active');

      if (targetTab === 'viewQueue') renderQueue();
      if (targetTab === 'viewFavorites') renderFavorites();
    });
  });

  // Mini-player click -> Open fullscreen player
  miniPlayerClickable.addEventListener('click', () => {
    fullPlayerModal.classList.add('open');
  });

  // Close fullscreen player
  btnCloseFullPlayer.addEventListener('click', () => {
    fullPlayerModal.classList.remove('open');
  });

  playerDragHandle.addEventListener('click', () => {
    fullPlayerModal.classList.remove('open');
  });

  // Play / Pause controls
  miniBtnPlay.addEventListener('click', (e) => {
    e.stopPropagation();
    togglePlayPause();
  });

  btnFullPlay.addEventListener('click', togglePlayPause);
  miniBtnNext.addEventListener('click', (e) => {
    e.stopPropagation();
    playNextTrack();
  });
  btnNext.addEventListener('click', playNextTrack);
  btnPrev.addEventListener('click', playPrevTrack);

  // Like current track
  miniBtnLike.addEventListener('click', (e) => {
    e.stopPropagation();
    toggleLikeCurrentTrack();
  });
  btnFullLike.addEventListener('click', toggleLikeCurrentTrack);

  // Mode switcher (Audio / Video)
  btnModeAudio.addEventListener('click', () => setMode('audio'));
  btnModeVideo.addEventListener('click', () => setMode('video'));

  // Shuffle toggle
  btnShuffle.addEventListener('click', () => {
    state.isShuffle = !state.isShuffle;
    btnShuffle.classList.toggle('active', state.isShuffle);
    showToast(state.isShuffle ? '🔀 Acak Lagu Aktif' : 'Acak Lagu Mati');
  });

  // Repeat toggle (off -> all -> one -> off)
  btnRepeat.addEventListener('click', () => {
    if (state.repeatMode === 'off') {
      state.repeatMode = 'all';
      btnRepeat.classList.add('active');
      repeatBadge.classList.add('hidden');
      showToast('🔁 Ulangi Semua Lagu');
    } else if (state.repeatMode === 'all') {
      state.repeatMode = 'one';
      btnRepeat.classList.add('active');
      repeatBadge.classList.remove('hidden');
      showToast('🔂 Ulangi Lagu Ini');
    } else {
      state.repeatMode = 'off';
      btnRepeat.classList.remove('active');
      repeatBadge.classList.add('hidden');
      showToast('Ulangi Mati');
    }
  });

  // Lyrics toggle
  btnToggleLyrics.addEventListener('click', () => {
    lyricsSheet.classList.toggle('hidden');
  });
  btnCloseLyrics.addEventListener('click', () => {
    lyricsSheet.classList.add('hidden');
  });

  // Sleep Timer Modals
  btnSleepTimer.addEventListener('click', () => modalSleepTimer.classList.remove('hidden'));
  btnOpenSleepTimerModal.addEventListener('click', () => modalSleepTimer.classList.remove('hidden'));
  btnCloseSleepModal.addEventListener('click', () => modalSleepTimer.classList.add('hidden'));

  timerOptions.forEach(opt => {
    opt.addEventListener('click', () => {
      const minutes = opt.dataset.minutes;
      setSleepTimer(minutes);
    });
  });

  // Playback speed
  const speedRates = [0.75, 1.0, 1.25, 1.5, 2.0];
  btnPlaybackSpeed.addEventListener('click', () => {
    let curIdx = speedRates.indexOf(state.playbackSpeed);
    curIdx = (curIdx + 1) % speedRates.length;
    state.playbackSpeed = speedRates[curIdx];
    speedDisplay.textContent = `${state.playbackSpeed}x`;
    getActiveMediaElement().playbackRate = state.playbackSpeed;
    showToast(`Kecepatan: ${state.playbackSpeed}x`);
  });

  // Download song
  btnDownloadCurrent.addEventListener('click', () => {
    if (!state.currentTrack) return;
    const downloadUrl = `/api/download/${state.currentTrack.id}?title=${encodeURIComponent(state.currentTrack.title)}`;
    showToast('Memulai pengunduhan audio...');
    window.open(downloadUrl, '_blank');
  });

  // Category pills on Home
  categoryPills.forEach(pill => {
    pill.addEventListener('click', () => {
      categoryPills.forEach(p => p.classList.remove('active'));
      pill.classList.add('active');
      const cat = pill.dataset.category;
      categoryTitle.textContent = pill.textContent;
      loadTrendingSongs(cat);
    });
  });

  btnPlayAllCategory.addEventListener('click', () => {
    const cards = homeSongList.querySelectorAll('.song-card');
    if (cards.length > 0) {
      cards[0].querySelector('.song-left').click();
    }
  });

  btnPlayAllFavorites.addEventListener('click', () => {
    if (state.favorites.length > 0) {
      state.queue = [...state.favorites];
      playTrack(state.favorites[0]);
    } else {
      showToast('Belum ada lagu favorit untuk diputar');
    }
  });

  btnClearQueue.addEventListener('click', () => {
    state.queue = [];
    renderQueue();
    showToast('Antrean dibersihkan');
  });

  // Search input listeners
  searchInput.addEventListener('input', (e) => {
    const val = e.target.value.trim();
    btnClearSearch.classList.toggle('hidden', !val);

    clearTimeout(searchDebounceTimer);
    if (!val) {
      suggestionsList.classList.add('hidden');
      searchSuggestionsBox.classList.remove('hidden');
      searchResultsSection.classList.add('hidden');
      return;
    }

    searchDebounceTimer = setTimeout(() => {
      fetchSearchSuggestions(val);
    }, 280);
  });

  searchInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      const q = searchInput.value.trim();
      if (q) executeSearch(q);
    }
  });

  btnClearSearch.addEventListener('click', () => {
    searchInput.value = '';
    btnClearSearch.classList.add('hidden');
    suggestionsList.classList.add('hidden');
    searchResultsSection.classList.add('hidden');
    searchSuggestionsBox.classList.remove('hidden');
  });

  searchTags.forEach(tag => {
    tag.addEventListener('click', () => {
      searchInput.value = tag.textContent;
      btnClearSearch.classList.remove('hidden');
      executeSearch(tag.textContent);
    });
  });

  btnClearHistory.addEventListener('click', () => {
    state.searchHistory = [];
    localStorage.removeItem('kedaimusik_search_history');
    localStorage.removeItem('vibetube_search_history');
    renderSearchHistory();
  });

  // QR Modal & Copy URL
  btnConnectQr.addEventListener('click', () => modalQr.classList.remove('hidden'));
  btnOpenQrModal.addEventListener('click', () => modalQr.classList.remove('hidden'));
  btnCloseQrModal.addEventListener('click', () => modalQr.classList.add('hidden'));

  btnCopyUrl.addEventListener('click', () => {
    const txt = mobileUrlText.textContent;
    navigator.clipboard.writeText(txt).then(() => {
      showToast('Tautan disalin ke papan klip!');
    }).catch(() => {
      showToast(txt);
    });
  });

  // Refresh QR code if Cloudflare Tunnel became ready
  function refreshNetworkInfo() {
    fetch('/api/network-info')
      .then(res => res.json())
      .then(data => {
        if (data && data.url) {
          const qrImg = document.getElementById('qrCodeImg');
          if (qrImg && data.qr) {
            qrImg.src = `data:image/png;base64,${data.qr}`;
          }
          if (mobileUrlText) {
            mobileUrlText.textContent = data.url;
          }
        }
      })
      .catch(() => {});
  }
  
  // Check after 3s and 6s for tunnel ready
  setTimeout(refreshNetworkInfo, 3000);
  setTimeout(refreshNetworkInfo, 7000);

  // Close modals on clicking overlay backdrop
  [modalQr, modalSleepTimer].forEach(m => {
    m.addEventListener('click', (e) => {
      if (e.target === m) m.classList.add('hidden');
    });
  });

  // Default mode select
  const selectDefaultMode = document.getElementById('selectDefaultMode');
  selectDefaultMode.addEventListener('change', (e) => {
    setMode(e.target.value);
    showToast(`Mode diubah ke: ${e.target.value === 'audio' ? 'Audio Saja' : 'Video'}`);
  });

  // ------------------------------------------------------------------------
  // PWA (Progressive Web App) Service Worker & Install Prompt
  // ------------------------------------------------------------------------
  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('/sw.js')
      .then(reg => console.log('Service Worker registered with scope:', reg.scope))
      .catch(err => console.log('Service Worker registration failed:', err));
  }

  window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault();
    state.deferredPrompt = e;
    btnInstallPwa.classList.remove('hidden');
  });

  btnInstallPwa.addEventListener('click', async () => {
    if (!state.deferredPrompt) return;
    state.deferredPrompt.prompt();
    const { outcome } = await state.deferredPrompt.userChoice;
    console.log(`User response to the install prompt: ${outcome}`);
    state.deferredPrompt = null;
    btnInstallPwa.classList.add('hidden');
  });

  // ------------------------------------------------------------------------
  // YouTube IFrame API Fallback Controller (Bypasses Cloud Datacenter Blocking!)
  // ------------------------------------------------------------------------
  function startYtSync() {
    clearInterval(state.ytSyncInterval);
    state.ytSyncInterval = setInterval(() => {
      if (!state.isUsingYtFallback || !state.ytPlayer || typeof state.ytPlayer.getCurrentTime !== 'function') {
        return;
      }
      try {
        const cur = state.ytPlayer.getCurrentTime() || 0;
        const dur = state.ytPlayer.getDuration() || 0;
        if (dur > 0 && !isSeeking) {
          const pct = (cur / dur) * 100;
          seekFill.style.width = `${pct}%`;
          seekThumb.style.left = `${pct}%`;
          miniProgressLine.style.width = `${pct}%`;
          currentTimeEl.textContent = formatDuration(cur);
          totalDurationEl.textContent = formatDuration(dur);
        }
        syncLyricsWithTime(cur);
      } catch (err) {}
    }, 250);
  }

  function fallbackToYouTubePlayer(track) {
    if (!track || !track.id) return;
    console.warn('Backend proxy restricted by cloud IP. Activating client-side YouTube player...');
    state.isUsingYtFallback = true;
    
    stopMediaElement(audioEl);
    stopMediaElement(videoEl);

    playerSpinner.classList.remove('hidden');
    fullPlayIcon.classList.add('hidden');

    const ytContainer = document.getElementById('ytPlayerContainer');
    const ytAudioCont = document.getElementById('ytAudioContainer');
    const ytWrapper = document.getElementById('ytPlayerWrapper');

    if (state.mode === 'video') {
      if (ytContainer) ytContainer.style.display = 'block';
    } else {
      if (ytContainer) ytContainer.style.display = 'none';
    }

    function doPlay() {
      try {
        if (state.mode === 'video' && ytWrapper) {
          const iframe = state.ytPlayer.getIframe();
          if (iframe && iframe.parentNode !== ytWrapper) {
            ytWrapper.appendChild(iframe);
          }
        } else if (ytAudioCont) {
          const iframe = state.ytPlayer.getIframe();
          if (iframe && iframe.parentNode !== ytAudioCont) {
            ytAudioCont.appendChild(iframe);
          }
        }

        state.ytPlayer.loadVideoById({
          videoId: track.id,
          startSeconds: 0
        });
        state.ytPlayer.playVideo();
        startYtSync();
        playerSpinner.classList.add('hidden');
        fullPlayIcon.classList.remove('hidden');
        updatePlaybackUI(true);
        showToast('🎶 Memutar via pemutar cloud langsung...');
      } catch (err) {
        console.error('YT play error:', err);
      }
    }

    if (state.ytPlayer && state.ytPlayerReady && typeof state.ytPlayer.loadVideoById === 'function') {
      doPlay();
    } else {
      let tries = 0;
      const readyWatcher = setInterval(() => {
        tries++;
        if (state.ytPlayer && typeof state.ytPlayer.loadVideoById === 'function') {
          clearInterval(readyWatcher);
          doPlay();
        } else if (tries > 25) {
          clearInterval(readyWatcher);
          playerSpinner.classList.add('hidden');
          fullPlayIcon.classList.remove('hidden');
          showToast('⚠️ Gagal memutar lagu, coba pilih lagu lain.');
        }
      }, 200);
    }
  }

  window.onYouTubeIframeAPIReady = function() {
    try {
      state.ytPlayer = new YT.Player('ytAudioPlayer', {
        height: '100%',
        width: '100%',
        playerVars: {
          autoplay: 0,
          controls: 1,
          rel: 0,
          playsinline: 1,
          enablejsapi: 1,
          origin: window.location.origin
        },
        events: {
          onReady: () => {
            state.ytPlayerReady = true;
          },
          onStateChange: (event) => {
            if (event.data === YT.PlayerState.PLAYING) {
              state.isPlaying = true;
              updatePlaybackUI(true);
              startYtSync();
            } else if (event.data === YT.PlayerState.PAUSED) {
              state.isPlaying = false;
              updatePlaybackUI(false);
            } else if (event.data === YT.PlayerState.ENDED) {
              if (state.sleepAtSongEnd) {
                state.sleepAtSongEnd = false;
                showToast('💤 Waktu tidur tiba, musik berhenti.');
                return;
              }
              if (state.repeatMode === 'one') {
                state.ytPlayer.seekTo(0, true);
                state.ytPlayer.playVideo();
              } else {
                playNextTrack();
              }
            }
          },
          onError: (e) => {
            console.warn('YouTube Player API error code:', e.data);
            playerSpinner.classList.add('hidden');
            fullPlayIcon.classList.remove('hidden');
            showToast('⚠️ Gagal memutar track dari YouTube.');
          }
        }
      });
    } catch (e) {
      console.warn('YT Iframe API init error:', e);
    }
  };

  // ------------------------------------------------------------------------
  // Initial Boot
  // ------------------------------------------------------------------------
  renderSearchHistory();
  renderFavorites();
  loadTrendingSongs('indo');
});
