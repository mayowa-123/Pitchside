// comments.js
//
// The comments system (submit, load/paginate, render, delete) — split
// out of app.js's much larger "Premium Features" block, which also
// contains notifications/profile/follows/collections. This module is
// deliberately scoped to ONLY comments — the eager, auth-triggered data
// loading for those other features stays in app.js untouched.
//
// LOADED VIA DYNAMIC import() FROM app.js — app.js stays a classic
// script (see match-detail.js's header comment for the full reasoning).
//
// renderComments and submitComment both need PERMANENT STUBS in app.js:
// renderComments is called directly by openComments() (itself triggered
// by a static onclick on every video's comment button) and submitComment
// is called directly by an eager DOMContentLoaded keydown listener on
// #comment-input, plus by the FanFeed's alternate "reading" comment box
// — all reachable before this module has necessarily loaded.
// _loadMoreComments is only ever reached via an onclick string this
// module's own _renderCommentLoadMoreBtn generates, so direct window
// assignment at the bottom of this file is safe for that one.
// _deleteComment is wired via a closure (`del.onclick = () =>
// _deleteComment(...)`) inside this module's own _buildCommentItem, not
// a global onclick string — no window exposure needed at all for it.
//
// window.currentVideoId / window.VIDEOS: app.js declares both with
// `let`, which does NOT attach to window (only var/function
// declarations do), and this module can't see a classic script's let
// bindings either. app.js mirrors both onto window at every
// reassignment site — see the "mirror for lazy-loaded modules" comments
// scattered through app.js if you ever add a new reassignment site for
// either and see "is not defined" errors here.
//
// Everything below is otherwise UNCHANGED from its original place in
// app.js — only `export` was added, and currentVideoId/VIDEOS now read
// via window. explicitly.

// 💬 COMMENTS SYSTEM - Full Firebase Integration
// ════════════════════════════════════════════════════════════════

export async function submitComment() {
  try {
    const currentUser = window._psCurrentUser || window._psAuth?.currentUser;
    if (!currentUser?.uid) {
      showToast('Please log in to comment');
      return;
    }

    const input = document.getElementById('comment-input');
    const text = input.value.trim();
    
    if (!text || !window.currentVideoId) {
      showToast('Comment cannot be empty');
      return;
    }

    if (text.length > 500) {
      showToast('Comment too long (max 500 chars)');
      return;
    }

    if (!_checkRateLimit('comment', 3000, 'Slow down a little before commenting again')) {
      return;
    }

    const db = window._psDb;
    const fsApi = window._psFs;

    if (!db || !fsApi) {
      showToast('Database not ready');
      return;
    }

    // Add comment to Firebase
    const commentsRef = fsApi.collection(db, 'videoComments');
    const myName = getUserDisplayName(currentUser);
    const v = window.VIDEOS.find(x => String(x.id) === String(window.currentVideoId));
    const commentDoc = await fsApi.addDoc(commentsRef, {
      videoId: String(window.currentVideoId),
      videoOwnerId: (v && (v.userId || v.uid)) || '',
      userId: currentUser.uid,
      userName: myName,
      userAvatar: (typeof profileData !== 'undefined' && profileData.avatarUrl) || '',
      text: text,
      timestamp: new Date(),
      likes: 0,
      likedBy: [],
      createdAt: new Date(),
    });

    // Update videoMetrics comment count
    const metricsRef = fsApi.doc(db, 'videoMetrics', String(window.currentVideoId));
    await fsApi.updateDoc(metricsRef, {
      comments: fsApi.increment(1),
      updatedAt: new Date(),
    }).catch(async (err) => {
      if (err.code === 'not-found') {
        await fsApi.setDoc(metricsRef, {
          videoId: String(window.currentVideoId),
          likes: [],
          likeCount: 0,
          comments: 1,
          shares: 0,
          reposts: 0,
          createdAt: new Date(),
          updatedAt: new Date(),
        });
      }
    });

    // Update UI — re-fetch from Firestore (the source of truth) rather than
    // also keeping a local copy, which was causing every comment you posted
    // to show up twice: once from this local array, once from Firestore.
    input.value = '';
    renderComments(window.currentVideoId);
    showToast('Comment posted ✓');

    // Notify video creator
    const creator = v?.userId || v?.uid;
    if (creator && creator !== currentUser.uid) {
      const notifRef = fsApi.collection(db, 'notifications');
      await fsApi.addDoc(notifRef, {
        type: 'comment',
        fromUserId: currentUser.uid,
        fromUserName: myName,
        toUserId: creator,
        videoId: String(window.currentVideoId),
        message: `${myName} commented: "${text.substring(0, 50)}"`,
        timestamp: new Date(),
        read: false,
      }).catch(() => {});
    }
  } catch (error) {
    console.error('Comment error:', error);
    showToast('Failed to post comment');
  }
}

// Load comments from Firebase
// Pagination state, keyed per video so switching between two videos'
// comment sections doesn't cross-contaminate cursors.
export const _commentPagination = {};

