// war-room.js
//
// War Room (live per-match chat: text, images, video, voice notes,
// stickers, reactions, presence/heartbeat) — split out of app.js so this
// (~27KB) only downloads for users who actually tap "Join War Room" on a
// live match, not on every app load.
//
// LOADED VIA DYNAMIC import() FROM app.js — app.js stays a classic
// script (see match-detail.js's header comment for the full reasoning).
// Unlike match-detail.js, this module GENERATES ITS OWN HTML with
// onclick="..." attributes (the chat overlay, message action sheet,
// sticker picker, etc.) — that HTML doesn't exist until this module has
// already loaded and run injectWarRoom(), so the functions those
// attributes reference are assigned directly onto `window` at the
// bottom of this file, once, on first load — no lazy-stub indirection
// needed for those (unlike app.js's openWarRoom/closeWarRoom stubs,
// which DO need to exist before this module has necessarily loaded,
// since the button that calls them is created by app.js's eager
// "HOOK WAR ROOM INTO LIVE MATCH TAPS" section).
//
// window.STICKERS_FOOTBALL/REACTIONS/CELEBRATIONS: app.js declares these
// with top-level `const`, which — like `let lsData` — does NOT attach to
// `window` automatically, and this module can't see a classic script's
// const bindings either. app.js mirrors them onto `window` once, right
// after their declaration (they're never reassigned, so a one-time
// mirror is enough, unlike lsData which needs re-mirroring on every
// reassignment). If you ever see "STICKERS_FOOTBALL is not defined"
// after editing app.js, check that mirror is still there.
//
// Everything below is otherwise UNCHANGED from its original place in
// app.js — only `export` was added, and the sticker constants now read
// via `window.` explicitly.

