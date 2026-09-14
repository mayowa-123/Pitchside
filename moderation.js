// moderation.js
//
// Content moderation: block/unblock users, report content, and the
// moderation action sheet UI — split out of app.js (~5KB) so this only
// downloads when someone actually taps a "⋯"/report/flag icon.
//
// LOADED VIA DYNAMIC import() FROM app.js — app.js stays a classic
// script (see match-detail.js's header comment for the full reasoning).
//
// NOTE: loadUserBlocks (which populates appState.blockedUsers via a
// live Firestore listener) is DELIBERATELY NOT part of this module — it
// runs eagerly on every auth-state change in app.js, since blocked-user
// filtering needs to be live from login, not gated behind opening the
// moderation sheet. Only the on-demand ACTIONS (_blockUser/_unblockUser/
// _reportContent) and the sheet UI itself moved here.
//
// _showModerationSheet is called from two places OUTSIDE this module
// (a comment's report button, and a user-list item's "⋯" button) —
// both reachable as soon as comments/user-lists render, potentially
// before this module has loaded — so it gets a PERMANENT STUB in app.js
// (the match-detail.js pattern). _blockUser, _unblockUser,
// _reportContent, _modSheetShowReasons, and _closeModerationSheet are
// only ever reached via onclick strings THIS module's own
// _showModerationSheet generates, so direct window assignment at the
// bottom of this file (the war-room.js pattern) is safe for those five.
//
// Everything below is otherwise UNCHANGED from its original place in
// app.js — only `export` was added.

export async function _blockUser(targetUserId, targetUserName) {
  const myUid = window._psCurrentUser && window._psCurrentUser.uid;
  if (!myUid) { showToast('Sign in to block users'); return; }
  if (myUid === targetUserId) return;

  const fsApi = window._psFs;
  const db = window._psDb;
  if (!fsApi || !db) return;

  try {
    await fsApi.setDoc(
      fsApi.doc(db, 'userBlocks', myUid),
      { blocked: fsApi.arrayUnion(targetUserId) },
      { merge: true }
    );
    showToast(`Blocked ${targetUserName || 'user'} — you won't see their posts or comments anymore`);
  } catch (e) {
    console.warn('[Blocks] block failed:', e);
    showToast('⚠️ Could not block — check your connection and try again');
  }
}

export async function _unblockUser(targetUserId, targetUserName) {
  const myUid = window._psCurrentUser && window._psCurrentUser.uid;
  if (!myUid) return;

  const fsApi = window._psFs;
  const db = window._psDb;
  if (!fsApi || !db) return;

  try {
    await fsApi.setDoc(
      fsApi.doc(db, 'userBlocks', myUid),
      { blocked: fsApi.arrayRemove(targetUserId) },
      { merge: true }
    );
    showToast(`Unblocked ${targetUserName || 'user'}`);
  } catch (e) {
    console.warn('[Blocks] unblock failed:', e);
    showToast('⚠️ Could not unblock — check your connection and try again');
  }
}

// ════════════════════════════════════════════════════════════════
// STEP 7.6: REPORT SYSTEM — writes to a reports collection for manual
// review. No auto-hide logic (that's easy to abuse via brigading) —
// this just gets the report in front of a human, which is the honest
// MVP version of this feature.
// ════════════════════════════════════════════════════════════════