export async function loadCommentsFromFirebase(videoId, cursorDoc) {
  const PAGE_SIZE = 20;
  try {
    const db = window._psDb;
    const fsApi = window._psFs;

    if (!db || !fsApi) return { comments: [], lastDoc: null, hasMore: false };

    const commentsRef = fsApi.collection(db, 'videoComments');
    const queryParts = [
      commentsRef,
      fsApi.where('videoId', '==', String(videoId)),
      fsApi.orderBy('timestamp', 'desc'),
      fsApi.limit(PAGE_SIZE),
    ];
    if (cursorDoc) queryParts.push(fsApi.startAfter(cursorDoc));

    const q = fsApi.query(...queryParts);
    const snap = await fsApi.getDocs(q);

    const comments = [];
    let lastDoc = null;
    snap.forEach(doc => {
      const data = doc.data();
      comments.push({
        id: doc.id,
        userId: data.userId || '',
        user: data.userName || 'User',
        avatar: data.userAvatar || '',
        text: data.text,
        time: getTimeAgo(data.timestamp),
        initials: (data.userName || 'U')[0].toUpperCase(),
        likes: data.likes || 0,
        timestamp: data.timestamp,
      });
      lastDoc = doc;
    });

    return { comments, lastDoc, hasMore: comments.length === PAGE_SIZE };
  } catch (error) {
    console.error('Load comments error:', error);
    // TEMPORARY DEBUG: surface the real Firestore error (often a missing-
    // composite-index message with a direct create-it link) so it's
    // visible on-device without devtools. Remove once confirmed fixed.
    return { comments: [], lastDoc: null, hasMore: false, loadError: error.message };
  }
}

// Helper: Get time ago string
export function getTimeAgo(timestamp) {
  if (!timestamp) return 'now';

  // Firestore returns a Timestamp object (with a .toDate() method), not a
  // plain JS Date — passing that straight into `new Date(...)` silently
  // produces an Invalid Date, which is why this was showing "NaNd ago".
  const date = (timestamp && typeof timestamp.toDate === 'function')
    ? timestamp.toDate()
    : new Date(timestamp);
  if (isNaN(date.getTime())) return 'now';

  const now = new Date();
  const seconds = Math.floor((now - date) / 1000);

  if (seconds < 60) return 'now';
  if (seconds < 3600) return Math.floor(seconds / 60) + 'm ago';
  if (seconds < 86400) return Math.floor(seconds / 3600) + 'h ago';
  return Math.floor(seconds / 86400) + 'd ago';
}

// Update renderComments to use Firebase data
// Builds one comment's DOM node — shared by the initial render and by
// "load more" so appending a page never has to duplicate this logic.
export function _buildCommentItem(c, videoId, myUid, videoOwnerId) {
  const item = document.createElement('div');
  item.className = 'comment-item';

  const avatar = document.createElement('div');
  avatar.className = 'comment-avatar';
  if (c.avatar) {
    avatar.innerHTML = `<img src="${c.avatar}" style="width:100%;height:100%;object-fit:cover;border-radius:50%;">`;
  } else {
    avatar.textContent = c.initials;
  }

  const bubble = document.createElement('div');
  bubble.className = 'comment-bubble';

  const user = document.createElement('div');
  user.className = 'comment-user';
  user.textContent = c.user;

  const text = document.createElement('div');
  text.className = 'comment-text';
  text.textContent = c.text;

  const time = document.createElement('div');
  time.className = 'comment-time';
  time.textContent = c.time;

  bubble.appendChild(user);
  bubble.appendChild(text);
  bubble.appendChild(time);
  item.appendChild(avatar);
  item.appendChild(bubble);

  // Delete: available to the comment's own author, or to the video owner
  // moderating comments on their own post — nobody else.
  const canDelete = myUid && (c.userId === myUid || videoOwnerId === myUid);
  if (canDelete) {
    const del = document.createElement('div');
    del.className = 'comment-delete';
    del.textContent = '🗑️';
    del.title = 'Delete comment';
    del.onclick = () => _deleteComment(c.id, videoId);
    item.appendChild(del);
  } else if (myUid && c.userId && c.userId !== myUid) {
    // Not your comment and not your video — the only option is to report it
    const report = document.createElement('div');
    report.className = 'comment-delete';
    report.textContent = '🚩';
    report.title = 'Report comment';
    report.onclick = () => _showModerationSheet({
      contentType: 'comment', contentId: c.id, targetUserId: c.userId, targetUserName: c.user
    });
    item.appendChild(report);
  }

  return item;
}

export function _renderCommentLoadMoreBtn(videoId) {
  const wrap = document.createElement('div');
  wrap.id = 'comment-load-more-wrap';
  wrap.style.cssText = 'text-align:center;padding:12px 0 4px;';
  wrap.innerHTML = `<button onclick="_loadMoreComments('${_esc(String(videoId))}')" style="padding:8px 20px;border-radius:20px;border:none;background:rgba(255,255,255,0.08);color:var(--text2);font-size:12.5px;font-weight:600;cursor:pointer;">Load more comments</button>`;
  return wrap;
}