/* ═══════════════════════════════════════════
   INJECT WAR ROOM HTML OVERLAY
═══════════════════════════════════════════ */
export function injectWarRoom() {
  const div = document.createElement('div');
  div.id = 'war-room-overlay';
  div.innerHTML = `
    <div class="wr-hdr">
      <button class="wr-close" onclick="closeWarRoom()">
        <svg width="20" height="20" fill="none" stroke="currentColor" stroke-width="2.5" viewBox="0 0 24 24"><path d="M18 6 6 18M6 6l12 12"/></svg>
      </button>
      <div class="wr-title" id="wr-match-title">WAR ROOM</div>
      <div class="wr-live-tag">🔴 LIVE</div>
    </div>
    <div class="wr-online-bar">
      <div style="width:7px;height:7px;border-radius:50%;background:#34d399;animation:blink 1s infinite;"></div>
      <span id="wr-online-count">0 watching</span>
      <span style="margin-left:auto;color:rgba(255,255,255,0.3);">Live Match Chat</span>
    </div>
    <div class="wr-body" id="wr-body"></div>

    <div class="wr-sticker-picker" id="wr-sticker-picker">
      <div class="wr-sticker-tabs" id="wr-sticker-tabs"></div>
      <div class="wr-sticker-grid" id="wr-sticker-grid"></div>
    </div>

    <div class="wr-reply-bar" id="wr-reply-bar">
      <div class="wr-reply-bar-line">
        <div class="wr-reply-bar-name" id="wr-reply-bar-name"></div>
        <div class="wr-reply-bar-text" id="wr-reply-bar-text"></div>
      </div>
      <button class="wr-reply-bar-cancel" onclick="clearWarRoomReply()">✕</button>
    </div>

    <div class="wr-upload-status" id="wr-upload-status" style="display:none;"></div>

    <div class="wr-input-bar">
      <input type="file" id="wr-file-input" accept="image/*,video/*" style="display:none;" onchange="wrHandleFileSelected(event)">
      <button class="wr-icon-btn" onclick="document.getElementById('wr-file-input').click()" title="Attach photo or video">
        <svg width="20" height="20" fill="currentColor" viewBox="0 0 24 24"><path d="M16.5 6v11.5a4 4 0 0 1-8 0V5a2.5 2.5 0 0 1 5 0v10.5a1 1 0 0 1-2 0V6H10v9.5a2.5 2.5 0 0 0 5 0V5a4 4 0 0 0-8 0v12.5a5.5 5.5 0 0 0 11 0V6h-1.5z"/></svg>
      </button>
      <button class="wr-icon-btn" onclick="wrToggleStickerPicker()" title="Stickers">
        <svg width="20" height="20" fill="currentColor" viewBox="0 0 24 24"><path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zM8.5 9.5a1.5 1.5 0 1 1 0 3 1.5 1.5 0 0 1 0-3zm7 0a1.5 1.5 0 1 1 0 3 1.5 1.5 0 0 1 0-3zM12 18.5c-2.33 0-4.31-1.46-5.11-3.5h10.22c-.8 2.04-2.78 3.5-5.11 3.5z"/></svg>
      </button>
      <input type="text" class="wr-input" id="wr-input" placeholder="Say something about the match…" maxlength="500">
      <span class="wr-recording-timer" id="wr-recording-timer" style="display:none;"></span>
      <button class="wr-icon-btn" id="wr-mic-btn" onclick="wrToggleRecording()" title="Record voice note">
        <svg width="20" height="20" fill="currentColor" viewBox="0 0 24 24"><path d="M12 14a3 3 0 0 0 3-3V6a3 3 0 0 0-6 0v5a3 3 0 0 0 3 3zm5-3a5 5 0 0 1-10 0H5a7 7 0 0 0 6 6.92V21h2v-3.08A7 7 0 0 0 19 11h-2z"/></svg>
      </button>
      <button class="wr-send-btn" onclick="sendWarRoomMsg()">
        <svg width="18" height="18" fill="white" viewBox="0 0 24 24"><path d="M2.01 21L23 12 2.01 3 2 10l15 2-15 2z"/></svg>
      </button>
    </div>

    <div class="wr-action-sheet-backdrop" id="wr-action-backdrop" onclick="wrCloseMsgActions()"></div>
    <div class="wr-action-sheet" id="wr-action-sheet" style="display:none;"></div>`;
  document.body.appendChild(div);
}
/* ═══════════════════════════════════════════
   WAR ROOM — Live Match Chat (REAL, Firestore-backed)
   Path: match_chats/{matchId}/messages/{messageId}
   Presence heartbeats: match_chats/{matchId}/presence/{uid}
   Supports: text, images, video, voice notes, stickers, reply, forward
═══════════════════════════════════════════ */
export let warRoomMatchId       = null;
export let warRoomMsgsUnsub     = null;
export let warRoomPresenceUnsub = null;
export let warRoomHeartbeatTimer= null;
export let warRoomReplyTo       = null;  // { id, user, text }
export let _wrMsgsById          = {};    // last-rendered messages, keyed by id (for action sheet / forward)
export let _wrActionTargetId    = null;

export const WR_PRESENCE_HEARTBEAT_MS = 20000; // send a heartbeat every 20s while open
export const WR_PRESENCE_STALE_MS     = 45000; // a user counts as "watching" if seen in last 45s
export const WR_STICKER_SETS = { football: window.STICKERS_FOOTBALL, reactions: window.STICKERS_REACTIONS, celebrations: window.STICKERS_CELEBRATIONS };

// Your real, chosen display name for War Room — delegates to the shared
// getUserDisplayName() helper (defined near profileData) so this stays in
// sync with the rest of the app instead of duplicating the fallback logic.
export function _wrDisplayName() {
  const currentUser = window._psCurrentUser || window._psAuth?.currentUser;
  return getUserDisplayName(currentUser);
}

export function _wrTimeAgo(ms) {
  if (!ms) return 'now';
  const diff = Math.max(0, Date.now() - ms);
  const s = Math.floor(diff / 1000);
  if (s < 5) return 'now';
  if (s < 60) return `${s}s ago`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  return `${h}h ago`;
}

export function _wrEnsureFirestore(onReady, attempt) {
  attempt = attempt || 0;
  const fsApi = window._psFs;
  const db = window._psDb;
  if (fsApi && db && fsApi.onSnapshot) { onReady(fsApi, db); return; }
  if (attempt >= 30) { console.warn('[WarRoom] Firestore never became ready'); return; }
  setTimeout(() => _wrEnsureFirestore(onReady, attempt + 1), 1000);
}

