// settings.js
//
// Settings & Privacy menu (account privacy, comments/mentions/DM
// permissions, data saver, data download) — split out of app.js
// (~7KB) so this only downloads when the user actually opens Settings.
//
// LOADED VIA DYNAMIC import() FROM app.js — app.js stays a classic
// script (see match-detail.js's header comment for the full reasoning).
//
// openSettingsMenu/closeSettingsMenu are called from STATIC onclick
// attributes already in index.html (every settings row, and the back
// button) — those need PERMANENT STUBS in app.js (the match-detail.js
// pattern), since they're reachable from page load. downloadMyData,
// togglePrivateAccount, and updateSetting are only ever reached via
// onchange/onclick strings THIS module's own openSettingsMenu generates
// — by the time those exist in the DOM, this module has already loaded,
// so direct window assignment at the bottom of this file (the
// war-room.js pattern) is safe for those three.
//
// Everything below is otherwise UNCHANGED from its original place in
// app.js — only `export` was added.

// ═══════════════════════════════════════════════════════════════
// SETTINGS & PRIVACY FUNCTIONALITY
// ═══════════════════════════════════════════════════════════════

// Settings Store (using localStorage)
export const settingsStore = {
  getSettings() {
    const stored = localStorage.getItem('pitchside_settings');
    return stored ? JSON.parse(stored) : this.getDefaults();
  },

  getDefaults() {
    return {
      account: { privateAccount: false },
      privacy: { allowComments: 'everyone', allowMentions: 'everyone', allowDMs: 'everyone' },
      display: { theme: 'dark', language: 'English' },
      content: { preferredLeagues: ['PL', 'UCL', 'NPFL'], autoPlayVideos: true, videoQuality: 'auto' },
      wellness: { screenTimeLimit: 0, screenTimeEnabled: false },
      data: { dataSaver: false, offlineContent: [] },
    };
  },

  save(settings) {
    localStorage.setItem('pitchside_settings', JSON.stringify(settings));
  },

  update(path, value) {
    const settings = this.getSettings();
    const keys = path.split('.');
    let obj = settings;
    for (let i = 0; i < keys.length - 1; i++) {
      obj = obj[keys[i]];
    }
    obj[keys[keys.length - 1]] = value;
    this.save(settings);
  },
};

export function openSettingsMenu(menuType) {
  const submenu = document.getElementById('settings-submenu');
  const content = document.getElementById('submenu-content');
  const title = document.getElementById('submenu-title');

  if (!submenu) return;
  submenu.classList.remove('hidden');

  const menus = {
    'private-account': {
      title: 'Private Account',
      content: `
        <div class="settings-info">🔓 Approve follow requests before people can see your profile.</div>
        <div class="settings-toggle">
          <div class="toggle-label">
            <div class="toggle-label-main">Private Account</div>
            <div class="toggle-label-sub">Control who follows you</div>
          </div>
          <input type="checkbox" id="private-toggle" onchange="togglePrivateAccount()">
        </div>
        <div style="margin-top: 16px; background: var(--bg2); padding: 12px; border-radius: 8px; font-size: 12px; color: var(--text2); line-height: 1.6;">
          <strong>When your account is private:</strong><br>
          • Only approved followers see your content<br>
          • You approve follow requests<br>
          • Others can't see your followers list
        </div>
      `,
    },

    'blocked': {
      title: 'Blocked Accounts',
      content: `
        <div class="settings-info">⛔ Manage users you've blocked.</div>
        <div id="blocked-list" style="margin-top: 12px;">
          <div style="text-align: center; padding: 40px 12px; color: var(--text3);">😊 No blocked accounts yet.</div>
        </div>
      `,
    },

    'comments': {
      title: 'Comments',
      content: `
        <div class="settings-info">💬 Choose who can comment on your posts.</div>
        <select class="settings-select" onchange="updateSetting('privacy.allowComments', this.value)">
          <option value="everyone">Everyone can comment</option>
          <option value="followers">Only followers can comment</option>
          <option value="followersmentioned">Followers and mentioned users</option>
          <option value="none">No one can comment</option>
        </select>
      `,
    },

    'mentions': {
      title: 'Mentions',
      content: `
        <div class="settings-info">@ Choose who can mention you in posts.</div>
        <select class="settings-select" onchange="updateSetting('privacy.allowMentions', this.value)">
          <option value="everyone">Everyone can mention you</option>
          <option value="followers">Only followers can mention</option>
          <option value="none">No one can mention</option>
        </select>
      `,
    },

    'dms': {
      title: 'Direct Messages',
      content: `
        <div class="settings-info">✉️ Control who can send you direct messages.</div>
        <select class="settings-select" onchange="updateSetting('privacy.allowDMs', this.value)">
          <option value="everyone">Everyone can DM you</option>
          <option value="followers">Only followers can DM</option>
          <option value="none">Only people you follow</option>
        </select>
      `,
    },

    'data-saver': {
      title: 'Data Saver',
      content: `
        <div class="settings-info">📊 Reduce data consumption.</div>
        <div class="settings-toggle">
          <div class="toggle-label">
            <div class="toggle-label-main">Data Saver Mode</div>
            <div class="toggle-label-sub">Reduce video quality & disable autoplay</div>
          </div>
          <input type="checkbox" id="datasaver-toggle" onchange="updateSetting('data.dataSaver', this.checked)">
        </div>
      `,
    },

    'devices': {
      title: 'Device Requests',
      content: `
        <div class="settings-info">📱 Manage active sessions and devices.</div>
        <div style="margin-top: 12px;">
          <div style="font-size: 12px; font-weight: 500; color: var(--text); margin-bottom: 8px;">Active Sessions</div>
          <div class="settings-list-item">
            <div class="settings-list-info">
              <div class="settings-list-name">🖥️ Current Device</div>
              <div class="settings-list-detail">Right now</div>
            </div>
            <span style="font-size: 12px; color: var(--green);">Current</span>
          </div>
        </div>
      `,
    },

    'privacy-center': {
      title: 'Privacy Center',
      content: `
        <div class="settings-info">🛡️ Learn about your privacy rights and how we protect your data.</div>
        <button class="settings-button" onclick="downloadMyData()">Download My Data</button>
      `,
    },

    'legal': {
      title: 'Terms & Policies',
      content: `
        <div style="font-size: 13px; color: var(--text2); line-height: 1.6;">
          📄 Our legal documents protect both you and PitchSide.<br><br>
          • Terms of Service<br>
          • Privacy Policy<br>
          • Cookie Policy
        </div>
      `,
    },
  };

  const menu = menus[menuType];
  if (menu) {
    title.textContent = menu.title;
    content.innerHTML = menu.content;
  }
}

export function closeSettingsMenu() {
  const submenu = document.getElementById('settings-submenu');
  if (submenu) submenu.classList.add('hidden');
}

export function updateSetting(path, value) {
  settingsStore.update(path, value);
  console.log(`Setting updated: ${path} = ${value}`);
}

export function togglePrivateAccount() {
  const toggle = document.getElementById('private-toggle');
  if (toggle) updateSetting('account.privateAccount', toggle.checked);
}

export function downloadMyData() {
  alert('Data download - feature in development');
}

// ── Module init (runs once, the first time this module is imported) ──
// These three are only ever referenced by onclick/onchange strings that
// openSettingsMenu itself generates — by the time that HTML exists,
// this module has already loaded, so direct assignment is safe.
window.updateSetting = updateSetting;
window.togglePrivateAccount = togglePrivateAccount;
window.downloadMyData = downloadMyData;