// Loads and renders the FIRST page of comments — resets pagination state
// for this video. 20 at a time instead of the old unbounded single read,
// which pulled every comment on a post in one shot every time it opened —
// fine at 10 comments, a real cost and a real wait once anything gets
// popular.
export async function renderComments(videoId) {
  const list = document.getElementById('comment-list');
  if (!list) return;

  const myUid = (window._psCurrentUser && window._psCurrentUser.uid) || null;
  const v = window.VIDEOS.find(x => String(x.id) === String(videoId));
  const videoOwnerId = v && (v.userId || v.uid);

  const { comments, lastDoc, hasMore, loadError } = await loadCommentsFromFirebase(videoId);
  const visible = comments.filter(c => !(appState.blockedUsers || []).includes(c.userId));

  _commentPagination[videoId] = { lastDoc, hasMore };

  // The count badge uses the running total already tracked on the video
  // doc (v.comments, kept in sync via increment/decrement on post and
  // delete) rather than counting what's been fetched so far — pagination
  // means this function only ever sees one page at a time, so counting
  // fetched docs would show "20" forever once a post passes 20 comments.
  const commentCount = document.getElementById('comment-count');
  if (commentCount) commentCount.textContent = `(${(v && v.comments) || comments.length})`;

  // Note: blocked-user filtering happens after the Firestore page is
  // fetched, so a page can render shorter than 20 if several of that
  // page's comments happen to be from someone you've blocked. That's a
  // known, acceptable tradeoff for a client-side blocklist layered on
  // top of server-side pagination — "Load more" still fetches the next
  // real page regardless, so nothing is ever permanently hidden by it.

  if (comments.length === 0) {
    const debugLine = loadError
      ? `<div style="margin-top:10px;padding:10px;background:#3a1414;color:#ff8a8a;font-size:11px;border-radius:8px;word-break:break-all;text-align:left;">DEBUG: ${_esc(loadError)}</div>`
      : '';
    list.innerHTML = `<div style="text-align:center;padding:30px;color:var(--text3);font-size:13px;">No comments yet. Be the first!${debugLine}</div>`;
    return;
  }

  list.innerHTML = '';
  visible.forEach(c => list.appendChild(_buildCommentItem(c, videoId, myUid, videoOwnerId)));

  if (hasMore) list.appendChild(_renderCommentLoadMoreBtn(videoId));

  list.scrollTop = 0;
}

// Fetches and appends the next page on top of what's already rendered —
// never re-fetches or re-renders what's already on screen.
export async function _loadMoreComments(videoId) {
  const state = _commentPagination[videoId];
  if (!state || !state.hasMore) return;

  const list = document.getElementById('comment-list');
  const oldBtn = document.getElementById('comment-load-more-wrap');
  if (oldBtn) oldBtn.remove();

  const { comments, lastDoc, hasMore } = await loadCommentsFromFirebase(videoId, state.lastDoc);
  const visible = comments.filter(c => !(appState.blockedUsers || []).includes(c.userId));

  _commentPagination[videoId] = { lastDoc, hasMore };

  const myUid = (window._psCurrentUser && window._psCurrentUser.uid) || null;
  const v = window.VIDEOS.find(x => String(x.id) === String(videoId));
  const videoOwnerId = v && (v.userId || v.uid);

  if (list) {
    visible.forEach(c => list.appendChild(_buildCommentItem(c, videoId, myUid, videoOwnerId)));
    if (hasMore) list.appendChild(_renderCommentLoadMoreBtn(videoId));
  }
}

// Firestore Timestamp -> epoch ms, tolerant of already-plain dates/numbers.
export function _tsToMs(ts) {
  if (!ts) return 0;
  const d = (ts && typeof ts.toDate === 'function') ? ts.toDate() : new Date(ts);
  const ms = d.getTime();
  return isNaN(ms) ? 0 : ms;
}

export async function _deleteComment(commentId, videoId) {
  const fsApi = window._psFs;
  const db = window._psDb;
  if (!fsApi || !db || !fsApi.deleteDoc) { showToast('Delete is not available right now'); return; }
  try {
    await fsApi.deleteDoc(fsApi.doc(db, 'videoComments', commentId));
    const metricsRef = fsApi.doc(db, 'videoMetrics', String(videoId));
    fsApi.updateDoc(metricsRef, { comments: fsApi.increment(-1) }).catch(() => {});
    showToast('Comment deleted');
    renderComments(videoId);
  } catch (e) {
    console.warn('[Comments] delete failed:', e);
    showToast('Could not delete — check your connection');
  }
}

// ── Module init (runs once, the first time this module is imported) ──
// _loadMoreComments is only ever referenced by an onclick string this
// module's own _renderCommentLoadMoreBtn generates — by the time that
// HTML exists, this module has already loaded, so direct assignment is
// safe.
window._loadMoreComments = _loadMoreComments;