export function openWarRoom(matchId, matchTitle) {
  warRoomMatchId = matchId || 'live-match';
  warRoomReplyTo = null;
  clearWarRoomReply();
  const overlay  = document.getElementById('war-room-overlay');
  if (!overlay) return;
  overlay.classList.add('active');

  const titleEl = document.getElementById('wr-match-title');
  const countEl = document.getElementById('wr-online-count');
  if (titleEl) titleEl.textContent = (matchTitle || 'LIVE MATCH').toUpperCase();
  if (countEl) countEl.textContent = 'connecting…';

  const body = document.getElementById('wr-body');
  if (body) body.innerHTML = '<div style="text-align:center;color:rgba(255,255,255,0.4);padding:24px;font-size:13px;">Connecting to live chat…</div>';

  // Tear down any previous match's listeners before attaching new ones
  _warRoomTeardownListeners();

  _wrEnsureFirestore((fsApi, db) => {
    // Bail if the user already switched matches or closed the room
    if (warRoomMatchId !== matchId && warRoomMatchId !== (matchId || 'live-match')) return;

    const { collection, doc, query, orderBy, limit, onSnapshot, setDoc, serverTimestamp } = fsApi;

    // ── Live messages ──
    const msgsQ = query(
      collection(db, 'match_chats', warRoomMatchId, 'messages'),
      orderBy('createdAt', 'desc'),
      limit(60)
    );
    warRoomMsgsUnsub = onSnapshot(msgsQ, snap => {
      const msgs = snap.docs.map(d => {
        const data = d.data() || {};
        const ts = data.createdAt && data.createdAt.toMillis ? data.createdAt.toMillis() : Date.now();
        return {
          id: d.id,
          uid: data.uid || '',
          user: data.displayName || 'Fan',
          avatarUrl: data.avatarUrl || null,
          text: data.text || '',
          type: data.type || 'text',
          mediaUrl: data.mediaUrl || null,
          thumbnailUrl: data.thumbnailUrl || null,
          duration: data.duration || null,
          replyTo: data.replyTo || null,
          ts
        };
      }).reverse(); // oldest first for display
      renderWarRoomMessages(msgs);
    }, err => {
      console.warn('[WarRoom] messages listener error:', err);
      if (body) body.innerHTML = '<div style="text-align:center;color:rgba(255,255,255,0.4);padding:24px;font-size:13px;">Couldn\'t load chat. Check your connection.</div>';
    });

    // ── Presence heartbeat (this device) ──
    const currentUser = window._psCurrentUser || window._psAuth?.currentUser;
    if (currentUser?.uid) {
      const sendHeartbeat = () => {
        setDoc(doc(db, 'match_chats', warRoomMatchId, 'presence', currentUser.uid), {
          lastSeen: serverTimestamp(),
          displayName: _wrDisplayName()
        }).catch(e => console.warn('[WarRoom] heartbeat failed:', e));
      };
      sendHeartbeat();
      clearInterval(warRoomHeartbeatTimer);
      warRoomHeartbeatTimer = setInterval(sendHeartbeat, WR_PRESENCE_HEARTBEAT_MS);
    }

    // ── Presence listener (everyone) ──
    warRoomPresenceUnsub = onSnapshot(
      collection(db, 'match_chats', warRoomMatchId, 'presence'),
      snap => {
        const now = Date.now();
        let active = 0;
        snap.forEach(d => {
          const data = d.data() || {};
          const ts = data.lastSeen && data.lastSeen.toMillis ? data.lastSeen.toMillis() : 0;
          if (now - ts < WR_PRESENCE_STALE_MS) active++;
        });
        if (countEl) countEl.textContent = `${active.toLocaleString()} watching`;
      },
      err => console.warn('[WarRoom] presence listener error:', err)
    );
  });
}

export function _warRoomTeardownListeners() {
  if (warRoomMsgsUnsub)     { warRoomMsgsUnsub(); warRoomMsgsUnsub = null; }
  if (warRoomPresenceUnsub) { warRoomPresenceUnsub(); warRoomPresenceUnsub = null; }
  if (warRoomHeartbeatTimer){ clearInterval(warRoomHeartbeatTimer); warRoomHeartbeatTimer = null; }
  if (_wrMediaRecorder && _wrMediaRecorder.state !== 'inactive') { try { _wrMediaRecorder.stop(); } catch(e){} }
}

