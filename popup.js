const I18N = globalThis.TCS_I18N;

function popupTr(key, vars = {}) {
  const lang = document.getElementById('language')?.value || 'en';
  return I18N.format(I18N.get(lang)?.popup?.[key] ?? I18N.get('en')?.popup?.[key] ?? key, vars);
}

async function getActiveYoutubeTab() {
  const [tab] = await chrome.tabs.query({active:true,currentWindow:true});
  return tab?.id ? tab : null;
}

async function sendToContent(message) {
  const tab = await getActiveYoutubeTab();
  if (!tab) return null;
  try { return await chrome.tabs.sendMessage(tab.id, message); } catch { return null; }
}

async function setChatVisibility(visible) {
  await chrome.storage.local.set({chatVisible: visible});
  await sendToContent({action: visible ? 'show' : 'hide'});
}

function parseOffset(value) {
  const s = String(value || '').trim();
  if (/^[+-]?\d+(?:\.\d+)?$/.test(s)) return Number(s);
  const m = s.match(/^([+-])?(?:(\d+):)?(\d{1,2}):(\d{2})$/);
  if (!m) return NaN;
  const sign = m[1] === '-' ? -1 : 1;
  const hours = Number(m[2] || 0);
  const minutes = Number(m[3]);
  const seconds = Number(m[4]);
  if (minutes > 59 || seconds > 59) return NaN;
  return sign * (hours * 3600 + minutes * 60 + seconds);
}

function formatOffset(seconds) {
  const n = Number(seconds);
  if (!Number.isFinite(n)) return '+00:00:00';
  const sign = n < 0 ? '-' : '+';
  let s = Math.round(Math.abs(n));
  const h = Math.floor(s / 3600);
  s -= h * 3600;
  const m = Math.floor(s / 60);
  const sec = s % 60;
  return `${sign}${String(h).padStart(2,'0')}:${String(m).padStart(2,'0')}:${String(sec).padStart(2,'0')}`;
}

function applyLanguage(lang) {
  const L = I18N.get(lang);
  document.getElementById('language-label').textContent = L.popup.language;
  document.getElementById('hide').textContent = L.popup.hideChat;
  document.getElementById('open').textContent = L.popup.showChat;
  document.getElementById('language').setAttribute('aria-label', L.popup.language);
  document.getElementById('clean-chat-label').textContent = L.popup.cleanChat;
  document.getElementById('clean-chat').setAttribute('aria-label', L.popup.cleanChat);
  const EN = I18N.get('en');
  const showTimestampsLabel = L.popup.showTimestamps || EN.popup.showTimestamps;
  const splitMessagesLabel = L.popup.splitMessages || EN.popup.splitMessages;
  const opacityLabel = L.popup.opacity || EN.popup.opacity;
  const splitColorLabel = L.popup.splitMessageColor || EN.popup.splitMessageColor;
  const resetSplitColorLabel = L.popup.resetSplitMessageColor || EN.popup.resetSplitMessageColor;
  const hideScrollbarLabel = L.popup.hideScrollbar || EN.popup.hideScrollbar;
  const hideChatFrameLabel = L.popup.hideChatFrame || EN.popup.hideChatFrame;
  const loadChatLabel = L.popup.loadChat || EN.popup.loadChat;
  const saveOffsetLabel = L.popup.saveOffset || EN.popup.saveOffset;
  const offsetLabel = L.popup.offset || EN.popup.offset;
  const applyLabel = L.popup.apply || EN.popup.apply;
  document.getElementById('show-timestamps-label').textContent = showTimestampsLabel;
  document.getElementById('show-timestamps').setAttribute('aria-label', showTimestampsLabel);
  document.getElementById('split-messages-label').textContent = splitMessagesLabel;
  document.getElementById('split-messages').setAttribute('aria-label', splitMessagesLabel);
  document.getElementById('opacity-label').textContent = opacityLabel;
  document.getElementById('split-color-label').textContent = splitColorLabel;
  document.getElementById('split-color').setAttribute('aria-label', splitColorLabel);
  document.getElementById('split-color-reset').textContent = resetSplitColorLabel;
  document.getElementById('hide-scrollbar-label').textContent = hideScrollbarLabel;
  document.getElementById('hide-scrollbar').setAttribute('aria-label', hideScrollbarLabel);
  document.getElementById('hide-chat-frame-label').textContent = hideChatFrameLabel;
  document.getElementById('hide-chat-frame').setAttribute('aria-label', hideChatFrameLabel);
  document.getElementById('load-chat').textContent = loadChatLabel;
  document.getElementById('save-offset').textContent = saveOffsetLabel;
  document.getElementById('offset-label').textContent = offsetLabel;
  document.getElementById('offset-apply').textContent = applyLabel;
}

