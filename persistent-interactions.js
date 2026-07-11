// ══════════════════════════════════════════════════════════════════════════════
// PITCHSIDE PERSISTENT INTERACTIONS MODULE
// Handles saving/loading likes, dislikes, saves, follows to Firebase
// ══════════════════════════════════════════════════════════════════════════════

// ── In-memory cache for user interactions (speeds up UI) ──
let userInteractions = {
  likes: new Set(),      // videoIds user has liked
  dislikes: new Set(),   // videoIds user has disliked
  saves: new Set(),      // videoIds user has saved
  follows: new Set()     // creatorIds user follows
};

// ── Load user interactions from Firebase on app startup ──
async function loadUserInteractions() {
  if (!window._psCurrentUser) {
    console.log('⚠️ No user logged in, skipping interaction load');
    return;
  }
  
  const userId = window._psCurrentUser.uid;
  console.log('📥 Loading user interactions for:', userId);
  
  try {
    const { db, collection, query, where, getDocs } = window._psFs || {};
    
    if (!db || !collection || !query || !where || !getDocs) {
      console.warn('⚠️ Firebase functions not ready');
      return;
    }
    
    // Query: find all interactions for this user
    const interactionsRef = collection(db, 'userInteractions');
    const q = query(interactionsRef, where('userId', '==', userId));
    const snap = await getDocs(q);
    
    // Clear and rebuild cache
    userInteractions = { likes: new Set(), dislikes: new Set(), saves: new Set(), follows: new Set() };
    
    snap.forEach(docSnap => {
      const data = docSnap.data();
      const { type, targetId } = data;
      
      if (type === 'like') {
        userInteractions.likes.add(String(targetId));
      } else if (type === 'dislike') {
        userInteractions.dislikes.add(String(targetId));
      } else if (type === 'save') {
        userInteractions.saves.add(String(targetId));
      } else if (type === 'follow') {
        userInteractions.follows.add(String(targetId));
      }
    });
    
    console.log(`✅ Loaded interactions:`, {
      likes: userInteractions.likes.size,
      dislikes: userInteractions.dislikes.size,
      saves: userInteractions.saves.size,
      follows: userInteractions.follows.size
    });
    
  } catch (error) {
    console.error('❌ Error loading interactions:', error.message);
  }
}

// ── Save interaction to Firebase ──
async function saveInteractionToFirebase(type, targetId) {
  if (!window._psCurrentUser) {
    console.warn('⚠️ Cannot save interaction: user not logged in');
    return false;
  }
  
  const userId = window._psCurrentUser.uid;
  
  try {
    const { db, doc, setDoc, serverTimestamp } = window._psFs || {};
    
    if (!db || !doc || !setDoc) {
      console.warn('⚠️ Firebase functions not ready');
      return false;
    }
    
    // Create a document ID from userId + targetId + type
    const docId = `${userId}_${type}_${targetId}`;
    const interactionRef = doc(db, 'userInteractions', docId);
    
    // Save/update interaction
    await setDoc(interactionRef, {
      userId,
      type,          // 'like', 'dislike', 'save', 'follow'
      targetId: String(targetId),
      timestamp: serverTimestamp()
    });
    
    console.log(`✅ Saved ${type} for ${targetId}`);
    return true;
    
  } catch (error) {
    console.error(`❌ Error saving interaction:`, error.message);
    if (typeof showToast === 'function') {
      showToast(`❌ Failed to save ${type}`);
    }
    return false;
  }
}

// ── Remove interaction from Firebase ──
async function removeInteractionFromFirebase(type, targetId) {
  if (!window._psCurrentUser) {
    console.warn('⚠️ Cannot remove interaction: user not logged in');
    return false;
  }
  
  const userId = window._psCurrentUser.uid;
  
  try {
    const { db, doc, deleteDoc } = window._psFs || {};
    
    if (!db || !doc || !deleteDoc) {
      console.warn('⚠️ Firebase functions not ready');
      return false;
    }
    
    const docId = `${userId}_${type}_${targetId}`;
    const interactionRef = doc(db, 'userInteractions', docId);
    
    await deleteDoc(interactionRef);
    
    console.log(`✅ Removed ${type} for ${targetId}`);
    return true;
    
  } catch (error) {
    console.error(`❌ Error removing interaction:`, error.message);
    return false;
  }
}