export function closeWarRoom() {
  const overlay = document.getElementById('war-room-overlay');
  if (overlay) overlay.classList.remove('active');
  _warRoomTeardownListeners();
  warRoomMatchId = null;
  clearWarRoomReply();
  wrCloseMsgActions();
  const picker = document.getElementById('wr-sticker-picker');
  if (picker) picker.classList.remove('active');
}

export function renderWarRoomMessages(msgs) {
  const body = document.getElementById('wr-body');
  if (!body) return;
  const currentUser = window._psCurrentUser || window._psAuth?.currentUser;
  const myUid = currentUser?.uid || '';

  _wrMsgsById = {};
  msgs.forEach(m => { _wrMsgsById[m.id] = m; });

  if (!msgs.length) {
    body.innerHTML = '<div style="text-align:center;color:rgba(255,255,255,0.35);padding:24px;font-size:13px;">No messages yet — be the first to say something 👋</div>';
    return;
  }

  body.innerHTML = '';
  msgs.forEach(m => {
    const mine = !!myUid && m.uid === myUid;
    const msgDiv = document.createElement('div');
    msgDiv.className = 'wr-msg' + (mine ? ' mine' : '');

    const avatarDiv = document.createElement('div');
    avatarDiv.className = 'wr-avatar';
    if (m.avatarUrl) {
      avatarDiv.innerHTML = `<img src="${m.avatarUrl}" style="width:100%;height:100%;object-fit:cover;border-radius:50%;">`;
    } else {
      avatarDiv.textContent = _wrInitials(m.user);
    }

    const colDiv = document.createElement('div');
    colDiv.className = 'wr-bubble-col';

    if (!mine) {
      const nameDiv = document.createElement('div');
      nameDiv.className = 'wr-bubble-name';
      nameDiv.textContent = m.user;
      colDiv.appendChild(nameDiv);
    }

    const bubbleDiv = document.createElement('div');
    bubbleDiv.className = 'wr-bubble' + (m.type === 'sticker' ? ' wr-sticker-bubble' : '');
    bubbleDiv.onclick = () => wrShowMsgActions(m.id);

    // Reply quote, if any
    if (m.replyTo) {
      const quote = document.createElement('div');
      quote.className = 'wr-reply-quote';
      const qName = document.createElement('div');
      qName.className = 'wr-reply-quote-name';
      qName.textContent = m.replyTo.user || 'Fan';
      const qText = document.createElement('div');
      qText.className = 'wr-reply-quote-text';
      qText.textContent = m.replyTo.text || '';
      quote.appendChild(qName);
      quote.appendChild(qText);
      bubbleDiv.appendChild(quote);
    }

    if (m.type === 'image' && m.mediaUrl) {
      const img = document.createElement('img');
      img.className = 'wr-media-img';
      img.src = m.mediaUrl;
      img.loading = 'lazy';
      bubbleDiv.appendChild(img);
      if (m.text) {
        const txt = document.createElement('div');
        txt.textContent = m.text;
        bubbleDiv.appendChild(txt);
      }
    } else if (m.type === 'video' && m.mediaUrl) {
      const vid = document.createElement('video');
      vid.className = 'wr-media-video';
      vid.src = m.mediaUrl;
      vid.controls = true;
      vid.playsInline = true;
      if (m.thumbnailUrl) vid.poster = m.thumbnailUrl;
      bubbleDiv.appendChild(vid);
    } else if (m.type === 'voice' && m.mediaUrl) {
      const row = document.createElement('div');
      row.className = 'wr-voice-row';
      const audio = document.createElement('audio');
      audio.src = m.mediaUrl;
      audio.controls = true;
      row.appendChild(audio);
      bubbleDiv.appendChild(row);
    } else if (m.type === 'sticker') {
      bubbleDiv.textContent = m.text;
    } else {
      bubbleDiv.appendChild(document.createTextNode(m.text));
    }

    const timeDiv = document.createElement('div');
    timeDiv.className = 'wr-time';
    timeDiv.textContent = _wrTimeAgo(m.ts);

    colDiv.appendChild(bubbleDiv);
    colDiv.appendChild(timeDiv);
    msgDiv.appendChild(avatarDiv);
    msgDiv.appendChild(colDiv);
    body.appendChild(msgDiv);
  });
  body.scrollTop = body.scrollHeight;
}

