// ══════════════════════════════════════════════════════════════════════════════
// PITCHSIDE APP - PERSISTENT LIKES & INTERACTIONS SYSTEM
// ══════════════════════════════════════════════════════════════════════════════

// ── Firebase Firestore functions exposed from firebase-auth.js ──
const { db, setDoc, doc, getDoc, updateDoc, collection, query, where, getDocs, deleteDoc, serverTimestamp } = window._psFs || {};

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
    // Create collection reference
    const interactionsRef = collection(db, 'userInteractions');
    
    // Query: find all interactions for this user
    const q = query(interactionsRef, where('userId', '==', userId));
    const snap = await getDocs(q);
    
    // Clear and rebuild cache
    userInteractions = { likes: new Set(), dislikes: new Set(), saves: new Set(), follows: new Set() };
    
    snap.forEach(docSnap => {
      const data = docSnap.data();
      const { type, targetId } = data;
      
      if (type === 'like' && userInteractions.likes) {
        userInteractions.likes.add(String(targetId));
      } else if (type === 'dislike' && userInteractions.dislikes) {
        userInteractions.dislikes.add(String(targetId));
      } else if (type === 'save' && userInteractions.saves) {
        userInteractions.saves.add(String(targetId));
      } else if (type === 'follow' && userInteractions.follows) {
        userInteractions.follows.add(String(targetId));
      }
    });
    
    console.log(`✅ Loaded interactions:`, {
      likes: userInteractions.likes.size,
      dislikes: userInteractions.dislikes.size,
      saves: userInteractions.saves.size,
      follows: userInteractions.follows.size
    });
    
    // Refresh UI to show restored state
    refreshWatchPageUI();
    
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
    // Create a document ID from userId + targetId + type
    const docId = `${userId}_${type}_${targetId}`;
    
    // Get interaction ref
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
    showToast(`❌ Failed to save ${type}`);
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
  const videoId = document.getElementById('watch-video-title')?.dataset.videoId || 
                  document.getElementById('watch-player-body')?.dataset.videoId;
  
  if (!videoId) {
    console.warn('⚠️ No video ID found');
    showToast('❌ Video ID not found');
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
      count = Math.max(0, parseInt(countEl?.textContent || 0) - 1);
    } else {
      // Like (remove dislike if exists)
      if (userInteractions.dislikes.has(videoIdStr)) {
        userInteractions.dislikes.delete(videoIdStr);
        await removeInteractionFromFirebase('dislike', videoIdStr);
        if (oppositeBtn) oppositeBtn.classList.remove('active');
      }
      
      userInteractions.likes.add(videoIdStr);
      await saveInteractionToFirebase('like', videoIdStr);
      btn.classList.add('active');
      count = parseInt(countEl?.textContent || 0) + 1;
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
    } else {
      // Dislike (remove like if exists)
      if (userInteractions.likes.has(videoIdStr)) {
        userInteractions.likes.delete(videoIdStr);
        await removeInteractionFromFirebase('like', videoIdStr);
        if (oppositeBtn) oppositeBtn.classList.remove('active');
        countEl = document.getElementById('watch-like-count');
        if (countEl) countEl.textContent = Math.max(0, parseInt(countEl.textContent) - 1);
      }
      
      userInteractions.dislikes.add(videoIdStr);
      await saveInteractionToFirebase('dislike', videoIdStr);
      dislikeBtn.classList.add('active');
    }
  }
  
  // Update count display for likes
  if (countEl && type === 'like') {
    countEl.textContent = count;
  }
};

// ── Handle other watch actions (save, download, share, follow) ──
window.handleWatchAction = async function(action) {
  const videoId = document.getElementById('watch-video-title')?.dataset.videoId || 
                  document.getElementById('watch-player-body')?.dataset.videoId;
  
  if (!videoId) {
    showToast('❌ Video ID not found');
    return;
  }
  
  const videoIdStr = String(videoId);
  
  switch(action) {
    case 'save': {
      const isSaved = userInteractions.saves.has(videoIdStr);
      
      if (isSaved) {
        userInteractions.saves.delete(videoIdStr);
        await removeInteractionFromFirebase('save', videoIdStr);
        showToast('❌ Removed from saved');
      } else {
        userInteractions.saves.add(videoIdStr);
        await saveInteractionToFirebase('save', videoIdStr);
        showToast('✅ Saved for later');
      }
      break;
    }
    
    case 'download': {
      showToast('📥 Download coming soon');
      break;
    }
    
    case 'share': {
      showToast('📤 Share feature coming soon');
      break;
    }
    
    case 'follow': {
      const creatorId = document.getElementById('watch-channel-name')?.dataset.creatorId || 'unknown-creator';
      const iFollowing = userInteractions.follows.has(creatorId);
      
      if (iFollowing) {
        userInteractions.follows.delete(creatorId);
        await removeInteractionFromFirebase('follow', creatorId);
        showToast('❌ Unfollowed');
      } else {
        userInteractions.follows.add(creatorId);
        await saveInteractionToFirebase('follow', creatorId);
        showToast('✅ Following');
      }
      break;
    }
    
    default:
      console.log('Unknown action:', action);
  }
};

// ── Refresh Watch Page UI to show current interaction state ──
function refreshWatchPageUI() {
  if (!document.getElementById('watch-page-overlay')?.classList.contains('open')) {
    return; // Watch page not open
  }
  
  const videoId = document.getElementById('watch-video-title')?.dataset.videoId;
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

// ── Hook into existing openHlPlayerById to load interactions for video ──
const originalOpenHlPlayerById = window.openHlPlayerById;
window.openHlPlayerById = function(videoId) {
  // Store video ID on elements for later reference
  if (document.getElementById('watch-video-title')) {
    document.getElementById('watch-video-title').dataset.videoId = videoId;
  }
  if (document.getElementById('watch-player-body')) {
    document.getElementById('watch-player-body').dataset.videoId = videoId;
  }
  
  // Call original function
  if (typeof originalOpenHlPlayerById === 'function') {
    originalOpenHlPlayerById(videoId);
  }
  
  // Refresh UI to show interaction state
  setTimeout(() => refreshWatchPageUI(), 100);
};

// ── Hook into enterApp to load interactions when user logs in ──
const originalEnterApp = window.enterApp;
window.enterApp = async function(user) {
  if (typeof originalEnterApp === 'function') {
    originalEnterApp(user);
  }
  
  // Load user's saved interactions
  await loadUserInteractions();
};

// ── Export for use in firebase-auth.js ──
window.loadUserInteractions = loadUserInteractions;

console.log('✅ Persistent Interactions Module Loaded');