function buildLanguageOptions(selected) {
  const select = document.getElementById('language');
  select.replaceChildren();
  for (const [code, data] of Object.entries(I18N.languages)) {
    const option = document.createElement('option');
    option.value = code;
    option.textContent = data.name;
    select.appendChild(option);
  }
  select.value = I18N.languages[selected] ? selected : 'en';
}

function setOffsetUI(value) {
  document.getElementById('offset').value = formatOffset(value);
}

function setFileState(hasChat, fileName='') {
  document.getElementById('save-offset').disabled = !hasChat;
  document.getElementById('file-status').textContent = hasChat ? fileName : '';
}

const IDB_NAME = 'tcsPopupFiles';
const IDB_STORE = 'handles';
const IDB_KEY = 'chat';
let toolbarLoadInProgress = false;
let storedChatHandle = null;
let storedWritePermission = 'unknown';

function openHandleDb() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(IDB_NAME, 1);
    req.onupgradeneeded = () => {
      if (!req.result.objectStoreNames.contains(IDB_STORE)) req.result.createObjectStore(IDB_STORE);
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error || new Error('IndexedDB error'));
  });
}

async function storeChatHandle(handle) {
  storedChatHandle = handle || null;
  storedWritePermission = 'unknown';
  const db = await openHandleDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(IDB_STORE, 'readwrite');
    tx.objectStore(IDB_STORE).put(handle, IDB_KEY);
    tx.oncomplete = () => { db.close(); resolve(); };
    tx.onerror = () => { db.close(); reject(tx.error || new Error('Could not store file handle')); };
  });
}

async function getStoredChatHandle() {
  if (storedChatHandle) return storedChatHandle;
  try {
    const db = await openHandleDb();
    return await new Promise((resolve, reject) => {
      const tx = db.transaction(IDB_STORE, 'readonly');
      const req = tx.objectStore(IDB_STORE).get(IDB_KEY);
      req.onsuccess = () => {
        const handle = req.result || null;
        db.close();
        storedChatHandle = handle;
        resolve(handle);
      };
      req.onerror = () => { db.close(); reject(req.error || new Error('Could not read file handle')); };
    });
  } catch {
    return null;
  }
}

async function getUtf8SafeTail(file, desiredSize = 128 * 1024 + 4) {
  const size = Math.min(file.size, desiredSize);
  const baseStart = file.size - size;
  if (baseStart <= 0) return {text: await file.slice(0, file.size).text(), start: 0};
  const probeStart = Math.max(0, baseStart - 3);
  const probe = new Uint8Array(await file.slice(probeStart, baseStart + 1).arrayBuffer());
  let safeStart = baseStart;
  const baseIndex = baseStart - probeStart;
  while (safeStart > probeStart && baseIndex - (baseStart - safeStart) >= 0) {
    const b = probe[baseIndex - (baseStart - safeStart)];
    if ((b & 0xC0) !== 0x80) break;
    safeStart--;
  }
  return {text: await file.slice(safeStart, file.size).text(), start: safeStart};
}

async function getSavedOffsetFromTail(file) {
  const tailSize = Math.min(file.size, 128 * 1024 + 4);
  if (!tailSize) return null;
  try {
    const tail = (await getUtf8SafeTail(file, tailSize)).text;
    const m = tail.match(/"_tcs_sync"\s*:\s*\{[^{}]*"offset_seconds"\s*:\s*(-?(?:\d+(?:\.\d+)?|\.\d+))/);
    if (!m) return null;
    const n = Number(m[1]);
    return Number.isFinite(n) ? n : null;
  } catch {
    return null;
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
      const localByteStart = encoder.encode(tail.slice(0, match.index)).byteLength;
      const globalByteStart = tailStart + localByteStart;
      const suffix = tail.slice(match.index + match[0].length);
      await writable.seek(globalByteStart);
      await writable.write(replacement + suffix);
      await writable.truncate(globalByteStart + encoder.encode(replacement + suffix).byteLength);
      await writable.close();
      return file.name;
    }

    // Our own metadata is normally at the end. Insert it immediately before
    // the final root-object brace without reading or rewriting the 100+ MB body.
    let finalIndex = tail.length - 1;
    while (finalIndex >= 0 && /\s/.test(tail[finalIndex])) finalIndex--;
    if (finalIndex < 0 || tail[finalIndex] !== '}') {
      throw new Error('The loaded chat JSON is not a root object.');
    }
    const beforeFinal = tail.slice(0, finalIndex);
    const separator = beforeFinal.trimEnd().endsWith('{') ? '' : ',';
    const insertion = `${separator}\n"_tcs_sync":${meta}\n}`;
    const trailing = tail.slice(finalIndex + 1);
    const localByteStart = encoder.encode(beforeFinal).byteLength;
    const globalByteStart = tailStart + localByteStart;
    const replacement = insertion + trailing;
    await writable.seek(globalByteStart);
    await writable.write(replacement);
    await writable.truncate(globalByteStart + encoder.encode(replacement).byteLength);
    await writable.close();
    return file.name;
  } catch (err) {
    try { await writable.abort(); } catch {}
    throw err;
  }
}