/* ── Sending (shared helper for text / media / sticker) ── */
export function _wrSendMessage(fields) {
  if (!warRoomMatchId) return;
  const currentUser = window._psCurrentUser || window._psAuth?.currentUser;
  if (!currentUser?.uid) { showToast('Sign in to join the chat'); return; }

  const fsApi = window._psFs;
  const db = window._psDb;
  if (!fsApi || !db || !fsApi.addDoc) { showToast('Chat is still connecting — try again in a moment'); return; }

  const { collection, addDoc, serverTimestamp } = fsApi;
  const payload = Object.assign({
    uid: currentUser.uid,
    displayName: _wrDisplayName(),
    avatarUrl: (typeof profileData !== 'undefined' && profileData.avatarUrl) || null,
    createdAt: serverTimestamp()
  }, fields);
  if (warRoomReplyTo) payload.replyTo = warRoomReplyTo;

  addDoc(collection(db, 'match_chats', warRoomMatchId, 'messages'), payload).catch(e => {
    console.warn('[WarRoom] send failed:', e);
    showToast('Message failed to send — try again');
  });

  clearWarRoomReply();
}

export function sendWarRoomMsg() {
  const inp = document.getElementById('wr-input');
  if (!inp) return;
  const text = inp.value.trim();
  if (!text) return;
  inp.value = ''; // optimistic clear; the real message arrives via onSnapshot
  _wrSendMessage({ type: 'text', text: text.slice(0, 500) });
}

document.addEventListener('keydown', e => {
  const inp = document.getElementById('wr-input');
  if (inp && e.key === 'Enter' && document.activeElement === inp) sendWarRoomMsg();
});

/* ── Reply ── */
export function setWarRoomReply(msg) {
  warRoomReplyTo = { user: msg.user, text: msg.type === 'text' ? msg.text : `[${msg.type}]` };
  const bar = document.getElementById('wr-reply-bar');
  const nameEl = document.getElementById('wr-reply-bar-name');
  const textEl = document.getElementById('wr-reply-bar-text');
  if (nameEl) nameEl.textContent = warRoomReplyTo.user;
  if (textEl) textEl.textContent = warRoomReplyTo.text;
  if (bar) bar.classList.add('active');
  const inp = document.getElementById('wr-input');
  if (inp) inp.focus();
}
export function clearWarRoomReply() {
  warRoomReplyTo = null;
  const bar = document.getElementById('wr-reply-bar');
  if (bar) bar.classList.remove('active');
}

/* ── Message action sheet (Reply / Forward / Delete) ── */
export function wrShowMsgActions(msgId) {
  _wrActionTargetId = msgId;
  const msg = _wrMsgsById[msgId];
  const currentUser = window._psCurrentUser || window._psAuth?.currentUser;
  const isMine = !!msg && !!currentUser?.uid && msg.uid === currentUser.uid;

  const sheet = document.getElementById('wr-action-sheet');
  const backdrop = document.getElementById('wr-action-backdrop');
  if (sheet) {
    sheet.innerHTML = `
      <div class="wr-action-item" onclick="wrReplyToSelected()">↩️ Reply</div>
      <div class="wr-action-item" onclick="wrForwardSelected()">➡️ Forward</div>
      ${isMine ? '<div class="wr-action-item" style="color:#f43f5e;" onclick="wrDeleteSelected()">🗑️ Delete for everyone</div>' : ''}
      <div class="wr-action-item" onclick="wrCloseMsgActions()">Cancel</div>`;
    sheet.style.display = 'block';
  }
  if (backdrop) backdrop.classList.add('active');
}
export function wrCloseMsgActions() {
  _wrActionTargetId = null;
  const backdrop = document.getElementById('wr-action-backdrop');
  const sheet = document.getElementById('wr-action-sheet');
  if (backdrop) backdrop.classList.remove('active');
  if (sheet) sheet.style.display = 'none';
}
export function wrReplyToSelected() {
  const msg = _wrMsgsById[_wrActionTargetId];
  wrCloseMsgActions();
  if (msg) setWarRoomReply(msg);
}
export function wrForwardSelected() {
  const msg = _wrMsgsById[_wrActionTargetId];
  wrCloseMsgActions();
  if (!msg) return;
  const shareText = msg.type === 'text' ? msg.text : (msg.mediaUrl || msg.text || '');
  const shareData = { title: 'PitchSide War Room', text: `${msg.user}: ${shareText}` };
  if (msg.mediaUrl) shareData.url = msg.mediaUrl;
  if (navigator.share) {
    navigator.share(shareData).catch(() => {});
  } else if (navigator.clipboard) {
    navigator.clipboard.writeText(`${shareData.text}${msg.mediaUrl ? ' ' + msg.mediaUrl : ''}`);
    showToast('Copied — paste it anywhere to forward');
  } else {
    showToast('Forwarding isn\'t supported on this browser');
  }
}
export function wrDeleteSelected() {
  const msg = _wrMsgsById[_wrActionTargetId];
  wrCloseMsgActions();
  if (!msg || !warRoomMatchId) return;

  const currentUser = window._psCurrentUser || window._psAuth?.currentUser;
  if (!currentUser?.uid || msg.uid !== currentUser.uid) return; // safety check, mirrors Firestore rule

  const fsApi = window._psFs;
  const db = window._psDb;
  if (!fsApi || !db || !fsApi.deleteDoc || !fsApi.doc) {
    showToast('Delete isn\'t available yet — deleteDoc isn\'t exposed on window._psFs');
    return;
  }
  const { doc, deleteDoc } = fsApi;
  deleteDoc(doc(db, 'match_chats', warRoomMatchId, 'messages', msg.id)).catch(e => {
    console.warn('[WarRoom] delete failed:', e);
    showToast('Could not delete message — try again');
  });
}