// ── Toggle Watch Action (Like/Dislike) - MAIN HANDLER ──
window.toggleWatchAction = async function(btn, type) {
  const videoEl = document.getElementById('watch-video-title');
  const playerEl = document.getElementById('watch-player-body');
  
  let videoId = videoEl?.dataset.videoId || playerEl?.dataset.videoId;
  
  if (!videoId) {
    console.warn('⚠️ No video ID found');
    if (typeof showToast === 'function') {
      showToast('❌ Video ID not found');
    }
    return;
  }
  
  const videoIdStr = String(videoId);
  let count = 0;
  let countEl = null;
  let oppositeBtn = null;
  
  if (type === 'like') {
    countEl = document.getElementById('watch-like-count');
    const likeBtn = btn;
    oppositeBtn = btn.parentElement?.querySelector('button[onclick*="dislike"]');
    
    // Check if already liked
    const isLiked = userInteractions.likes.has(videoIdStr);
    
    if (isLiked) {
      // Unlike
      userInteractions.likes.delete(videoIdStr);
      await removeInteractionFromFirebase('like', videoIdStr);
      likeBtn.classList.remove('active');
      count = Math.max(0, parseInt(countEl?.textContent || '0') - 1);
      if (typeof showToast === 'function') showToast('❌ Removed like');
    } else {
      // Like (remove dislike if exists)
      if (userInteractions.dislikes.has(videoIdStr)) {
        userInteractions.dislikes.delete(videoIdStr);
        await removeInteractionFromFirebase('dislike', videoIdStr);
        if (oppositeBtn) oppositeBtn.classList.remove('active');
      }
      
      userInteractions.likes.add(videoIdStr);
      await saveInteractionToFirebase('like', videoIdStr);
      likeBtn.classList.add('active');
      count = parseInt(countEl?.textContent || '0') + 1;
      if (typeof showToast === 'function') showToast('❤️ Liked!');
    }
    
  } else if (type === 'dislike') {
    const dislikeBtn = btn;
    oppositeBtn = btn.parentElement?.querySelector('button[onclick*="like"]');
    
    // Check if already disliked
    const isDisliked = userInteractions.dislikes.has(videoIdStr);
    
    if (isDisliked) {
      // Un-dislike
      userInteractions.dislikes.delete(videoIdStr);
      await removeInteractionFromFirebase('dislike', videoIdStr);
      dislikeBtn.classList.remove('active');
      if (typeof showToast === 'function') showToast('❌ Removed dislike');
    } else {
      // Dislike (remove like if exists)
      if (userInteractions.likes.has(videoIdStr)) {
        userInteractions.likes.delete(videoIdStr);
        await removeInteractionFromFirebase('like', videoIdStr);
        if (oppositeBtn) oppositeBtn.classList.remove('active');
        countEl = document.getElementById('watch-like-count');
        if (countEl) countEl.textContent = Math.max(0, parseInt(countEl.textContent || '0') - 1);
      }
      
      userInteractions.dislikes.add(videoIdStr);
      await saveInteractionToFirebase('dislike', videoIdStr);
      dislikeBtn.classList.add('active');
      if (typeof showToast === 'function') showToast('👎 Disliked');
    }
  }
  
  // Update count display for likes
  if (countEl && type === 'like') {
    countEl.textContent = count;
  }
};

// ── Handle other watch actions (save, download, share, follow) ──
window.handleWatchAction = async function(action) {
  const videoEl = document.getElementById('watch-video-title');
  const playerEl = document.getElementById('watch-player-body');
  
  let videoId = videoEl?.dataset.videoId || playerEl?.dataset.videoId;
  
  if (!videoId) {
    if (typeof showToast === 'function') {
      showToast('❌ Video ID not found');
    }
    return;
  }
  
  const videoIdStr = String(videoId);
  
  switch(action) {
    case 'save': {
      const isSaved = userInteractions.saves.has(videoIdStr);
      
      if (isSaved) {
        userInteractions.saves.delete(videoIdStr);
        await removeInteractionFromFirebase('save', videoIdStr);
        if (typeof showToast === 'function') showToast('❌ Removed from saved');
      } else {
        userInteractions.saves.add(videoIdStr);
        await saveInteractionToFirebase('save', videoIdStr);
        if (typeof showToast === 'function') showToast('✅ Saved for later');
      }
      break;
    }
    
    case 'download': {
      if (typeof showToast === 'function') showToast('📥 Download coming soon');
      break;
    }
    
    case 'share': {
      if (typeof showToast === 'function') showToast('📤 Share feature coming soon');
      break;
    }
    
    case 'follow': {
      const creatorId = document.getElementById('watch-channel-name')?.dataset.creatorId || 'unknown-creator';
      const isFollowing = userInteractions.follows.has(creatorId);
      
      if (isFollowing) {
        userInteractions.follows.delete(creatorId);
        await removeInteractionFromFirebase('follow', creatorId);
        if (typeof showToast === 'function') showToast('❌ Unfollowed');
      } else {
        userInteractions.follows.add(creatorId);
        await saveInteractionToFirebase('follow', creatorId);
        if (typeof showToast === 'function') showToast('✅ Following');
      }
      break;
    }
    
    default:
      console.log('Unknown action:', action);
  }
};

// ── Refresh Watch Page UI to show current interaction state ──
function refreshWatchPageUI() {
  const overlay = document.getElementById('watch-page-overlay');
  if (!overlay || !overlay.classList.contains('open')) {
    return; // Watch page not open
  }
  
  const videoEl = document.getElementById('watch-video-title');
  const playerEl = document.getElementById('watch-player-body');
  const videoId = videoEl?.dataset.videoId || playerEl?.dataset.videoId;
  
  if (!videoId) return;
  
  const videoIdStr = String(videoId);
  
  // Update like button
  const likeBtn = document.querySelector('button[onclick*="toggleWatchAction"][onclick*="like"]');
  if (likeBtn) {
    if (userInteractions.likes.has(videoIdStr)) {
      likeBtn.classList.add('active');
    } else {
      likeBtn.classList.remove('active');
    }
  }
  
  // Update dislike button
  const dislikeBtn = document.querySelector('button[onclick*="toggleWatchAction"][onclick*="dislike"]');
  if (dislikeBtn) {
    if (userInteractions.dislikes.has(videoIdStr)) {
      dislikeBtn.classList.add('active');
    } else {
      dislikeBtn.classList.remove('active');
    }
  }
}

// ── Hook into existing watch player functions ──
const originalOpenHlPlayerById = window.openHlPlayerById;
if (typeof originalOpenHlPlayerById === 'function') {
  window.openHlPlayerById = function(videoId) {
    // Store video ID on elements for later reference
    const titleEl = document.getElementById('watch-video-title');
    const playerEl = document.getElementById('watch-player-body');
    
    if (titleEl) titleEl.dataset.videoId = videoId;
    if (playerEl) playerEl.dataset.videoId = videoId;
    
    // Call original function
    originalOpenHlPlayerById(videoId);
    
    // Refresh UI to show interaction state
    setTimeout(() => refreshWatchPageUI(), 100);
  };
}

console.log('✅ Persistent Interactions Module Loaded');