async function loadChatFromPopup() {
  if (toolbarLoadInProgress) return;
  if (typeof window.showOpenFilePicker !== 'function') {
    setFileState(false, popupTr('filePickerUnavailable'));
    return;
  }
  try {
    toolbarLoadInProgress = true;
    const [handle] = await window.showOpenFilePicker({
      id:'tcs-chat-json', multiple:false, excludeAcceptAllOption:false,
      types:[{description:'Twitch chat JSON', accept:{'application/json':['.json']}}]
    });
    const file = await handle.getFile();

    // Keep the handle cached for Save offset. Write permission is requested
    // from the Save button's own user gesture when needed.
    await storeChatHandle(handle);
    const savedOffset = await getSavedOffsetFromTail(file);
    if (savedOffset !== null) setOffsetUI(savedOffset);

    const tab = await getActiveYoutubeTab();
    if (!tab) {
      if (savedOffset !== null) await chrome.storage.local.set({offset:savedOffset});
      setFileState(true, file.name);
      return;
    }
    let result = await chrome.tabs.sendMessage(tab.id, {
      action:'load-chat-start', fileName:file.name, savedOffset, fileHandle: handle
    });
    if (!result?.ok) throw new Error(popupTr('overlayLoadStartError'));
    if (Number.isFinite(Number(result.offset))) {
      setOffsetUI(Number(result.offset));
      await chrome.storage.local.set({offset:Number(result.offset)});
    }

    const chunkSize = 2 * 1024 * 1024;
    const decoder = new TextDecoder('utf-8');
    let chunkIndex = 0;
    for (let pos=0; pos<file.size; pos+=chunkSize) {
      const end = Math.min(file.size, pos + chunkSize);
      const buffer = await file.slice(pos, end).arrayBuffer();
      const chunk = decoder.decode(buffer, {stream:true});
      if (chunk) {
        result = await chrome.tabs.sendMessage(tab.id, {action:'load-chat-chunk', chunk});
        if (!result?.ok) throw new Error(popupTr('overlayStoppedReceiving'));
      }
      chunkIndex++;
      if ((chunkIndex & 7) === 0 || end === file.size) {
        const percent = Math.min(100, Math.round(end / Math.max(1, file.size) * 100));
        document.getElementById('file-status').textContent = popupTr('loadingProgress', {file:file.name, percent});
      }
      // Let the extension popup/browser paint between large IPC operations.
      await new Promise(resolve => setTimeout(resolve, 2));
    }
    const decoderTail = decoder.decode();
    if (decoderTail) {
      result = await chrome.tabs.sendMessage(tab.id, {action:'load-chat-chunk', chunk:decoderTail});
      if (!result?.ok) throw new Error(popupTr('overlayStoppedReceivingFinal'));
    }
    result = await chrome.tabs.sendMessage(tab.id, {action:'load-chat-complete'});
    if (!result?.ok) throw new Error(result?.error || popupTr('overlayLoadError'));
    if (Number.isFinite(Number(result.offset))) {
      const finalOffset = Number(result.offset);
      await chrome.storage.local.set({offset:finalOffset});
      setOffsetUI(finalOffset);
    }
    setFileState(true, file.name);
  } catch (err) {
    if (err?.name === 'AbortError') return;
    console.error(err);
    document.getElementById('file-status').textContent = err.message || String(err);
  } finally {
    toolbarLoadInProgress = false;
  }
}