/* ── Media attach (images & video) ── */
export function wrHandleFileSelected(event) {
  const file = event.target.files && event.target.files[0];
  event.target.value = '';
  if (!file || !warRoomMatchId) return;

  const isVideo = file.type.startsWith('video/');
  const isImage = file.type.startsWith('image/');
  if (!isVideo && !isImage) { showToast('Only photos and videos are supported'); return; }

  const MAX_MB = isVideo ? 100 : 15;
  if (file.size > MAX_MB * 1024 * 1024) { showToast(`File too large (max ${MAX_MB}MB)`); return; }

  const statusEl = document.getElementById('wr-upload-status');
  if (statusEl) { statusEl.style.display = 'block'; statusEl.textContent = 'Uploading…'; }

  const uploadPromise = isVideo ? _wrUploadVideo(file, statusEl) : _wrUploadImage(file);
  uploadPromise.then(result => {
    if (statusEl) statusEl.style.display = 'none';
    if (isVideo) {
      _wrSendMessage({ type: 'video', mediaUrl: result.url, thumbnailUrl: result.thumbnail || null, text: '' });
    } else {
      _wrSendMessage({ type: 'image', mediaUrl: result.url, text: '' });
    }
  }).catch(e => {
    console.warn('[WarRoom] upload failed:', e);
    if (statusEl) statusEl.style.display = 'none';
    showToast('Upload failed — try again');
  });
}

export function _wrUploadImage(file) {
  return new Promise(async (resolve, reject) => {
    try {
      const presignRes = await fetch('/api/r2-upload-url', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          fileName: file.name,
          fileType: file.type,
          uploaderId: (window._psCurrentUser && window._psCurrentUser.uid) || 'anon',
        }),
      });
      const presignData = await presignRes.json();
      if (!presignRes.ok || !presignData.uploadUrl) {
        reject(new Error(presignData.error || 'Could not get upload URL'));
        return;
      }
      const putRes = await fetch(presignData.uploadUrl, {
        method: 'PUT',
        headers: { 'Content-Type': file.type },
        body: file
      });
      if (!putRes.ok) { reject(new Error('Upload failed: ' + putRes.status)); return; }
      resolve({ url: presignData.publicUrl });
    } catch (e) { reject(e); }
  });
}