export async function _reportContent(contentType, contentId, targetUserId, reason) {
  const myUid = window._psCurrentUser && window._psCurrentUser.uid;
  if (!myUid) { showToast('Sign in to report'); return; }
  if (!_checkRateLimit('report', 3000, 'Give it a moment before reporting again')) return;

  const fsApi = window._psFs;
  const db = window._psDb;
  if (!fsApi || !db) { showToast('⚠️ Reporting is not available right now'); return; }

  try {
    await fsApi.addDoc(fsApi.collection(db, 'reports'), {
      contentType,          // 'video' | 'comment' | 'user'
      contentId: String(contentId),
      targetUserId: targetUserId || null,
      reporterId: myUid,
      reason,
      status: 'pending',
      createdAt: fsApi.serverTimestamp(),
    });
    showToast('Report submitted — thanks for flagging this');
  } catch (e) {
    console.warn('[Report] submit failed:', e);
    showToast('⚠️ Could not submit report — check your connection and try again');
  }
}
export function _showModerationSheet({ contentType, contentId, targetUserId, targetUserName }) {
  const myUid = (window._psCurrentUser && window._psCurrentUser.uid) || null;
  const isSelf = myUid && targetUserId && myUid === targetUserId;
  const isBlocked = (appState.blockedUsers || []).includes(targetUserId);

  let sheet = document.getElementById('mod-sheet');
  let backdrop = document.getElementById('mod-sheet-backdrop');
  if (!sheet) {
    backdrop = document.createElement('div');
    backdrop.id = 'mod-sheet-backdrop';
    backdrop.className = 'mod-sheet-backdrop';
    backdrop.onclick = _closeModerationSheet;
    document.body.appendChild(backdrop);

    sheet = document.createElement('div');
    sheet.id = 'mod-sheet';
    sheet.className = 'mod-sheet';
    document.body.appendChild(sheet);
  }

  const rows = [];
  if (!isSelf && targetUserId) {
    rows.push(`<div class="mod-sheet-row" onclick="_modSheetShowReasons('${_esc(contentType)}','${_esc(String(contentId))}','${_esc(targetUserId)}')">🚩 Report ${_esc(contentType)}</div>`);
    rows.push(isBlocked
      ? `<div class="mod-sheet-row" onclick="_unblockUser('${_esc(targetUserId)}','${_esc(targetUserName || '')}'); _closeModerationSheet();">✓ Unblock ${_esc(targetUserName || 'user')}</div>`
      : `<div class="mod-sheet-row danger" onclick="_blockUser('${_esc(targetUserId)}','${_esc(targetUserName || '')}'); _closeModerationSheet();">🚫 Block ${_esc(targetUserName || 'user')}</div>`);
  } else {
    rows.push(`<div class="mod-sheet-row" onclick="_modSheetShowReasons('${_esc(contentType)}','${_esc(String(contentId))}','${_esc(targetUserId || '')}')">🚩 Report ${_esc(contentType)}</div>`);
  }
  rows.push(`<div class="mod-sheet-row" onclick="_closeModerationSheet()">Cancel</div>`);

  sheet.innerHTML = rows.join('');
  backdrop.classList.add('open');
  sheet.classList.add('open');
}

export function _modSheetShowReasons(contentType, contentId, targetUserId) {
  const sheet = document.getElementById('mod-sheet');
  if (!sheet) return;
  const reasons = ['Spam', 'Abusive or hateful', 'Inappropriate content', 'Something else'];
  sheet.innerHTML = reasons.map(r =>
    `<div class="mod-sheet-row" onclick="_reportContent('${_esc(contentType)}','${_esc(contentId)}','${_esc(targetUserId)}','${_esc(r)}'); _closeModerationSheet();">${_esc(r)}</div>`
  ).join('') + `<div class="mod-sheet-row" onclick="_closeModerationSheet()">Cancel</div>`;
}

export function _closeModerationSheet() {
  const sheet = document.getElementById('mod-sheet');
  const backdrop = document.getElementById('mod-sheet-backdrop');
  if (sheet) sheet.classList.remove('open');
  if (backdrop) backdrop.classList.remove('open');
}

// ── Module init (runs once, the first time this module is imported) ──
// These five are only ever referenced by onclick strings that
// _showModerationSheet itself generates — by the time that HTML exists,
// this module has already loaded, so direct assignment is safe.
window._blockUser = _blockUser;
window._unblockUser = _unblockUser;
window._reportContent = _reportContent;
window._modSheetShowReasons = _modSheetShowReasons;
window._closeModerationSheet = _closeModerationSheet;