async function loadSettings() {
  const saved = await chrome.storage.local.get({
    language:'en', cleanChat:false, showTimestamps:true, purpleMessages:true, hideScrollbar:false, hideChatFrame:false, opacity:94, splitColor:'#563e76', offset:0
  });
  buildLanguageOptions(saved.language);
  document.getElementById('clean-chat').checked = saved.cleanChat === true;
  document.getElementById('show-timestamps').checked = saved.showTimestamps !== false;
  document.getElementById('split-messages').checked = saved.purpleMessages !== false;
  document.getElementById('hide-scrollbar').checked = saved.hideScrollbar === true;
  document.getElementById('hide-chat-frame').checked = saved.hideChatFrame === true;
  const savedOpacity = Number(saved.opacity);
  document.getElementById('opacity').value = String(Number.isFinite(savedOpacity) ? Math.max(0, Math.min(100, savedOpacity)) : 94);
  document.getElementById('opacity-value').textContent = `${document.getElementById('opacity').value}%`;
  const savedSplitColor = /^#[0-9a-fA-F]{6}$/.test(String(saved.splitColor || '')) ? String(saved.splitColor).toLowerCase() : '#563e76';
  document.getElementById('split-color').value = savedSplitColor;
  setOffsetUI(saved.offset);
  applyLanguage(saved.language);

  const storedHandle = await getStoredChatHandle();
  if (storedHandle) {
    try {
      const file = await storedHandle.getFile();
      setFileState(true, file.name);
      try { storedWritePermission = await storedHandle.queryPermission({mode:'readwrite'}); } catch { storedWritePermission = 'unknown'; }
    } catch {}
  }

  const state = await sendToContent({action:'get-state'});
  if (state?.ok) {
    if (state.hasChat && Number.isFinite(Number(state.offset))) setOffsetUI(Number(state.offset));
    if (state.hasChat) setFileState(true, state.chatFileName || '');
  }
}

async function setCleanChat(enabled) {
  const value = enabled === true;
  await chrome.storage.local.set({cleanChat: value});
  await sendToContent({action:'set-clean-chat', enabled:value});
}

async function setShowTimestamps(enabled) {
  const value = enabled === true;
  await chrome.storage.local.set({showTimestamps: value});
  await sendToContent({action:'set-show-timestamps', enabled:value});
}

async function setSplitMessages(enabled) {
  const value = enabled === true;
  await chrome.storage.local.set({purpleMessages: value});
  await sendToContent({action:'set-purple-messages', enabled:value});
}

async function setHideChatFrame(enabled) {
  const value = enabled === true;
  await chrome.storage.local.set({hideChatFrame: value});
  await sendToContent({action:'set-hide-chat-frame', enabled:value});
}

async function setHideScrollbar(enabled) {
  const value = enabled === true;
  await chrome.storage.local.set({hideScrollbar: value});
  await sendToContent({action:'set-hide-scrollbar', enabled:value});
}

async function setOpacity(value) {
  const raw = Number(value);
  const n = Number.isFinite(raw) ? Math.max(0, Math.min(100, raw)) : 94;
  await chrome.storage.local.set({opacity:n});
  document.getElementById('opacity').value = String(n);
  document.getElementById('opacity-value').textContent = `${n}%`;
  await sendToContent({action:'set-opacity', opacity:n});
}

async function setSplitColor(value) {
  const color = /^#[0-9a-fA-F]{6}$/.test(String(value || '')) ? String(value).toLowerCase() : '#563e76';
  document.getElementById('split-color').value = color;
  await chrome.storage.local.set({splitColor: color});
  await sendToContent({action:'set-split-color', color});
}

async function applyOffset() {
  const parsed = parseOffset(document.getElementById('offset').value);
  if (!Number.isFinite(parsed)) return;
  await chrome.storage.local.set({offset:parsed});
  const result = await sendToContent({action:'set-offset', offset:parsed});
  setOffsetUI(result?.ok ? result.offset : parsed);
}

async function nudgeOffset(delta) {
  const current = parseOffset(document.getElementById('offset').value);
  const base = Number.isFinite(current) ? current : 0;
  const next = base + delta;
  await chrome.storage.local.set({offset:next});
  const result = await sendToContent({action:'set-offset', offset:next});
  setOffsetUI(result?.ok ? result.offset : next);
}

async function openChat() {
  await loadChatFromPopup();
}

async function saveOffset() {
  const statusEl = document.getElementById('file-status');
  const parsed = parseOffset(document.getElementById('offset').value);
  if (!Number.isFinite(parsed)) {
    statusEl.textContent = popupTr('invalidOffset');
    return;
  }

  // Do not await IndexedDB before asking for write permission. Chrome requires
  // requestPermission() to run from a user gesture. The handle is cached while
  // the popup initializes or immediately when Load chat is used.
  const handle = storedChatHandle;
  if (!handle) {
    statusEl.textContent = popupTr('noChatToolbar');
    return;
  }

  try {
    const permissionPromise = handle.requestPermission({mode:'readwrite'});
    const permission = await permissionPromise;
    storedWritePermission = permission;
    if (permission !== 'granted') {
      statusEl.textContent = popupTr('writePermission');
      return;
    }

    const fileName = await writeOffsetToHandle(handle, parsed);
    await chrome.storage.local.set({offset:parsed});
    const result = await sendToContent({action:'set-offset', offset:parsed});
    const offset = result?.ok ? Number(result.offset) : parsed;
    await chrome.storage.local.set({offset});
    setOffsetUI(offset);
    setFileState(true, fileName);
    document.getElementById('file-status').textContent = popupTr('savedTo', {offset:formatOffset(offset), file:fileName});
  } catch (err) {
    console.error(err);
    document.getElementById('file-status').textContent = err.message || String(err);
  }
}