export function _wrUploadVideo(file, statusEl) {
  return new Promise(async (resolve, reject) => {
    try {
      const presignRes = await fetch('/api/stream-upload-url', { method: 'POST' });
      const presignData = await presignRes.json();
      if (!presignRes.ok || !presignData.uploadURL) {
        reject(new Error(presignData.error || 'Could not get Stream upload URL'));
        return;
      }
      const form = new FormData();
      form.append('file', file);
      const xhr = new XMLHttpRequest();
      xhr.upload.onprogress = (e) => {
        if (e.lengthComputable && statusEl) {
          statusEl.textContent = `Uploading… ${Math.round((e.loaded / e.total) * 100)}%`;
        }
      };
      xhr.onload = async () => {
        if (xhr.status < 200 || xhr.status >= 300) { reject(new Error('Upload failed: ' + xhr.status)); return; }
        try {
          if (statusEl) statusEl.textContent = 'Processing video…';
          const ready = await _wrPollStreamReady(presignData.uid, statusEl);
          resolve({ url: ready.hlsUrl, thumbnail: ready.thumbnail });
        } catch (e) { reject(e); }
      };
      xhr.onerror = () => reject(new Error('Network error during upload'));
      xhr.open('POST', presignData.uploadURL);
      xhr.send(form);
    } catch (e) { reject(e); }
  });
}

export function _wrPollStreamReady(uid, statusEl, attempt) {
  attempt = attempt || 0;
  return new Promise((resolve, reject) => {
    const poll = async () => {
      try {
        const r = await fetch(`/api/stream-status?uid=${encodeURIComponent(uid)}`);
        const data = await r.json();
        if (!r.ok) { reject(new Error('Stream status error')); return; }
        if (data.state === 'error') { reject(new Error('Stream processing error')); return; }
        if (data.ready) { resolve(data); return; }
        if (attempt > 120) { reject(new Error('Video processing timed out')); return; } // ~5 min max
        if (statusEl) statusEl.textContent = 'Processing video… almost there';
        setTimeout(() => { _wrPollStreamReady(uid, statusEl, attempt + 1).then(resolve, reject); }, 2500);
      } catch (e) { reject(e); }
    };
    poll();
  });
}

/* ── Stickers ── */
export let _wrStickerBuilt = false;
export function wrToggleStickerPicker() {
  const picker = document.getElementById('wr-sticker-picker');
  if (!picker) return;
  if (!_wrStickerBuilt) _wrBuildStickerPicker();
  picker.classList.toggle('active');
}
export function _wrBuildStickerPicker() {
  const tabsEl = document.getElementById('wr-sticker-tabs');
  const gridEl = document.getElementById('wr-sticker-grid');
  if (!tabsEl || !gridEl) return;
  const setNames = { football: '⚽ Football', reactions: '🔥 Reactions', celebrations: '🎉 Celebrations' };
  const keys = Object.keys(WR_STICKER_SETS);
  tabsEl.innerHTML = keys.map((k, i) =>
    `<div class="wr-sticker-tab${i === 0 ? ' on' : ''}" data-set="${k}" onclick="_wrSelectStickerTab('${k}')">${setNames[k]}</div>`
  ).join('');
  _wrSelectStickerTab(keys[0]);
  _wrStickerBuilt = true;
}
export function _wrSelectStickerTab(setKey) {
  document.querySelectorAll('#wr-sticker-tabs .wr-sticker-tab').forEach(t => {
    t.classList.toggle('on', t.dataset.set === setKey);
  });
  const gridEl = document.getElementById('wr-sticker-grid');
  if (!gridEl) return;
  gridEl.innerHTML = (WR_STICKER_SETS[setKey] || []).map(emoji =>
    `<span onclick="wrSendSticker('${emoji}')">${emoji}</span>`
  ).join('');
}
export function wrSendSticker(emoji) {
  _wrSendMessage({ type: 'sticker', text: emoji });
  const picker = document.getElementById('wr-sticker-picker');
  if (picker) picker.classList.remove('active');
}

/* ── Voice notes ── */
export let _wrMediaRecorder  = null;
export let _wrRecordedChunks = [];
export let _wrRecordStart    = null;
export let _wrRecordTimer    = null;

export function wrToggleRecording() {
  if (_wrMediaRecorder && _wrMediaRecorder.state === 'recording') {
    _wrStopRecordingAndSend();
  } else {
    _wrStartRecording();
  }
}

