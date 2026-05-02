// ══════════════════════════════════════════════
//  FIREBASE AUTH
//  DEV_MODE = true  → skips login screen entirely (for local design/testing)
//  DEV_MODE = false → uses real Firebase auth (for production on Netlify)
// ══════════════════════════════════════════════
const DEV_MODE = false; // 👈 SET TO true WHEN DESIGNING LOCALLY

import { initializeApp } from 'https://www.gstatic.com/firebasejs/10.12.0/firebase-app.js';
import {
  getAuth,
  onAuthStateChanged,
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  updateProfile
} from 'https://www.gstatic.com/firebasejs/10.12.0/firebase-auth.js';

const firebaseConfig = {
  apiKey:            "AIzaSyCvK_7_Z4-KI7PACIBl3ahAxw9Xiyh9P1Q",
  authDomain:        "pitchside-76c5b.firebaseapp.com",
  projectId:         "pitchside-76c5b",
  storageBucket:     "pitchside-76c5b.firebasestorage.app",
  messagingSenderId: "647363119981",
  appId:             "1:647363119981:web:6c0f1deee92f18266e6864",
  measurementId:     "G-VMVR4DDLKP"
};

const app  = initializeApp(firebaseConfig);
const auth = getAuth(app);

// ── Helpers ──────────────────────────────────
function showAuthError(id, msg) {
  const el = document.getElementById(id);
  el.textContent = msg; el.classList.add('show');
}
function clearAuthErrors() {
  ['login-error','register-error'].forEach(id => {
    const el = document.getElementById(id);
    el.textContent = ''; el.classList.remove('show');
  });
}
function applyUserToApp(user) {
  const displayName = user.displayName || (user.email ? user.email.split('@')[0] : 'Fan');
  const initials = displayName.split(' ').map(w => w[0]).join('').slice(0,2).toUpperCase();
  profileData = { ...profileData, name: displayName, email: user.email || 'dev@pitchside.app', initials };
  document.getElementById('profile-name').textContent     = displayName;
  document.getElementById('profile-email').textContent    = user.email || 'dev@pitchside.app';
  document.getElementById('profile-initials').textContent = initials;
  if (user.photoURL) {
    const img = document.getElementById('profile-avatar-img');
    img.src = user.photoURL; img.style.display = 'block';
    document.getElementById('profile-initials').style.display = 'none';
  }
}
function enterApp(user) {
  applyUserToApp(user);
  document.getElementById('auth-screen').classList.add('hidden');
  document.getElementById('auth-loading').classList.add('hidden');
  if (!DEV_MODE) showToast(`Welcome back, ${user.displayName || 'fan'}! ⚽`);
}

// ── DEV MODE: skip login immediately ─────────
if (DEV_MODE) {
  document.getElementById('auth-loading').classList.add('hidden');
  enterApp({ displayName: 'Dev User', email: 'dev@pitchside.app', photoURL: null });
} else {
  // ── PRODUCTION: real Firebase auth ──────────
  // Detect if running as a local file (not hosted) and warn
  const isLocalFile = location.protocol === 'content:' || location.protocol === 'file:';

  const authTimeout = setTimeout(() => {
    document.getElementById('auth-loading').classList.add('hidden');
    document.getElementById('auth-screen').classList.remove('hidden');
    if (isLocalFile) {
      showAuthError('login-error', '⚠️ Firebase does not work on local files. Host on Netlify or set DEV_MODE=true to skip login.');
    }
  }, 4000);

  onAuthStateChanged(auth, user => {
    clearTimeout(authTimeout);
    if (user) {
      enterApp(user);
    } else {
      document.getElementById('auth-loading').classList.add('hidden');
      document.getElementById('auth-screen').classList.remove('hidden');
      if (isLocalFile) {
        showAuthError('login-error', '⚠️ Running as local file. Set DEV_MODE=true at top of code to skip login, or host on Netlify.');
      }
    }
  });
}

// ── Auth tab switch ──────────────────────────
window.switchAuthTab = function(tab) {
  clearAuthErrors();
  document.querySelectorAll('.auth-tab').forEach((t, i) => {
    t.classList.toggle('on', (tab === 'login' && i === 0) || (tab === 'register' && i === 1));
  });
  document.getElementById('auth-login-form').style.display    = tab === 'login'    ? '' : 'none';
  document.getElementById('auth-register-form').style.display = tab === 'register' ? '' : 'none';
};

// ── Email / Password Login ───────────────────
window.doEmailLogin = async function() {
  clearAuthErrors();
  const email    = document.getElementById('login-email').value.trim();
  const password = document.getElementById('login-password').value;
  if (!email || !password) { showAuthError('login-error', 'Please fill in all fields.'); return; }
  const btn = document.getElementById('login-btn');
  btn.disabled = true; btn.textContent = 'Signing in…';
  try {
    await signInWithEmailAndPassword(auth, email, password);
  } catch(e) {
    btn.disabled = false; btn.textContent = 'Sign In to PitchSide';
    const msg = ['auth/user-not-found','auth/wrong-password','auth/invalid-credential'].includes(e.code)
      ? 'Incorrect email or password.' : e.message;
    showAuthError('login-error', msg);
  }
};

// ── Register ─────────────────────────────────
window.doRegister = async function() {
  clearAuthErrors();
  const name     = document.getElementById('reg-name').value.trim();
  const email    = document.getElementById('reg-email').value.trim();
  const password = document.getElementById('reg-password').value;
  if (!name || !email || !password) { showAuthError('register-error', 'Please fill in all fields.'); return; }
  if (password.length < 6) { showAuthError('register-error', 'Password must be at least 6 characters.'); return; }
  const btn = document.getElementById('register-btn');
  btn.disabled = true; btn.textContent = 'Creating account…';
  try {
    const { user } = await createUserWithEmailAndPassword(auth, email, password);
    await updateProfile(user, { displayName: name });
  } catch(e) {
    btn.disabled = false; btn.textContent = 'Create Account';
    const msg = e.code === 'auth/email-already-in-use'
      ? 'An account with this email already exists.' : e.message;
    showAuthError('register-error', msg);
  }
};

// ── Firestore: import & expose to window so plain scripts can use them ──
import { getFirestore, collection, query, where, orderBy, limit,
         getDocs, startAfter, doc, getDoc, updateDoc, addDoc,
         setDoc, serverTimestamp,
         onSnapshot   // ← ADDED: real-time listener
       } from 'https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js';
const db = getFirestore(app);
window._psDb          = db;
window._psFs          = { collection, query, where, orderBy, limit, getDocs,
                          startAfter, doc, getDoc, updateDoc, addDoc,
                          setDoc, serverTimestamp,
                          onSnapshot,  // ← ADDED: exposed for activateFirebaseListener
                          db };
window._psCurrentUser = null;
onAuthStateChanged(auth, user => {
  window._psCurrentUser = user || null;
  // ── CHANGE 2: Activate Firebase listener once auth is confirmed ──
  // Works whether user is logged in or not (Firestore rules permitting).
  if (typeof activateFirebaseListener === 'function') {
    activateFirebaseListener();
  }