document.getElementById('open').addEventListener('click', () => setChatVisibility(true));
document.getElementById('hide').addEventListener('click', () => setChatVisibility(false));
document.getElementById('load-chat').addEventListener('click', openChat);
document.getElementById('save-offset').addEventListener('click', saveOffset);
document.getElementById('offset-apply').addEventListener('click', applyOffset);
document.getElementById('offset').addEventListener('keydown', (e) => { if (e.key === 'Enter') applyOffset(); });
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
  const cancelPointer = () => {
    pointerGesture = false;
    suppressClick = false;
    clearTimers();
  };
  button.addEventListener('pointerup', endPointer);
  button.addEventListener('pointercancel', cancelPointer);

  button.addEventListener('click', () => {
    if (suppressClick) {
      suppressClick = false;
      return;
    }
    nudgeOffset(direction);
  });
}

bindAcceleratingNudge(document.getElementById('offset-up'), 1);
bindAcceleratingNudge(document.getElementById('offset-down'), -1);
document.getElementById('clean-chat').addEventListener('change', (e) => setCleanChat(e.target.checked));
document.getElementById('show-timestamps').addEventListener('change', (e) => setShowTimestamps(e.target.checked));
document.getElementById('split-messages').addEventListener('change', (e) => setSplitMessages(e.target.checked));
document.getElementById('hide-scrollbar').addEventListener('change', (e) => setHideScrollbar(e.target.checked));
document.getElementById('hide-chat-frame').addEventListener('change', (e) => setHideChatFrame(e.target.checked));
document.getElementById('opacity').addEventListener('input', (e) => setOpacity(e.target.value));
document.getElementById('split-color').addEventListener('input', (e) => setSplitColor(e.target.value));
document.getElementById('split-color-reset').addEventListener('click', () => setSplitColor('#563e76'));
document.getElementById('language').addEventListener('change', async (e) => {
  const language = I18N.languages[e.target.value] ? e.target.value : 'en';
  await chrome.storage.local.set({language});
  applyLanguage(language);
  await sendToContent({action:'set-language', language});
});

chrome.storage.onChanged?.addListener(async (changes, areaName) => {
  if (areaName !== 'local') return;
  if (changes.cleanChat) document.getElementById('clean-chat').checked = changes.cleanChat.newValue === true;
  if (changes.showTimestamps) document.getElementById('show-timestamps').checked = changes.showTimestamps.newValue !== false;
  if (changes.purpleMessages) document.getElementById('split-messages').checked = changes.purpleMessages.newValue !== false;
  if (changes.hideScrollbar) document.getElementById('hide-scrollbar').checked = changes.hideScrollbar.newValue === true;
  if (changes.hideChatFrame) document.getElementById('hide-chat-frame').checked = changes.hideChatFrame.newValue === true;
  if (changes.opacity) {
    const raw = Number(changes.opacity.newValue);
    const n = Number.isFinite(raw) ? Math.max(0, Math.min(100, raw)) : 94;
    document.getElementById('opacity').value = String(n);
    document.getElementById('opacity-value').textContent = `${n}%`;
  }
  if (changes.splitColor) {
    const color = /^#[0-9a-fA-F]{6}$/.test(String(changes.splitColor.newValue || '')) ? String(changes.splitColor.newValue).toLowerCase() : '#563e76';
    document.getElementById('split-color').value = color;
  }
  if (changes.offset && Number.isFinite(Number(changes.offset.newValue))) {
    setOffsetUI(Number(changes.offset.newValue));
  }
  if (changes.language) {
    buildLanguageOptions(changes.language.newValue);
    applyLanguage(changes.language.newValue);
  }
  if (changes.chatVisible) { /* visibility buttons intentionally remain static */ }
  if (toolbarLoadInProgress) return;
  const state = await sendToContent({action:'get-state'});
  if (state?.ok) {
    if (state.hasChat && Number.isFinite(Number(state.offset))) setOffsetUI(Number(state.offset));
    setFileState(state.hasChat, state.chatFileName || '');
  }
});

loadSettings();