export async function _wrStartRecording() {
  if (!warRoomMatchId) return;
  const currentUser = window._psCurrentUser || window._psAuth?.currentUser;
  if (!currentUser?.uid) { showToast('Sign in to join the chat'); return; }
  if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
    showToast('Voice notes aren\'t supported on this browser');
    return;
  }
  try {
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    _wrRecordedChunks = [];
    _wrMediaRecorder = new MediaRecorder(stream);
    _wrMediaRecorder.ondataavailable = e => { if (e.data.size > 0) _wrRecordedChunks.push(e.data); };
    _wrMediaRecorder.onstop = () => {
      stream.getTracks().forEach(t => t.stop());
      _wrUploadAndSendVoice();
    };
    _wrMediaRecorder.start();
    _wrRecordStart = Date.now();

    const micBtn = document.getElementById('wr-mic-btn');
    const timerEl = document.getElementById('wr-recording-timer');
    if (micBtn) micBtn.classList.add('recording');
    if (timerEl) timerEl.style.display = 'inline';
    _wrRecordTimer = setInterval(() => {
      const secs = Math.floor((Date.now() - _wrRecordStart) / 1000);
      if (timerEl) timerEl.textContent = `${String(Math.floor(secs / 60)).padStart(1,'0')}:${String(secs % 60).padStart(2,'0')}`;
      if (secs >= 120) _wrStopRecordingAndSend(); // 2 min cap
    }, 250);
  } catch (e) {
    console.warn('[WarRoom] mic access failed:', e);
    showToast('Microphone permission is needed for voice notes');
  }
}

export function _wrStopRecordingAndSend() {
  if (_wrMediaRecorder && _wrMediaRecorder.state === 'recording') _wrMediaRecorder.stop();
  clearInterval(_wrRecordTimer);
  _wrRecordTimer = null;
  const micBtn = document.getElementById('wr-mic-btn');
  const timerEl = document.getElementById('wr-recording-timer');
  if (micBtn) micBtn.classList.remove('recording');
  if (timerEl) { timerEl.style.display = 'none'; timerEl.textContent = ''; }
}

export function _wrUploadAndSendVoice() {
  const durationSec = _wrRecordStart ? Math.round((Date.now() - _wrRecordStart) / 1000) : 0;
  _wrRecordStart = null;
  if (!_wrRecordedChunks.length || durationSec < 1) return; // too short / aborted

  const blob = new Blob(_wrRecordedChunks, { type: 'audio/webm' });
  const file = new File([blob], `voice-${Date.now()}.webm`, { type: 'audio/webm' });

  const statusEl = document.getElementById('wr-upload-status');
  if (statusEl) { statusEl.style.display = 'block'; statusEl.textContent = 'Sending voice note…'; }

  _wrUploadImage(file) // generic R2 PUT flow works for any file type, not just images
    .then(result => {
      if (statusEl) statusEl.style.display = 'none';
      _wrSendMessage({ type: 'voice', mediaUrl: result.url, duration: durationSec, text: '' });
    })
    .catch(e => {
      console.warn('[WarRoom] voice upload failed:', e);
      if (statusEl) statusEl.style.display = 'none';
      showToast('Voice note failed to send — try again');
    });
}

// ── Module init (runs once, the first time this module is imported) ──
// Inject the overlay HTML now, so it exists before openWarRoom() (called
// by app.js's stub immediately after this module finishes loading) tries
// to reference elements like #wr-match-title.
injectWarRoom();

// Expose every function War Room's OWN generated HTML calls via
// onclick="..."/onchange="..." — these only ever get clicked after this
// module (and therefore these assignments) has already run, so plain
// direct assignment is safe here (unlike app.js's openWarRoom/
// closeWarRoom stubs, which must exist BEFORE this module has loaded).
window._wrSelectStickerTab = _wrSelectStickerTab;
window.clearWarRoomReply = clearWarRoomReply;
window.closeWarRoom = closeWarRoom;
window.sendWarRoomMsg = sendWarRoomMsg;
window.wrCloseMsgActions = wrCloseMsgActions;
window.wrDeleteSelected = wrDeleteSelected;
window.wrForwardSelected = wrForwardSelected;
window.wrReplyToSelected = wrReplyToSelected;
window.wrSendSticker = wrSendSticker;
window.wrToggleRecording = wrToggleRecording;
window.wrToggleStickerPicker = wrToggleStickerPicker;
window.wrHandleFileSelected = wrHandleFileSelected;
