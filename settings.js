// settings.js
//
// Settings & Privacy menu. Only controls that really work are offered:
//   • Blocked Accounts — live list from your account, with Unblock
//   • Privacy Center   — real "Download My Data" (JSON export of your own data)
//   • Terms & Policies
//
// LOADED VIA DYNAMIC import() FROM app.js (see match-detail.js header for why).
// openSettingsMenu/closeSettingsMenu have permanent stubs in app.js; the other
// functions are only reached via onclick strings generated here, so they are
// assigned to window at the bottom.

export function openSettingsMenu(menuType) {
  const submenu = document.getElementById('settings-submenu');
  const content = document.getElementById('submenu-content');
  const title = document.getElementById('submenu-title');
  if (!submenu) return;
  submenu.classList.remove('hidden');

  const menus = {
    'blocked': {
      title: 'Blocked Accounts',
      content: `
        <div class="settings-info">⛔ People you block can't appear in your comments.</div>
        <div id="blocked-list" style="margin-top: 12px;">
          <div style="text-align: center; padding: 40px 12px; color: var(--text3);">Loading…</div>
        </div>
      `,
    },
    'privacy-center': {
      title: 'Privacy Center',
      content: `
        <div class="settings-info">🛡️ Get a copy of the information stored in your PitchSide account.</div>
        <button class="settings-button" onclick="downloadMyData()">Download My Data</button>
      `,
    },
    'legal': {
      title: 'Terms & Policies',
      content: `
        <div style="font-size: 13px; color: var(--text2); line-height: 1.6;">
          📄 By using PitchSide you agree to behave respectfully and not post content that is abusive, hateful, sexual, or that you don't have the right to share. Posts and comments can be reported and removed, and accounts that break these rules can be blocked.
        </div>
      `,
    },
  };

  const menu = menus[menuType];
  if (menu) {
    title.textContent = menu.title;
    content.innerHTML = menu.content;
    if (menuType === 'blocked') _renderBlockedList();
  }
}

export function closeSettingsMenu() {
  const submenu = document.getElementById('settings-submenu');
  if (submenu) submenu.classList.add('hidden');
}

async function _renderBlockedList() {
  const el = document.getElementById('blocked-list');
  if (!el) return;
  const ids = (window.appState && window.appState.blockedUsers) || [];
  if (!ids.length) {
    el.innerHTML = '<div style="text-align: center; padding: 40px 12px; color: var(--text3);">😊 No blocked accounts yet.</div>';
    return;
  }
  const rows = await Promise.all(ids.map(async (uid) => {
    let name = 'Fan';
    try {
      const { doc, getDoc, db } = window._psFs;
      const s = await getDoc(doc(db, 'users', uid));
      if (s.exists()) name = s.data().name || (s.data().handle ? '@' + s.data().handle : 'Fan');
    } catch (e) {}
    return { uid, name };
  }));
  el.innerHTML = '';
  rows.forEach(r => {
    const row = document.createElement('div');
    row.className = 'settings-list-item';
    const info = document.createElement('div');
    info.className = 'settings-list-info';
    const nm = document.createElement('div');
    nm.className = 'settings-list-name';
    nm.textContent = r.name;
    info.appendChild(nm);
    const btn = document.createElement('button');
    btn.className = 'settings-button';
    btn.style.cssText = 'width:auto;padding:6px 14px;margin:0;';
    btn.textContent = 'Unblock';
    btn.onclick = async () => {
      btn.disabled = true;
      if (window._unblockUser) await window._unblockUser(r.uid, r.name);
      else { const m = await import('./moderation.js'); await m._unblockUser(r.uid, r.name); }
      setTimeout(_renderBlockedList, 400);
    };
    row.appendChild(info);
    row.appendChild(btn);
    el.appendChild(row);
  });
}

export async function downloadMyData() {
  const user = window._psCurrentUser;
  const { doc, getDoc, collection, query, where, getDocs, db } = window._psFs || {};
  if (!user || !db) { showToast('Sign in first'); return; }
  showToast('Preparing your data…');
  const plain = (v) => JSON.parse(JSON.stringify(v, (k, x) => (x && typeof x.toDate === 'function') ? x.toDate().toISOString() : x));
  const out = { exportedAt: new Date().toISOString(), accountEmail: user.email || null, uid: user.uid };
  try {
    for (const c of ['users', 'userSettings', 'userCollections', 'userFollowing', 'userBlocks']) {
      const s = await getDoc(doc(db, c, user.uid));
      out[c] = s.exists() ? plain(s.data()) : null;
    }
    const posts = await getDocs(query(collection(db, 'posts'), where('userId', '==', user.uid)));
    out.posts = posts.docs.map(d => ({ id: d.id, ...plain(d.data()) }));
    const comments = await getDocs(query(collection(db, 'videoComments'), where('userId', '==', user.uid)));
    out.comments = comments.docs.map(d => ({ id: d.id, ...plain(d.data()) }));
    const blob = new Blob([JSON.stringify(out, null, 2)], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = 'pitchside-my-data.json';
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 5000);
    showToast('Your data was downloaded ✓');
  } catch (e) {
    console.error('[Privacy] export failed:', e);
    showToast('⚠️ Could not prepare your data. Try again.');
  }
}

window.downloadMyData = downloadMyData;
