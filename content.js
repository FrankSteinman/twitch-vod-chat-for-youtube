(() => {
  'use strict';

  const STATE = {
    comments: [],
    times: [],
    offset: 0,
    windowSeconds: 180,
    opacity: 94,
    splitColor: '#563e76',
    currentVideo: null,
    lastRenderedTarget: NaN,
    raf: 0,
    dragging: false,
    resizing: false,
    startX: 0,
    startY: 0,
    startLeft: 0,
    startTop: 0,
    startWidth: 0,
    startHeight: 0,
    searchResults: [],
    searchQuery: '',
    searchContextIndex: -1,
    chatFileName: '',
    firstChannelId: '',
    streamParser: null,
    lastRenderedFrom: -1,
    lastRenderedTo: -1,
    chatFileHandle: null,
    extEmotes: new Map(),
    extEmoteRegex: null,
    extEmotesReady: false,
    extEmotesLoading: false,
    extChannelId: '',
    saveTimer: 0,
    chatVisible: true,
    showTimestamps: true,
    purpleMessages: true,
    hideScrollbar: false,
    hideChatFrame: false,
    language: 'en',
    popupLoadFileName: '',
    videoObserverInterval: 0,
    syncHeartbeat: 0,
    searchToken: 0,
    twitchMode: false,
    twitchVodId: '',
    twitchVodInput: '',
    twitchCommentIds: new Set(),
    twitchFetchedAnchors: new Set(),
    twitchMinTime: Infinity,
    twitchMaxTime: -Infinity,
    twitchLastAheadAnchor: -Infinity,
    twitchForwardCursor: null,
    twitchForwardCursorTime: -Infinity,
    twitchCursorExhausted: false,
    twitchFetching: false,
    twitchFetchToken: 0,
    twitchAbortController: null,
    twitchSeekTimer: 0,
    twitchLastVideoTime: NaN,
    twitchPendingTarget: NaN,
    twitchSeekSequence: 0,
    twitchNextOffset: NaN,
    currentYouTubeVideoId: '',
    videoSettingsLoadToken: 0,
    prefsLoaded: false
  };

  const $ = (id) => document.getElementById(id);

  function safeText(value) { return value == null ? '' : String(value); }

  function formatTime(seconds, forceHours = false) {
    const s = Math.max(0, Math.floor(Number(seconds) || 0));
    const h = Math.floor(s / 3600);
    const m = Math.floor((s % 3600) / 60);
    const sec = s % 60;
    return (h > 0 || forceHours)
      ? `${String(h).padStart(2,'0')}:${String(m).padStart(2,'0')}:${String(sec).padStart(2,'0')}`
      : `${String(m).padStart(2,'0')}:${String(sec).padStart(2,'0')}`;
  }

  function formatOffset(seconds) {
    const n = Number(seconds) || 0;
    const sign = n < 0 ? '-' : '+';
    return sign + formatTime(Math.abs(n), true);
  }

  function parseOffset(value) {
    const raw = safeText(value).trim();
    if (!raw) return 0;
    if (/^[+-]?\d+(?:\.\d+)?$/.test(raw)) return Number(raw);
    const sign = raw.startsWith('-') ? -1 : 1;
    const clean = raw.replace(/^[+-]/, '');
    const parts = clean.split(':');
    if (parts.length < 2 || parts.length > 3 || parts.some(p => !/^\d+(?:\.\d+)?$/.test(p))) return NaN;
    const nums = parts.map(Number);
    if (parts.length === 2) return sign * (nums[0] * 60 + nums[1]);
    return sign * (nums[0] * 3600 + nums[1] * 60 + nums[2]);
  }

  function getYouTubeVideoId() {
    try {
      const u = new URL(location.href);
      if (u.hostname === 'youtu.be') {
        const id = u.pathname.split('/').filter(Boolean)[0] || '';
        return /^[A-Za-z0-9_-]{11}$/.test(id) ? id : '';
      }
      const v = u.searchParams.get('v');
      if (v && /^[A-Za-z0-9_-]{11}$/.test(v)) return v;
      const parts = u.pathname.split('/').filter(Boolean);
      for (const marker of ['shorts', 'embed', 'live']) {
        const i = parts.indexOf(marker);
        if (i >= 0 && /^[A-Za-z0-9_-]{11}$/.test(parts[i + 1] || '')) return parts[i + 1];
      }
    } catch {}
    return '';
  }

  function videoSettingsKey(videoId) {
    return 'tcsVideoSettings_' + videoId;
  }

  async function saveVideoSettings() {
    const videoId = STATE.currentYouTubeVideoId || getYouTubeVideoId();
    if (!videoId) return;
    try {
      await chrome.storage.local.set({
        [videoSettingsKey(videoId)]: {
          version: 1,
          offset: Number.isFinite(Number(STATE.offset)) ? Number(STATE.offset) : 0,
          twitchVodInput: safeText(STATE.twitchVodInput).trim()
        }
      });
    } catch {}
  }

  async function restoreVideoSettingsForCurrentVideo(initial = false) {
    if (!STATE.prefsLoaded) return;
    const videoId = getYouTubeVideoId();
    if (!videoId) return;
    if (STATE.currentYouTubeVideoId === videoId && STATE.videoSettingsLoadToken > 0) return;

    const token = ++STATE.videoSettingsLoadToken;
    const previousVideoId = STATE.currentYouTubeVideoId;
    STATE.currentYouTubeVideoId = videoId;

    if (previousVideoId && previousVideoId !== videoId) {
      // A YouTube SPA navigation changed to a different video. Do not carry the
      // previous video's chat buffer, Twitch VOD, or offset into the new video.
      resetChatStateForLoad('');
    }

    let saved = null;
    try {
      const result = await chrome.storage.local.get(videoSettingsKey(videoId));
      saved = result?.[videoSettingsKey(videoId)] || null;
    } catch {}

    if (token !== STATE.videoSettingsLoadToken || getYouTubeVideoId() !== videoId) return;

    if (saved && typeof saved === 'object') {
      const savedOffset = Number(saved.offset);
      STATE.offset = Number.isFinite(savedOffset) ? savedOffset : 0;
      STATE.twitchVodInput = safeText(saved.twitchVodInput).trim();
    } else if (!initial) {
      STATE.offset = 0;
      STATE.twitchVodInput = '';
    }

    if ($('tcs-offset')) $('tcs-offset').value = formatOffset(STATE.offset);
    if ($('tcs-twitch-vod-id')) $('tcs-twitch-vod-id').value = STATE.twitchVodInput;
    if (previousVideoId && previousVideoId !== videoId) {
      if ($('tcs-file-name')) $('tcs-file-name').textContent = tr('noChatFile');
      if ($('tcs-save-json')) $('tcs-save-json').disabled = true;
      if ($('tcs-status')) $('tcs-status').textContent = '';
      if ($('tcs-chat')) $('tcs-chat').innerHTML = `<div class=\"tcs-system\">${tr('chooseChat')}</div>`;
    }

    chrome.storage.local.set({offset: STATE.offset}).catch(() => {});
    savePrefs();
    render(true);

    // Seed the current video with the legacy/global offset on first load so an
    // existing user's current video keeps its previous synchronization.
    if (!saved && initial) saveVideoSettings();
  }

  const I18N = globalThis.TCS_I18N;
  const TWITCH_UI = {
    en: { label: 'Twitch VOD URL or ID', load: 'Load Twitch VOD', placeholder: 'Enter Twitch VOD URL or ID', enter: 'Enter a Twitch VOD URL or ID first.', loading: 'Loading Twitch VOD chat…', fetching: 'Fetching Twitch chat…', noChat: 'No Twitch chat was found for this VOD.', loaded: '{count} messages fetched • {length} chat available', error: 'Twitch chat error: {error}' },
    es: { label: 'URL o ID del VOD de Twitch', load: 'Cargar VOD de Twitch', placeholder: 'Introduce la URL o el ID del VOD de Twitch', enter: 'Introduce primero la URL o el ID de un VOD de Twitch.', loading: 'Cargando el chat del VOD de Twitch…', fetching: 'Cargando chat de Twitch…', noChat: 'No se encontró chat de Twitch para este VOD.', loaded: '{count} mensajes cargados • chat disponible hasta {length}', error: 'Error del chat de Twitch: {error}' },
    fr: { label: 'URL ou ID du VOD Twitch', load: 'Charger le VOD Twitch', placeholder: 'Saisissez l’URL ou l’ID du VOD Twitch', enter: 'Saisissez d’abord l’URL ou l’ID d’un VOD Twitch.', loading: 'Chargement du chat du VOD Twitch…', fetching: 'Chargement du chat Twitch…', noChat: 'Aucun chat Twitch trouvé pour ce VOD.', loaded: '{count} messages récupérés • chat disponible jusqu’à {length}', error: 'Erreur du chat Twitch : {error}' },
    ja: { label: 'Twitch VOD の URL または ID', load: 'Twitch VOD を読み込む', placeholder: 'Twitch VOD の URL または ID を入力', enter: 'まず Twitch VOD の URL または ID を入力してください。', loading: 'Twitch VOD チャットを読み込み中…', fetching: 'Twitch チャットを取得中…', noChat: 'この VOD の Twitch チャットが見つかりませんでした。', loaded: '{count} 件取得 • {length} までのチャットを利用可能', error: 'Twitch チャットエラー: {error}' },
    ko: { label: 'Twitch VOD URL 또는 ID', load: 'Twitch VOD 불러오기', placeholder: 'Twitch VOD URL 또는 ID 입력', enter: '먼저 Twitch VOD URL 또는 ID를 입력하세요.', loading: 'Twitch VOD 채팅을 불러오는 중…', fetching: 'Twitch 채팅을 가져오는 중…', noChat: '이 VOD에서 Twitch 채팅을 찾을 수 없습니다.', loaded: '{count}개 메시지 가져옴 • {length}까지 채팅 사용 가능', error: 'Twitch 채팅 오류: {error}' },
    pt: { label: 'URL ou ID do VOD da Twitch', load: 'Carregar VOD da Twitch', placeholder: 'Digite a URL ou o ID do VOD da Twitch', enter: 'Digite primeiro a URL ou o ID de um VOD da Twitch.', loading: 'Carregando o chat do VOD da Twitch…', fetching: 'Carregando o chat da Twitch…', noChat: 'Nenhum chat da Twitch foi encontrado para este VOD.', loaded: '{count} mensagens obtidas • chat disponível até {length}', error: 'Erro no chat da Twitch: {error}' },
    de: { label: 'Twitch-VOD-URL oder ID', load: 'Twitch-VOD laden', placeholder: 'Twitch-VOD-URL oder ID eingeben', enter: 'Gib zuerst eine Twitch-VOD-URL oder ID ein.', loading: 'Twitch-VOD-Chat wird geladen…', fetching: 'Twitch-Chat wird geladen…', noChat: 'Für dieses VOD wurde kein Twitch-Chat gefunden.', loaded: '{count} Nachrichten geladen • Chat bis {length} verfügbar', error: 'Twitch-Chat-Fehler: {error}' },
    it: { label: 'URL o ID del VOD Twitch', load: 'Carica VOD Twitch', placeholder: 'Inserisci l’URL o l’ID del VOD Twitch', enter: 'Inserisci prima l’URL o l’ID di un VOD Twitch.', loading: 'Caricamento della chat del VOD Twitch…', fetching: 'Caricamento della chat Twitch…', noChat: 'Non è stata trovata alcuna chat Twitch per questo VOD.', loaded: '{count} messaggi recuperati • chat disponibile fino a {length}', error: 'Errore della chat Twitch: {error}' }
  };
  function twitchTr(key, vars = {}) {
    const text = TWITCH_UI[STATE.language]?.[key] || TWITCH_UI.en[key] || key;
    return I18N?.format ? I18N.format(text, vars) : text.replace(/\{(\w+)\}/g, (_, k) => vars[k] ?? `{${k}}`);
  }
  function currentLang() { return I18N?.get(STATE.language) || I18N?.get('en'); }
  function tr(key, vars = {}) {
    const value = currentLang()?.[key];
    return I18N?.format(value ?? I18N?.get('en')?.[key] ?? key, vars) ?? key;
  }
  function trPopupLang() { return currentLang()?.popup || currentLang(); }
  function localizedNumber(n) {
    try { return Number(n).toLocaleString(currentLang()?.locale || 'en-US'); } catch { return Number(n).toLocaleString(); }
  }
  function setStatus(key, vars) {
    const el = $('tcs-status');
    if (el) el.textContent = tr(key, vars);
  }
  function applyLanguage() {
    const L = currentLang();
    if (!L) return;
    $('tcs-title').textContent = STATE.chatFileName ? tr('loadedTitle', {file: STATE.chatFileName}) : tr('title');
    $('tcs-file-btn').textContent = tr('loadChat');
    $('tcs-file-name').textContent = STATE.chatFileName || tr('noChatFile');
    $('tcs-clear').textContent = tr('clearChat');
    $('tcs-save-json').textContent = tr('saveOffset');
    $('tcs-save-json').title = tr('saveOffsetTitle');
    $('tcs-offset-label').textContent = tr('offset');
    $('tcs-offset').title = tr('offsetInputTitle');
    $('tcs-offset-down').title = tr('decreaseOffset');
    $('tcs-offset-up').title = tr('increaseOffset');
    $('tcs-offset-apply').textContent = tr('apply');
    $('tcs-opacity-label').textContent = tr('opacity');
    $('tcs-show-timestamps-label').textContent = tr('showTimestamps');
    $('tcs-settings-drag-handle').title = tr('moveChat');
    $('tcs-settings-drag-handle').setAttribute('aria-label', tr('moveChat'));
    if ($('tcs-settings-toggle')) {
      $('tcs-settings-toggle').title = tr('expandSettings');
      $('tcs-settings-toggle').setAttribute('aria-label', tr('expandSettings'));
    }
    $('tcs-hide-chat-frame').setAttribute('aria-label', tr('hideChatFrame'));
    $('tcs-purple-messages-label').textContent = tr('purpleMessages');
    $('tcs-hide-scrollbar-label').textContent = tr('hideScrollbar');
    $('tcs-hide-chat-frame-label').textContent = tr('hideChatFrame');
    $('tcs-opacity-value').textContent = tr('opacityValue', {n: STATE.opacity});
    $('tcs-search').placeholder = tr('searchPlaceholder');
    $('tcs-search-btn').textContent = tr('search');
    if ($('tcs-twitch-vod-id')) $('tcs-twitch-vod-id').placeholder = twitchTr('placeholder');
    if ($('tcs-load-twitch')) $('tcs-load-twitch').textContent = twitchTr('load');
    $('tcs-search-clear').textContent = tr('clear');
    const collapsed = $('tcs-overlay').classList.contains('tcs-settings-collapsed');
    const minBtn = $('tcs-min');
    minBtn.title = collapsed ? tr('expandSettings') : tr('collapseSettings');
    minBtn.setAttribute('aria-label', minBtn.title);
    if (!STATE.comments.length) {
      $('tcs-status').textContent = '';
      $('tcs-chat').innerHTML = `<div class="tcs-system">${tr('chooseChat')}</div>`;
    }
    if (STATE.searchResults.length) renderSearchResults();
  }
  async function loadLanguage() {
    try {
      const saved = await chrome.storage.local.get({language: 'en'});
      STATE.language = I18N?.languages?.[saved.language] ? saved.language : 'en';
    } catch { STATE.language = 'en'; }
    applyLanguage();
  }

  function ensureUI() {
    if ($('tcs-overlay')) return;

    const overlay = document.createElement('div');
    overlay.id = 'tcs-overlay';
    overlay.innerHTML = `
      <div id="tcs-head">
        <div id="tcs-title">Twitch VOD Chat for YouTube</div>
        <button id="tcs-min" class="tcs-head-btn" type="button" title="Collapse settings" aria-label="Collapse settings">−</button>
      </div>
      <div id="tcs-controls">
        <div class="tcs-control-row">
          <button id="tcs-file-btn" class="tcs-mini-btn" type="button">Load chat JSON</button>
          <span id="tcs-file-name" class="tcs-file-name">No chat file loaded</span>
          <button id="tcs-clear" class="tcs-mini-btn" type="button">Clear chat</button>
          <button id="tcs-save-json" class="tcs-mini-btn" type="button" title="Write the current offset directly into the loaded JSON file">Save offset to JSON</button>
        </div>
        <div class="tcs-control-row tcs-twitch-row">
          <input id="tcs-twitch-vod-id" class="tcs-input" type="text" inputmode="text" autocomplete="off" spellcheck="false" placeholder="Enter Twitch VOD URL or ID">
          <button id="tcs-load-twitch" class="tcs-mini-btn" type="button">Load Twitch VOD</button>
        </div>
        <div class="tcs-control-row">
          <label><span id="tcs-offset-label">Offset</span>
            <span class="tcs-offset-control">
              <input id="tcs-offset" class="tcs-input" type="text" value="+00:00:00" spellcheck="false" title="Use +HH:MM:SS, -HH:MM:SS, MM:SS, or seconds">
              <button id="tcs-offset-down" class="tcs-step-btn" type="button" title="Decrease offset by 1 second">▼</button>
              <button id="tcs-offset-up" class="tcs-step-btn" type="button" title="Increase offset by 1 second">▲</button>
            </span>
          </label>
          <button id="tcs-offset-apply" class="tcs-mini-btn" type="button">Apply</button>
          <div id="tcs-opacity-wrap"><span id="tcs-opacity-label">Opacity</span> <input id="tcs-opacity" type="range" min="0" max="100" step="1" value="94"><span id="tcs-opacity-value">94%</span></div>
        </div>
        <div class="tcs-control-row">
          <input id="tcs-search" class="tcs-input" type="search" placeholder="Search chat to find a sync point…" spellcheck="false">
          <button id="tcs-search-btn" type="button">Search</button>
          <button id="tcs-search-clear" type="button">Clear</button>
        </div>
        <div class="tcs-control-row tcs-display-row">
          <label class="tcs-check"><input id="tcs-show-timestamps" type="checkbox" checked><span id="tcs-show-timestamps-label">Show timestamps</span></label>
          <label class="tcs-check"><input id="tcs-purple-messages" type="checkbox" checked><span id="tcs-purple-messages-label">Separate messages</span></label>
          <label class="tcs-check"><input id="tcs-hide-scrollbar" type="checkbox"><span id="tcs-hide-scrollbar-label">Hide scrollbar</span></label>
          <label class="tcs-check"><input id="tcs-hide-chat-frame" type="checkbox"><span id="tcs-hide-chat-frame-label">Hide chat frame</span></label>
        </div>
        <div class="tcs-control-row">
          <div id="tcs-status"></div>
          <div id="tcs-search-status"></div>
        </div>
      </div>
      <div id="tcs-search-results" hidden></div>
      <div id="tcs-settings-drag-handle" role="button" tabindex="0" aria-label="Move chat" title="Move chat"></div>
      <button id="tcs-settings-toggle" class="tcs-settings-btn" type="button" aria-label="Expand settings" title="Expand settings">+</button>
      <div id="tcs-chat"><div class="tcs-system">Open a YouTube video and load a Twitch chat JSON file.</div></div>
      <div class="tcs-resize tcs-resize-r" data-edge="r"></div>
      <div class="tcs-resize tcs-resize-l" data-edge="l"></div>
      <div class="tcs-resize tcs-resize-t" data-edge="t"></div>
      <div class="tcs-resize tcs-resize-b" data-edge="b"></div>
      <div class="tcs-resize tcs-resize-tr" data-edge="tr"></div>
      <div class="tcs-resize tcs-resize-tl" data-edge="tl"></div>
      <div class="tcs-resize tcs-resize-br" data-edge="br"></div>
      <div class="tcs-resize tcs-resize-bl" data-edge="bl"></div>`;
    overlay.dataset.tcsVersion = '1.13.0-settings-toggle';
    document.body.appendChild(overlay);

    // Start expanded so the controls are immediately visible after page load/reload.
    setSettingsCollapsed(false);

    $('tcs-clear').addEventListener('click', clearChat);
    $('tcs-save-json').addEventListener('click', saveOffsetToJson);
    $('tcs-offset-apply').addEventListener('click', applyOffset);
    $('tcs-offset').addEventListener('keydown', (e) => { if (e.key === 'Enter') applyOffset(); });
    function bindAcceleratingNudge(button, direction) {
      let holdTimer = null;
      let repeatTimer = null;
      let pointerGesture = false;
      let suppressClick = false;

      const clearTimers = () => {
        if (holdTimer !== null) { clearTimeout(holdTimer); holdTimer = null; }
        if (repeatTimer !== null) { clearTimeout(repeatTimer); repeatTimer = null; }
      };

      const stepForHold = (count) => {
        if (count < 10) return 1;
        if (count < 20) return 2;
        if (count < 35) return 5;
        if (count < 55) return 10;
        if (count < 80) return 20;
        return 30;
      };

      // Gentle acceleration: remain on small steps for several seconds and
      // only gradually shorten the repeat interval while the button is held.
      const delayForHold = (count) => Math.max(180, 320 - Math.min(count, 28) * 5);

      const startHold = () => {
        holdTimer = setTimeout(() => {
          let count = 0;
          const repeat = () => {
            nudgeOffset(direction * stepForHold(count));
            count += 1;
            repeatTimer = setTimeout(repeat, delayForHold(count));
          };
          repeatTimer = setTimeout(repeat, 280);
        }, 450);
      };

      button.addEventListener('pointerdown', (e) => {
        if (e.button !== 0) return;
        pointerGesture = true;
        suppressClick = true;
        try { button.setPointerCapture(e.pointerId); } catch {}
        nudgeOffset(direction);
        startHold();
      });

      const endPointer = () => {
        if (!pointerGesture) return;
        pointerGesture = false;
        clearTimers();
      };
      button.addEventListener('pointerup', endPointer);
      button.addEventListener('pointercancel', endPointer);

      button.addEventListener('click', () => {
        if (suppressClick) {
          suppressClick = false;
          return;
        }
        nudgeOffset(direction);
      });
    }

    bindAcceleratingNudge($('tcs-offset-up'), 1);
    bindAcceleratingNudge($('tcs-offset-down'), -1);
    $('tcs-show-timestamps').addEventListener('change', () => {
      STATE.showTimestamps = $('tcs-show-timestamps').checked;
      applyDisplayPrefs(true);
      savePrefs();
      chrome.storage.local.set({showTimestamps: STATE.showTimestamps}).catch(() => {});
    });
    $('tcs-purple-messages').addEventListener('change', () => {
      STATE.purpleMessages = $('tcs-purple-messages').checked;
      applyDisplayPrefs(true);
      savePrefs();
      chrome.storage.local.set({purpleMessages: STATE.purpleMessages}).catch(() => {});
    });
    $('tcs-hide-scrollbar').addEventListener('change', () => {
      setHideScrollbar($('tcs-hide-scrollbar').checked);
    });
    $('tcs-hide-chat-frame').addEventListener('change', () => {
      setHideChatFrame($('tcs-hide-chat-frame').checked);
    });
    $('tcs-opacity').addEventListener('input', () => {
      const rawOpacity = Number($('tcs-opacity').value);
      STATE.opacity = Number.isFinite(rawOpacity) ? Math.max(0, Math.min(100, rawOpacity)) : 94;
      applyOpacity();
      savePrefs();
      chrome.storage.local.set({opacity: STATE.opacity}).catch(() => {});
    });
    $('tcs-search-btn').addEventListener('click', runSearch);
    $('tcs-search-clear').addEventListener('click', clearSearch);
    $('tcs-search').addEventListener('keydown', (e) => { if (e.key === 'Enter') runSearch(); });
    $('tcs-file-btn').addEventListener('click', openChatFile);
    const twitchVodInput = $('tcs-twitch-vod-id');
    const syncTwitchVodInput = () => {
      const value = safeText(twitchVodInput?.value).trim();
      STATE.twitchVodInput = value;
      saveVideoSettings();
    };
    $('tcs-load-twitch').addEventListener('click', () => {
      syncTwitchVodInput();
      loadTwitchVod(twitchVodInput?.value || STATE.twitchVodInput);
    });
    twitchVodInput.addEventListener('input', syncTwitchVodInput);
    twitchVodInput.addEventListener('change', syncTwitchVodInput);
    twitchVodInput.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        syncTwitchVodInput();
        loadTwitchVod(twitchVodInput?.value || STATE.twitchVodInput);
      }
    });
    $('tcs-min').addEventListener('click', () => {
      const overlay = $('tcs-overlay');
      if (!overlay) return;
      const collapsed = !overlay.classList.contains('tcs-settings-collapsed');
      setSettingsCollapsed(collapsed);
    });
    $('tcs-settings-toggle').addEventListener('click', () => setSettingsCollapsed(false));

    makeDraggable(overlay, $('tcs-head'));
    makeDraggable(overlay, $('tcs-settings-drag-handle'));
    makeResizable(overlay);
    loadPrefs();
    applyOpacity();
    applyDisplayPrefs();
    loadLanguage();
    clampToViewport();
    loadChatVisibility();
    loadPurpleMessages();
    loadHideScrollbar();
  }

  function setSettingsCollapsed(collapsed) {
    const overlay = $('tcs-overlay');
    const controls = $('tcs-controls');
    const results = $('tcs-search-results');
    const btn = $('tcs-min');
    const hoverBtn = $('tcs-settings-toggle');
    if (!overlay || !controls || !btn) return;

    const isCollapsed = !!collapsed;
    overlay.classList.toggle('tcs-settings-collapsed', isCollapsed);
    controls.hidden = isCollapsed;
    if (results) results.hidden = isCollapsed || !STATE.searchResults.length;
    btn.textContent = isCollapsed ? '+' : '−';
    btn.title = isCollapsed ? tr('expandSettings') : tr('collapseSettings');
    btn.setAttribute('aria-label', btn.title);
    if (hoverBtn) {
      hoverBtn.title = tr('expandSettings');
      hoverBtn.setAttribute('aria-label', hoverBtn.title);
    }
  }

  function applyDisplayPrefs(rerender = false) {
    const overlay = $('tcs-overlay');
    if (!overlay) return;
    overlay.classList.toggle('tcs-hide-timestamps', !STATE.showTimestamps);
    overlay.classList.toggle('tcs-purple-messages', STATE.purpleMessages);
    overlay.classList.toggle('tcs-hide-scrollbar', STATE.hideScrollbar);
    overlay.classList.toggle('tcs-no-box', STATE.hideChatFrame);
    if ($('tcs-show-timestamps')) $('tcs-show-timestamps').checked = STATE.showTimestamps;
    if ($('tcs-purple-messages')) $('tcs-purple-messages').checked = STATE.purpleMessages;
    if ($('tcs-hide-scrollbar')) $('tcs-hide-scrollbar').checked = STATE.hideScrollbar;
    if ($('tcs-hide-chat-frame')) $('tcs-hide-chat-frame').checked = STATE.hideChatFrame;
    if (rerender && STATE.comments.length) render(true);
  }

  function applyOpacity() {
    const opacity = Math.max(0, Math.min(1, STATE.opacity / 100));
    const overlay = $('tcs-overlay');
    if (!overlay) return;

    // ThinkPad diagnostic: bypass the CSS custom property and set the
    // RGBA backgrounds directly. This tests whether the issue is related
    // to Chrome rendering var(--tcs-opacity) inside rgba().
    const alpha = opacity.toFixed(2);
    overlay.style.backgroundColor = `rgba(24,24,27,${alpha})`;
    const head = $('tcs-head');
    const controls = $('tcs-controls');
    const chat = $('tcs-chat');
    if (head) head.style.backgroundColor = `rgba(31,31,35,${alpha})`;
    if (controls) controls.style.backgroundColor = `rgba(31,31,35,${alpha})`;
    if (chat) chat.style.backgroundColor = `rgba(24,24,27,${alpha})`;

    // Keep the alternating purple background tied to the same opacity
    // setting, while leaving message text/emotes fully opaque.
    applyPurpleMessageOpacity(overlay, opacity);

    $('tcs-opacity').value = String(STATE.opacity);
    $('tcs-opacity-value').textContent = tr('opacityValue', {n: STATE.opacity});
  }

  async function loadPrefs() {
    try {
      const saved = JSON.parse(localStorage.getItem('tcsPrefs') || '{}');
      if (Number.isFinite(saved.offset)) STATE.offset = saved.offset;
      if (Number.isFinite(saved.windowSeconds)) STATE.windowSeconds = saved.windowSeconds;
      if (Number.isFinite(saved.opacity)) STATE.opacity = Math.max(0, Math.min(100, saved.opacity));
      if (typeof saved.showTimestamps === 'boolean') STATE.showTimestamps = saved.showTimestamps;

      const chromeSaved = await chrome.storage.local.get({offset: null, opacity: null, splitColor: null, showTimestamps: null, purpleMessages: null, hideScrollbar: null, hideChatFrame: null});
      chrome.storage.local.remove('cleanChat').catch(() => {});
      if (Number.isFinite(chromeSaved.offset)) STATE.offset = chromeSaved.offset;
      if (Number.isFinite(chromeSaved.opacity)) STATE.opacity = Math.max(0, Math.min(100, chromeSaved.opacity));
      else chrome.storage.local.set({opacity: STATE.opacity}).catch(() => {});
      if (/^#[0-9a-fA-F]{6}$/.test(String(chromeSaved.splitColor || ''))) STATE.splitColor = String(chromeSaved.splitColor).toLowerCase();
      else chrome.storage.local.set({splitColor: STATE.splitColor}).catch(() => {});
      if (typeof chromeSaved.showTimestamps === 'boolean') STATE.showTimestamps = chromeSaved.showTimestamps;
      else chrome.storage.local.set({showTimestamps: STATE.showTimestamps}).catch(() => {});
      if (typeof chromeSaved.purpleMessages === 'boolean') STATE.purpleMessages = chromeSaved.purpleMessages;
      else chrome.storage.local.set({purpleMessages: STATE.purpleMessages}).catch(() => {});
      if (typeof chromeSaved.hideScrollbar === 'boolean') STATE.hideScrollbar = chromeSaved.hideScrollbar;
      else chrome.storage.local.set({hideScrollbar: STATE.hideScrollbar}).catch(() => {});
      if (typeof chromeSaved.hideChatFrame === 'boolean') STATE.hideChatFrame = chromeSaved.hideChatFrame;
      else chrome.storage.local.set({hideChatFrame: STATE.hideChatFrame}).catch(() => {});

      if ($('tcs-offset')) $('tcs-offset').value = formatOffset(STATE.offset);
      if ($('tcs-opacity')) $('tcs-opacity').value = STATE.opacity;
      if (saved.left != null) $('tcs-overlay').style.left = saved.left + 'px';
      if (saved.top != null) $('tcs-overlay').style.top = saved.top + 'px';
      if (saved.width != null) $('tcs-overlay').style.width = saved.width + 'px';
      if (saved.height != null) $('tcs-overlay').style.height = saved.height + 'px';
      applyOpacity();
      applyDisplayPrefs();
      STATE.prefsLoaded = true;
      restoreVideoSettingsForCurrentVideo(true);
    } catch {}
  }

  async function loadChatVisibility() {
    try {
      const saved = await chrome.storage.local.get({ chatVisible: true });
      STATE.chatVisible = saved.chatVisible !== false;
      applyChatVisibility();
    } catch {
      STATE.chatVisible = true;
      applyChatVisibility();
    }
  }

  function setChatVisibility(visible, persist = true) {
    STATE.chatVisible = !!visible;
    applyChatVisibility();
    if (persist) {
      chrome.storage.local.set({ chatVisible: STATE.chatVisible }).catch(() => {});
    }
  }

  function isYouTubeVideoPage() {
    const path = location.pathname;
    return path === '/watch' && new URLSearchParams(location.search).has('v');
  }

  function applyChatVisibility() {
    const overlay = $('tcs-overlay');
    if (!overlay) return;
    const visible = STATE.chatVisible && isYouTubeVideoPage();
    overlay.classList.toggle('tcs-hidden', !visible);
  }

  async function loadPurpleMessages() {
    try {
      const saved = await chrome.storage.local.get({ purpleMessages: true });
      STATE.purpleMessages = saved.purpleMessages !== false;
      applyDisplayPrefs();
    } catch {
      STATE.purpleMessages = true;
      applyDisplayPrefs();
    }
  }

  async function loadHideScrollbar() {
    try {
      const saved = await chrome.storage.local.get({ hideScrollbar: false });
      STATE.hideScrollbar = saved.hideScrollbar === true;
      applyDisplayPrefs();
    } catch {
      STATE.hideScrollbar = false;
      STATE.hideChatFrame = false;
      applyDisplayPrefs();
    }
  }

  function setHideChatFrame(enabled, persist = true) {
    STATE.hideChatFrame = !!enabled;
    applyDisplayPrefs();
    if (persist) chrome.storage.local.set({ hideChatFrame: STATE.hideChatFrame }).catch(() => {});
  }

  function setPurpleMessages(enabled, persist = true) {
    STATE.purpleMessages = !!enabled;
    applyDisplayPrefs(true);
    applyPurpleMessageOpacity($('tcs-overlay'));
    if (persist) chrome.storage.local.set({ purpleMessages: STATE.purpleMessages }).catch(() => {});
  }

  function setShowTimestamps(enabled, persist = true) {
    STATE.showTimestamps = !!enabled;
    applyDisplayPrefs(true);
    savePrefs();
    if (persist) chrome.storage.local.set({ showTimestamps: STATE.showTimestamps }).catch(() => {});
  }

  function setOpacity(value, persist = true) {
    const rawOpacity = Number(value);
    STATE.opacity = Number.isFinite(rawOpacity) ? Math.max(0, Math.min(100, rawOpacity)) : 94;
    applyOpacity();
    savePrefs();
    if (persist) chrome.storage.local.set({ opacity: STATE.opacity }).catch(() => {});
  }

  function setSplitColor(value, persist = true) {
    const color = /^#[0-9a-fA-F]{6}$/.test(String(value || '')) ? String(value).toLowerCase() : '#563e76';
    STATE.splitColor = color;
    applyPurpleMessageOpacity($('tcs-overlay'));
    if (persist) chrome.storage.local.set({ splitColor: STATE.splitColor }).catch(() => {});
  }

  function setHideScrollbar(enabled, persist = true) {
    STATE.hideScrollbar = !!enabled;
    applyDisplayPrefs();
    if (persist) chrome.storage.local.set({ hideScrollbar: STATE.hideScrollbar }).catch(() => {});
  }

  function savePrefs() {
    try {
      const r = $('tcs-overlay').getBoundingClientRect();
      localStorage.setItem('tcsPrefs', JSON.stringify({
        offset: STATE.offset,
        windowSeconds: STATE.windowSeconds,
        opacity: STATE.opacity,
        splitColor: STATE.splitColor,
        showTimestamps: STATE.showTimestamps,
        left: Math.round(r.left),
        top: Math.round(r.top),
        width: Math.round(r.width),
        height: Math.round(r.height)
      }));
    } catch {}
  }

  function maybeFetchTwitchForOffsetChange() {
    if (!STATE.twitchMode || !STATE.twitchVodId) {
      render(true);
      return;
    }

    const video = STATE.currentVideo || findVideo();
    if (!video) {
      render(true);
      return;
    }

    const target = Math.max(0, video.currentTime + STATE.offset);
    const buffered = STATE.comments.length > 0
      && Number.isFinite(STATE.twitchMinTime)
      && Number.isFinite(STATE.twitchMaxTime)
      && target >= STATE.twitchMinTime
      && target <= STATE.twitchMaxTime;

    render(true);

    // Changing the offset effectively moves the Twitch chat position. If the
    // new target lies outside the currently buffered Twitch range, re-anchor
    // the progressive fetch around the new target so the chat can load there.
    if (!buffered) maybeFetchTwitchForSeek();
  }

  function applyOffset() {
    const parsed = parseOffset($('tcs-offset').value);
    if (!Number.isFinite(parsed)) {
      setStatus('invalidOffset');
      return;
    }
    STATE.offset = parsed;
    $('tcs-offset').value = formatOffset(parsed);
    setStatus('offsetApplied', {offset: formatOffset(parsed)});
    savePrefs();
    chrome.storage.local.set({offset: STATE.offset}).catch(() => {});
    saveVideoSettings();
    maybeFetchTwitchForOffsetChange();
  }

  function nudgeOffset(deltaSeconds) {
    const current = parseOffset($('tcs-offset').value);
    const base = Number.isFinite(current) ? current : STATE.offset;
    STATE.offset = base + deltaSeconds;
    $('tcs-offset').value = formatOffset(STATE.offset);
    setStatus('offsetCurrent', {offset: formatOffset(STATE.offset)});
    savePrefs();
    chrome.storage.local.set({offset: STATE.offset}).catch(() => {});
    saveVideoSettings();
    maybeFetchTwitchForOffsetChange();
  }

  async function getUtf8SafeTail(file, desiredSize = 128 * 1024 + 4) {
  const size = Math.min(file.size, desiredSize);
  const baseStart = file.size - size;
  if (baseStart <= 0) return {text: await file.slice(0, file.size).text(), start: 0};
  const probeStart = Math.max(0, baseStart - 3);
  const probe = new Uint8Array(await file.slice(probeStart, baseStart + 1).arrayBuffer());
  let safeStart = baseStart;
  const baseIndex = baseStart - probeStart;
  while (safeStart > probeStart) {
    const b = probe[baseIndex - (baseStart - safeStart)];
    if ((b & 0xC0) !== 0x80) break;
    safeStart--;
  }
  return {text: await file.slice(safeStart, file.size).text(), start: safeStart};
}

function getSavedOffsetFromText(text) {
    const source = safeText(text);
    const m = source.match(/"_tcs_sync"\s*:\s*\{[^{}]*"offset_seconds"\s*:\s*(-?(?:\d+(?:\.\d+)?|\.\d+))/);
    if (!m) return null;
    const n = Number(m[1]);
    return Number.isFinite(n) ? n : null;
  }

  function resetChatStateForLoad(fileName = '') {
    STATE.comments = [];
    STATE.times = [];
    STATE.searchResults = [];
    STATE.searchContextIndex = -1;
    STATE.searchToken++;
    userStringCache.clear();
    colorStringCache.clear();
    STATE.streamParser = null;
    STATE.chatFileName = fileName || '';
    STATE.extEmotes = new Map();
    STATE.extEmoteRegex = null;
    STATE.extEmotesReady = false;
    STATE.extEmotesLoading = false;
    STATE.extChannelId = '';
    STATE.firstChannelId = '';
    STATE.lastRenderedTarget = NaN;
    STATE.lastRenderedFrom = -1;
    STATE.lastRenderedTo = -1;
    STATE.twitchMode = false;
    STATE.twitchVodId = '';
    STATE.twitchVodInput = '';
    STATE.twitchCommentIds = new Set();
    STATE.twitchFetchedAnchors = new Set();
    STATE.twitchMinTime = Infinity;
    STATE.twitchMaxTime = -Infinity;
    STATE.twitchLastAheadAnchor = -Infinity;
    STATE.twitchPendingTarget = NaN;
    STATE.twitchNextOffset = NaN;
    STATE.twitchSeekSequence++;
    STATE.twitchForwardCursor = null;
    STATE.twitchForwardCursorTime = -Infinity;
    STATE.twitchCursorExhausted = false;
    if (STATE.twitchAbortController) { try { STATE.twitchAbortController.abort(); } catch {} }
    if (STATE.twitchSeekTimer) { clearTimeout(STATE.twitchSeekTimer); STATE.twitchSeekTimer = 0; }
    STATE.twitchAbortController = null;
    STATE.twitchFetching = false;
    STATE.twitchLastVideoTime = NaN;
    STATE.twitchPendingTarget = NaN;
    STATE.twitchNextOffset = NaN;
    STATE.twitchSeekSequence++;
    STATE.twitchFetchToken++;
    if ($('tcs-save-json')) $('tcs-save-json').disabled = false;
  }

  // Keep repeated high-cardinality metadata from allocating another copy per message.
  // Bodies are intentionally NOT interned because they are usually unique.
  const USER_CACHE_LIMIT = 50000;
  const userStringCache = new Map();
  const colorStringCache = new Map();

  function internString(value, cache, limit = USER_CACHE_LIMIT) {
    const str = safeText(value);
    if (!str) return '';
    const existing = cache.get(str);
    if (existing !== undefined) return existing;
    if (cache.size >= limit) cache.clear();
    cache.set(str, str);
    return str;
  }

  const TWITCH_GQL_ENDPOINT = 'https://gql.twitch.tv/gql';
  const TWITCH_ANDROID_CLIENT_ID = 'kd1unb4b3q4t58fwlpcbzcbnm76a8fp';
  const TWITCH_VOD_COMMENTS_HASH = 'b70a3591ff0f4e0313d126c6a1502d79a1c02baebb288227c582044aa76adf6a';
  const TWITCH_VOD_COMMENTS_QUERY = `
    query VideoCommentsByOffsetOrCursor($videoID: ID!, $contentOffsetSeconds: Int, $cursor: Cursor) {
      video(id: $videoID) {
        id
        creator { id channel { id } }
        comments(contentOffsetSeconds: $contentOffsetSeconds, after: $cursor) {
          edges {
            cursor
            node {
              id
              contentOffsetSeconds
              commenter { id displayName login }
              message {
                fragments { text emote { emoteID } }
                userBadges { setID version }
                userColor
              }
            }
          }
          pageInfo { hasNextPage }
        }
      }
    }`;

  function normalizeTwitchVodId(value) {
    // Accept either a plain numeric VOD ID or a Twitch VOD URL.
    // Do not modify the user's input field; the original text should remain
    // visible after loading.
    const raw = safeText(value)
      .replace(/[\u200B-\u200D\uFEFF]/g, '')
      .replace(/[\r\n]+/g, ' ')
      .trim();
    if (!raw) return '';

    if (/^\d+$/.test(raw)) return raw;

    // Handle normal Twitch VOD URLs, with or without a protocol and with
    // optional path/query/fragment data after the VOD ID.
    const directMatch = raw.match(/(?:https?:\/\/)?(?:www\.)?twitch\.tv\/(?:[^\s/]+\/)?videos\/(\d+)(?:[/?#].*)?$/i);
    if (directMatch) return directMatch[1];

    try {
      const url = new URL(/^https?:\/\//i.test(raw) ? raw : `https://${raw}`);
      const host = url.hostname.toLowerCase();
      if (host !== 'twitch.tv' && !host.endsWith('.twitch.tv')) return '';
      const parts = url.pathname.split('/').filter(Boolean);
      const videosIndex = parts.findIndex(part => part.toLowerCase() === 'videos');
      if (videosIndex !== -1 && /^\d+$/.test(parts[videosIndex + 1] || '')) {
        return parts[videosIndex + 1];
      }
    } catch {}

    // Last fallback for pasted text containing /videos/<id>.
    const m = raw.match(/(?:^|\/|\s)videos\/(\d+)(?:[/?#\s]|$)/i);
    return m ? m[1] : '';
  }

  function twitchGqlBody(videoId, offsetSeconds = null, inline = false, cursor = null) {
    const variables = { videoID: videoId };
    if (cursor) variables.cursor = cursor;
    else variables.contentOffsetSeconds = Math.max(0, Math.floor(Number(offsetSeconds) || 0));
    if (inline) return { operationName: 'VideoCommentsByOffsetOrCursor', query: TWITCH_VOD_COMMENTS_QUERY, variables };
    return { operationName: 'VideoCommentsByOffsetOrCursor', variables, extensions: { persistedQuery: { version: 1, sha256Hash: TWITCH_VOD_COMMENTS_HASH } } };
  }

  async function twitchGqlRequest(body, signal = null) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 15000);
    const onAbort = () => { try { controller.abort(); } catch {} };
    if (signal) {
      if (signal.aborted) onAbort();
      else signal.addEventListener('abort', onAbort, { once: true });
    }
    try {
      const response = await fetch(TWITCH_GQL_ENDPOINT, {
        method: 'POST',
        mode: 'cors',
        credentials: 'omit',
        headers: { 'Client-ID': TWITCH_ANDROID_CLIENT_ID, 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
        signal: controller.signal
      });
      const text = await response.text();
      let json;
      try { json = JSON.parse(text); } catch { throw new Error(`Twitch returned invalid JSON (HTTP ${response.status}).`); }
      if (!response.ok) throw new Error(`Twitch returned HTTP ${response.status}.`);
      return Array.isArray(json) ? json[0] : json;
    } catch (err) {
      if (err?.name === 'AbortError') throw new Error('Twitch request timed out.');
      throw err;
    } finally {
      clearTimeout(timer);
      if (signal) { try { signal.removeEventListener('abort', onAbort); } catch {} }
    }
  }

  function twitchApiError(json) {
    if (!Array.isArray(json?.errors) || !json.errors.length) return '';
    return json.errors.map(e => safeText(e?.message)).filter(Boolean).join(' / ');
  }

  async function fetchTwitchVodPage(videoId, offsetSeconds = null, cursor = null, signal = null) {
    let json = await twitchGqlRequest(twitchGqlBody(videoId, offsetSeconds, false, cursor), signal);
    const firstError = twitchApiError(json);
    if (/PersistedQueryNotFound|persisted query/i.test(firstError)) {
      json = await twitchGqlRequest(twitchGqlBody(videoId, offsetSeconds, true, cursor), signal);
    }
    const error = twitchApiError(json);
    if (error) throw new Error(error);
    const video = json?.data?.video;
    if (!video) throw new Error('Twitch VOD not found or unavailable.');
    const conn = video.comments;
    if (!conn) return { comments: [], channelId: video?.creator?.channel?.id || '', noChat: true, nextCursor: null, hasNextPage: false };

    const comments = [];
    let lastCursor = null;
    for (const edge of (Array.isArray(conn.edges) ? conn.edges : [])) {
      lastCursor = safeText(edge?.cursor) || lastCursor;
      const node = edge?.node;
      if (!node?.id) continue;
      const t = Number(node.contentOffsetSeconds);
      if (!Number.isFinite(t)) continue;
      const commenter = node.commenter || {};
      const message = node.message || {};
      const fragments = Array.isArray(message.fragments) ? message.fragments : [];
      let body = '';
      const emotes = [];
      let cursorPos = 0;
      for (const fragment of fragments) {
        const part = safeText(fragment?.text);
        const emoteId = safeText(fragment?.emote?.emoteID);
        if (emoteId) emotes.push([cursorPos, cursorPos + part.length, emoteId]);
        body += part;
        cursorPos += part.length;
      }
      comments.push({
        id: safeText(node.id),
        t,
        user: internString(commenter.displayName || commenter.login || tr('anonymous'), userStringCache),
        color: internString(message.userColor || '#a970ff', colorStringCache, 256),
        body,
        emotes: emotes.length ? emotes : null
      });
    }

    return {
      comments,
      channelId: safeText(video?.creator?.channel?.id || ''),
      noChat: false,
      nextCursor: conn.pageInfo?.hasNextPage ? lastCursor : null,
      hasNextPage: conn.pageInfo?.hasNextPage === true
    };
  }

  function rebuildTwitchTimes() {
    if (!STATE.comments.length) {
      STATE.times = new Float64Array(0);
      STATE.twitchMinTime = Infinity;
      STATE.twitchMaxTime = -Infinity;
      return;
    }

    // Cursor pages normally arrive in time order, but offset-based fetches can
    // overlap or arrive out of order. Keep one sorted array so the existing
    // binary-search renderer can use the same data structure as JSON chat.
    STATE.comments.sort((a, b) => a.t - b.t);
    STATE.times = new Float64Array(STATE.comments.length);
    for (let i = 0; i < STATE.comments.length; i++) {
      STATE.times[i] = STATE.comments[i].t;
    }
    STATE.twitchMinTime = STATE.times[0];
    STATE.twitchMaxTime = STATE.times[STATE.times.length - 1];
  }

  function mergeTwitchResult(result) {
    let added = 0;
    for (const comment of result.comments || []) {
      if (STATE.twitchCommentIds.has(comment.id)) continue;
      STATE.twitchCommentIds.add(comment.id);
      STATE.comments.push(comment);
      added++;
    }
    if (result.channelId && !STATE.firstChannelId) {
      STATE.firstChannelId = result.channelId;
      loadExternalEmotes().catch(err => console.debug('Third-party emote load failed:', err));
    }
    rebuildTwitchTimes();
    STATE.lastRenderedFrom = -1;
    STATE.lastRenderedTo = -1;
    render(true);
    return added;
  }

  function cancelTwitchFetch(invalidate = true) {
    if (invalidate) STATE.twitchFetchToken++;
    if (STATE.twitchAbortController) {
      try { STATE.twitchAbortController.abort(); } catch {}
    }
    STATE.twitchAbortController = null;
    STATE.twitchFetching = false;
  }

  function resetTwitchForwardCursor() {
    STATE.twitchForwardCursor = null;
    STATE.twitchForwardCursorTime = -Infinity;
    STATE.twitchCursorExhausted = false;
  }

  async function fetchTwitchAround(anchorSeconds, force = false) {
    if (!STATE.twitchMode || !STATE.twitchVodId || STATE.twitchFetching) return false;
    const anchor = Math.max(0, Math.floor(Number(anchorSeconds) || 0));
    const anchorKey = Math.floor(anchor / 30);
    if (!force && STATE.twitchFetchedAnchors.has(anchorKey)) return false;

    const token = STATE.twitchFetchToken;
    const controller = new AbortController();
    STATE.twitchAbortController = controller;
    STATE.twitchFetching = true;
    STATE.twitchFetchedAnchors.add(anchorKey);
    if ($('tcs-status')) $('tcs-status').textContent = twitchTr('fetching');
    try {
      const result = await fetchTwitchVodPage(STATE.twitchVodId, anchor, null, controller.signal);
      if (!STATE.twitchMode || token !== STATE.twitchFetchToken) return false;
      const added = mergeTwitchResult(result);

      // Every offset-based fetch creates a fresh forward chain for this part
      // of the VOD. This is especially important after a long YouTube seek.
      const pageEnd = (result.comments || []).reduce(
        (max, comment) => Math.max(max, Number(comment?.t)),
        -Infinity
      );
      resetTwitchForwardCursor();
      STATE.twitchForwardCursorTime = Number.isFinite(pageEnd) ? pageEnd : -Infinity;
      STATE.twitchNextOffset = Number.isFinite(pageEnd) ? pageEnd + 1 : anchor + 30;
      STATE.twitchCursorExhausted = true;

      STATE.twitchLastAheadAnchor = anchor;
      if (!STATE.comments.length && result.noChat) {
        if ($('tcs-status')) $('tcs-status').textContent = twitchTr('noChat');
      } else if (STATE.comments.length) {
        if ($('tcs-status')) $('tcs-status').textContent = twitchTr('loaded', {count: localizedNumber(STATE.comments.length), length: formatTime(STATE.twitchMaxTime, true)});
      }
      return added > 0 || result.noChat;
    } catch (err) {
      if (token !== STATE.twitchFetchToken || err?.name === 'AbortError') return false;
      STATE.twitchFetchedAnchors.delete(anchorKey);
      console.error('Twitch VOD chat fetch failed:', err);
      if ($('tcs-status')) $('tcs-status').textContent = twitchTr('error', {error: err?.message || String(err)});
      return false;
    } finally {
      if (token === STATE.twitchFetchToken) {
        STATE.twitchFetching = false;
        if (STATE.twitchAbortController === controller) STATE.twitchAbortController = null;
      }
    }
  }

  async function fetchTwitchForwardUntil(desiredTime) {
    if (!STATE.twitchMode || !STATE.twitchVodId || STATE.twitchFetching) return false;
    const desired = Math.max(0, Number(desiredTime) || 0);

    const token = STATE.twitchFetchToken;
    const controller = new AbortController();
    STATE.twitchAbortController = controller;
    STATE.twitchFetching = true;
    if ($('tcs-status')) $('tcs-status').textContent = twitchTr('fetching');
    let changed = false;
    try {
      // Use timestamp-based pagination for the progressive path instead of
      // carrying a Twitch cursor across playback seeks. A cursor belongs to
      // one forward position; offset requests are independent and remain
      // reliable after large jumps in the YouTube video.
      if (!Number.isFinite(STATE.twitchNextOffset)) {
        STATE.twitchNextOffset = Math.max(0, desired - 60);
      }

      let requestCount = 0;
      const maxRequests = 16;
      let lastRequestedOffset = -1;

      while (
        STATE.twitchMode &&
        token === STATE.twitchFetchToken &&
        requestCount < maxRequests &&
        (!Number.isFinite(STATE.twitchForwardCursorTime) || STATE.twitchForwardCursorTime < desired)
      ) {
        let anchor = Math.max(0, Math.floor(STATE.twitchNextOffset));
        if (anchor <= lastRequestedOffset) anchor = lastRequestedOffset + 1;
        lastRequestedOffset = anchor;

        const result = await fetchTwitchVodPage(STATE.twitchVodId, anchor, null, controller.signal);
        if (!STATE.twitchMode || token !== STATE.twitchFetchToken) return changed;
        requestCount++;
        const added = mergeTwitchResult(result);
        changed = changed || added > 0;

        const pageEnd = (result.comments || []).reduce(
          (max, comment) => Math.max(max, Number(comment?.t)),
          -Infinity
        );
        if (Number.isFinite(pageEnd) && pageEnd >= anchor) {
          STATE.twitchForwardCursorTime = Math.max(
            Number.isFinite(STATE.twitchForwardCursorTime) ? STATE.twitchForwardCursorTime : -Infinity,
            pageEnd
          );
          STATE.twitchNextOffset = pageEnd + 1;
        } else {
          // The offset request must always move forward. Do not skip the rest
          // of the current 30-second bucket: a later request may legitimately
          // start in that same bucket and contain different comments.
          STATE.twitchNextOffset = anchor + 1;
        }

        if (!result.comments?.length) break;
        if (!result.hasNextPage) break;
      }

      if (STATE.twitchMode && token === STATE.twitchFetchToken && $('tcs-status') && STATE.comments.length) {
        $('tcs-status').textContent = twitchTr('loaded', {count: localizedNumber(STATE.comments.length), length: formatTime(STATE.twitchMaxTime, true)});
      }
      return changed;
    } catch (err) {
      if (token !== STATE.twitchFetchToken || err?.name === 'AbortError') return changed;
      console.error('Twitch VOD forward fetch failed:', err);
      if ($('tcs-status')) $('tcs-status').textContent = twitchTr('error', {error: err?.message || String(err)});
      return changed;
    } finally {
      if (token === STATE.twitchFetchToken) {
        STATE.twitchFetching = false;
        if (STATE.twitchAbortController === controller) STATE.twitchAbortController = null;
      }
    }
  }

  async function startTwitchProgressiveFetching() {
    if (!STATE.twitchMode || !STATE.twitchVodId) return;
    const video = findVideo();
    if (!video) { setStatus('noVideo'); return; }
    const target = Math.max(0, video.currentTime + STATE.offset);
    const token = STATE.twitchFetchToken;
    await fetchTwitchAround(Math.max(0, target - 60));
    if (!STATE.twitchMode || token !== STATE.twitchFetchToken) return;
    await fetchTwitchForwardUntil(target + 90);
  }

  function maybeFetchTwitchAhead() {
    if (!STATE.twitchMode || !STATE.twitchVodId || STATE.twitchFetching) return;
    const video = STATE.currentVideo || findVideo();
    if (!video || video.paused || video.ended) return;
    const target = Math.max(0, video.currentTime + STATE.offset);
    const desired = target + 90;

    if (!Number.isFinite(STATE.twitchForwardCursorTime) || STATE.twitchForwardCursorTime < desired) {
      fetchTwitchForwardUntil(desired).catch(() => {});
    }
  }

  function maybeFetchTwitchForSeek() {
    if (!STATE.twitchMode || !STATE.twitchVodId) return;
    const video = STATE.currentVideo || findVideo();
    if (!video) return;

    STATE.twitchPendingTarget = Math.max(0, video.currentTime + STATE.offset);
    STATE.twitchSeekSequence++;
    const sequence = STATE.twitchSeekSequence;

    if (STATE.twitchSeekTimer) clearTimeout(STATE.twitchSeekTimer);
    STATE.twitchSeekTimer = setTimeout(async () => {
      STATE.twitchSeekTimer = 0;
      if (!STATE.twitchMode || !STATE.twitchVodId || sequence !== STATE.twitchSeekSequence) return;

      const currentVideo = STATE.currentVideo || findVideo();
      if (!currentVideo) return;
      const target = Math.max(0, currentVideo.currentTime + STATE.offset);
      STATE.twitchPendingTarget = target;

      // A seek gets its own fresh fetch chain. Do not let a cursor from an old
      // part of the VOD decide what happens after a long jump.
      cancelTwitchFetch(true);
      resetTwitchForwardCursor();
      STATE.twitchNextOffset = NaN;

      // Force the anchor fetch even if this 30-second bucket was visited before.
      // A previously visited bucket may only contain a partial page, and the
      // old global min/max range cannot prove that the exact seek position is
      // covered.
      const anchor = Math.max(0, target - 60);

      // Always re-anchor on a seek, even if the target falls inside the
      // already-loaded min/max range. Progressive fetching can contain gaps,
      // so the range alone does not prove the exact seek position is covered.
      const fetchToken = STATE.twitchFetchToken;
      await fetchTwitchAround(anchor, true);
      if (!STATE.twitchMode || !STATE.twitchVodId || fetchToken !== STATE.twitchFetchToken) return;

      const latestVideo = STATE.currentVideo || findVideo();
      if (!latestVideo) return;
      const latestTarget = Math.max(0, latestVideo.currentTime + STATE.offset);
      if (Math.abs(latestTarget - target) > 4) {
        // The user moved again while the network request was in flight.
        maybeFetchTwitchForSeek();
        return;
      }

      await fetchTwitchForwardUntil(latestTarget + 90);
    }, 120);
  }

  async function loadTwitchVod(vodValue = null) {
    let inputValue = safeText(vodValue ?? $('tcs-twitch-vod-id')?.value).trim();
    if (!inputValue) inputValue = safeText(STATE.twitchVodInput).trim();
    const id = normalizeTwitchVodId(inputValue);
    if (!id) {
      if ($('tcs-status')) $('tcs-status').textContent = twitchTr('enter');
      return {ok:false, error:twitchTr('enter')};
    }
    const video = findVideo();
    if (!video) { setStatus('noVideo'); return {ok:false, error:tr('noVideo')}; }

    cancelTwitchFetch(true);
    resetChatStateForLoad(`Twitch VOD ${id}`);
    STATE.twitchMode = true;
    STATE.twitchVodId = id;
    STATE.twitchVodInput = inputValue;
    if ($('tcs-twitch-vod-id')) $('tcs-twitch-vod-id').value = inputValue;
    saveVideoSettings();
    STATE.twitchFetchToken++;
    STATE.chatFileHandle = null;
    STATE.chatFileName = `Twitch VOD ${id}`;
    if ($('tcs-file-name')) $('tcs-file-name').textContent = STATE.chatFileName;
    if ($('tcs-title')) $('tcs-title').textContent = `Twitch VOD Chat — ${id}`;
    if ($('tcs-save-json')) $('tcs-save-json').disabled = true;
    if ($('tcs-status')) $('tcs-status').textContent = twitchTr('loading');
    if ($('tcs-chat')) $('tcs-chat').innerHTML = `<div class="tcs-system">${twitchTr('loading')}</div>`;
    STATE.lastRenderedFrom = -1;
    STATE.lastRenderedTo = -1;
    clearSearch();
    await startTwitchProgressiveFetching();
    return {
      ok: STATE.twitchMode && STATE.twitchVodId === id && STATE.comments.length > 0,
      hasChat: STATE.comments.length > 0,
      twitchVodId: id,
      twitchVodInput: STATE.twitchVodInput || inputValue,
      chatFileName: STATE.chatFileName || `Twitch VOD ${id}`,
      offset: STATE.offset
    };
  }

  function normalizeCommentObject(c) {
    if (!c || typeof c !== 'object') return null;
    const t = Number(c?.content_offset_seconds);
    if (!Number.isFinite(t)) return null;

    const commenter = c?.commenter || {};
    const msg = c?.message || {};
    const body = safeText(msg.body);
    const fragments = Array.isArray(msg.fragments) ? msg.fragments : [];
    const emotes = [];

    if (fragments.length) {
      let cursor = 0;
      let aligned = true;
      for (const f of fragments) {
        const text = safeText(f?.text);
        const em = f?.emoticon || f?.emote;
        const id = em?.emoticon_id || em?.emote_id || em?.id;
        if (id) emotes.push([cursor, cursor + text.length, safeText(id)]);
        cursor += text.length;
      }
      aligned = cursor === body.length;
      if (!aligned) emotes.length = 0;
    }

    return {
      t,
      user: internString(commenter.display_name || commenter.name || tr('anonymous'), userStringCache),
      color: internString(msg.user_color || '#a970ff', colorStringCache, 256),
      body,
      emotes: emotes.length ? emotes : null
    };
  }

  function createStreamParser(fileName = '', savedOffset = null) {
    return {
      fileName: safeText(fileName),
      decoder: new TextDecoder('utf-8'),
      header: '',
      commentsStarted: false,
      rootArray: false,
      rootEnded: false,
      objectBuffer: '',
      objectDepth: 0,
      inString: false,
      escaped: false,
      comments: [],
      count: 0,
      lastTime: -Infinity,
      needsSort: false,
      channelId: '',
      savedOffset: savedOffset != null && Number.isFinite(Number(savedOffset)) ? Number(savedOffset) : null
    };
  }

  function beginStreamingLoad(fileName = '', savedOffset = null) {
    resetChatStateForLoad(fileName);
    STATE.streamParser = createStreamParser(fileName, savedOffset);
    if (STATE.streamParser.savedOffset !== null) {
      STATE.offset = STATE.streamParser.savedOffset;
      chrome.storage.local.set({offset: STATE.offset}).catch(() => {});
      saveVideoSettings();
    }
    if ($('tcs-offset')) $('tcs-offset').value = formatOffset(STATE.offset);
    if ($('tcs-file-name')) $('tcs-file-name').textContent = fileName || tr('noChatFile');
    if ($('tcs-title')) $('tcs-title').textContent = fileName ? tr('loadedTitle', {file: fileName}) : tr('title');
    setStatus('statusLoading', {file: fileName});
  }

  async function appendStreamingChunk(chunk) {
    const parser = STATE.streamParser;
    if (!parser || parser.rootEnded) return;

    let text = '';
    if (chunk instanceof ArrayBuffer) {
      text = parser.decoder.decode(new Uint8Array(chunk), {stream: true});
    } else if (ArrayBuffer.isView(chunk)) {
      text = parser.decoder.decode(new Uint8Array(chunk.buffer, chunk.byteOffset, chunk.byteLength), {stream: true});
    } else {
      text = safeText(chunk);
    }
    if (!text) return;

    if (!parser.commentsStarted) {
      parser.header += text;
      const rootArrayMatch = parser.header.match(/^\s*\[/);
      if (rootArrayMatch) {
        parser.commentsStarted = true;
        parser.rootArray = true;
        text = parser.header.slice(rootArrayMatch[0].length);
        parser.header = '';
      } else {
        const match = parser.header.match(/"comments"\s*:\s*\[/);
        if (match) {
          parser.commentsStarted = true;
          text = parser.header.slice(match.index + match[0].length);
          parser.header = '';
        } else {
          if (parser.header.length > 2 * 1024 * 1024) parser.header = parser.header.slice(-64 * 1024);
          return;
        }
      }
    }

    for (let i = 0; i < text.length; i++) {
      const ch = text[i];
      if ((i & 0xFFFF) === 0 && i > 0) await new Promise(resolve => setTimeout(resolve, 0));

      if (parser.objectDepth === 0) {
        if (ch === '{') {
          parser.objectDepth = 1;
          parser.objectBuffer = '{';
          parser.inString = false;
          parser.escaped = false;
        } else if (ch === ']') {
          parser.rootEnded = true;
          break;
        }
        continue;
      }

      parser.objectBuffer += ch;

      if (parser.inString) {
        if (parser.escaped) {
          parser.escaped = false;
        } else if (ch === '\\') {
          parser.escaped = true;
        } else if (ch === '"') {
          parser.inString = false;
        }
        continue;
      }

      if (ch === '"') {
        parser.inString = true;
      } else if (ch === '{') {
        parser.objectDepth++;
      } else if (ch === '}') {
        parser.objectDepth--;
        if (parser.objectDepth === 0) {
          let rawComment;
          try {
            rawComment = JSON.parse(parser.objectBuffer);
          } catch (err) {
            throw new Error(`Invalid chat message near message ${parser.count + 1}: ${err.message}`);
          }
          const comment = normalizeCommentObject(rawComment);
          if (comment) {
            if (comment.t < parser.lastTime - 0.0001) parser.needsSort = true;
            parser.lastTime = comment.t;
            if (!parser.channelId && rawComment?.channel_id) parser.channelId = safeText(rawComment.channel_id);
            parser.comments.push(comment);
            parser.count++;
          }
          parser.objectBuffer = '';
        }
      }
    }
  }

  async function finishStreamingLoad() {
    const parser = STATE.streamParser;
    if (!parser) throw new Error('No chat load is in progress.');
    const tail = parser.decoder.decode();
    if (tail) await appendStreamingChunk(tail);
    if (parser.objectDepth !== 0) throw new Error('The chat JSON ended in the middle of a message object.');
    if (!parser.commentsStarted) throw new Error('Could not find the TwitchDownloader comments array.');
    if (!parser.comments.length) throw new Error(tr('statusNoMessages'));

    if (parser.needsSort) parser.comments.sort((a, b) => a.t - b.t);
    STATE.comments = parser.comments;
    STATE.twitchMode = false;
    STATE.twitchVodId = '';
    if ($('tcs-save-json')) $('tcs-save-json').disabled = false;
    STATE.times = new Float64Array(parser.comments.length);
    for (let i = 0; i < parser.comments.length; i++) STATE.times[i] = parser.comments[i].t;
    STATE.firstChannelId = parser.channelId;
    STATE.streamParser = null;
    STATE.lastRenderedTarget = NaN;
    STATE.lastRenderedFrom = -1;
    STATE.lastRenderedTo = -1;
    clearSearch();
    render(true);
    loadExternalEmotes().catch(err => console.debug('Third-party emote load failed:', err));

    const lastTime = STATE.times[STATE.times.length - 1] || 0;
    const saved = parser.savedOffset !== null ? tr('savedOffsetSuffix', {offset: formatOffset(parser.savedOffset)}) : '';
    setStatus('statusLoaded', {
      count: localizedNumber(STATE.comments.length),
      length: formatTime(lastTime),
      sync: saved
    });
    return {offset: STATE.offset, hasChat: true, chatFileName: STATE.chatFileName || ''};
  }

  async function streamFileHandle(handle) {
    const file = await handle.getFile();
    const tailSize = Math.min(file.size, 128 * 1024 + 4);
    let savedOffset = null;
    if (tailSize) {
      try {
        const tail = (await getUtf8SafeTail(file, tailSize)).text;
        savedOffset = getSavedOffsetFromText(tail);
      } catch {}
    }

    beginStreamingLoad(file.name, savedOffset);
    const chunkSize = 2 * 1024 * 1024;
    for (let pos = 0; pos < file.size; pos += chunkSize) {
      const end = Math.min(file.size, pos + chunkSize);
      const buffer = await file.slice(pos, end).arrayBuffer();
      await appendStreamingChunk(buffer);
      // Give YouTube a chance to paint between large parsing chunks.
      await new Promise(resolve => setTimeout(resolve, 0));
    }
    const result = await finishStreamingLoad();
    return {file, result};
  }

  async function openChatFile() {
    try {
      if (typeof window.showOpenFilePicker !== 'function') {
        setStatus('statusUnsupportedEditing');
        return;
      }
      const [handle] = await window.showOpenFilePicker({
        id: 'tcs-chat-json',
        multiple: false,
        excludeAcceptAllOption: false,
        types: [{ description: 'Twitch chat JSON', accept: { 'application/json': ['.json'] } }]
      });
      const {file} = await streamFileHandle(handle);
      STATE.chatFileHandle = handle;
      STATE.chatFileName = file.name;
      $('tcs-file-name').textContent = file.name;
      $('tcs-title').textContent = tr('loadedTitle', {file: file.name});
    } catch (err) {
      if (err?.name === 'AbortError') return;
      console.error(err);
      setStatus('statusOpenError', {error: err.message || err});
    }
  }

  async function writeOffsetToHandle(handle, offsetSeconds) {
    const file = await handle.getFile();
    const tailSize = Math.min(file.size, 128 * 1024 + 4);
    if (!tailSize) throw new Error('The chat JSON file is empty.');

    const tailInfo = await getUtf8SafeTail(file, tailSize);
    const tailStart = tailInfo.start;
    const tail = tailInfo.text;
    const meta = JSON.stringify({version:1, offset_seconds:Number(offsetSeconds) || 0});
    const encoder = new TextEncoder();
    const syncRe = /("_tcs_sync"\s*:\s*)\{\s*"version"\s*:\s*\d+\s*,\s*"offset_seconds"\s*:\s*-?(?:\d+(?:\.\d+)?|\.\d+)\s*(?:,\s*"saved_at"\s*:\s*"(?:\\.|[^"\\])*")?\s*\}/;
    const match = syncRe.exec(tail);
    const writable = await handle.createWritable({keepExistingData:true});

    try {
      if (match) {
        const replacement = `${match[1]}${meta}`;
        const globalByteStart = tailStart + encoder.encode(tail.slice(0, match.index)).byteLength;
        const suffix = tail.slice(match.index + match[0].length);
        const output = replacement + suffix;
        await writable.seek(globalByteStart);
        await writable.write(output);
        await writable.truncate(globalByteStart + encoder.encode(output).byteLength);
        await writable.close();
        return file.name;
      }

      let finalIndex = tail.length - 1;
      while (finalIndex >= 0 && /\s/.test(tail[finalIndex])) finalIndex--;
      if (finalIndex < 0 || tail[finalIndex] !== '}') throw new Error('The loaded chat JSON is not a root object.');
      const beforeFinal = tail.slice(0, finalIndex);
      const separator = beforeFinal.trimEnd().endsWith('{') ? '' : ',';
      const output = `${separator}\n"_tcs_sync":${meta}\n}` + tail.slice(finalIndex + 1);
      const globalByteStart = tailStart + encoder.encode(beforeFinal).byteLength;
      await writable.seek(globalByteStart);
      await writable.write(output);
      await writable.truncate(globalByteStart + encoder.encode(output).byteLength);
      await writable.close();
      return file.name;
    } catch (err) {
      try { await writable.abort(); } catch {}
      throw err;
    }
  }

  async function saveOffsetToJson() {
    if (!STATE.chatFileHandle || !STATE.comments.length) {
      setStatus('statusLoadFirst');
      return;
    }
    try {
      let permission = await STATE.chatFileHandle.queryPermission({ mode: 'readwrite' });
      if (permission !== 'granted') permission = await STATE.chatFileHandle.requestPermission({ mode: 'readwrite' });
      if (permission !== 'granted') {
        setStatus('statusNoPermission');
        return;
      }
      await writeOffsetToHandle(STATE.chatFileHandle, STATE.offset);
      setStatus('statusSaved', {offset: formatOffset(STATE.offset), file: STATE.chatFileName});
    } catch (err) {
      console.error(err);
      setStatus('statusWriteError', {file: STATE.chatFileName, error: err.message || err});
    }
  }

  function clearChat() {
    STATE.comments = [];
    STATE.times = [];
    STATE.streamParser = null;
    STATE.chatFileName = '';
    STATE.chatFileHandle = null;
    STATE.extEmotes = new Map();
    STATE.extEmotesReady = false;
    STATE.extEmotesLoading = false;
    STATE.extChannelId = '';
    STATE.extEmoteRegex = null;
    STATE.firstChannelId = '';
    STATE.twitchMode = false;
    STATE.twitchVodId = '';
    STATE.twitchVodInput = '';
    STATE.twitchCommentIds = new Set();
    STATE.twitchFetchedAnchors = new Set();
    STATE.twitchMinTime = Infinity;
    STATE.twitchMaxTime = -Infinity;
    STATE.twitchLastAheadAnchor = -Infinity;
    STATE.twitchPendingTarget = NaN;
    STATE.twitchNextOffset = NaN;
    STATE.twitchSeekSequence++;
    STATE.twitchForwardCursor = null;
    STATE.twitchForwardCursorTime = -Infinity;
    STATE.twitchCursorExhausted = false;
    if (STATE.twitchAbortController) { try { STATE.twitchAbortController.abort(); } catch {} }
    if (STATE.twitchSeekTimer) { clearTimeout(STATE.twitchSeekTimer); STATE.twitchSeekTimer = 0; }
    STATE.twitchAbortController = null;
    STATE.twitchFetching = false;
    STATE.twitchFetchToken++;
    if ($('tcs-save-json')) $('tcs-save-json').disabled = true;
    STATE.lastRenderedTarget = NaN;
    STATE.lastRenderedFrom = -1;
    STATE.lastRenderedTo = -1;
    STATE.searchResults = [];
    STATE.searchContextIndex = -1;
    if ($('tcs-file-name')) $('tcs-file-name').textContent = tr('noChatFile');
    $('tcs-title').textContent = tr('title');
    setStatus('statusCleared');
    $('tcs-chat').innerHTML = `<div class="tcs-system">${tr('chooseChat')}</div>`;
    clearSearch();
  }

  function lowerBound(arr, value) {
    let lo = 0, hi = arr.length;
    while (lo < hi) {
      const mid = (lo + hi) >>> 1;
      if (arr[mid] < value) lo = mid + 1;
      else hi = mid;
    }
    return lo;
  }

  function currentVideoTime() {
    const v = findVideo();
    return v && Number.isFinite(v.currentTime) ? v.currentTime : 0;
  }

  function render(force = false) {
    if (!STATE.comments.length) return;
    const video = STATE.currentVideo || findVideo();
    if (!video) return;

    const target = video.currentTime + STATE.offset;
    const start = Math.max(0, target - STATE.windowSeconds);
    const from = lowerBound(STATE.times, start);
    const to = lowerBound(STATE.times, target + 0.0001);

    // The visible DOM only changes when the message range changes.
    // Offset/seek/style changes can still force a render.
    if (!force && from === STATE.lastRenderedFrom && to === STATE.lastRenderedTo) return;

    STATE.lastRenderedTarget = target;
    STATE.lastRenderedFrom = from;
    STATE.lastRenderedTo = to;

    const recentFrom = Math.max(from, to - 220);
    const box = $('tcs-chat');
    const wasNearBottom = box.scrollHeight - box.scrollTop - box.clientHeight < 60;
    const frag = document.createDocumentFragment();

    for (let i = recentFrom; i < to; i++) {
      frag.appendChild(renderComment(STATE.comments[i], i % 2 === 1));
    }

    if (to <= recentFrom) {
      const empty = document.createElement('div');
      empty.className = 'tcs-system';
      empty.textContent = target < (STATE.times[0] || 0) ? tr('statusNoChatYet') : tr('statusNoChatWindow');
      frag.appendChild(empty);
    }

    box.replaceChildren(frag);
    applyPurpleMessageOpacity($('tcs-overlay'));
    if (wasNearBottom) box.scrollTop = box.scrollHeight;
  }

  function applyPurpleMessageOpacity(overlay, opacity = Math.max(0, Math.min(1, STATE.opacity / 100))) {
    if (!overlay) return;
    const enabled = STATE.purpleMessages;
    const purpleAlpha = (0.28 * opacity).toFixed(3);
    const color = /^#[0-9a-fA-F]{6}$/.test(String(STATE.splitColor || '')) ? STATE.splitColor : '#563e76';
    const rgb = [1, 3, 5].map(i => parseInt(color.slice(i, i + 2), 16));
    overlay.querySelectorAll('.tcs-msg').forEach((msg) => {
      if (msg.classList.contains('tcs-alt') && enabled) {
        // Use an inline declaration so the dynamically-created chat rows
        // cannot fall back to the stylesheet's fixed purple opacity.
        msg.style.setProperty('background-color', `rgba(${rgb[0]},${rgb[1]},${rgb[2]},${purpleAlpha})`, '');
      } else {
        // Clearing the inline value makes non-purple rows completely clear.
        msg.style.removeProperty('background-color');
      }
    });
  }

  function renderComment(c, alternate = false) {
    const div = document.createElement('div');
    const isAlternate = alternate && STATE.purpleMessages;
    div.className = `tcs-msg${isAlternate ? ' tcs-alt' : ''}`;
    // Purple background is applied after the complete chat DOM is created
    // so toggling/rerendering cannot leave stale inline styles behind.

    const tm = document.createElement('span');
    tm.className = 'tcs-time';
    tm.textContent = `[${formatTime(c.t, true)}]`;
    tm.title = tr('timeJumpTitle', {time: formatTime(Math.max(0, c.t - STATE.offset), true)});
    tm.addEventListener('click', () => seekToChatTime(c.t));
    div.appendChild(tm);

    const user = document.createElement('span');
    user.className = 'tcs-user';
    user.style.color = c.color || '#a970ff';
    user.textContent = c.user + ':';
    div.appendChild(user);

    const body = document.createElement('span');
    body.className = 'tcs-body';
    if (c.emotes?.length) renderBodyWithEmoteRanges(body, c.body, c.emotes);
    else renderThirdPartyText(body, c.body);
    div.appendChild(body);
    return div;
  }

  function renderBodyWithEmoteRanges(parent, bodyText, emotes) {
    const source = safeText(bodyText);
    let cursor = 0;
    for (const range of emotes) {
      const start = Math.max(cursor, Number(range?.[0]) || 0);
      const end = Math.max(start, Number(range?.[1]) || start);
      const id = safeText(range?.[2]);
      if (start > cursor) renderThirdPartyText(parent, source.slice(cursor, start));
      const text = source.slice(start, end);
      if (id) {
        const img = document.createElement('img');
        img.className = 'tcs-emote';
        img.alt = text;
        img.title = text;
        img.src = `https://static-cdn.jtvnw.net/emoticons/v2/${encodeURIComponent(id)}/default/dark/2.0`;
        img.loading = 'lazy';
        img.decoding = 'async';
        img.onerror = () => { img.replaceWith(document.createTextNode(text)); };
        parent.appendChild(img);
      } else if (text) {
        renderThirdPartyText(parent, text);
      }
      cursor = end;
    }
    if (cursor < source.length) renderThirdPartyText(parent, source.slice(cursor));
  }

  function renderThirdPartyText(parent, text) {
    const source = safeText(text);
    if (!STATE.extEmotesReady || !STATE.extEmotes.size) {
      parent.appendChild(document.createTextNode(source));
      return;
    }
    const regex = STATE.extEmoteRegex || buildExtEmoteRegex();
    if (!regex) {
      parent.appendChild(document.createTextNode(source));
      return;
    }
    let last = 0;
    let match;
    while ((match = regex.exec(source))) {
      const matchStart = match.index;
      const leading = match[1] || '';
      const code = match[2] || match[0];
      const codeStart = matchStart + leading.length;
      const emote = STATE.extEmotes.get(code) || STATE.extEmotes.get(code.replace(/^:/, '').replace(/:$/, ''));
      if (!emote) continue;
      if (codeStart > last) parent.appendChild(document.createTextNode(source.slice(last, codeStart)));
      const img = document.createElement('img');
      img.className = 'tcs-emote tcs-ext-emote';
      img.alt = code;
      img.title = `${code} (${emote.provider})`;
      img.src = emote.url;
      img.loading = 'eager';
      img.decoding = 'async';
      img.onerror = () => { img.replaceWith(document.createTextNode(code)); };
      parent.appendChild(img);
      last = codeStart + code.length;
    }
    if (last < source.length) parent.appendChild(document.createTextNode(source.slice(last)));
  }

  function buildExtEmoteRegex() {
    const keys = [...STATE.extEmotes.keys()].filter(Boolean).sort((a,b) => b.length - a.length).map(escapeRegex);
    if (!keys.length) return null;
    return new RegExp(`(^|\\s)(${keys.join('|')})(?=$|\\s|[.,!?;:])`, 'g');
  }

  function escapeRegex(s) { return safeText(s).replace(/[.*+?^${}()|[\]\\]/g, '\\$&'); }

  function addExtEmote(map, code, url, provider) {
    const name = safeText(code).trim();
    if (!name || !url) return;
    const canonical = name.replace(/^:/, '').replace(/:$/, '');
    map.set(name, {url, provider});
    map.set(canonical, {url, provider});
  }

  async function loadExternalEmotes() {
    if (STATE.extEmotesLoading || !STATE.comments.length) return;
    const channelId = STATE.firstChannelId || '';
    if (!channelId) {
      STATE.extEmotesReady = true;
      return;
    }
    if (STATE.extChannelId === channelId && STATE.extEmotesReady) return;
    STATE.extEmotesLoading = true;
    STATE.extEmotesReady = false;
    STATE.extChannelId = channelId;
    $('tcs-status').textContent += tr('loadingEmotesSuffix');

    const map = new Map();
    const tasks = [
      loadBTTV(map, channelId),
      loadFFZ(map, channelId),
      loadSevenTV(map, channelId)
    ];
    await Promise.allSettled(tasks);
    STATE.extEmotes = map;
    STATE.extEmoteRegex = buildExtEmoteRegex();
    STATE.extEmotesReady = true;
    STATE.extEmotesLoading = false;
    const count = [...map.keys()].filter((k, i, arr) => arr.indexOf(k.replace(/^:/, '').replace(/:$/, '')) === i).length;
    setStatus('emotesFoundStatus', {count: localizedNumber(STATE.comments.length), length: formatTime(STATE.comments[STATE.comments.length - 1].t), emotes: localizedNumber(Math.max(0, Math.floor(count / 2)))});
    render(true);
  }

  async function fetchJson(url) {
    const r = await fetch(url, { credentials: 'omit', cache: 'force-cache' });
    if (!r.ok) throw new Error(`${r.status} ${r.statusText}`);
    return r.json();
  }

  async function loadBTTV(map, channelId) {
    try {
      const [global, channel] = await Promise.all([
        fetchJson('https://api.betterttv.net/3/cached/emotes/global'),
        fetchJson(`https://api.betterttv.net/3/cached/users/twitch/${encodeURIComponent(channelId)}`)
      ]);
      for (const e of Array.isArray(global) ? global : []) {
        addExtEmote(map, e.code, `https://cdn.betterttv.net/emote/${encodeURIComponent(e.id)}/3x`, 'BTTV');
      }
      for (const e of [...(channel?.channelEmotes || []), ...(channel?.sharedEmotes || [])]) {
        addExtEmote(map, e.code, `https://cdn.betterttv.net/emote/${encodeURIComponent(e.id)}/3x`, 'BTTV');
      }
    } catch (err) {
      console.debug('BTTV unavailable:', err);
    }
  }

  function collectFFZSet(map, set) {
    for (const e of set?.emoticons || []) {
      const urls = e.urls || {};
      const url = urls['2'] || urls['1'] || urls['4'];
      if (url) addExtEmote(map, e.name, normalizeProtocol(url), 'FFZ');
      const animated = e.animated || {};
      const animatedUrl = animated['2'] || animated['1'] || animated['4'];
      if (animatedUrl) addExtEmote(map, e.name, normalizeProtocol(animatedUrl), 'FFZ');
    }
  }

  async function loadFFZ(map, channelId) {
    try {
      const [room, global] = await Promise.all([
        fetchJson(`https://api.frankerfacez.com/v1/room/id/${encodeURIComponent(channelId)}`),
        fetchJson('https://api.frankerfacez.com/v1/set/global')
      ]);
      const sets = room?.sets || {};
      for (const set of Object.values(sets)) collectFFZSet(map, set);
      for (const id of global?.default_sets || []) collectFFZSet(map, global?.sets?.[String(id)]);
    } catch (err) {
      console.debug('FFZ unavailable:', err);
    }
  }

  async function loadSevenTV(map, channelId) {
    try {
      const [global, user] = await Promise.all([
        fetchJson('https://7tv.io/v3/emote-sets/global'),
        fetchJson(`https://7tv.io/v3/users/twitch/${encodeURIComponent(channelId)}`)
      ]);
      for (const e of global?.emotes || []) addExtEmote(map, e?.name, sevenTVUrl(e?.id), '7TV');
      const setId = user?.emote_set?.id || user?.emote_sets?.[0]?.id;
      if (!setId) return;
      const set = await fetchJson(`https://api.7tv.app/v3/emote-sets/${encodeURIComponent(setId)}`);
      for (const e of set?.emotes || []) addExtEmote(map, e?.name, sevenTVUrl(e?.id), '7TV');
    } catch (err) {
      console.debug('7TV unavailable:', err);
    }
  }

  function sevenTVUrl(id) {
    return id ? `https://cdn.7tv.app/emote/${encodeURIComponent(id)}/3x.webp` : '';
  }

  function normalizeProtocol(url) {
    const s = safeText(url);
    return s.startsWith('//') ? 'https:' + s : s;
  }

  function messageSearchText(c) {
    return `${c.user} ${c.body}`.toLocaleLowerCase();
  }

  function runSearch() {
    const query = safeText($('tcs-search').value).trim().toLocaleLowerCase();
    if (!query) { clearSearch(); return; }
    if (!STATE.comments.length) {
      $('tcs-search-status').textContent = tr('searchLoadFirst');
      return;
    }

    const token = ++STATE.searchToken;
    STATE.searchQuery = query;
    STATE.searchResults = [];
    STATE.searchContextIndex = -1;
    $('tcs-search-status').textContent = `${tr('search')}…`;

    let i = 0;
    const batchSize = 8000;

    function searchBatch() {
      if (token !== STATE.searchToken) return;
      const end = Math.min(i + batchSize, STATE.comments.length);
      const deadline = performance.now() + 8;
      for (; i < end; i++) {
        const c = STATE.comments[i];
        if (messageSearchText(c).includes(query)) {
          STATE.searchResults.push(i);
          if (STATE.searchResults.length >= 150) break;
        }
        if ((i & 255) === 0 && performance.now() >= deadline) break;
      }

      if (i < STATE.comments.length && STATE.searchResults.length < 150) {
        setTimeout(searchBatch, 0);
      } else {
        renderSearchResults();
      }
    }

    searchBatch();
  }

  function clearSearch() {
    STATE.searchToken++;
    STATE.searchQuery = '';
    STATE.searchResults = [];
    STATE.searchContextIndex = -1;
    if ($('tcs-search')) $('tcs-search').value = '';
    if ($('tcs-search-status')) $('tcs-search-status').textContent = '';
    if ($('tcs-search-results')) {
      $('tcs-search-results').replaceChildren();
      $('tcs-search-results').hidden = true;
    }
  }

  function renderSearchResults() {
    const box = $('tcs-search-results');
    box.replaceChildren();
    box.hidden = $('tcs-overlay')?.classList.contains('tcs-settings-collapsed') || false;
    $('tcs-search-status').textContent = STATE.searchResults.length
      ? tr(STATE.searchResults.length === 1 ? 'searchOneMatch' : 'searchManyMatches', {count: `${localizedNumber(STATE.searchResults.length)}${STATE.searchResults.length === 150 ? '+' : ''}`})
      : tr('searchNone');

    for (const index of STATE.searchResults) {
      const c = STATE.comments[index];
      const row = document.createElement('div');
      row.className = 'tcs-result';

      const main = document.createElement('div');
      main.className = 'tcs-result-main';
      const time = document.createElement('span');
      time.className = 'tcs-result-time';
      time.textContent = formatTime(c.t, true);
      const user = document.createElement('span');
      user.className = 'tcs-result-user';
      user.style.color = c.color || '#a970ff';
      user.textContent = c.user + ':';
      main.append(time, user, document.createTextNode(' '));
      appendHighlightedText(main, c.body, STATE.searchQuery);

      const actions = document.createElement('div');
      actions.className = 'tcs-result-actions';
      const jump = document.createElement('button');
      jump.className = 'tcs-mini-btn';
      jump.textContent = tr('jump');
      jump.addEventListener('click', (e) => { e.stopPropagation(); seekToChatTime(c.t); });
      const sync = document.createElement('button');
      sync.className = 'tcs-mini-btn';
      sync.textContent = tr('syncHere');
      sync.title = tr('syncHereTitle');
      sync.addEventListener('click', (e) => {
        e.stopPropagation();
        syncOffsetToChatTime(c.t);
      });
      actions.append(jump, sync);
      row.append(main, actions);
      row.addEventListener('click', () => {
        STATE.searchContextIndex = index;
        showContext(index);
      });
      box.appendChild(row);
    }
  }

  function appendHighlightedText(parent, text, query) {
    const source = safeText(text);
    if (!query) { parent.appendChild(document.createTextNode(source)); return; }
    const lower = source.toLocaleLowerCase();
    let cursor = 0;
    let pos = lower.indexOf(query, cursor);
    while (pos !== -1) {
      if (pos > cursor) parent.appendChild(document.createTextNode(source.slice(cursor, pos)));
      const mark = document.createElement('mark');
      mark.className = 'tcs-hit';
      mark.textContent = source.slice(pos, pos + query.length);
      parent.appendChild(mark);
      cursor = pos + query.length;
      pos = lower.indexOf(query, cursor);
    }
    if (cursor < source.length) parent.appendChild(document.createTextNode(source.slice(cursor)));
  }

  function showContext(index) {
    const c = STATE.comments[index];
    if (!c) return;
    const start = Math.max(0, c.t - 15);
    const end = c.t + 15;
    const from = lowerBound(STATE.times, start);
    const to = lowerBound(STATE.times, end + 0.0001);
    const box = $('tcs-chat');
    const frag = document.createDocumentFragment();
    const note = document.createElement('div');
    note.className = 'tcs-pinned';
    note.textContent = tr('context', {time: formatTime(c.t, true), start: formatTime(start, true), end: formatTime(end, true)});
    frag.appendChild(note);
    for (let i = from; i < to; i++) {
      const row = renderComment(STATE.comments[i], (i - from) % 2 === 1);
      if (i === index) row.style.outline = '1px solid #9147ff';
      frag.appendChild(row);
    }
    box.replaceChildren(frag);
    box.scrollTop = Math.max(0, [...box.children].findIndex(el => el.style.outline));
  }

  function syncOffsetToChatTime(chatTime) {
    const video = findVideo();
    if (!video) {
      setStatus('noVideo');
      return;
    }
    STATE.offset = chatTime - video.currentTime;
    $('tcs-offset').value = formatOffset(STATE.offset);
    chrome.storage.local.set({offset: STATE.offset}).catch(() => {});
    saveVideoSettings();
    savePrefs();
    setStatus('synced', {chatTime: formatTime(chatTime, true), videoTime: formatTime(video.currentTime, true), offset: formatOffset(STATE.offset)});
    savePrefs();
    render(true);
  }

  function seekToChatTime(chatTime) {
    const video = findVideo();
    if (!video) return;
    video.currentTime = Math.max(0, chatTime - STATE.offset);
    render(true);
  }

  function detachVideoListeners(video) {
    if (!video || !video.__tcsHandlers) return;
    for (const [event, handler] of video.__tcsHandlers) {
      try { video.removeEventListener(event, handler); } catch {}
    }
    delete video.__tcsHandlers;
  }

  function findVideo() {
    const v = document.querySelector('video.html5-main-video, video');
    if (v !== STATE.currentVideo) {
      if (STATE.currentVideo) detachVideoListeners(STATE.currentVideo);
      STATE.currentVideo = v || null;
      if (STATE.currentVideo) attachVideoListeners(STATE.currentVideo);
    }
    return STATE.currentVideo;
  }

  function attachVideoListeners(video) {
    if (!video || video.__tcsHandlers) return video;
    const renderTick = () => {
      try {
        ensureUI();
        if (STATE.twitchMode && STATE.twitchVodId) {
          const now = Number(video.currentTime);
          const previous = STATE.twitchLastVideoTime;
          // Some YouTube keyboard jumps can change currentTime without giving us
          // a useful seek event. Detect a larger-than-normal time jump here too.
          if (Number.isFinite(now) && Number.isFinite(previous) && Math.abs(now - previous) > 2.5) {
            maybeFetchTwitchForSeek();
          }
          STATE.twitchLastVideoTime = now;
        }
        render(false);
      }
      catch (err) { console.debug('Twitch VOD Chat for YouTube render error:', err); }
    };
    const forceTick = () => {
      try { ensureUI(); render(true); }
      catch (err) { console.debug('Twitch VOD Chat for YouTube forced render error:', err); }
    };
    const handlers = [
      ['timeupdate', renderTick],
      ['seeked', () => { forceTick(); maybeFetchTwitchForSeek(); }],
      ['seeking', () => { forceTick(); maybeFetchTwitchForSeek(); }],
      ['play', forceTick],
      ['playing', forceTick],
      ['ratechange', forceTick],
      ['loadedmetadata', forceTick],
      ['durationchange', forceTick],
      ['ended', forceTick]
    ];
    for (const [event, handler] of handlers) video.addEventListener(event, handler, {passive: true});
    video.__tcsHandlers = handlers;
    STATE.twitchLastVideoTime = Number.isFinite(Number(video.currentTime)) ? Number(video.currentTime) : NaN;
    try { render(true); } catch (err) { console.debug('Twitch VOD Chat for YouTube initial render error:', err); }
    return video;
  }

  function startVideoObserver() {
    ensureUI();
    findVideo();
    applyChatVisibility();

    window.addEventListener('yt-navigate-start', applyChatVisibility);
    window.addEventListener('yt-navigate-finish', () => {
      applyChatVisibility();
      restoreVideoSettingsForCurrentVideo(false);
    });
    window.addEventListener('popstate', () => {
      applyChatVisibility();
      restoreVideoSettingsForCurrentVideo(false);
    });

    if (!STATE.videoObserverInterval) {
      // YouTube can replace its <video> element during navigation/quality changes.
      STATE.videoObserverInterval = setInterval(() => {
        try {
          ensureUI();
          findVideo();
          applyChatVisibility();
          restoreVideoSettingsForCurrentVideo(false);
        } catch (err) { console.debug('Twitch VOD Chat for YouTube video observer error:', err); }
      }, 2000);
    }

    if (!STATE.syncHeartbeat) {
      // Safety net for browsers/media states that throttle timeupdate. This is 4Hz
      // instead of a 60Hz animation-frame loop and does no DOM query when attached.
      STATE.syncHeartbeat = setInterval(() => {
        try {
          const video = STATE.currentVideo;
          if (video && !video.paused && !video.ended) {
            render(false);
            maybeFetchTwitchAhead();
          }
        } catch (err) { console.debug('Twitch VOD Chat for YouTube sync heartbeat error:', err); }
      }, 250);
    }
  }

  function makeDraggable(box, handle) {
    handle.addEventListener('mousedown', (e) => {
      if (e.target.closest('button') || e.target.closest('input')) return;
      STATE.dragging = true;
      const r = box.getBoundingClientRect();
      STATE.startX = e.clientX; STATE.startY = e.clientY;
      STATE.startLeft = r.left; STATE.startTop = r.top;
      box.style.left = r.left + 'px'; box.style.top = r.top + 'px'; box.style.right = 'auto';
      e.preventDefault();
    });
    window.addEventListener('mousemove', (e) => {
      if (!STATE.dragging) return;
      const nx = Math.max(0, Math.min(window.innerWidth - 60, STATE.startLeft + e.clientX - STATE.startX));
      const ny = Math.max(0, Math.min(window.innerHeight - 60, STATE.startTop + e.clientY - STATE.startY));
      box.style.left = nx + 'px'; box.style.top = ny + 'px';
    });
    window.addEventListener('mouseup', () => { if (STATE.dragging) { STATE.dragging = false; savePrefs(); } });
  }

  function makeResizable(box) {
    box.querySelectorAll('.tcs-resize').forEach(grip => {
      grip.addEventListener('mousedown', (e) => {
        STATE.resizing = true;
        STATE.resizeEdge = grip.dataset.edge;
        const r = box.getBoundingClientRect();
        STATE.startX = e.clientX; STATE.startY = e.clientY;
        STATE.startLeft = r.left; STATE.startTop = r.top;
        STATE.startWidth = r.width; STATE.startHeight = r.height;
        e.preventDefault(); e.stopPropagation();
      });
    });

    window.addEventListener('mousemove', (e) => {
      if (!STATE.resizing) return;
      const dx = e.clientX - STATE.startX;
      const dy = e.clientY - STATE.startY;
      const edge = STATE.resizeEdge || 'br';
      let left = STATE.startLeft;
      let top = STATE.startTop;
      let width = STATE.startWidth;
      let height = STATE.startHeight;

      if (edge.includes('r')) width += dx;
      if (edge.includes('l')) { width -= dx; left += dx; }
      if (edge.includes('b')) height += dy;
      if (edge.includes('t')) { height -= dy; top += dy; }

      const minW = 300, minH = 300;
      const maxW = Math.min(900, Math.max(minW, window.innerWidth - 24));
      const maxH = Math.min(1400, Math.max(minH, window.innerHeight - 100));
      if (width < minW) { if (edge.includes('l')) left -= minW - width; width = minW; }
      if (width > maxW) { if (edge.includes('l')) left += width - maxW; width = maxW; }
      if (height < minH) { if (edge.includes('t')) top -= minH - height; height = minH; }
      if (height > maxH) { if (edge.includes('t')) top += height - maxH; height = maxH; }

      box.style.left = Math.max(0, Math.min(window.innerWidth - width, left)) + 'px';
      box.style.top = Math.max(0, Math.min(window.innerHeight - height, top)) + 'px';
      box.style.right = 'auto';
      box.style.width = width + 'px';
      box.style.height = height + 'px';
    });
    window.addEventListener('mouseup', () => { if (STATE.resizing) { STATE.resizing = false; savePrefs(); } });
  }

  function clampToViewport() {
    const box = $('tcs-overlay');
    if (!box) return;
    const r = box.getBoundingClientRect();
    const w = Math.min(r.width, Math.max(300, window.innerWidth - 24));
    const h = Math.min(r.height, Math.max(300, window.innerHeight - 100));
    box.style.width = w + 'px';
    box.style.height = h + 'px';
    box.style.left = Math.max(0, Math.min(window.innerWidth - w, r.left)) + 'px';
    box.style.top = Math.max(0, Math.min(window.innerHeight - h, r.top)) + 'px';
  }

  window.addEventListener('resize', clampToViewport);

  chrome.storage.onChanged?.addListener((changes, areaName) => {
    if (areaName !== 'local') return;
    if (changes.chatVisible) {
      STATE.chatVisible = changes.chatVisible.newValue !== false;
      applyChatVisibility();
    }
    if (changes.showTimestamps) {
      STATE.showTimestamps = changes.showTimestamps.newValue !== false;
      applyDisplayPrefs(true);
    }
    if (changes.hideChatFrame) {
      setHideChatFrame(changes.hideChatFrame.newValue === true, false);
    }
    if (changes.purpleMessages) {
      STATE.purpleMessages = changes.purpleMessages.newValue !== false;
      applyDisplayPrefs(true);
    }
    if (changes.hideScrollbar) {
      STATE.hideScrollbar = changes.hideScrollbar.newValue === true;
      applyDisplayPrefs();
    }
    if (changes.splitColor) {
      setSplitColor(changes.splitColor.newValue, false);
    }
    if (changes.opacity) {
      const n = Number(changes.opacity.newValue);
      if (Number.isFinite(n)) {
        STATE.opacity = Math.max(0, Math.min(100, n));
        applyOpacity();
      }
    }
    if (changes.language) {
      STATE.language = I18N?.languages?.[changes.language.newValue] ? changes.language.newValue : 'en';
      applyLanguage();
    }
  });

  chrome.runtime.onMessage?.addListener((msg, _sender, sendResponse) => {
    ensureUI();
    if (msg?.action === 'show') {
      setChatVisibility(true);
      sendResponse?.({ ok: true, visible: true });
      return true;
    }
    if (msg?.action === 'hide') {
      setChatVisibility(false);
      sendResponse?.({ ok: true, visible: false });
      return true;
    }
    if (msg?.action === 'set-hide-chat-frame') {
      setHideChatFrame(msg.enabled);
      sendResponse?.({ ok: true, hideChatFrame: STATE.hideChatFrame });
      return true;
    }
    if (msg?.action === 'set-purple-messages') {
      setPurpleMessages(msg.enabled === true);
      sendResponse?.({ ok: true, purpleMessages: STATE.purpleMessages });
      return true;
    }
    if (msg?.action === 'set-hide-scrollbar') {
      setHideScrollbar(msg.enabled === true);
      sendResponse?.({ ok: true, hideScrollbar: STATE.hideScrollbar });
      return true;
    }
    if (msg?.action === 'set-show-timestamps') {
      setShowTimestamps(msg.enabled === true);
      sendResponse?.({ ok: true, showTimestamps: STATE.showTimestamps });
      return true;
    }
    if (msg?.action === 'set-split-color') {
      setSplitColor(msg.color);
      sendResponse?.({ ok: true, splitColor: STATE.splitColor });
      return true;
    }
    if (msg?.action === 'set-opacity') {
      setOpacity(msg.opacity);
      sendResponse?.({ ok: true, opacity: STATE.opacity });
      return true;
    }
    if (msg?.action === 'set-twitch-vod-input') {
      const value = safeText(msg.value).trim();
      STATE.twitchVodInput = value;
      const input = $('tcs-twitch-vod-id');
      if (input) input.value = value;
      saveVideoSettings();
      sendResponse?.({ ok: true, twitchVodInput: value });
      return true;
    }
    if (msg?.action === 'get-state') {
      sendResponse?.({
        ok: true,
        offset: STATE.offset,
        hasChat: STATE.comments.length > 0,
        chatFileName: STATE.chatFileName || '',
        twitchMode: STATE.twitchMode,
        twitchVodId: STATE.twitchVodId || '',
        twitchVodInput: STATE.twitchVodInput || ''
      });
      return true;
    }
    if (msg?.action === 'set-offset') {
      const n = Number(msg.offset);
      if (!Number.isFinite(n)) {
        sendResponse?.({ ok: false });
        return true;
      }
      STATE.offset = n;
      if ($('tcs-offset')) $('tcs-offset').value = formatOffset(n);
      savePrefs();
      chrome.storage.local.set({offset: STATE.offset}).catch(() => {});
      saveVideoSettings();
      if (msg.showStatus === true) setStatus('offsetApplied');
      maybeFetchTwitchForOffsetChange();
      sendResponse?.({ ok: true, offset: STATE.offset });
      return true;
    }
    if (msg?.action === 'open-chat-file') {
      openChatFile().then(() => sendResponse?.({
        ok: !!STATE.chatFileHandle && STATE.comments.length > 0,
        hasChat: STATE.comments.length > 0,
        chatFileName: STATE.chatFileName || ''
      })).catch(() => sendResponse?.({ ok: false }));
      return true;
    }
    if (msg?.action === 'load-chat-start') {
      try {
        // Toolbar loads use structured-clone messaging to pass the same
        // FileSystemFileHandle into the content script. This lets the
        // overlay's Save Offset button operate on the original JSON file.
        beginStreamingLoad(msg.fileName, msg.savedOffset);
        if (msg.fileHandle) STATE.chatFileHandle = msg.fileHandle;
        sendResponse?.({ok: true});
      } catch (err) {
        sendResponse?.({ok:false, error:err.message || String(err)});
      }
      return true;
    }
    if (msg?.action === 'load-chat-chunk') {
      appendStreamingChunk(msg.chunk).then(() => {
        sendResponse?.({ok: true});
      }).catch(err => {
        STATE.streamParser = null;
        sendResponse?.({ok:false, error:err.message || String(err)});
      });
      return true;
    }
    if (msg?.action === 'load-chat-complete') {
      finishStreamingLoad().then(result => sendResponse?.({ok:true, ...result})).catch(err => sendResponse?.({ok:false, error:err.message || String(err)}));
      return true;
    }
    if (msg?.action === 'load-twitch-vod') {
      loadTwitchVod(msg.vodId).then(result => sendResponse?.(result || {ok:false})).catch(err => sendResponse?.({ok:false, error:err?.message || String(err)}));
      return true;
    }
    if (msg?.action === 'save-offset') {
      saveOffsetToJson().then(() => sendResponse?.({ ok: true, offset: STATE.offset, hasChat: true, chatFileName: STATE.chatFileName || '' }))
        .catch(() => sendResponse?.({ ok: false, offset: STATE.offset }));
      return true;
    }
    if (msg?.action === 'toggle-settings') {
      const overlay = $('tcs-overlay');
      if (overlay) {
        const collapsed = !overlay.classList.contains('tcs-settings-collapsed');
        setSettingsCollapsed(collapsed);
      }
      sendResponse?.({ ok: true });
      return true;
    }
    if (msg?.action === 'set-language') {
      STATE.language = I18N?.languages?.[msg.language] ? msg.language : 'en';
      applyLanguage();
      sendResponse?.({ ok: true, language: STATE.language });
      return true;
    }
  });

  ensureUI();
  startVideoObserver();
})();
