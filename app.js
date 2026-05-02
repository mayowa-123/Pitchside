// ── Scorebat Free API Highlights ──────────────────────────────
let _sbAllVideos = [];
let _sbCurrentFilter = 'all';

let _sbPage = 0;
const _sbPageSize = 20;
let _sbFiltered = [];

async function loadSBHighlights(filter) {
  _sbCurrentFilter = filter;
  _sbAllVideos = [];
  _sbPage = 0;

  // Update button styles
  document.querySelectorAll('[id^="sb-btn-"]').forEach(btn => {
    btn.style.background = 'var(--bg2)';
    btn.style.color = 'var(--text)';
  });
  const btnMap = {
    'all': 'all', 'ENGLAND: Premier League': 'pl', 'SPAIN: La Liga': 'll',
    'ITALY: Serie A': 'sa', 'GERMANY: Bundesliga': 'bl',
    'UEFA: Champions League': 'cl', 'FRANCE: Ligue 1': 'l1'
  };
  const activeId = 'sb-btn-' + (btnMap[filter] || 'all');
  const activeBtn = document.getElementById(activeId);
  if (activeBtn) { activeBtn.style.background = 'var(--green)'; activeBtn.style.color = '#fff'; }

  const grid = document.getElementById('sb-video-grid');
  grid.innerHTML = '<div style="grid-column:1/-1;text-align:center;padding:40px;color:var(--text2);"><div style="font-size:28px;">⚽</div><div style="margin-top:8px;font-size:14px;">Loading highlights...</div></div>';

  try {
    const res = await fetch('https://www.scorebat.com/video-api/v3/');
    const data = await res.json();
    _sbAllVideos = data.response || data || [];

    _sbFiltered = filter === 'all' ? _sbAllVideos :
      _sbAllVideos.filter(v =>
        (v.competition || '').toLowerCase().includes(filter.split(': ')[1]?.toLowerCase() || filter.toLowerCase())
      );

    if (!_sbFiltered.length) {
      grid.innerHTML = '<div style="grid-column:1/-1;text-align:center;padding:40px;color:var(--text2);">No highlights found for this league right now.</div>';
      return;
    }

    renderSBPage(true);

  } catch(e) {
    grid.innerHTML = `<div style="grid-column:1/-1;text-align:center;padding:40px;color:var(--text2);">Could not load highlights. Please try again.</div>`;
  }
}

function renderSBPage(reset) {
  const grid = document.getElementById('sb-video-grid');
  const start = _sbPage * _sbPageSize;
  const end = start + _sbPageSize;
  const slice = _sbFiltered.slice(start, end);
  const hasMore = _sbFiltered.length > end || _sbFiltered.length === _sbAllVideos.length;

  const cards = slice.map(v => {
    const thumb = v.thumbnail || 'https://via.placeholder.com/320x180/1a1a2e/ffffff?text=⚽';
    const title = (v.title || 'Highlight').replace(/'/g, "\\'");
    const embed = (v.videos?.[0]?.embed || v.embed || '').replace(/'/g, "\\'");
    const comp = v.competition || '';
    return `
      <div onclick="openSBPlayer('${title}','${embed}')" style="cursor:pointer;border-radius:12px;overflow:hidden;background:var(--bg2);box-shadow:var(--shadow-md);">
        <div style="position:relative;aspect-ratio:16/9;background:#111;">
          <img src="${thumb}" style="width:100%;height:100%;object-fit:cover;" onerror="this.src='https://via.placeholder.com/320x180/1a1a2e/ffffff?text=⚽'">
          <div style="position:absolute;inset:0;display:flex;align-items:center;justify-content:center;">
            <div style="width:36px;height:36px;border-radius:50%;background:rgba(16,185,129,0.9);display:flex;align-items:center;justify-content:center;">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="white"><path d="M8 5v14l11-7z"/></svg>
            </div>
          </div>
        </div>
        <div style="padding:8px;">
          <div style="font-size:11px;color:var(--green);font-weight:600;margin-bottom:3px;">${comp}</div>
          <div style="font-size:12px;color:var(--text);font-weight:500;line-height:1.3;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden;">${v.title || 'Highlight'}</div>
        </div>
      </div>`;
  }).join('');

  const loadMoreBtn = `
    <div id="sb-load-more-wrap" style="grid-column:1/-1;text-align:center;padding:16px 16px 120px;">
      <button onclick="sbLoadMore()" style="padding:10px 32px;border-radius:20px;border:none;background:var(--green);color:#fff;font-size:13px;font-weight:600;cursor:pointer;">Load More</button>
    </div>`;

  if (reset) {
    grid.innerHTML = cards + loadMoreBtn;
  } else {
    const oldWrap = document.getElementById('sb-load-more-wrap');
    if (oldWrap) oldWrap.remove();
    grid.innerHTML += cards + loadMoreBtn;
  }
}

let _sbApiPage = 1;

async function sbLoadMore() {
  _sbPage++;

  // If we still have local videos to show
  if (_sbPage * _sbPageSize < _sbFiltered.length) {
    renderSBPage(false);
    return;
  }

  // Fetch next page from Scorebat
  const btn = document.querySelector('#sb-load-more-wrap button');
  if (btn) btn.textContent = 'Loading...';

  try {
    _sbApiPage++;
    const res = await fetch(`https://www.scorebat.com/video-api/v3/?page=${_sbApiPage}`);
    const data = await res.json();
    const newVideos = data.response || data || [];

    if (!newVideos.length) {
      const wrap = document.getElementById('sb-load-more-wrap');
      if (wrap) wrap.innerHTML = '<div style="color:var(--text2);font-size:13px;padding:10px;">All highlights loaded!</div>';
      return;
    }

    _sbAllVideos = [..._sbAllVideos, ...newVideos];
    _sbFiltered = _sbCurrentFilter === 'all' ? _sbAllVideos :
      _sbAllVideos.filter(v =>
        (v.competition || '').toLowerCase().includes(_sbCurrentFilter.split(': ')[1]?.toLowerCase() || _sbCurrentFilter.toLowerCase())
      );

    renderSBPage(false);
  } catch(e) {
    if (btn) btn.textContent = 'Load More';
  }
}

function openSBPlayer(title, embedHtml) {
  const overlay = document.getElementById('sb-player-overlay');
  document.getElementById('sb-player-title').textContent = title;
  const body = document.getElementById('sb-player-body');
  const srcMatch = embedHtml.match(/src=["']([^"']+)["']/);
  const src = srcMatch ? srcMatch[1] : embedHtml;
  const cleanSrc = src.includes('youtube') || src.includes('youtu.be')
    ? src + (src.includes('?') ? '&' : '?') + 'rel=0&modestbranding=1&showinfo=0'
    : src;
  body.innerHTML = `
    <div style="position:relative;width:100%;height:100%;">
      <iframe src="${cleanSrc}" width="100%" height="100%" style="border:none;display:block;height:100%;" allowfullscreen allow="autoplay; fullscreen"></iframe>
      <!-- Cover only YouTube bottom bar - moved up more -->
      <div style="position:absolute;bottom:0;left:0;right:0;height:50px;background:#000;pointer-events:none;z-index:10;"></div>
    </div>`;
  overlay.style.display = 'flex';
  overlay.style.flexDirection = 'column';
}

function closeSBPlayer() {
  document.getElementById('sb-player-overlay').style.display = 'none';
  document.getElementById('sb-player-body').innerHTML = '';
}

// Auto load when highlights page opens
document.addEventListener('DOMContentLoaded', () => {
  const origSwitch = window.switchPage;
  window.switchPage = function(page, el) {
    if (origSwitch) origSwitch(page, el);
    if (page === 'highlights' && _sbAllVideos.length === 0) {
      loadSBHighlights('all');
    }
  };
});

/* ═══════════════════════════════════════════
   LIVE SCORES ENGINE
═══════════════════════════════════════════ */
/* ═══════════════════════════════════════════
   LIVE SCORES — populated exclusively by the
   football API in fetchLiveScores().
   Starts empty; the API fills it on page load.
═══════════════════════════════════════════ */
let lsCurrentFilter = 'all';
let lsData = [];

function initLiveScores() {
  // Start clean — show loader while live API fetches
  const wrap = document.getElementById('ls-wrap');
  if (wrap) wrap.innerHTML = `<div class="ls-loading"><div class="spinner"></div>Scanning for live matches…</div>`;
  fetchLiveScores();
}

// Auto-refresh configuration
let liveScoresRefreshInterval = null;
let liveScoresLastUpdate = 0;
const LIVESCORE_REFRESH_INTERVAL = 15000; // 15 seconds

async function fetchLiveScores() {
  // ── localStorage cache (5 min = 300,000ms) ──
  const CACHE_KEY = 'pitchside_livescores';
  const CACHE_TTL = 5 * 60 * 1000; // 5 minutes
  const today     = new Date().toISOString().split('T')[0];

  try {
    // Check cache first
    const cached = localStorage.getItem(CACHE_KEY);
    if (cached) {
      const { timestamp, dateKey, data } = JSON.parse(cached);
      const age = Date.now() - timestamp;
      if (dateKey === today && age < CACHE_TTL) {
        // ✅ Cache is fresh — use it, skip API call
        console.log(`[PitchSide] Using cached live scores (${Math.round(age/1000)}s old)`);
        lsData = data;
        renderLiveScores(lsData, lsCurrentFilter);
        liveScoresLastUpdate = timestamp;
        return;
      }
    }

    // Cache is old or missing — make API call
    console.log('[PitchSide] Fetching fresh live scores from API...');
    const res = await fetch(`/api/football?endpoint=fixtures&date=${today}`, {
      headers: {},
      signal: AbortSignal.timeout(4000)
    });
    if (!res.ok) return;
    const data = await res.json();
    if (!data.response || data.response.length < 3) return;

    // Transform API data into our format
    const grouped = {};
    data.response.forEach(f => {
      const key = f.league.id;
      if (!grouped[key]) grouped[key] = {
        league: f.league.name, country: f.league.country,
        flag: countryFlag(f.league.country), matches: []
      };
      const st = f.fixture.status.short;
      const isLive = ['1H','2H','ET','BT','P','INT'].includes(st);
      grouped[key].matches.push({
        id: String(f.fixture.id),
        time: f.fixture.date ? new Date(f.fixture.date).toLocaleTimeString([],{hour:'2-digit',minute:'2-digit'}) : '--:--',
        status: st === 'FT' ? 'FT' : st === 'NS' ? 'NS' : isLive ? (f.fixture.status.elapsed + '\'') : st,
        home: {name: f.teams.home.name, badge: '⚽'},
        away: {name: f.teams.away.name, badge: '⚽'},
        scoreH: f.goals.home,
        scoreA: f.goals.away,
        minute: f.fixture.status.elapsed,
        isLive,
      });
    });

    lsData = Object.values(grouped);
    renderLiveScores(lsData, lsCurrentFilter);
    liveScoresLastUpdate = Date.now();

    // ✅ Save fresh data to localStorage with timestamp
    try {
      localStorage.setItem(CACHE_KEY, JSON.stringify({
        timestamp: liveScoresLastUpdate,
        dateKey:   today,
        data:      lsData
      }));
      console.log('[PitchSide] Live scores cached to localStorage');
    } catch(cacheErr) {
      console.warn('[PitchSide] Could not cache to localStorage:', cacheErr);
    }

  } catch(e) {
    // API failed — try to use any cached data even if stale
    try {
      const cached = localStorage.getItem(CACHE_KEY);
      if (cached) {
        const { data } = JSON.parse(cached);
        lsData = data;
        renderLiveScores(lsData, lsCurrentFilter);
        console.log('[PitchSide] API failed, using stale cache as fallback');
      }
    } catch(_) { /* cache read failed — feed stays empty until API responds */ }
  }
}

function startLiveScoresRefresh() {
  // Clear existing interval if any
  if (liveScoresRefreshInterval) clearInterval(liveScoresRefreshInterval);
  
  // Fetch immediately
  fetchLiveScores();
  
  // Then set up periodic refresh
  liveScoresRefreshInterval = setInterval(() => {
    fetchLiveScores();
  }, LIVESCORE_REFRESH_INTERVAL);
}

function stopLiveScoresRefresh() {
  if (liveScoresRefreshInterval) {
    clearInterval(liveScoresRefreshInterval);
    liveScoresRefreshInterval = null;
  }
}

function countryFlag(country) {
  const map = {'England':'🏴󠁧󠁢󠁥󠁮󠁧󠁿','Spain':'🇪🇸','Germany':'🇩🇪','Italy':'🇮🇹','France':'🇫🇷',
    'Brazil':'🇧🇷','Argentina':'🇦🇷','Nigeria':'🇳🇬','South Africa':'🇿🇦','USA':'🇺🇸',
    'Portugal':'🇵🇹','Netherlands':'🇳🇱','Turkey':'🇹🇷','Mexico':'🇲🇽','Japan':'🇯🇵',
    'World':'🌍','Africa':'🌍','South America':'🌎'};
  return map[country] || '🏳️';
}

function filterLive(filter, btn) {
  lsCurrentFilter = filter;
  document.querySelectorAll('.ls-pill').forEach(p => p.classList.remove('on'));
  btn.classList.add('on');
  renderLiveScores(lsData, filter);
}

function renderLiveScores(groups, filter) {
  const wrap = document.getElementById('ls-wrap');
  if (!wrap) return;

  let html = '';
  let totalShown = 0;

  groups.forEach(group => {
    const filtered = group.matches.filter(m => {
      const st = m.status;
      if (filter === 'all') return true;
      if (filter === 'live') return st !== 'FT' && st !== 'NS' && st !== 'Canc.';
      if (filter === 'finished') return st === 'FT';
      if (filter === 'upcoming') return st === 'NS';
      return true;
    });

    if (filtered.length === 0) return;
    totalShown += filtered.length;

    html += `
      <div class="ls-league-group">
        <div class="ls-league-hdr">
          <div class="ls-league-flag">${group.flag}</div>
          <div class="ls-league-info">
            <div class="ls-league-name">${group.league}</div>
            <div class="ls-league-country">${group.country}</div>
          </div>
        </div>`;

    filtered.forEach(m => {
      const st = m.status;
      const isFT = st === 'FT' || st === 'AET';
      const isNS = st === 'NS';
      const isLive = !isFT && !isNS;
      const hasScore = m.scoreH !== null && m.scoreA !== null;

      const homeWin = hasScore && m.scoreH > m.scoreA;
      const awayWin = hasScore && m.scoreA > m.scoreH;

      let timeCol = '';
      if (isLive) {
        timeCol = `<span class="ls-live-dot"></span><span class="ls-live-min">${st}</span>`;
      } else if (isFT) {
        timeCol = `<span class="ls-finished">FT</span>`;
      } else {
        timeCol = `<span class="ls-time">${m.time}</span>`;
      }

      const scoreDisp = hasScore
        ? `<div class="ls-score ${homeWin ? 'winner' : ''}">${m.scoreH}</div><div class="ls-score ${awayWin ? 'winner' : ''}">${m.scoreA}</div>`
        : `<div class="ls-score" style="color:var(--text3)">-</div><div class="ls-score" style="color:var(--text3)">-</div>`;

      html += `
        <div class="ls-match" onclick="openMatchDetail('${m.id}','${m.home.name} vs ${m.away.name}')">
          <div class="ls-time-col">${timeCol}</div>
          <div class="ls-teams-col">
            <div class="ls-team-row">
              <div class="ls-team-badge">${m.home.badge}</div>
              <div class="ls-team-name ${homeWin ? 'winner' : ''}">${m.home.name}</div>
            </div>
            <div class="ls-team-row">
              <div class="ls-team-badge">${m.away.badge}</div>
              <div class="ls-team-name ${awayWin ? 'winner' : ''}">${m.away.name}</div>
            </div>
          </div>
          <div class="ls-scores-col">${scoreDisp}</div>
        </div>`;
    });

    html += `</div>`;
  });

  if (totalShown === 0) {
    html = `<div class="ls-loading" style="color:var(--text3);">
      <div style="font-size:32px;">⚽</div>No matches for this filter</div>`;
  }

  wrap.innerHTML = html;
}

/* ═══════════════════════════════════════════
   VIDEO DATA SYSTEM
/* ═══════════════════════════════════════════
   VIDEO DATA — Firebase is the SINGLE SOURCE OF TRUTH
   VIDEOS array starts empty. The onSnapshot listener
   (activated after auth) is the ONLY thing that fills it.
   Your Python robot writes to 'highlights' in Firestore;
   onSnapshot fires instantly and updates every open feed.
═══════════════════════════════════════════ */
let VIDEOS = []; // starts empty — Firebase fills this
let _highlightlyVideos = []; // filled by Highlightly API or stays empty

// Active Firestore listener handle (so we can unsub on demand)
let _firestoreUnsubscribe = null;

/* ─────────────────────────────────────────
   MAP FIRESTORE DOCUMENT → VIDEOS OBJECT
   Handles both your Python robot's schema
   AND user-uploaded posts.
───────────────────────────────────────── */
function _firestoreDocToVideo(docSnap) {
  const d  = docSnap.data();
  const id = docSnap.id; // ← CRITICAL: use Firestore document ID as videoId

  // Resolve media URL — try all known field names your robot may use
  const rawMediaUrl =
    d.mediaUrl   || d.video_url  || d.videoUrl  ||
    d.embedUrl   || d.embed_url  ||
    (d.youtubeId ? 'https://www.youtube.com/embed/' + d.youtubeId : '') ||
    d.url        || d.src        || '';

  // Apply Cloudinary auto-quality if applicable
  const mediaUrl = applyCloudinaryQuality(rawMediaUrl);

  // Thumbnail — try all known field names
  const thumbnail =
    applyCloudinaryQuality(
      d.thumbnail || d.thumbnail_url || d.thumbUrl ||
      d.image     || d.poster_url    || ''
    );

  // Embed HTML — some robots store an <iframe> string
  const embedHtml = d.embed || d.embedHtml || d.embed_html || '';
  const embedUrl  = d.embedUrl || d.embed_url || d.videoUrl || '';

  // Competition / category
  const competition = d.competition || d.league || d.source || 'Football';
  const cat         = d.cat || mapCompetitionToCategory(competition);

  // Dates — Firestore Timestamp or plain string
  let dateStr = 'Today';
  try {
    const ts = d.createdAt || d.date || d.publishedAt;
    if (ts && ts.toDate) {
      dateStr = ts.toDate().toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
    } else if (ts) {
      dateStr = new Date(ts).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
    }
  } catch(_) {}

  return {
    // Use Firestore doc ID directly for TikTok swipe logic
    id,
    firestoreId: id,

    title:       d.title       || d.teams  || d.matchTitle || 'Football Highlight',
    description: d.description || d.desc   || d.summary    || '',
    date:        dateStr,
    cat,
    competition,

    src:         mediaUrl,
    embed:       embedHtml,
    embedUrl:    embedUrl,
    thumbnail,

    poster:      d.poster      || d.posterHandle || d.userName
                   ? ('@' + (d.userName || d.poster || 'pitchside')
                         .replace(/\s+/g,'').toLowerCase().slice(0,15))
                   : '@pitchside_official',

    avatarSeed:  d.userId      || id,
    likes:       d.likes       || 0,
    comments:    d.comments    || 0,
    saved:       false,

    // Source flags — used by Verified Badge logic
    fromAPI:     d.fromAPI     || d.isOfficial || false,
    userPost:    d.userPost    || false,

    // Extra robot fields (pass through for AI insight etc.)
    taggedMatch: d.taggedMatch || null,
    music:       d.music       || null,
  };
}

/* ─────────────────────────────────────────
   COMPETITION → CATEGORY MAPPER (unchanged)
───────────────────────────────────────── */
function mapCompetitionToCategory(name = '') {
  const n = name.toLowerCase();
  if (n.includes('champions') || n.includes('ucl'))  return 'UCL';
  if (n.includes('premier')   || n.includes('epl'))  return 'PL';
  if (n.includes('nigeria')   || n.includes('npfl')) return 'NPFL';
  if (n.includes('bundesliga'))                       return 'Bundesliga';
  if (n.includes('la liga')   || n.includes('laliga')) return 'La Liga';
  if (n.includes('serie a'))                          return 'Serie A';
  if (n.includes('ligue'))                            return 'Ligue 1';
  if (n.includes('afcon')     || n.includes('africa')) return 'Africa';
  if (n.includes('world cup') || n.includes('fifa'))  return 'World Cup';
  return 'Highlights';
}

/* ─────────────────────────────────────────
   FIREBASE REAL-TIME LISTENER
   Called once auth is confirmed.
   Uses onSnapshot → instant updates when
   the Python robot writes to 'highlights'.
───────────────────────────────────────── */
function activateFirebaseListener() {
  // Prevent double-subscription
  if (_firestoreUnsubscribe) return;

  const fsApi = window._psFs;
  const db    = window._psDb;
  if (!fsApi || !db || !fsApi.onSnapshot) {
    console.warn('[PitchSide] Firestore not ready — retrying in 1s');
    // Cap retries: if VIDEOS is still empty after 8s from first call, use fallback
    if (!activateFirebaseListener._retryCount) activateFirebaseListener._retryCount = 0;
    activateFirebaseListener._retryCount++;
    if (activateFirebaseListener._retryCount > 8) {
      console.warn('[PitchSide] Firebase SDK never loaded — using fallback content');
      loadFallbackVideos();
      return;
    }
    setTimeout(activateFirebaseListener, 1000);
    return;
  }
  activateFirebaseListener._retryCount = 0;

  console.log('[PitchSide] 🔥 Activating Firebase real-time listener on "highlights"…');
  showFirebaseFetchingState(); // CHANGE 3: professional loading state

  const { collection, query, orderBy, limit, onSnapshot } = fsApi;

  const q = query(
    collection(db, 'highlights'),
    orderBy('createdAt', 'desc'),
    limit(200)
  );

  _firestoreUnsubscribe = onSnapshot(q,
    // ── SUCCESS: fires immediately with current data, then on every new write ──
    (snapshot) => {
      console.log('[PitchSide] 🔥 onSnapshot fired —', snapshot.docs.length, 'docs');

      const firebaseDocs = snapshot.docs.map(_firestoreDocToVideo);

      // Merge: Highlightly API highlights first, then Firebase docs, then local user posts
      const userPosts = VIDEOS.filter(v => v.userPost && !v.firestoreId);
      VIDEOS = [..._highlightlyVideos, ...firebaseDocs, ...userPosts];

      console.log('[PitchSide] VIDEOS updated:', VIDEOS.length, 'total');
      refreshAllVideoGrids();

      // If Firebase returned zero docs, load fallback content
      if (VIDEOS.length === 0) {
        loadFallbackVideos();
      }
    },
    // ── ERROR ──
    (err) => {
      console.error('[PitchSide] Firestore onSnapshot error:', err);
      if (VIDEOS.length === 0) loadFallbackVideos();
    }
  );
}

/* ─────────────────────────────────────────
   REFRESH ALL GRIDS (unchanged signature,
   now driven by Firebase VIDEOS array)
───────────────────────────────────────── */
function refreshAllVideoGrids() {
  // Check if user has an active explore filter — preserve it; otherwise render all
  try {
    const activeExpPill = document.querySelector('#page-explore .pill.on');
    const onAttr = activeExpPill ? activeExpPill.getAttribute('onclick') : '';
    if (!onAttr || onAttr.includes("'all'")) {
      if (typeof _renderExploreAll === 'function') _renderExploreAll();
      else renderVideos('explore-grid', VIDEOS);
    }
    // else: a specific filter pill is active — leave the grid as-is
  } catch(e) {
    try { renderVideos('explore-grid', VIDEOS); } catch(e2){}
  }
  try { renderVideos('dash-grid', VIDEOS.slice(0, 4)); } catch(e){}
  // Refresh highlights panel whenever Firebase fires
  try {
    if (typeof _renderHighlightsFromVideos === 'function') {
      _renderHighlightsFromVideos();
    }
  } catch(e){}
}

/* ─────────────────────────────────────────
   CHANGE 3: PROFESSIONAL FETCHING STATE
   Shown while waiting for Firebase's first
   onSnapshot response.
───────────────────────────────────────── */
function showFirebaseFetchingState() {
  const fetchHTML = `
    <div id="firebase-fetch-state" style="
      display:flex; flex-direction:column; align-items:center; justify-content:center;
      padding:52px 24px; text-align:center;
    ">
      <!-- Spinning football -->
      <div style="position:relative;width:72px;height:72px;margin-bottom:22px;">
        <div style="
          width:72px;height:72px;border-radius:50%;
          border:3px solid rgba(16,185,129,0.15);
          border-top-color:#10b981;
          animation:spin 0.9s linear infinite;
          position:absolute;inset:0;
        "></div>
        <div style="
          position:absolute;inset:0;display:flex;align-items:center;justify-content:center;
          font-size:32px;
        ">⚽</div>
      </div>
      <div style="font-size:17px;font-weight:800;color:var(--text);margin-bottom:8px;letter-spacing:-.01em;">
        📡 PitchSide is scanning the globe for goals...
      </div>
      <div style="font-size:13px;color:var(--text3);max-width:240px;line-height:1.6;">
        hang tight!
      </div>
      <!-- Pulsing dots -->
      <div style="display:flex;gap:6px;margin-top:20px;">
        <div style="width:7px;height:7px;background:#10b981;border-radius:50%;animation:aiDot 1.2s ease-in-out infinite;"></div>
        <div style="width:7px;height:7px;background:#10b981;border-radius:50%;animation:aiDot 1.2s ease-in-out .2s infinite;"></div>
        <div style="width:7px;height:7px;background:#10b981;border-radius:50%;animation:aiDot 1.2s ease-in-out .4s infinite;"></div>
      </div>
    </div>`;
  ['home-grid','explore-grid','dash-grid'].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.innerHTML = fetchHTML;
  });
}

/* Skeleton cards — used while paginating or refreshing */
function showFeedSkeleton() {
  const skeletonCard = () => `
    <div style="background:var(--bg2);border-radius:12px;overflow:hidden;border:1px solid var(--border);animation:pulse 1.5s infinite;">
      <div style="aspect-ratio:16/9;background:var(--bg3);"></div>
      <div style="padding:13px;">
        <div style="height:14px;background:var(--bg3);border-radius:6px;margin-bottom:8px;"></div>
        <div style="height:12px;background:var(--bg3);border-radius:6px;width:60%;"></div>
      </div>
    </div>`;
  ['home-grid','explore-grid','dash-grid'].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.innerHTML = Array(4).fill(0).map(skeletonCard).join('');
  });
}

function showVideoFeedError(reason) {
  const errorHTML = `
    <div style="text-align:center;padding:48px 24px;color:var(--text2);">
      <div style="font-size:48px;margin-bottom:14px;">📡</div>
      <div style="font-size:15px;font-weight:700;color:var(--text);margin-bottom:6px;">Feed temporarily unavailable</div>
      <div style="font-size:13px;color:var(--text3);margin-bottom:20px;">
        Waiting for Firebase connection…<br>
        <span style="font-size:11px;opacity:.6;">${reason || ''}</span>
      </div>
      <button onclick="activateFirebaseListener()"
        style="padding:10px 24px;background:var(--blue);color:#fff;border:none;border-radius:10px;
               font-size:13px;font-weight:600;font-family:'DM Sans',sans-serif;cursor:pointer;">
        🔄 Reconnect
      </button>
    </div>`;
  ['home-grid','explore-grid','dash-grid'].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.innerHTML = errorHTML;
  });
}

/* ═══════════════════════════════════════════
   FALLBACK DEMO CONTENT (shown when Firebase/API unavailable)
═══════════════════════════════════════════ */
function loadFallbackVideos() {
  // Firebase bot already filled the highlights collection.
  // onSnapshot will populate VIDEOS automatically — just show loader.
  if (VIDEOS.length > 0) return;
  showFirebaseFetchingState();
}

/* ═══════════════════════════════════════════
   VIDEO GRID RENDERING
═══════════════════════════════════════════ */

/* ═══════════════════════════════════════════
   TICKER — filled exclusively by live API.
   Stays empty until fetchLiveScores() responds.
═══════════════════════════════════════════ */

/* ═══════════════════════════════════════════
   MATCH DETAILS — loaded on demand from the
   live API when a user taps a match row.
═══════════════════════════════════════════ */
const MATCH_DETAILS = {}; // populated by live API only

/* ═══════════════════════════════════════════
   TEAM & LEAGUE DATA
═══════════════════════════════════════════ */
const ALL_TEAMS = [
  // England
  {name:'Arsenal',         icon:'🔴', group:'Premier League'},
  {name:'Chelsea',         icon:'🔵', group:'Premier League'},
  {name:'Liverpool',       icon:'🔴', group:'Premier League'},
  {name:'Man City',        icon:'🩵', group:'Premier League'},
  {name:'Man United',      icon:'🔴', group:'Premier League'},
  {name:'Newcastle',       icon:'⚫', group:'Premier League'},
  {name:'Spurs',           icon:'⚪', group:'Premier League'},
  {name:'Aston Villa',     icon:'🟣', group:'Premier League'},
  {name:'Brighton',        icon:'🔵', group:'Premier League'},
  {name:'West Ham',        icon:'🔵', group:'Premier League'},
  // Spain
  {name:'Real Madrid',     icon:'⚪', group:'La Liga'},
  {name:'Barcelona',       icon:'🔵', group:'La Liga'},
  {name:'Atlético Madrid', icon:'🔴', group:'La Liga'},
  {name:'Sevilla',         icon:'⚪', group:'La Liga'},
  {name:'Villarreal',      icon:'🟡', group:'La Liga'},
  {name:'Athletic Bilbao', icon:'🔴', group:'La Liga'},
  {name:'Real Sociedad',   icon:'🔵', group:'La Liga'},
  // Germany
  {name:'Bayern Munich',   icon:'🔴', group:'Bundesliga'},
  {name:'Borussia Dortmund',icon:'🟡',group:'Bundesliga'},
  {name:'Bayer Leverkusen',icon:'🔴', group:'Bundesliga'},
  {name:'RB Leipzig',      icon:'🔴', group:'Bundesliga'},
  {name:'Eintracht Frankfurt',icon:'⚫',group:'Bundesliga'},
  // Italy
  {name:'Juventus',        icon:'⚫', group:'Serie A'},
  {name:'AC Milan',        icon:'🔴', group:'Serie A'},
  {name:'Inter Milan',     icon:'🔵', group:'Serie A'},
  {name:'Napoli',          icon:'🩵', group:'Serie A'},
  {name:'AS Roma',         icon:'🟡', group:'Serie A'},
  {name:'Lazio',           icon:'🩵', group:'Serie A'},
  // France
  {name:'PSG',             icon:'🔵', group:'Ligue 1'},
  {name:'Marseille',       icon:'🩵', group:'Ligue 1'},
  {name:'Monaco',          icon:'🔴', group:'Ligue 1'},
  {name:'Lyon',            icon:'🔴', group:'Ligue 1'},
  // Portugal
  {name:'Benfica',         icon:'🔴', group:'Primeira Liga'},
  {name:'Porto',           icon:'🔵', group:'Primeira Liga'},
  {name:'Sporting CP',     icon:'🟢', group:'Primeira Liga'},
  // Netherlands
  {name:'Ajax',            icon:'🔴', group:'Eredivisie'},
  {name:'PSV Eindhoven',   icon:'🔴', group:'Eredivisie'},
  {name:'Feyenoord',       icon:'🔴', group:'Eredivisie'},
  // Africa & Others
  {name:'Al-Ahly',         icon:'🔴', group:'CAF'},
  {name:'Zamalek',         icon:'⚪', group:'CAF'},
  {name:'Mamelodi Sundowns',icon:'🟡',group:'CAF'},
  {name:'Raja Casablanca', icon:'🟢', group:'CAF'},
  {name:'Wydad Casablanca',icon:'🔴', group:'CAF'},
];

const ALL_LEAGUES = [
  // Europe – Top 5
  {name:'Premier League',      icon:'🏴󠁧󠁢󠁥󠁮󠁧󠁿', group:'Europe', checked:true},
  {name:'La Liga',             icon:'🇪🇸', group:'Europe', checked:true},
  {name:'Champions League',    icon:'⭐', group:'Europe', checked:true},
  {name:'Bundesliga',          icon:'🇩🇪', group:'Europe'},
  {name:'Serie A',             icon:'🇮🇹', group:'Europe'},
  {name:'Ligue 1',             icon:'🇫🇷', group:'Europe'},
  // Europe – Other
  {name:'Europa League',       icon:'🟠', group:'Europe'},
  {name:'Conference League',   icon:'🟢', group:'Europe'},
  {name:'Eredivisie',          icon:'🇳🇱', group:'Europe'},
  {name:'Primeira Liga',       icon:'🇵🇹', group:'Europe'},
  {name:'Scottish Premiership',icon:'🏴󠁧󠁢󠁳󠁣󠁴󠁿', group:'Europe'},
  {name:'Super Lig',           icon:'🇹🇷', group:'Europe'},
  // Americas
  {name:'MLS',                 icon:'🇺🇸', group:'Americas'},
  {name:'Copa Libertadores',   icon:'🌎', group:'Americas'},
  {name:'Brasileirão',         icon:'🇧🇷', group:'Americas'},
  {name:'Liga MX',             icon:'🇲🇽', group:'Americas'},
  {name:'Argentine Primera',   icon:'🇦🇷', group:'Americas'},
  // Africa
  {name:'CAF Champions League',icon:'🌍', group:'Africa'},
  {name:'NPFL (Nigeria)',      icon:'🇳🇬', group:'Africa'},
  {name:'ABSA Prem (SA)',      icon:'🇿🇦', group:'Africa'},
  {name:'Ethiopian Prem',      icon:'🇪🇹', group:'Africa'},
  {name:'CAF Confederation',   icon:'🏆', group:'Africa'},
  // Asia & Rest
  {name:'AFC Champions League',icon:'🌏', group:'Asia'},
  {name:'Saudi Pro League',    icon:'🇸🇦', group:'Asia'},
  {name:'J-League',            icon:'🇯🇵', group:'Asia'},
  {name:'A-League',            icon:'🇦🇺', group:'Asia'},
  // International
  {name:'FIFA World Cup',      icon:'🏆', group:'International'},
  {name:'AFCON',               icon:'🌍', group:'International'},
  {name:'UEFA Nations League', icon:'🇪🇺', group:'International'},
  {name:'CONCACAF Gold Cup',   icon:'🌎', group:'International'},
];

const CHECK_SVG = `<svg width="10" height="10" stroke="white" stroke-width="3" fill="none" stroke-linecap="round" stroke-linejoin="round" viewBox="0 0 24 24"><path d="M20 6L9 17l-5-5"/></svg>`;

// Track selections in Sets
const selectedTeams   = new Set(['Real Madrid']);
const selectedLeagues = new Set(['Premier League','La Liga','Champions League']);

function renderSelectionList(containerId, items, selectedSet) {
  const container = document.getElementById(containerId);
  if (!container) return;

  // Group items
  const groups = {};
  items.forEach(item => {
    if (!groups[item.group]) groups[item.group] = [];
    groups[item.group].push(item);
  });

  let html = '';
  Object.entries(groups).forEach(([groupName, groupItems]) => {
    html += `<div style="padding:8px 16px 4px; font-size:10px; font-weight:700; letter-spacing:.08em; color:var(--text3); background:var(--bg); text-transform:uppercase;">${groupName}</div>`;
    groupItems.forEach(item => {
      const checked = selectedSet.has(item.name);
      html += `
        <div class="sel-item" onclick="toggleSelData(this,'${item.name.replace(/'/g,"\\'")}',${containerId === 'team-list' ? 'selectedTeams' : 'selectedLeagues'})">
          <div class="sel-item-icon">${item.icon}</div>
          <div class="sel-item-name">${item.name}</div>
          <div class="sel-check ${checked ? 'checked' : ''}">${CHECK_SVG}</div>
        </div>`;
    });
  });

  container.innerHTML = html;
}

function toggleSelData(el, name, setRef) {
  const check = el.querySelector('.sel-check');
  check.classList.toggle('checked');
  const on = check.classList.contains('checked');
  if (on) setRef.add(name); else setRef.delete(name);
  showToast(on ? `Following ${name} ✓` : `Unfollowed ${name}`);
  updateProfileStats();
}

/* ═══════════════════════════════════════════
   SAVED HIGHLIGHTS (persisted in memory)
═══════════════════════════════════════════ */
let savedHighlights = new Set();

function toggleSaveVideo(videoId) {
  if (savedHighlights.has(videoId)) {
    savedHighlights.delete(videoId);
    showToast('Removed from Saved');
  } else {
    savedHighlights.add(videoId);
    showToast('Saved to Highlights ✓');
  }
  // Update save label in overlay if it's the current video
  if (videoId === currentVideoId) {
    const lbl = document.getElementById('tt-save-label');
    if (lbl) lbl.textContent = savedHighlights.has(videoId) ? 'Saved ✓' : 'Save';
  }
  renderSavedPanel();
  updateProfileStats();
  // home removed
  renderVideos('explore-grid', VIDEOS);
  renderVideos('dash-grid',    VIDEOS.slice(0, 2));
}

function renderSavedPanel() {
  const container = document.getElementById('saved-highlights-list');
  if (!container) return;
  const saved = VIDEOS.filter(v => savedHighlights.has(v.id));
  if (saved.length === 0) {
    container.innerHTML = `<div class="empty-state"><div class="empty-icon">🎬</div>No saved highlights yet.<br>Tap the bookmark on any video.</div>`;
  } else {
    container.innerHTML = saved.map(v => `
      <div class="sel-item" onclick="openVideoOverlay(${v.id})">
        <div class="sel-item-icon">▶️</div>
        <div class="sel-item-name">${v.title}</div>
        <div style="font-size:11px;color:var(--text3);">${v.date}</div>
      </div>
    `).join('');
  }
}

/* ═══════════════════════════════════════════
   PAGE NAVIGATION
═══════════════════════════════════════════ */
function switchPage(pageId, navEl) {
  document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
  document.getElementById('page-' + pageId).classList.add('active');
  document.querySelectorAll('.nav-item').forEach(n => n.classList.remove('active'));
  if (navEl) navEl.classList.add('active');
  document.getElementById('page-' + pageId).scrollTop = 0;
  if (pageId === 'live') {
    initLiveScores();
    startLiveScoresRefresh();
  } else {
    stopLiveScoresRefresh();
  }
}

/* ═══════════════════════════════════════════
   TICKER — live API only, no hardcoded data
═══════════════════════════════════════════ */
let tickerRefreshInterval = null;
const TICKER_REFRESH_INTERVAL = 20000; // 20 seconds

async function initTicker() {
  // Start empty — show a waiting state while the API loads
  renderTicker([]);

  // Attempt live fetch
  try {
    const res = await fetch('/api/football?endpoint=fixtures&live=all', {
      headers: {},
      signal: AbortSignal.timeout(3000)
    });
    if (res.ok) {
      const data = await res.json();
      if (data.response && data.response.length > 0) {
        const matches = data.response.slice(0, 6).map(f => ({
          home: f.teams.home.name,
          away: f.teams.away.name,
          score: `${f.goals.home ?? 0} - ${f.goals.away ?? 0}`,
          status: f.fixture.status.short === 'LIVE' ? 'LIVE' : f.fixture.status.short,
          matchId: String(f.fixture.id),
          minute: f.fixture.status.elapsed
        }));
        renderTicker(matches);
      }
    }
  } catch(e) {
    // API unreachable — ticker stays empty, no dummy data shown
  }

  startTickerRefresh();
}

function startTickerRefresh() {
  if (tickerRefreshInterval) clearInterval(tickerRefreshInterval);
  tickerRefreshInterval = setInterval(async () => {
    try {
      const res = await fetch('/api/football?endpoint=fixtures&live=all', {
        headers: {},
        signal: AbortSignal.timeout(3000)
      });
      if (res.ok) {
        const data = await res.json();
        if (data.response && data.response.length > 0) {
          const matches = data.response.slice(0, 6).map(f => ({
            home: f.teams.home.name,
            away: f.teams.away.name,
            score: `${f.goals.home ?? 0} - ${f.goals.away ?? 0}`,
            status: f.fixture.status.short === 'LIVE' ? 'LIVE' : f.fixture.status.short,
            matchId: String(f.fixture.id),
            minute: f.fixture.status.elapsed
          }));
          renderTicker(matches);
        }
      }
    } catch(e) {
      // silently continue
    }
  }, TICKER_REFRESH_INTERVAL);
}

function stopTickerRefresh() {
  if (tickerRefreshInterval) {
    clearInterval(tickerRefreshInterval);
    tickerRefreshInterval = null;
  }
}

function renderTicker(matches) {
  const container = document.getElementById('ticker-row');
  container.innerHTML = matches.map(m => {
    const isLive = m.status === 'LIVE' || m.status === '1H' || m.status === '2H';
    const isHT   = m.status === 'HT';
    const active = isLive || isHT;
    const displayStatus = isLive && m.minute ? `${m.minute}'` : m.status;
    return `
      <div class="t-card" onclick="openMatchDetail('${m.matchId}', '${m.home} vs ${m.away}')">
        <div class="t-teams"><div>${m.home}</div><div>${m.away}</div></div>
        <div class="t-score">${m.score}</div>
        <div class="t-live" style="background:${active ? '#fde047' : '#333'}; color:${active ? '#b91c1c' : '#999'};">
          ${displayStatus}
        </div>
      </div>`;
  }).join('');
}

function formatCount(n) {
  if (!n) return '0';
  if (n >= 1000000) return (n/1000000).toFixed(1).replace('.0','') + 'M';
  if (n >= 1000) return (n/1000).toFixed(1).replace('.0','') + 'K';
  return String(n);
}

/* ═══════════════════════════════════════════
   VIDEO GRID RENDERING — Discover/TikTok Hybrid
═══════════════════════════════════════════ */
/* ── FEATURE 5: Cloudinary Auto-Quality URL helper ── */
function applyCloudinaryQuality(url) {
  if (!url || typeof url !== 'string') return url;
  // Only transform URLs that go through Cloudinary
  if (!url.includes('res.cloudinary.com') && !url.includes('cloudinary.com/djqxj5twp')) return url;
  try {
    // Insert f_auto,q_auto into the upload transformation slot
    return url.replace(/(\/upload\/)/, '$1f_auto,q_auto/');
  } catch(e) { return url; }
}

/* ── FEATURE 1: Source type badge HTML ── */
function _sourceBadge(v) {
  // Player behind the scenes
  if (v.playerPost) {
    return `<span class="player-post-badge">⭐ Player</span>`;
  }
  // Fan upload
  if (v.userPost) {
    return `<span class="user-post-badge">👤 Fan Post</span>`;
  }
  // Official highlight from Highlightly API or robot pipeline
  if (v.fromAPI || (v.competition && !v.userPost && !v.playerPost)) {
    return `<span class="verified-badge">
      <svg fill="none" stroke="white" stroke-width="3" stroke-linecap="round" stroke-linejoin="round" viewBox="0 0 24 24"><path d="M20 6L9 17l-5-5"/></svg>
      OFFICIAL
    </span>`;
  }
  return '';
}

function renderVideos(containerId, data) {
  const container = document.getElementById(containerId);
  if (!container) return;
  if (!data || !data.length) {
    showFirebaseFetchingState();
    return;
  }

  container.innerHTML = data.map(v => {
    const isSaved = savedHighlights.has(v.id);
    const hasThumbnail = v.thumbnail && v.thumbnail.length > 10;
    // FEATURE 5: Apply Cloudinary auto-quality to thumbnail URL
    const thumbUrl = applyCloudinaryQuality(v.thumbnail || '');
    const compBadge = v.competition ? `<span style="background:rgba(16,185,129,0.15);color:#10b981;border-radius:10px;padding:2px 7px;font-size:9px;font-weight:700;letter-spacing:.04em;">${v.competition.toUpperCase().slice(0,18)}</span>` : '';
    const catColors = {
      'UCL':'#3b82f6','PL':'#6366f1','NPFL':'#16a34a','Trending':'#f43f5e',
      'Nigeria':'#16a34a','Africa':'#f59e0b','La Liga':'#ef4444','Bundesliga':'#eab308',
    };
    const catColor = catColors[v.cat] || '#10b981';
    // FEATURE 1: source type badge
    const sourceBadge = _sourceBadge(v);
    // FEATURE 3: AI insight overlay — description text is v.description or v.title as fallback
    const aiDescription = v.description || v.title || '';
    // Demo card: uses gradient bg + emoji, tapping opens YouTube search
    const isDemoCard = v.id && String(v.id).startsWith('demo');
    const gradA = v.gradientA || '#0f172a';
    const gradB = v.gradientB || '#1e293b';
    const cardClick = ''; // demo cards removed — all videos come from Firebase bot

    return `
    <div class="vcard" id="vcard-${v.id}" data-videoid="${v.id}" style="position:relative;" ${cardClick}>
      <!-- FEATURE 2 (Lazy Loading): Thumbnail always visible; embed slot overlays it when Intersection Observer fires -->
      <div class="vthumb" style="position:relative;" id="vcard-thumb-${v.id}">
        ${isDemoCard
          ? `<div style="width:100%;height:100%;background:linear-gradient(135deg,${gradA},${gradB});display:flex;flex-direction:column;align-items:center;justify-content:center;gap:10px;">
               <div style="font-size:52px;filter:drop-shadow(0 2px 8px rgba(0,0,0,0.5));">${v.emoji || getCatEmoji(v.cat)}</div>
               <div style="background:rgba(16,185,129,0.9);border-radius:50%;width:52px;height:52px;display:flex;align-items:center;justify-content:center;box-shadow:0 4px 20px rgba(16,185,129,0.5);">
                 <svg width="22" height="22" fill="white" viewBox="0 0 24 24"><path d="M8 5v14l11-7z"/></svg>
               </div>
             </div>`
          : hasThumbnail
            ? `<img src="${thumbUrl}" alt="${v.title}" loading="lazy"
                 style="width:100%;height:100%;object-fit:cover;display:block;"
                 onerror="this.style.display='none';this.nextElementSibling.style.display='flex';">
               <div class="vthumb-ph" style="background:linear-gradient(135deg,#0f172a,#1e293b);display:none;">`
            : `<div class="vthumb-ph" style="background:linear-gradient(135deg,#0f172a,#1e293b);">`
        }
        ${!isDemoCard ? `
          <div style="font-size:32px;margin-bottom:6px;">${v.emoji || getCatEmoji(v.cat)}</div>
          <div class="play-btn">
            <svg width="22" height="22" fill="white" viewBox="0 0 24 24"><path d="M8 5v14l11-7z"/></svg>
          </div>
        </div>` : ''}
        <!-- Embed slot: ONLY loaded when card crosses 60% viewport (lazy loading) -->
        <div id="vcard-embed-${v.id}" style="display:none;position:absolute;inset:0;width:100%;height:100%;background:#000;overflow:hidden;"></div>
        <!-- Competition label top-left -->
        <div style="position:absolute;top:8px;left:8px;background:rgba(0,0,0,0.65);backdrop-filter:blur(4px);border-radius:8px;padding:3px 8px;font-size:9px;font-weight:700;color:#fff;letter-spacing:.04em;z-index:5;">${v.competition || v.cat}</div>
        <!-- FEATURE 1: Official Verified badge top-right (only for official highlights) -->
        ${(v.fromAPI || (v.competition && !v.userPost)) ? `<div style="position:absolute;top:8px;right:8px;z-index:6;"><span class="verified-badge"><svg width="9" height="9" fill="none" stroke="white" stroke-width="3" stroke-linecap="round" stroke-linejoin="round" viewBox="0 0 24 24"><path d="M20 6L9 17l-5-5"/></svg> OFFICIAL</span></div>` : ''}
        <!-- YouTube end-screen blocker -->
        <div style="position:absolute;bottom:0;left:0;right:0;height:28%;z-index:10;pointer-events:auto;background:transparent;" id="vcard-blocker-${v.id}"></div>
        <!-- FEATURE 3: AI Insight Overlay (glass morphism, hidden by default) -->
        <div class="ai-insight-overlay" id="ai-overlay-${v.id}">
          <div class="ai-insight-header">
            <div class="ai-insight-title">
              <svg width="13" height="13" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><path d="M12 2a10 10 0 1 0 0 20A10 10 0 0 0 12 2zm0 5v6m0 2v2"/></svg>
              AI ANALYSIS
            </div>
            <button class="ai-insight-close" onclick="event.stopPropagation();closeAiInsight('${v.id}')">✕</button>
          </div>
          <div class="ai-insight-text" id="ai-insight-text-${v.id}">
            <div class="ai-insight-loader" id="ai-insight-loader-${v.id}">
              <div class="ai-insight-dots"><span></span><span></span><span></span></div>
              <span>Analysing highlight…</span>
            </div>
          </div>
        </div>
      </div>
      <div class="vinfo" style="padding:10px 12px 12px;">
        <div style="display:flex;align-items:flex-start;gap:8px;margin-bottom:6px;">
          <div style="width:32px;height:32px;border-radius:50%;background:linear-gradient(135deg,${catColor},${catColor}aa);display:flex;align-items:center;justify-content:center;font-size:13px;flex-shrink:0;">
            ${getCatEmoji(v.cat)}
          </div>
          <div style="flex:1;min-width:0;">
            <div style="display:flex;align-items:center;gap:5px;margin-bottom:2px;flex-wrap:wrap;">
              <div class="vtitle" style="font-size:13px;line-height:1.35;margin-bottom:0;">${v.title}</div>
            </div>
            <div style="display:flex;align-items:center;gap:5px;flex-wrap:wrap;">
              <span style="font-size:11px;color:var(--text3);">${v.poster || '@pitchside'} · ${v.date}</span>
              ${sourceBadge}
            </div>
          </div>
          <div onclick="event.stopPropagation();toggleSaveVideo(${v.id},this)"
               style="font-size:16px;cursor:pointer;flex-shrink:0;padding:2px;color:${isSaved?'#10b981':'var(--text3)'};"
               title="${isSaved?'Saved':'Save'}">🔖</div>
        </div>
        <div style="display:flex;align-items:center;gap:8px;flex-wrap:wrap;">
          ${compBadge}
          <!-- FEATURE 3: AI Analysis button -->
          <button class="ai-analysis-btn" onclick="event.stopPropagation();openAiInsight('${v.id}','${escapeAttr(aiDescription)}')">
            <svg fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><path d="M12 2a10 10 0 1 0 0 20A10 10 0 0 0 12 2zm0 5v6m0 2v2"/></svg>
            AI Analysis
          </button>
          <span style="font-size:11px;color:var(--text3);margin-left:auto;">❤️ ${formatCount(v.likes||0)}</span>
          <span style="font-size:11px;color:var(--text3);">💬 ${formatCount(v.comments||0)}</span>
        </div>
      </div>
    </div>`;
  }).join('');

  // FEATURE 2: Kick off IntersectionObserver (lazy loading) — only loads video when card is 60% visible
  requestAnimationFrame(() => _startScrollObserver());
}

/* ── Escape helper for data attributes ── */
function escapeAttr(str) {
  return (str || '').replace(/'/g, '\\u2019').replace(/"/g, '&quot;').slice(0, 300);
}

/* ── FEATURE 3: AI Insight panel logic ── */
const _aiInsightCache = {}; // cache per videoId so we don't re-fetch

async function openAiInsight(videoId, description) {
  const overlay = document.getElementById('ai-overlay-' + videoId);
  if (!overlay) return;
  overlay.classList.add('show');

  const textEl   = document.getElementById('ai-insight-text-' + videoId);
  const loaderEl = document.getElementById('ai-insight-loader-' + videoId);

  // Use cached result if available
  if (_aiInsightCache[videoId]) {
    if (loaderEl) loaderEl.style.display = 'none';
    textEl.innerHTML = _aiInsightCache[videoId];
    return;
  }

  // Show loader
  if (loaderEl) loaderEl.style.display = 'flex';

  try {
    const prompt = description
      ? `You are a sharp football analyst. Given this highlight description: "${description}" — provide a 3-sentence tactical insight about this football moment. Be specific, mention tactics/formations/player roles. Keep it concise and punchy.`
      : `You are a sharp football analyst. Give 3 punchy sentences of tactical analysis for a football highlight. Mention pressing, space creation, or finishing. Be specific and exciting.`;

    const res = await fetch('/api/ai', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        max_tokens: 200,
        messages: [{ role: 'user', content: prompt }]
      })
    });
    const data = await res.json();
    const reply = (data.content && data.content[0] && data.content[0].text) || 'No analysis available.';
    const html = reply.replace(/\n/g, '<br>');
    _aiInsightCache[videoId] = html;
    if (loaderEl) loaderEl.style.display = 'none';
    textEl.innerHTML = html;
  } catch(e) {
    if (loaderEl) loaderEl.style.display = 'none';
    textEl.textContent = '⚠️ Analysis unavailable. Check your connection.';
  }
}

function closeAiInsight(videoId) {
  const overlay = document.getElementById('ai-overlay-' + videoId);
  if (overlay) overlay.classList.remove('show');
}

function getCatEmoji(cat) {
  const map = { 'UCL':'⭐','PL':'🏴󠁧󠁢󠁥󠁮󠁧󠁿','NPFL':'🇳🇬','Trending':'🔥','Nigeria':'🦅',
    'Africa':'🌍','La Liga':'🇪🇸','Bundesliga':'🇩🇪','Serie A':'🇮🇹','Highlights':'🎬',
    'Skills':'👟','Analysis':'🧠','World Cup':'🏆','Ligue 1':'🇫🇷','AFCON':'🌍' };
  return map[cat] || '⚽';
}

/* ═══════════════════════════════════════════
   VIDEO PLAYBACK — Auto-play on scroll (Google style)
   Video loads & plays when card scrolls into view,
   pauses & unloads when it scrolls out.
═══════════════════════════════════════════ */
let currentVideoId = null;
let _scrollObserver = null;

function _startScrollObserver() {
  if (_scrollObserver) _scrollObserver.disconnect();

  // No autoplay on scroll — only wire click to open full player
  document.querySelectorAll('.vcard[data-videoid]').forEach(card => {
    card.onclick = (e) => {
      if (e.target.closest('.ai-analysis-btn') || e.target.closest('.ai-insight-overlay')) return;
      const vid = card.dataset.videoid;
      if (vid) openHlPlayerById(String(vid));
    };
  });
}

function _playInCard(videoId) {
  const vid = String(videoId);
  if (String(currentVideoId) === vid) return; // already playing
  if (currentVideoId !== null) _stopInCard(currentVideoId);

  const v = VIDEOS.find(x => String(x.id) === vid);
  if (!v) return;
  currentVideoId = v.id;

  const embedSlot = document.getElementById('vcard-embed-' + v.id);
  if (!embedSlot) return;

  embedSlot.style.display = 'block';
  renderVideoEmbed(v);
  applyMuteState();
  // Show the global speaker button whenever a video is active
  const spkBtn = document.getElementById('tt-speaker-btn');
  if (spkBtn) spkBtn.style.display = 'flex';
}

function _stopInCard(videoId) {
  if (String(currentVideoId) === String(videoId)) {
    currentVideoId = null;
    // Hide speaker button when nothing is playing
    const spkBtn = document.getElementById('tt-speaker-btn');
    if (spkBtn) spkBtn.style.display = 'none';
  }
  const embedSlot = document.getElementById('vcard-embed-' + videoId);
  if (!embedSlot) return;
  const vid = embedSlot.querySelector('video');
  if (vid) { try { vid.pause(); } catch(e){} }
  embedSlot.innerHTML = '';
  embedSlot.style.display = 'none';
}

// openVideoOverlay now opens the full hl player overlay
function openVideoOverlay(videoId) { openHlPlayerById(String(videoId)); }
function closeVideoOverlay() {
  if (currentVideoId !== null) _stopInCard(currentVideoId);
}
function navigateVideo(direction) {
  const idx = VIDEOS.findIndex(v => v.id === currentVideoId);
  if (idx === -1) return;
  const nextIdx = direction === 'next'
    ? (idx + 1) % VIDEOS.length
    : (idx - 1 + VIDEOS.length) % VIDEOS.length;
  _playInCard(VIDEOS[nextIdx].id);
}

function renderVideoEmbed(v) {
  const container = document.getElementById('vcard-embed-' + v.id)
                 || document.getElementById('video-embed-container');
  if (!container) return;

  // Clear previous content and stop any playing video
  const oldVid = container.querySelector('video');
  if (oldVid) { try { oldVid.pause(); } catch(e){} }
  container.innerHTML = '';

  // ── Clip constants: skip first 20s, stop 20s before end ──
  const CLIP_START = 20;   // seconds to skip at the start
  const CLIP_END   = 20;   // seconds to trim from the end

  // ── Helper: suppress YouTube end-screen "more videos" and clean up embed URL ──
  function cleanEmbedUrl(url) {
    if (!url) return url;
    try {
      const u = new URL(url, location.href);
      // Detect YouTube embed URLs
      if (u.hostname.includes('youtube.com') || u.hostname.includes('youtu.be')) {
        u.searchParams.set('rel', '0');           // no related videos at end
        u.searchParams.set('modestbranding', '1'); // minimal YouTube branding
        u.searchParams.set('iv_load_policy', '3'); // no annotations
        u.searchParams.set('disablekb', '1');      // no keyboard shortcuts
        u.searchParams.set('fs', '0');             // hide fullscreen button
        u.searchParams.set('playsinline', '1');    // stay inline on iOS
      }
      return u.toString();
    } catch(e) { return url; }
  }

  // ── Helper: append #t=START to a URL so the player seeks on load ──
  function addStartTime(url) {
    if (!url) return url;
    try {
      // Some players respect the #t= fragment (HTML5, JW Player, Flowplayer, etc.)
      const u = new URL(url, location.href);
      // If URL already has a hash, append; otherwise set fresh
      if (u.hash && u.hash.length > 1) {
        u.hash = u.hash + '&t=' + CLIP_START;
      } else {
        u.hash = '#t=' + CLIP_START;
      }
      return u.toString();
    } catch(e) {
      return url + '#t=' + CLIP_START;
    }
  }

  // ── Helper: take raw iframe HTML, strip fixed size attrs, force fullscreen fill ──
  function injectIframeHtml(html) {
    // Remove hardcoded width/height attributes so our CSS takes over
    const cleaned = html
      .replace(/\s+width=["']\d+["']/gi, '')
      .replace(/\s+height=["']\d+["']/gi, '')
      .replace(/\s+style=["'][^"']*["']/gi, '');
    container.innerHTML = cleaned;

    const iframe = container.querySelector('iframe');
    if (!iframe) return;

    // Clean YouTube end-screen params, then append start-time fragment
    if (iframe.src) {
      iframe.src = addStartTime(cleanEmbedUrl(iframe.src));
    }

    // Force fill + allow audio/autoplay/fullscreen
    iframe.setAttribute('allowfullscreen', '');
    iframe.setAttribute('webkitallowfullscreen', '');
    iframe.setAttribute('mozallowfullscreen', '');
    iframe.setAttribute('allow', 'autoplay; fullscreen; picture-in-picture; encrypted-media; gyroscope');
    iframe.removeAttribute('scrolling');

    // Scale up to clip both top ads/intros and bottom branding bar off-screen.
    // top: negative value pushes the iframe up → top ad/intro slides out of view.
    // height: oversized → bottom ad bar falls below the container's clipped edge.
    // The container itself has overflow:hidden so nothing bleeds out.
    iframe.style.cssText = [
      'position:absolute',
      'top:-12%',       // clip ~12% off the top → removes pre-roll / top ad banners
      'left:0',
      'width:100%',
      'height:130%',    // 130% tall → bottom ad bar + branding clips off-screen
      'border:none',
      'display:block',
      'pointer-events:auto',
    ].join(';');
  }

  // Priority 1: Raw embed HTML (contains <iframe ...>)
  if (v.embed && v.embed.trim().length > 0) {
    injectIframeHtml(v.embed);
    return;
  }

  // Priority 2: Plain embed URL — build our own clean iframe
  if (v.embedUrl && v.embedUrl.trim().length > 10) {
    const iframe = document.createElement('iframe');
    iframe.src = addStartTime(cleanEmbedUrl(v.embedUrl));  // clean + seek to CLIP_START on load
    iframe.setAttribute('frameborder', '0');
    iframe.setAttribute('allowfullscreen', '');
    iframe.setAttribute('webkitallowfullscreen', '');
    iframe.setAttribute('allow', 'autoplay; fullscreen; picture-in-picture; encrypted-media');
    iframe.style.cssText = 'position:absolute;top:-12%;left:0;width:100%;height:130%;border:none;';
    container.appendChild(iframe);
    return;
  }

  // Priority 3: Direct MP4 — native <video>, full trim control
  if (v.src && v.src.trim().length > 10) {
    const vid = document.createElement('video');
    vid.setAttribute('playsinline', '');
    vid.setAttribute('controls', '');
    vid.setAttribute('autoplay', '');
    if (v.thumbnail) vid.poster = v.thumbnail;
    vid.style.cssText = 'position:absolute;inset:0;width:100%;height:100%;object-fit:cover;background:#000;';
    const src = document.createElement('source');
    src.src  = v.src;
    src.type = 'video/mp4';
    vid.appendChild(src);

    // Seek to CLIP_START once metadata is loaded
    vid.addEventListener('loadedmetadata', () => {
      vid.currentTime = CLIP_START;
    });

    // Stop CLIP_END seconds before the real end, then advance to next video
    vid.addEventListener('timeupdate', () => {
      if (vid.duration && vid.duration > (CLIP_START + CLIP_END)) {
        const stopAt = vid.duration - CLIP_END;
        if (vid.currentTime >= stopAt) {
          vid.pause();
          navigateVideo('next');
        }
      }
    });

    vid.onerror = () => showNoSourceState(v);
    vid.onended = () => navigateVideo('next');
    container.appendChild(vid);
    return;
  }

  // Priority 4: Nothing — thumbnail placeholder
  showNoSourceState(v);
}

function showNoSourceState(v) {
  const container = document.getElementById('video-embed-container');
  if (!container) return;
  container.innerHTML = `
    ${v.thumbnail ? `<img src="${v.thumbnail}" style="position:absolute;inset:0;width:100%;height:100%;object-fit:cover;opacity:0.3;" onerror="this.style.display='none'">` : ''}
    <div style="position:relative;text-align:center;padding:24px;">
      <div style="font-size:56px;margin-bottom:12px;">⚽</div>
      <div style="font-size:16px;font-weight:700;color:#fff;margin-bottom:6px;">${v.title}</div>
      <div style="font-size:13px;color:rgba(255,255,255,0.5);">${v.competition || v.cat}</div>
      <div style="margin-top:16px;font-size:12px;color:rgba(255,255,255,0.4);">Video unavailable</div>
    </div>`;
}

/* ── Mute / Unmute — works for both native <video> AND iframes ── */
let _isMuted = false;

// We use a single hidden <audio> context gain node to silence everything,
// AND directly mute native <video> elements. For iframes we do
// both: mute via the gain node AND inject a postMessage seek into the frame.
let _audioCtx = null;
let _gainNode  = null;

function _ensureAudioCtx() {
  if (_audioCtx) return;
  try {
    _audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    _gainNode = _audioCtx.createGain();
    _gainNode.connect(_audioCtx.destination);
  } catch(e) { /* AudioContext not supported — fallback only */ }
}

function _applyVolumeToAll(muted) {
  // Determine the active embed container (inline card slot or fallback)
  const embedId = currentVideoId != null
    ? ('vcard-embed-' + currentVideoId)
    : 'video-embed-container';
  const embedEl = document.getElementById(embedId);

  // 1. Native <video> elements — direct and reliable
  const targets = embedEl
    ? embedEl.querySelectorAll('video')
    : document.querySelectorAll('#video-embed-container video');
  targets.forEach(v => {
    v.muted  = muted;
    v.volume = muted ? 0 : 1;
  });

  // 2. Iframes — postMessage to known players (JW Player / HTML5)
  const iframes = embedEl
    ? embedEl.querySelectorAll('iframe')
    : document.querySelectorAll('#video-embed-container iframe');
  iframes.forEach(fr => {
    try {
      fr.contentWindow.postMessage(
        JSON.stringify({ method: 'setMute', value: muted }), '*'
      );
      fr.contentWindow.postMessage({ event: 'command', func: muted ? 'mute' : 'unMute', args: [] }, '*');
      fr.contentWindow.postMessage(muted ? 'mute' : 'unmute', '*');
      fr.contentWindow.postMessage(JSON.stringify({ event: 'command', func: muted ? 'mute' : 'unMute' }), '*');
    } catch(e) { /* cross-origin */ }
  });

  // 3. Web Audio gain node — intercepts ALL audio including cross-origin iframes
  _ensureAudioCtx();
  if (_gainNode) {
    _gainNode.gain.setTargetAtTime(muted ? 0 : 1, _audioCtx.currentTime, 0.05);
  }

  // 4. Also mute any audio/video inside the overlay itself
  document.querySelectorAll('#video-overlay audio, #video-overlay video').forEach(el => {
    el.muted  = muted;
    el.volume = muted ? 0 : 1;
  });
}

function toggleMute() {
  _isMuted = !_isMuted;

  const btn = document.getElementById('tt-speaker-btn');
  const on  = document.getElementById('icon-speaker-on');
  const off = document.getElementById('icon-speaker-muted');

  if (_isMuted) {
    btn.classList.add('muted');
    if (on)  on.style.display  = 'none';
    if (off) off.style.display = '';
  } else {
    btn.classList.remove('muted');
    if (on)  on.style.display  = '';
    if (off) off.style.display = 'none';
  }

  _applyVolumeToAll(_isMuted);
}

function applyMuteState() {
  _applyVolumeToAll(_isMuted);
  // Also sync button icon to current state
  const btn = document.getElementById('tt-speaker-btn');
  const on  = document.getElementById('icon-speaker-on');
  const off = document.getElementById('icon-speaker-muted');
  if (!btn) return;
  if (_isMuted) {
    btn.classList.add('muted');
    if (on)  on.style.display  = 'none';
    if (off) off.style.display = '';
  } else {
    btn.classList.remove('muted');
    if (on)  on.style.display  = '';
    if (off) off.style.display = 'none';
  }
}

/* ── Touch swipe ── */
let touchStartY = 0;
let touchStartX = 0;
let _swipeInProgress = false;

function handleTouchStart(e) {
  touchStartY = e.touches[0].clientY;
  touchStartX = e.touches[0].clientX;
}

function handleTouchEnd(e) {
  if (_swipeInProgress) return;
  const dy = touchStartY - e.changedTouches[0].clientY;
  const dx = Math.abs(touchStartX - e.changedTouches[0].clientX);
  // Only treat as vertical swipe when dy dominates
  if (Math.abs(dy) > 55 && Math.abs(dy) > dx * 1.2) {
    navigateVideo(dy > 0 ? 'next' : 'prev');
  }
}

function navigateVideo(direction) {
  if (_swipeInProgress) return;
  const idx = VIDEOS.findIndex(v => v.id === currentVideoId);
  if (idx === -1) return;

  const nextIdx = direction === 'next'
    ? (idx + 1) % VIDEOS.length
    : (idx - 1 + VIDEOS.length) % VIDEOS.length;

  const wrap = document.querySelector('.video-player-wrap');
  if (!wrap) { openVideoOverlay(VIDEOS[nextIdx].id); return; }

  _swipeInProgress = true;

  // 1. Animate current content out
  const outClass = direction === 'next' ? 'swipe-out-up' : 'swipe-out-down';
  wrap.classList.add(outClass);

  wrap.addEventListener('animationend', function onOut() {
    wrap.removeEventListener('animationend', onOut);
    wrap.classList.remove(outClass);

    // 2. Load the next video (updates embed + metadata)
    const nextV = VIDEOS[nextIdx];
    currentVideoId = nextV.id;
    _loadVideoMeta(nextV);
    renderVideoEmbed(nextV);
    applyMuteState();

    // 3. Animate new content in
    const inClass = direction === 'next' ? 'swipe-in-up' : 'swipe-in-down';
    wrap.classList.add(inClass);
    wrap.addEventListener('animationend', function onIn() {
      wrap.removeEventListener('animationend', onIn);
      wrap.classList.remove(inClass);
      _swipeInProgress = false;
    }, { once: true });

  }, { once: true });
}

function _loadVideoMeta(v) {
  const titleEl  = document.getElementById('video-ov-info-title');
  const dateEl   = document.getElementById('video-ov-info-date');
  const handleEl = document.getElementById('tt-poster-handle');
  const likeEl   = document.getElementById('tt-like-count');
  const cmtEl    = document.getElementById('tt-comment-count');
  const saveEl   = document.getElementById('tt-save-label');
  const musicEl  = document.getElementById('tt-music-label');
  const avatarEl = document.getElementById('tt-avatar-inner');

  if (titleEl)  titleEl.textContent  = v.title;
  if (dateEl)   dateEl.textContent   = `${v.competition || v.cat} · ${v.date}`;
  if (handleEl) handleEl.textContent = v.poster || '@pitchside_official';
  if (likeEl)   likeEl.textContent   = formatCount(v.likes || 0);
  if (cmtEl)    cmtEl.textContent    = formatCount((MOCK_COMMENTS[v.id]||[]).length + (userComments[v.id]||[]).length);
  if (saveEl)   saveEl.textContent   = savedHighlights.has(v.id) ? 'Saved ✓' : 'Save';
  if (musicEl)  musicEl.textContent  = v.music ? `🎵 ${v.music}` : `🎵 ${v.competition || 'PitchSide Football'}`;
  if (avatarEl) avatarEl.src         = `https://api.dicebear.com/7.x/avataaars/svg?seed=${v.avatarSeed || v.id}`;
}

const likedVideos = new Set();

function toggleTTLike(el) {
  const btn = el.querySelector('.tt-action-btn');
  const countEl = document.getElementById('tt-like-count');
  const v = VIDEOS.find(x => x.id === currentVideoId);
  if (!v) return;
  if (likedVideos.has(currentVideoId)) {
    likedVideos.delete(currentVideoId);
    v.likes = Math.max(0, (v.likes || 0) - 1);
    btn.classList.remove('active');
  } else {
    likedVideos.add(currentVideoId);
    v.likes = (v.likes || 0) + 1;
    btn.classList.add('active');
    showToast('Liked! ❤️');
  }
  countEl.textContent = formatCount(v.likes);
}

function repostVideo() {
  const v = VIDEOS.find(x => x.id === currentVideoId);
  if (!v) return;
  showToast('Reposted to your profile ✓');
}

function downloadVideo() {
  const v = VIDEOS.find(x => x.id === currentVideoId);
  if (!v || !v.src) { showToast('No downloadable source for this video'); return; }
  const a = document.createElement('a');
  a.href = v.src;
  a.download = v.title.replace(/[^a-z0-9]/gi,'_').slice(0,40) + '.mp4';
  a.target = '_blank';
  a.click();
  showToast('Downloading…');
}

function toggleSaveVideoFromTT(el) {
  if (currentVideoId) toggleSaveVideo(currentVideoId);
}

// closeVideoOverlay is defined above in the inline player section

/* ═══════════════════════════════════════════
   MATCH DETAIL OVERLAY
═══════════════════════════════════════════ */
// A. postMessage listener for ScoreAxis iframe clicks
window.addEventListener('message', function(event) {
  if (event.data && event.data.type === 'match_click') {
    openMatchDetail(String(event.data.matchId), event.data.title || 'Match Details');
  }
});

// A. Transparent tap layer over the widget (for native widget link intercept)
function handleWidgetTap(e) {
  // Forward the tap through but intercept & show our overlay with a "view details" prompt
  // In production, coordinate with ScoreAxis postMessage; here we demonstrate the UX
  showToast('Tap a match in the widget ⚽');
}

async function openMatchDetail(matchId, title) {
  const overlay = document.getElementById('match-overlay');
  const body = document.getElementById('match-ov-body');
  const titleEl = document.getElementById('match-ov-title');

  titleEl.textContent = title || 'MATCH DETAILS';
  overlay.classList.add('active');
  
  // Loading State
  body.innerHTML = `<div class="ov-loading"><div class="spinner"></div>Loading live match data...</div>`;

  try {
    // Fetch Fixture Data (Overview, Timeline, Lineups, Stats)
    const res = await fetch(`/api/football?endpoint=fixtures&id=${matchId}`, {
      headers: {}
    });
    const data = await res.json();
    const fixtureData = data.response && data.response[0];

    if (fixtureData) {
      body.innerHTML = buildRealMatchDetailCard(fixtureData);
      
      // Animate stat bars after rendering
      setTimeout(() => {
        body.querySelectorAll('.stat-bar-home, .stat-bar-away').forEach(el => {
          el.style.width = el.dataset.w + '%';
        });
      }, 100);
    } else {
      fallbackToScoreAxis(matchId, body);
    }
  } catch (e) {
    console.error("Match Detail Error:", e);
    fallbackToScoreAxis(matchId, body);
  }
}

function fallbackToScoreAxis(matchId, body) {
  body.innerHTML = `
    <div class="match-detail-card" style="padding-top:10px;">
      <div id="scoreaxis-match-widget" class="scoreaxis-widget" style="min-height:400px;"></div>
    </div>`;
  const script = document.createElement('script');
  script.src = `https://widgets.scoreaxis.com/api/football/live-match/${matchId}?widgetId=match-detail&lang=en&bodyColor=%23ffffff&textColor=%230f172a&borderColor=%23e2e8f0&links=0`;
  script.async = true;
  document.getElementById('scoreaxis-match-widget')?.appendChild(script);
}

function buildRealMatchDetailCard(d) {
  const statusShort = d.fixture.status.short;
  const isLive = ['1H','2H','ET','BT','P','INT'].includes(statusShort);
  const statusClass = isLive ? 'match-status-live' : (statusShort === 'HT' ? 'match-status-ht' : (statusShort === 'FT' ? 'match-status-ft' : 'match-status-upcoming'));
  const statusLabel = isLive ? `${d.fixture.status.elapsed}'` : statusShort;
  
  const scoreH = d.goals.home ?? '-';
  const scoreA = d.goals.away ?? '-';

  return `
    <div class="match-scoreboard" style="margin: 16px; border-radius: 14px;">
      <div class="match-league">${d.league.name} ${d.league.round ? '· ' + d.league.round : ''}</div>
      <div class="match-teams-row">
        <div class="match-team">
          <img src="${d.teams.home.logo}" style="width:56px;height:56px;object-fit:contain;margin-bottom:8px;">
          <div class="match-team-name">${d.teams.home.name}</div>
        </div>
        <div class="match-scoreline">
          <div class="match-scoreline-num">${scoreH} - ${scoreA}</div>
          <div class="match-status-badge ${statusClass}">${statusLabel}</div>
        </div>
        <div class="match-team">
          <img src="${d.teams.away.logo}" style="width:56px;height:56px;object-fit:contain;margin-bottom:8px;">
          <div class="match-team-name">${d.teams.away.name}</div>
        </div>
      </div>
    </div>

    <div class="match-tabs">
      <div class="m-tab active" onclick="switchMatchTab(this, 'tab-overview')">Overview</div>
      <div class="m-tab" onclick="switchMatchTab(this, 'tab-timeline')">Timeline</div>
      <div class="m-tab" onclick="switchMatchTab(this, 'tab-lineups')">Lineups</div>
      <div class="m-tab" onclick="switchMatchTab(this, 'tab-stats')" data-league="${d.league.id}" data-season="${d.league.season}">Stats</div>
    </div>

    <div id="tab-overview" class="m-tab-content active">
      <div class="venue-card">
        <svg width="24" height="24" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"/><circle cx="12" cy="10" r="3"/></svg>
        <div class="venue-title">${d.fixture.venue.name || 'Venue TBD'}</div>
        <div class="venue-sub">${d.fixture.venue.city || ''}</div>
      </div>
      <div class="venue-card" style="margin-top:12px;">
        <svg width="24" height="24" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><rect x="3" y="4" width="18" height="18" rx="2" ry="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>
        <div class="venue-title">Referee</div>
        <div class="venue-sub">${d.fixture.referee || 'To be announced'}</div>
      </div>
    </div>

    <div id="tab-timeline" class="m-tab-content">
      ${generateTimelineHTML(d.events)}
    </div>

    <div id="tab-lineups" class="m-tab-content">
      ${generateLineupsHTML(d.lineups, d.teams)}
    </div>

    <div id="tab-stats" class="m-tab-content">
      <div class="match-stats-title" style="text-align:center;">MATCH STATISTICS</div>
      ${generateStatsHTML(d.statistics)}
      
      <div class="match-stats-title" style="text-align:center; margin-top:30px;">LEAGUE TABLE</div>
      <div id="live-table-container">
        <button class="btn-cancel" onclick="loadLiveTable(${d.league.id}, ${d.league.season})" style="width:100%;">Load Standings</button>
      </div>
    </div>
  `;
}

/* Tab Switcher Logic */
function switchMatchTab(btn, tabId) {
  document.querySelectorAll('.m-tab').forEach(t => t.classList.remove('active'));
  document.querySelectorAll('.m-tab-content').forEach(c => c.classList.remove('active'));
  btn.classList.add('active');
  document.getElementById(tabId).classList.add('active');
}

/* Timeline Generator */
function generateTimelineHTML(events) {
  if (!events || events.length === 0) return `<div class="empty-state">No events available yet.</div>`;
  
  return events.map(ev => {
    let icon = '⏱️';
    if (ev.type === 'Goal') icon = ev.detail.includes('Own') ? '🤦‍♂️' : '⚽';
    if (ev.type === 'Card') icon = ev.detail.includes('Yellow') ? '🟨' : '🟥';
    if (ev.type === 'subst') icon = '🔄';

    let desc = ev.detail;
    if (ev.type === 'subst') desc = `In: ${ev.player.name} | Out: ${ev.assist.name}`;
    if (ev.type === 'Goal' && ev.assist.name) desc += ` (Assist: ${ev.assist.name})`;

    return `
      <div class="tl-item">
        <div class="tl-time">${ev.time.elapsed}'${ev.time.extra ? '+'+ev.time.extra : ''}</div>
        <div class="tl-icon">${icon}</div>
        <div class="tl-details">
          <div class="tl-player">${ev.type === 'subst' ? 'Substitution' : ev.player.name}</div>
          <div class="tl-desc">${desc}</div>
        </div>
      </div>`;
  }).join('');
}

/* Lineups Generator */
function generateLineupsHTML(lineups, teams) {
  if (!lineups || lineups.length < 2) return `<div class="empty-state">Lineups will be announced closer to kick-off.</div>`;
  
  const buildCol = (teamData) => {
    const xi = teamData.startXI.map(p => `
      <div class="lineup-player">
        <div class="lp-num">${p.player.number}</div>
        <div class="lp-name">${p.player.name}</div>
        <div class="lp-rating">${p.player.pos}</div>
      </div>`).join('');
      
    const subs = teamData.substitutes.map(p => `
      <div class="lineup-player">
        <div class="lp-num">${p.player.number}</div>
        <div class="lp-name">${p.player.name}</div>
      </div>`).join('');

    return `
      <div class="lineup-col">
        <div class="lineup-team-title">${teamData.team.name}</div>
        <div style="text-align:center;font-size:10px;color:var(--text3);margin-bottom:12px;">Formation: ${teamData.formation || 'N/A'}</div>
        <div class="lineup-section-title">Starting XI</div>
        ${xi}
        <div class="lineup-section-title">Bench</div>
        ${subs}
        <div class="lineup-section-title">Manager</div>
        <div class="lineup-player"><div class="lp-name" style="padding-left:26px;">👔 ${teamData.coach.name || 'Unknown'}</div></div>
      </div>`;
  };

  return `<div class="lineup-wrap">${buildCol(lineups[0])}${buildCol(lineups[1])}</div>`;
}

/* Match Stats Generator */
function generateStatsHTML(statistics) {
  if (!statistics || statistics.length < 2) return `<div class="empty-state">Detailed statistics are not available for this match.</div>`;

  const homeStats = statistics[0].statistics;
  const awayStats = statistics[1].statistics;

  return homeStats.map((stat, i) => {
    let valH = stat.value || 0;
    let valA = awayStats[i].value || 0;
    
    // Handle percentages (like Ball Possession "45%")
    let numH = typeof valH === 'string' ? parseInt(valH.replace('%','')) : valH;
    let numA = typeof valA === 'string' ? parseInt(valA.replace('%','')) : valA;
    
    let total = numH + numA;
    let pctH = total === 0 ? 50 : Math.round((numH / total) * 100);
    let pctA = total === 0 ? 50 : 100 - pctH;

    return `
      <div class="stat-row">
        <div class="stat-label">${valH}</div>
        <div class="stat-bar-wrap">
          <div class="stat-bar-home" data-w="${pctH}" style="width:0;flex:${pctH}"></div>
          <div class="stat-bar-away" data-w="${pctA}" style="width:0;flex:${pctA}"></div>
        </div>
        <div class="stat-val">${valA}</div>
      </div>
      <div style="text-align:center; font-size:10px; color:var(--text3); margin-top:-6px; margin-bottom:14px; text-transform:uppercase;">${stat.type}</div>`;
  }).join('');
}

/* Load Table Function */
async function loadLiveTable(leagueId, season) {
  const container = document.getElementById('live-table-container');
  container.innerHTML = `<div class="ov-loading"><div class="spinner"></div>Fetching table...</div>`;
  
  try {
    const res = await fetch(`/api/football?endpoint=standings&league=${leagueId}&season=${season}`, {
      headers: {}
    });
    const data = await res.json();
    const standings = data.response[0]?.league?.standings[0];

    if (!standings) throw new Error("No standings found");

    let html = `
      <div class="table-row table-hdr">
        <div class="tr-pos">#</div>
        <div class="tr-team">Team</div>
        <div class="tr-stat">P</div>
        <div class="tr-stat">GD</div>
        <div class="tr-pts">Pts</div>
      </div>`;

    html += standings.map(row => `
      <div class="table-row">
        <div class="tr-pos">${row.rank}</div>
        <div class="tr-team"><img src="${row.team.logo}">${row.team.name}</div>
        <div class="tr-stat">${row.all.played}</div>
        <div class="tr-stat">${row.goalsDiff}</div>
        <div class="tr-pts">${row.points}</div>
      </div>`).join('');
      
    container.innerHTML = html;
  } catch (e) {
    container.innerHTML = `<div class="empty-state">Table not available for this competition.</div>`;
  }
}

function closeMatchDetail() {
  document.getElementById('match-overlay').classList.remove('active');
  document.getElementById('match-ov-body').innerHTML = '';
}

/* ═══════════════════════════════════════════
   DASHBOARD ACTIONS
═══════════════════════════════════════════ */
const DASH_PANELS = ['myteam','leagues','saved','notifs'];

function dashAction(key) {
  const card = document.getElementById('dash-' + key);
  const panel = document.getElementById('panel-' + key);
  const isOpen = panel.classList.contains('open');

  // Close all panels, deactivate all cards
  DASH_PANELS.forEach(k => {
    document.getElementById('panel-' + k).classList.remove('open');
    document.getElementById('dash-' + k).classList.remove('on');
  });

  if (!isOpen) {
    panel.classList.add('open');
    card.classList.add('on');
    if (key === 'saved') renderSavedPanel();
    // Scroll into view
    setTimeout(() => panel.scrollIntoView({ behavior:'smooth', block:'nearest' }), 80);
  }
}

function toggleSel(el, name) {
  const check = el.querySelector('.sel-check');
  check.classList.toggle('checked');
  const on = check.classList.contains('checked');
  showToast(on ? `Following ${name} ✓` : `Unfollowed ${name}`);
}

function toggleNotif(el) {
  el.classList.toggle('on');
  const on = el.classList.contains('on');
  const label = el.closest('.notif-item').querySelector('.notif-label').textContent;
  showToast(on ? `${label}: On` : `${label}: Off`);
}

/* ═══════════════════════════════════════════
   PROFILE LOGIC
═══════════════════════════════════════════ */
let profileData = {
  name: 'John Doe',
  email: 'john.doe@pitchside.com',
  team: 'Real Madrid',
  initials: 'JD',
  avatarUrl: null,
};

function triggerAvatarUpload() {
  document.getElementById('avatar-file-input').click();
}

function handleAvatarUpload(e) {
  const file = e.target.files[0];
  if (!file) return;
  const url = URL.createObjectURL(file);
  profileData.avatarUrl = url;
  const img = document.getElementById('profile-avatar-img');
  const initials = document.getElementById('profile-initials');
  img.src = url;
  img.style.display = 'block';
  initials.style.display = 'none';
  showToast('Profile photo updated ✓');
}

function updateProfileStats() {
  const videoCount  = VIDEOS.filter(v => v.userPost).length;
  const teamsCount  = selectedTeams.size;
  const leaguesCount= selectedLeagues.size;
  const statV = document.getElementById('stat-videos');
  const statT = document.getElementById('stat-teams');
  const statL = document.getElementById('stat-leagues');
  if (statV) statV.textContent = videoCount;
  if (statT) statT.textContent = teamsCount;
  if (statL) statL.textContent = leaguesCount;
}

function openEditProfile() {
  document.getElementById('edit-name').value  = profileData.name;
  document.getElementById('edit-email').value = profileData.email;
  document.getElementById('edit-team').value  = profileData.team;
  document.getElementById('edit-profile-form').classList.add('open');
  document.getElementById('profile-stats').style.display       = 'none';
  document.getElementById('profile-menu-items').style.display  = 'none';
}

function closeEditProfile() {
  document.getElementById('edit-profile-form').classList.remove('open');
  document.getElementById('profile-stats').style.display      = '';
  document.getElementById('profile-menu-items').style.display = '';
}

function saveProfile() {
  const name  = document.getElementById('edit-name').value.trim()  || profileData.name;
  const email = document.getElementById('edit-email').value.trim() || profileData.email;
  const team  = document.getElementById('edit-team').value.trim()  || profileData.team;
  profileData = { ...profileData, name, email, team,
    initials: name.split(' ').map(w=>w[0]).join('').slice(0,2).toUpperCase() };
  document.getElementById('profile-name').textContent  = name;
  document.getElementById('profile-email').textContent = email;
  if (!profileData.avatarUrl) {
    document.getElementById('profile-initials').textContent = profileData.initials;
  }
  closeEditProfile();
  showToast('Profile updated ✓');
}

function confirmSignOut() {
  if (confirm('Sign out of PitchSide?')) {
    import('https://www.gstatic.com/firebasejs/10.12.0/firebase-auth.js').then(({ getAuth, signOut }) => {
      signOut(getAuth()).then(() => {
        showToast('Signed out. See you next match! 👋');
        setTimeout(() => { document.getElementById('auth-screen').classList.remove('hidden'); }, 800);
      });
    });
  }
}

/* ═══════════════════════════════════════════
   EXPLORE FILTER — Unified mixed-feed renderer
═══════════════════════════════════════════ */

/* ── Helper: render a news card inside the explore grid ── */
function _exploreNewsCard(n) {
  const catColor = (function(cat) {
    const map = {
      'transfer':'#f59e0b','transfers':'#f59e0b',
      'premier league':'#6366f1','pl':'#6366f1',
      'champions league':'#3b82f6','ucl':'#3b82f6',
      'nigeria football':'#16a34a','nigeria':'#16a34a','npfl':'#16a34a',
      'la liga':'#ef4444','bundesliga':'#eab308',
    };
    return map[(cat||'').toLowerCase()] || '#10b981';
  })(n.category);
  const hasImg = n.imageUrl && n.imageUrl.length > 10;
  const safeId = n.id.replace(/'/g, "\\'");
  return `
    <div class="vcard" style="cursor:pointer;" onclick="openNewsReader(window._newsLookup && window._newsLookup['${safeId}'] ? window._newsLookup['${safeId}'] : ${JSON.stringify(n).replace(/</g,'\\u003c').replace(/>/g,'\\u003e').replace(/&/g,'\\u0026')})">
      <div class="vthumb" style="position:relative;background:linear-gradient(135deg,#0f172a,#1e293b);">
        ${hasImg
          ? `<img src="${n.imageUrl}" alt="" loading="lazy" style="width:100%;height:100%;object-fit:cover;display:block;" onerror="this.style.display='none'">`
          : `<div style="width:100%;height:100%;display:flex;align-items:center;justify-content:center;font-size:48px;">${n.emoji||'⚽'}</div>`}
        <div style="position:absolute;top:8px;left:8px;background:rgba(0,0,0,0.65);backdrop-filter:blur(4px);border-radius:8px;padding:3px 8px;font-size:9px;font-weight:700;color:#fff;letter-spacing:.04em;">📰 NEWS</div>
        <div style="position:absolute;top:8px;right:8px;background:${catColor}22;border:1px solid ${catColor}55;border-radius:8px;padding:2px 8px;font-size:9px;font-weight:700;color:${catColor};text-transform:uppercase;">${n.category!=='general'?n.category:''}</div>
      </div>
      <div class="vinfo" style="padding:10px 12px 12px;">
        <div style="font-weight:700;font-size:13px;color:var(--text);line-height:1.35;margin-bottom:5px;">${n.title}</div>
        <div style="display:flex;align-items:center;gap:6px;flex-wrap:wrap;">
          <span style="font-size:11px;color:var(--text3);">📰 ${n.source} · ${n.timeAgo}</span>
          <span style="margin-left:auto;font-size:10px;font-weight:700;padding:2px 8px;border-radius:10px;background:${catColor}15;color:${catColor};">READ</span>
        </div>
      </div>
    </div>`;
}

/* ── Render ALL explore: videos + news mixed ── */
function _renderExploreAll() {
  const container = document.getElementById('explore-grid');
  if (!container) return;

  let html = '';
  const newsLookup = {};
  (_newsAllDocs||[]).forEach(n => { newsLookup[n.id] = n; });
  window._newsLookup = { ...window._newsLookup, ...newsLookup };

  // Filter out demo/fake videos — only show real ones from Firebase or Scorebat
  const realVideos = VIDEOS.filter(v => {
    const id = String(v.id || '');
    return !id.startsWith('demo') && (v.embedUrl || v.videoUrl || v.embed);
  });

  // Add Scorebat videos to explore
  const sbVideos = (_sbAllVideos || []).slice(0, 20).map((v, i) => ({
    id: 'sb_' + i,
    title: v.title || 'Highlight',
    thumbnail: v.thumbnail || '',
    competition: v.competition || 'Football',
    cat: v.competition || 'Football',
    embedUrl: v.videos?.[0]?.embed || v.embed || '',
    fromAPI: true,
    isOfficial: true,
    userPost: false,
    isScorebat: true,
    sbEmbed: v.videos?.[0]?.embed || v.embed || '',
    sbTitle: v.title || 'Highlight',
  }));

  const allVideos = [...sbVideos, ...realVideos];

  // Build fully mixed/shuffled feed of all content types
  const news = [...(_newsAllDocs||[])];

  const sbItems = allVideos.filter(v => v.isScorebat).map(v => {
    const thumb = v.thumbnail || 'https://via.placeholder.com/320x180/1a1a2e/ffffff?text=⚽';
    const title = (v.sbTitle || '').replace(/'/g, "\\'");
    const embed = (v.sbEmbed || '').replace(/'/g, "\\'");
    return `
      <div class="vcard" onclick="openSBPlayer('${title}','${embed}')" style="cursor:pointer;">
        <div class="vthumb" style="position:relative;">
          <img src="${thumb}" style="width:100%;height:100%;object-fit:cover;display:block;" onerror="this.src='https://via.placeholder.com/320x180/1a1a2e/ffffff?text=⚽'">
          <div style="position:absolute;inset:0;display:flex;align-items:center;justify-content:center;">
            <div style="background:rgba(16,185,129,0.9);border-radius:50%;width:44px;height:44px;display:flex;align-items:center;justify-content:center;">
              <svg width="18" height="18" fill="white" viewBox="0 0 24 24"><path d="M8 5v14l11-7z"/></svg>
            </div>
          </div>
          <div style="position:absolute;top:8px;left:8px;background:rgba(0,0,0,0.65);border-radius:8px;padding:3px 8px;font-size:9px;font-weight:700;color:#fff;">${v.competition}</div>
          <div style="position:absolute;top:8px;right:8px;"><span class="verified-badge"><svg width="9" height="9" fill="none" stroke="white" stroke-width="3" stroke-linecap="round" stroke-linejoin="round" viewBox="0 0 24 24"><path d="M20 6L9 17l-5-5"/></svg> OFFICIAL</span></div>
        </div>
        <div class="vmeta">
          <div class="vinfo">
            <div class="vuser"><span class="vhandle">@pitchside_official</span></div>
            <div class="vtitle">${v.title}</div>
          </div>
        </div>
      </div>`;
  });

  const firebaseItems = allVideos.filter(v => !v.isScorebat).map(v => _videoToExploreCard(v));
  const newsItems = news.map(n => _exploreNewsCard(n));

  // Merge all and shuffle randomly
  const allItems = [...sbItems, ...firebaseItems, ...newsItems];
  for (let i = allItems.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [allItems[i], allItems[j]] = [allItems[j], allItems[i]];
  }
  allItems.forEach(item => { html += item; });

  if (!html) { showFirebaseFetchingState(); return; }
  container.innerHTML = html;
  requestAnimationFrame(() => _startScrollObserver());
}

/* ── Convert a video object to an explore card HTML string ── */
function _videoToExploreCard(v) {
  const isSaved = savedHighlights.has(v.id);
  const hasThumbnail = v.thumbnail && v.thumbnail.length > 10;
  const thumbUrl = applyCloudinaryQuality(v.thumbnail || '');
  const catColors = {
    'UCL':'#3b82f6','PL':'#6366f1','NPFL':'#16a34a','Trending':'#f43f5e',
    'Nigeria':'#16a34a','Africa':'#f59e0b','La Liga':'#ef4444','Bundesliga':'#eab308',
  };
  const catColor = catColors[v.cat] || '#10b981';
  const sourceBadge = _sourceBadge(v);
  const aiDescription = v.description || v.title || '';
  const gradA = v.gradientA || '#0f172a';
  const gradB = v.gradientB || '#1e293b';
  const isDemoCard = v.id && String(v.id).startsWith('demo');

  return `
    <div class="vcard" id="vcard-${v.id}" data-videoid="${v.id}" style="position:relative;">
      <div class="vthumb" style="position:relative;" id="vcard-thumb-${v.id}">
        ${isDemoCard
          ? `<div style="width:100%;height:100%;background:linear-gradient(135deg,${gradA},${gradB});display:flex;flex-direction:column;align-items:center;justify-content:center;gap:10px;">
               <div style="font-size:52px;filter:drop-shadow(0 2px 8px rgba(0,0,0,0.5));">${v.emoji||getCatEmoji(v.cat)}</div>
               <div style="background:rgba(16,185,129,0.9);border-radius:50%;width:52px;height:52px;display:flex;align-items:center;justify-content:center;box-shadow:0 4px 20px rgba(16,185,129,0.5);">
                 <svg width="22" height="22" fill="white" viewBox="0 0 24 24"><path d="M8 5v14l11-7z"/></svg>
               </div>
             </div>`
          : hasThumbnail
            ? `<img src="${thumbUrl}" alt="${v.title}" loading="lazy"
                 style="width:100%;height:100%;object-fit:cover;display:block;"
                 onerror="this.style.display='none';this.nextElementSibling.style.display='flex';">
               <div class="vthumb-ph" style="background:linear-gradient(135deg,#0f172a,#1e293b);display:none;">`
            : `<div class="vthumb-ph" style="background:linear-gradient(135deg,#0f172a,#1e293b);">`
        }
        ${!isDemoCard ? `
          <div style="font-size:32px;margin-bottom:6px;">${v.emoji||getCatEmoji(v.cat)}</div>
          <div class="play-btn">
            <svg width="22" height="22" fill="white" viewBox="0 0 24 24"><path d="M8 5v14l11-7z"/></svg>
          </div>
        </div>` : ''}
        <div id="vcard-embed-${v.id}" style="display:none;position:absolute;inset:0;width:100%;height:100%;background:#000;overflow:hidden;"></div>
        <div style="position:absolute;top:8px;left:8px;background:rgba(0,0,0,0.65);backdrop-filter:blur(4px);border-radius:8px;padding:3px 8px;font-size:9px;font-weight:700;color:#fff;letter-spacing:.04em;z-index:5;">${v.competition||v.cat}</div>
        ${(v.fromAPI||(v.competition&&!v.userPost))?`<div style="position:absolute;top:8px;right:8px;z-index:6;"><span class="verified-badge"><svg width="9" height="9" fill="none" stroke="white" stroke-width="3" stroke-linecap="round" stroke-linejoin="round" viewBox="0 0 24 24"><path d="M20 6L9 17l-5-5"/></svg> OFFICIAL</span></div>`:''}
        <div style="position:absolute;bottom:0;left:0;right:0;height:28%;z-index:10;pointer-events:auto;background:transparent;" id="vcard-blocker-${v.id}"></div>
        <div class="ai-insight-overlay" id="ai-overlay-${v.id}">
          <div class="ai-insight-header">
            <div class="ai-insight-title">
              <svg width="13" height="13" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><path d="M12 2a10 10 0 1 0 0 20A10 10 0 0 0 12 2zm0 5v6m0 2v2"/></svg>
              AI ANALYSIS
            </div>
            <button class="ai-insight-close" onclick="event.stopPropagation();closeAiInsight('${v.id}')">✕</button>
          </div>
          <div class="ai-insight-text" id="ai-insight-text-${v.id}">
            <div class="ai-insight-loader" id="ai-insight-loader-${v.id}">
              <div class="ai-insight-dots"><span></span><span></span><span></span></div>
              <span>Analysing highlight…</span>
            </div>
          </div>
        </div>
      </div>
      <div class="vinfo" style="padding:10px 12px 12px;">
        <div style="display:flex;align-items:flex-start;gap:8px;margin-bottom:6px;">
          <div style="width:32px;height:32px;border-radius:50%;background:linear-gradient(135deg,${catColor},${catColor}99);display:flex;align-items:center;justify-content:center;font-size:13px;flex-shrink:0;">${getCatEmoji(v.cat)}</div>
          <div style="flex:1;min-width:0;">
            <div style="display:flex;align-items:center;gap:5px;margin-bottom:2px;flex-wrap:wrap;">
              <div class="vtitle" style="font-size:13px;line-height:1.35;margin-bottom:0;">${v.title}</div>
            </div>
            <div style="display:flex;align-items:center;gap:5px;flex-wrap:wrap;">
              <span style="font-size:11px;color:var(--text3);">${v.poster||'@pitchside'} · ${v.date}</span>
              ${sourceBadge}
            </div>
          </div>
          <div onclick="event.stopPropagation();toggleSaveVideo(${v.id},this)"
               style="font-size:16px;cursor:pointer;flex-shrink:0;padding:2px;color:${isSaved?'#10b981':'var(--text3)'};"
               title="${isSaved?'Saved':'Save'}">🔖</div>
        </div>
        <div style="display:flex;align-items:center;gap:8px;flex-wrap:wrap;">
          ${v.competition?`<span style="background:rgba(16,185,129,0.15);color:#10b981;border-radius:10px;padding:2px 7px;font-size:9px;font-weight:700;letter-spacing:.04em;">${v.competition.toUpperCase().slice(0,18)}</span>`:''}
          <button class="ai-analysis-btn" onclick="event.stopPropagation();openAiInsight('${v.id}','${escapeAttr(aiDescription)}')">
            <svg fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><path d="M12 2a10 10 0 1 0 0 20A10 10 0 0 0 12 2zm0 5v6m0 2v2"/></svg>
            AI Analysis
          </button>
          <span style="font-size:11px;color:var(--text3);margin-left:auto;">❤️ ${formatCount(v.likes||0)}</span>
          <span style="font-size:11px;color:var(--text3);">💬 ${formatCount(v.comments||0)}</span>
        </div>
      </div>
    </div>`;
}

function filterExplore(val) {
  const q = val.toLowerCase();
  if (!q) { _renderExploreAll(); return; }
  const filteredVids = VIDEOS.filter(v =>
    v.title.toLowerCase().includes(q) ||
    (v.competition || '').toLowerCase().includes(q) ||
    (v.cat || '').toLowerCase().includes(q) ||
    (v.poster || '').toLowerCase().includes(q)
  );
  const filteredNews = (_newsAllDocs||[]).filter(n =>
    (n.title||'').toLowerCase().includes(q) ||
    (n.category||'').toLowerCase().includes(q) ||
    (n.source||'').toLowerCase().includes(q)
  );
  const container = document.getElementById('explore-grid');
  if (!container) return;
  let html = filteredVids.map(_videoToExploreCard).join('') + filteredNews.map(_exploreNewsCard).join('');
  container.innerHTML = html || '<div style="text-align:center;padding:40px;color:var(--text3);">No results found</div>';
  requestAnimationFrame(() => _startScrollObserver());
}

function selExpCat(el, cat) {
  document.querySelectorAll('#page-explore .pill').forEach(p => p.classList.remove('on'));
  el.classList.add('on');
  // Category pills filter videos only (official + fan + player) by competition
  let filtered;
  if (cat === 'UCL') {
    filtered = VIDEOS.filter(v =>
      (v.cat||'').toUpperCase() === 'UCL' ||
      (v.competition||'').toLowerCase().includes('champions')
    );
  } else if (cat === 'PL') {
    filtered = VIDEOS.filter(v =>
      (v.cat||'').toUpperCase() === 'PL' ||
      (v.competition||'').toLowerCase().includes('premier')
    );
  } else if (cat === 'NPFL' || cat === 'Nigeria') {
    filtered = VIDEOS.filter(v =>
      (v.cat||'').toLowerCase().includes('npfl') ||
      (v.cat||'').toLowerCase().includes('nigeria') ||
      (v.competition||'').toLowerCase().includes('nigeria') ||
      (v.title||'').toLowerCase().includes('npfl') ||
      (v.title||'').toLowerCase().includes('nigeria')
    );
  } else if (cat === 'La Liga') {
    filtered = VIDEOS.filter(v =>
      (v.cat||'').toLowerCase().includes('la liga') ||
      (v.competition||'').toLowerCase().includes('la liga')
    );
  } else {
    filtered = VIDEOS.filter(v =>
      v.cat === cat ||
      (v.competition||'').toLowerCase().includes(cat.toLowerCase())
    );
  }
  const container = document.getElementById('explore-grid');
  if (!container) return;
  container.innerHTML = filtered.length
    ? filtered.map(_videoToExploreCard).join('')
    : '<div style="text-align:center;padding:40px;color:var(--text3);">No posts in this category yet</div>';
  requestAnimationFrame(() => _startScrollObserver());
}

/* ── Filter explore by source type: all / official / fan / player ── */
function selExpType(btn, type) {
  document.querySelectorAll('#page-explore .pill').forEach(p => p.classList.remove('on'));
  btn.classList.add('on');
  const container = document.getElementById('explore-grid');
  if (!container) return;

  if (type === 'all') {
    // ALL = videos (all types) + news articles interleaved
    _renderExploreAll();
    return;
  }

  if (type === 'official') {
    // Official = bot/API highlights + news only (no user or player posts)
    const officialVids = VIDEOS.filter(v => !v.userPost && !v.playerPost);
    const newsLookup = {};
    (_newsAllDocs||[]).forEach(n => { newsLookup[n.id] = n; });
    window._newsLookup = { ...window._newsLookup, ...newsLookup };
    let html = officialVids.map(_videoToExploreCard).join('') +
               (_newsAllDocs||[]).map(_exploreNewsCard).join('');
    container.innerHTML = html || '<div style="text-align:center;padding:40px;color:var(--text3);">No official content yet</div>';
    requestAnimationFrame(() => _startScrollObserver());
    return;
  }

  let filtered;
  if (type === 'fan') {
    filtered = VIDEOS.filter(v => v.userPost && !v.playerPost);
  } else if (type === 'player') {
    filtered = VIDEOS.filter(v => v.playerPost === true);
  } else {
    filtered = VIDEOS;
  }

  container.innerHTML = filtered.length
    ? filtered.map(_videoToExploreCard).join('')
    : `<div style="text-align:center;padding:40px;color:var(--text3);"><div style="font-size:40px;margin-bottom:12px;">${type==='fan'?'👥':'⭐'}</div>No ${type} posts yet.<br><span style="font-size:12px;margin-top:6px;display:block;">Be the first to post!</span></div>`;
  requestAnimationFrame(() => _startScrollObserver());
}



/* ═══════════════════════════════════════════
   TOAST
═══════════════════════════════════════════ */
let toastTimer = null;
function showToast(msg) {
  const t = document.getElementById('toast');
  t.textContent = msg;
  t.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => t.classList.remove('show'), 2800);
}

/* ═══════════════════════════════════════════
   INIT
═══════════════════════════════════════════ */
/* ═══════════════════════════════════════════
   MASTER INIT — single DOMContentLoaded
═══════════════════════════════════════════ */
document.addEventListener('DOMContentLoaded', function () {

  // ── Dashboard lists ──
  try { renderSelectionList('team-list',   ALL_TEAMS,   selectedTeams); } catch(e){}
  try { renderSelectionList('league-list', ALL_LEAGUES, selectedLeagues); } catch(e){}

  // ── Ticker ──
  try { initTicker(); } catch(e){}

  // ── Profile stats ──
  try { updateProfileStats(); } catch(e){}

  // ── Nav active state ──
  // Explore is the first nav item and is already marked active in HTML

  // ── Comment enter key ──
  const ci = document.getElementById('comment-input');
  if (ci) ci.addEventListener('keydown', e => { if(e.key==='Enter') submitComment(); });

  // ── Editor canvas click ──
  const canvas = document.getElementById('editor-canvas');
  if (canvas) canvas.addEventListener('click', () => {
    document.querySelectorAll('.text-overlay-item,.sticker-overlay-item')
      .forEach(e => e.classList.remove('selected'));
    selectedTextEl = null;
  });

  // ── Speaker: always start unmuted (ON) ──
  _isMuted = false;
  try { applyMuteState(); } catch(e){}

  // ── AI chips ──
  try { renderAiChips(); } catch(e){}

  // ── Fan streak check ──
  try { checkFanStreak(); } catch(e){}

  // ── CHANGE 2: Start Firebase real-time feed listener ──
  // activateFirebaseListener() is also called from onAuthStateChanged above,
  // but calling it here ensures the fetching state shows immediately on load.
  try {
    showFirebaseFetchingState();
    // Attempt Firebase connection
    const _waitForFs = setInterval(() => {
      if (window._psFs && window._psFs.onSnapshot) {
        clearInterval(_waitForFs);
        activateFirebaseListener();
      }
    }, 150);
    // Hard timeout: if Firestore SDK never loads in 5s, load fallback content
    setTimeout(() => { clearInterval(_waitForFs); if (VIDEOS.length === 0) loadFallbackVideos(); }, 5000);
  } catch(e) { console.warn('[PitchSide] Feed init error:', e); }
});

/* ═══════════════════════════════════════════
   COMMENTS
═══════════════════════════════════════════ */
const MOCK_COMMENTS = {
  1: [
    { user: 'FootballFan92', initials: 'FF', text: 'What a game! Real Madrid were absolutely electric in the second half.', time: '2h ago' },
    { user: 'UCLWatcher', initials: 'UW', text: "Bellingham's movement was insane. Man City couldn't handle him at all.", time: '1h ago' },
    { user: 'TacticsGuru', initials: 'TG', text: "Pep's high press completely backfired here. Madrid exploited it perfectly on the counter.", time: '45m ago' },
    { user: 'GoalMachine', initials: 'GM', text: 'CHAMPIONS LEAGUE NIGHTS 🔥🔥🔥', time: '30m ago' },
  ],
  2: [
    { user: 'GoalOfTheWeek', initials: 'GW', text: "That bicycle kick at 3:42 is genuinely one of the best goals I've ever seen.", time: '3h ago' },
    { user: 'Striker99', initials: 'S9', text: "Mbappe's free kick should've been in here too honestly", time: '2h ago' },
    { user: 'PitchsidePro', initials: 'PP', text: "Top 10 every week never disappoints. Keep them coming!", time: '1h ago' },
  ],
  3: [
    { user: 'TacticsBoard', initials: 'TB', text: "Arteta's 4-3-3 pressing shape was textbook here. Brilliant analysis.", time: '5h ago' },
    { user: 'FootballIQ', initials: 'FI', text: "The way Arsenal shut down Liverpool's buildup from the back was phenomenal.", time: '4h ago' },
  ],
  4: [
    { user: 'MbappeFan', initials: 'MF', text: "He's on another level right now. Absolute monster season 🐐", time: '6h ago' },
    { user: 'LaLigaLover', initials: 'LL', text: 'His Spanish has improved so much too haha, great interview!', time: '5h ago' },
    { user: 'GoalMachine', initials: 'GM', text: 'Hat trick AND this interview?? What a day for him', time: '3h ago' },
  ],
  5: [
    { user: 'EvertonTil', initials: 'ET', text: "Finally! Can't wait to see us in the new ground. This has been years in the making.", time: '1d ago' },
    { user: 'ArchitectFan', initials: 'AF', text: 'The design looks incredible. Best new stadium in the PL for sure.', time: '20h ago' },
  ],
  6: [
    { user: 'SkillsKing', initials: 'SK', text: "Practiced the elastico for months and still can't do it 😭", time: '8h ago' },
    { user: 'FutsalPro', initials: 'FP', text: "The slow-mo breakdown is so helpful. Best tutorial I've seen on this.", time: '6h ago' },
    { user: 'StreetBaller', initials: 'SB', text: 'The key is in the ankle snap. Once you get that it clicks instantly.', time: '4h ago' },
  ],
};

// Per-video user-added comments (in memory)
const userComments = { 1: [], 2: [], 3: [], 4: [], 5: [], 6: [] };

function openComments() {
  if (!currentVideoId) return;
  const panel = document.getElementById('comment-panel');
  panel.classList.add('active');
  renderComments(currentVideoId);
  setTimeout(() => document.getElementById('comment-input').focus(), 300);
}

function closeComments() {
  document.getElementById('comment-panel').classList.remove('active');
  document.getElementById('comment-input').value = '';
}

function renderComments(videoId) {
  const list = document.getElementById('comment-list');
  const mock = MOCK_COMMENTS[videoId] || [];
  const user = userComments[videoId] || [];
  const all = [...mock, ...user];

  document.getElementById('comment-count').textContent = `(${all.length})`;

  if (all.length === 0) {
    list.innerHTML = `<div style="text-align:center;padding:30px;color:var(--text3);font-size:13px;">No comments yet. Be the first!</div>`;
    return;
  }

  // XSS-SAFE: use createElement + textContent instead of innerHTML with user data
  list.innerHTML = '';
  all.forEach(c => {
    const item = document.createElement('div');
    item.className = 'comment-item';

    const avatar = document.createElement('div');
    avatar.className = 'comment-avatar';
    avatar.textContent = c.initials;

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
    list.appendChild(item);
  });

  // Scroll to bottom so newest is visible
  list.scrollTop = list.scrollHeight;
}

function submitComment() {
  const input = document.getElementById('comment-input');
  const text = input.value.trim();
  if (!text || !currentVideoId) return;

  if (!userComments[currentVideoId]) userComments[currentVideoId] = [];
  userComments[currentVideoId].push({
    user: 'You',
    initials: 'JD',
    text,
    time: 'Just now',
  });

  input.value = '';
  renderComments(currentVideoId);
  showToast('Comment posted ✓');
}

// comment enter key handled in master init above

/* ═══════════════════════════════════════════
   SHARE
═══════════════════════════════════════════ */
function shareVideo() {
  const v = VIDEOS.find(x => x.id === currentVideoId);
  if (!v) return;

  const shareData = {
    title: 'PitchSide – ' + v.title,
    text: '⚽ Check out this football highlight: ' + v.title,
    url: window.location.href,
  };

  if (navigator.share) {
    navigator.share(shareData)
      .then(() => showToast('Shared! ✓'))
      .catch(() => {}); // user cancelled — no toast needed
  } else {
    // Fallback: copy link to clipboard
    const textToCopy = shareData.text + '\n' + shareData.url;
    navigator.clipboard.writeText(textToCopy)
      .then(() => showToast('Link copied to clipboard ✓'))
      .catch(() => showToast('Share: ' + window.location.href));
  }
}

/* ═══════════════════════════════════════════
   POST STUDIO
═══════════════════════════════════════════ */

/* ── Data ── */
const FILTERS = [
  {id:'normal',  label:'Normal',  emoji:'🖼️'},
  {id:'vivid',   label:'Vivid',   emoji:'🌈'},
  {id:'cool',    label:'Cool',    emoji:'❄️'},
  {id:'warm',    label:'Warm',    emoji:'🌅'},
  {id:'mono',    label:'Mono',    emoji:'⬛'},
  {id:'fade',    label:'Fade',    emoji:'☁️'},
  {id:'drama',   label:'Drama',   emoji:'🎭'},
  {id:'golden',  label:'Golden',  emoji:'🌟'},
  {id:'neon',    label:'Neon',    emoji:'💜'},
  {id:'vintage', label:'Vintage', emoji:'📷'},
];

const STICKERS_FOOTBALL    = ['⚽','🥅','🏟️','🥇','🏆','🎽','👟','🤾','🧤','🪃','🎯','⚡'];
const STICKERS_REACTIONS   = ['🔥','❤️','😍','😭','🤯','👏','💯','🫡','😤','🥹','👀','🫶'];
const STICKERS_CELEBRATIONS= ['🎉','🎊','🙌','🥳','💃','🕺','🎆','✨','🏅','🥂','🎤','🎸'];

const MUSIC_TRACKS = [
  {name:'Crowd Roar Anthem',    artist:'PitchSide Sounds', emoji:'🏟️'},
  {name:'Victory March',        artist:'Stadium Classics',  emoji:'🏆'},
  {name:'Goal Celebration Mix', artist:'Football Vibes',    emoji:'⚽'},
  {name:'Champions Intro',      artist:'Epic Sports',       emoji:'⭐'},
  {name:'Ultras Chant Vol.1',   artist:'The Kop',           emoji:'🎺'},
  {name:'Dribble Beat',         artist:'Street Football',   emoji:'🎧'},
];

const COLORS = ['#ffffff','#f43f5e','#f97316','#facc15','#4ade80','#22d3ee','#818cf8','#a855f7','#000000','#1a56db'];
const FONTS  = ['Bold','Italic','Outline','Shadow','Neon','Handwrite'];
const SPEEDS = ['0.3x','0.5x','0.7x','1x','1.5x','2x','3x'];
const HASHTAGS = ['#Football','#PitchSide','#Goals','#Highlights','#UCL','#PremierLeague','#GOAT','#FootballSkills','#MatchDay','#LaLiga','#WorldCup','#FIFAWorldCup'];

/* Mock gallery data — large grid, multi-select */
const MOCK_GALLERY_IMGS = [
  {emoji:'⚽',label:'Match Day'},   {emoji:'🏟️',label:'Stadium'},
  {emoji:'🥅',label:'Goal Kick'},   {emoji:'🎽',label:'Kit'},
  {emoji:'🏆',label:'Trophy'},      {emoji:'👟',label:'Boots'},
  {emoji:'🤾',label:'Action'},      {emoji:'🌟',label:'Star'},
  {emoji:'🎯',label:'Free Kick'},   {emoji:'🔥',label:'On Fire'},
  {emoji:'💥',label:'Tackle'},      {emoji:'🥇',label:'Champion'},
  {emoji:'🎬',label:'Highlight'},   {emoji:'📸',label:'Snapshot'},
  {emoji:'🏅',label:'Medal'},       {emoji:'🎺',label:'Ultras'},
  {emoji:'💪',label:'Power'},       {emoji:'🙌',label:'Celebrate'},
];

/* ── State ── */
let studioMediaSrc     = null;  // first/primary selected
let studioMediaType    = null;
let studioSelectedMedia = [];   // all selected {src, type, emoji}
let activeFilter      = 'normal';
let activeTextColor   = '#ffffff';
let activeFont        = 'Bold';
let selectedTextEl    = null;
let selectedMusic     = null;
let selectedMusicAudio = null;  // Audio() instance for preview
let activeSpeed       = '1x';
let adjustState       = { brightness:0, contrast:0, saturation:0, sharpness:0, warmth:0, vignette:0 };
let trimLeft = 0, trimRight = 100;

/* ── Init Studio ── */
function openStudio() {
  buildStudioUI();
  // Reset state
  studioSelectedMedia = [];
  studioMediaSrc      = null;
  studioMediaType     = null;
  document.getElementById('step1-next').disabled = true;
  document.getElementById('media-preview-big').innerHTML = `
    <div class="media-preview-placeholder">
      <svg width="48" height="48" fill="none" stroke="#555575" stroke-width="1.5" viewBox="0 0 24 24"><rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8.5" cy="8.5" r="1.5"/><path d="m21 15-5-5L5 21"/></svg>
      <span>Select photos or videos below</span>
    </div>`;
  document.getElementById('studio-overlay').classList.add('active');
  document.body.style.overflow = 'hidden';
  goToStep(1);
  // Default to gallery tab
  const galleryTab = document.querySelector('.media-tab.on');
  if (!galleryTab) switchMediaTab(document.querySelector('.media-tab'), 'gallery');
}

function closeStudio() {
  // Stop music preview if playing
  if (selectedMusicAudio) { selectedMusicAudio.pause(); selectedMusicAudio = null; }
  document.getElementById('studio-overlay').classList.remove('active');
  document.body.style.overflow = '';
  studioMediaSrc = null; studioMediaType = null; studioSelectedMedia = [];
  document.getElementById('step1-next').disabled = true;
  const img = document.getElementById('editor-img');
  const vid = document.getElementById('editor-vid');
  img.src = ''; img.style.display = 'none';
  vid.src = ''; vid.style.display = 'none';
  document.querySelectorAll('.text-overlay-item, .sticker-overlay-item').forEach(el => el.remove());
  // Reset gallery selections
  document.querySelectorAll('.media-thumb').forEach(t => t.classList.remove('selected'));
  document.querySelectorAll('.media-sel-num').forEach(n => n.remove());
}

function buildStudioUI() {
  // Gallery — large cells, multi-select numbers
  const gallery = document.getElementById('mock-gallery');
  if (!gallery.children.length) {
    gallery.innerHTML = MOCK_GALLERY_IMGS.map((g) => `
      <div class="media-thumb" onclick="toggleGallerySelect(this,'image','${g.emoji}')">
        <div class="media-thumb-inner" style="font-size:0;">
          <span style="font-size:44px;line-height:1;">${g.emoji}</span>
          <span style="font-size:10px;margin-top:4px;">${g.label}</span>
        </div>
        <div class="media-sel-badge"></div>
      </div>`).join('');
  }
  // Filters
  const fs = document.getElementById('filter-strip');
  if (!fs.children.length) {
    fs.innerHTML = FILTERS.map(f => `
      <div class="filter-item ${f.id==='normal'?'on':''}" onclick="applyFilter(this,'${f.id}')">
        <div class="filter-preview f-${f.id}">${f.emoji}</div>
        <div class="filter-label">${f.label}</div>
      </div>`).join('');
  }
  // Colors
  const cs = document.getElementById('text-color-strip');
  if (!cs.children.length) {
    cs.innerHTML = COLORS.map(c => `
      <div class="color-dot ${c==='#ffffff'?'on':''}" style="background:${c};border:${c==='#000000'?'1.5px solid #333':'none'}" onclick="selectTextColor(this,'${c}')"></div>`).join('');
  }
  // Fonts
  const fonts = document.getElementById('font-strip');
  if (!fonts.children.length) {
    fonts.innerHTML = FONTS.map((f,i) => `
      <div class="font-btn ${i===0?'on':''}" onclick="selectFont(this,'${f}')">${f}</div>`).join('');
  }
  // Stickers
  ['sticker-grid-football','sticker-grid-reactions','sticker-grid-celebrations'].forEach((id,i) => {
    const el = document.getElementById(id);
    if (!el.children.length) {
      const arr = [STICKERS_FOOTBALL, STICKERS_REACTIONS, STICKERS_CELEBRATIONS][i];
      el.innerHTML = arr.map(s=>`<div class="sticker-btn" onclick="addSticker('${s}')">${s}</div>`).join('');
    }
  });
  // Music — now with real Audio preview
  const ml = document.getElementById('music-list');
  if (!ml.children.length) {
    ml.innerHTML = MUSIC_TRACKS.map((m,i) => `
      <div class="music-item" id="music-item-${i}" onclick="selectMusic(this,${i})">
        <div class="music-icon">${m.emoji}</div>
        <div class="music-info">
          <div class="music-name">${m.name}</div>
          <div class="music-artist">${m.artist}</div>
        </div>
        <div class="music-check" style="display:none;">✓</div>
      </div>`).join('');
  }
  // Speed
  const ss = document.getElementById('speed-strip');
  if (!ss.children.length) {
    ss.innerHTML = SPEEDS.map(sp => `
      <div class="speed-btn ${sp==='1x'?'on':''}" onclick="setSpeed(this,'${sp}')">${sp}</div>`).join('');
  }
  // Hashtags
  const ts = document.getElementById('tag-strip');
  if (!ts.children.length) {
    ts.innerHTML = HASHTAGS.map(t => `
      <div class="tag-chip" onclick="insertTag(this,'${t}')">${t}</div>`).join('');
  }
}

/* ── Step Navigation ── */
function goToStep(n) {
  document.querySelectorAll('.studio-step').forEach(s => s.classList.remove('active'));
  document.getElementById('studio-step-' + n).classList.add('active');
  if (n === 2) loadEditorMedia();
  if (n === 3) loadCaptionThumb();
}

/* ── Step 1: Media Selection ── */
function switchMediaTab(el, tab) {
  document.querySelectorAll('.media-tab').forEach(t => t.classList.remove('on'));
  el.classList.add('on');
  document.getElementById('media-tab-gallery').style.display = tab === 'gallery' ? '' : 'none';
  document.getElementById('media-tab-upload').style.display  = tab === 'upload'  ? '' : 'none';
}

/* Multi-select gallery — tap to toggle, shows selection order number */
function toggleGallerySelect(el, type, emoji) {
  const badge = el.querySelector('.media-sel-badge');
  const alreadyIdx = studioSelectedMedia.findIndex(m => m.emoji === emoji && m.type === type);
  if (alreadyIdx >= 0) {
    // Deselect
    studioSelectedMedia.splice(alreadyIdx, 1);
    el.classList.remove('selected');
    badge.textContent = '';
    badge.style.display = 'none';
    // Re-number remaining
    document.querySelectorAll('.media-thumb.selected').forEach((thumb, idx) => {
      thumb.querySelector('.media-sel-badge').textContent = idx + 1;
    });
  } else {
    studioSelectedMedia.push({ src: 'mock:' + emoji, type, emoji });
    el.classList.add('selected');
    badge.style.display = 'flex';
    badge.textContent = studioSelectedMedia.length;
  }
  // Set primary as first selected
  if (studioSelectedMedia.length > 0) {
    studioMediaSrc  = studioSelectedMedia[0].src;
    studioMediaType = studioSelectedMedia[0].type;
    const firstEmoji = studioSelectedMedia[0].emoji;
    document.getElementById('media-preview-big').innerHTML =
      `<div style="font-size:90px;text-align:center;line-height:1;">${firstEmoji}</div>
       ${studioSelectedMedia.length > 1 ? `<div style="position:absolute;bottom:10px;right:12px;background:rgba(0,0,0,0.6);color:#fff;font-size:12px;font-weight:700;padding:4px 10px;border-radius:12px;">${studioSelectedMedia.length} selected</div>` : ''}`;
    document.getElementById('step1-next').disabled = false;
  } else {
    studioMediaSrc = null; studioMediaType = null;
    document.getElementById('media-preview-big').innerHTML = `
      <div class="media-preview-placeholder">
        <svg width="48" height="48" fill="none" stroke="#555575" stroke-width="1.5" viewBox="0 0 24 24"><rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8.5" cy="8.5" r="1.5"/><path d="m21 15-5-5L5 21"/></svg>
        <span>Select photos or videos below</span>
      </div>`;
    document.getElementById('step1-next').disabled = true;
  }
}

function handleFileUpload(e) {
  const files = Array.from(e.target.files);
  if (!files.length) return;

  // Check video duration before proceeding
  const videoFile = files.find(f => f.type.startsWith('video'));
  if (videoFile) {
    const isPlayer = window._hlIsPlayerPost || false;
    const maxSecs  = isPlayer ? 90 : 30;
    const maxLabel = isPlayer ? '1 min 30 secs' : '30 seconds';
    const tempVid  = document.createElement('video');
    tempVid.preload = 'metadata';
    tempVid.src = URL.createObjectURL(videoFile);
    tempVid.onloadedmetadata = function() {
      URL.revokeObjectURL(tempVid.src);
      if (tempVid.duration > maxSecs) {
        showToast('⚠️ Video too long! Max is ' + maxLabel + ' for ' + (isPlayer ? 'players' : 'fans'));
        e.target.value = '';
        return;
      }
      _doHandleFiles(files);
    };
    return;
  }
  _doHandleFiles(files);
}

function _doHandleFiles(files) {
  const grid = document.getElementById('upload-preview-grid');
  grid.innerHTML = '';
  studioSelectedMedia = [];
  files.forEach((file, i) => {
    const url  = URL.createObjectURL(file);
    const type = file.type.startsWith('video') ? 'video' : 'image';
    studioSelectedMedia.push({ src: url, type, emoji: null });
    const cell = document.createElement('div');
    cell.style.cssText = 'aspect-ratio:1;border-radius:8px;overflow:hidden;background:#1a1a2e;position:relative;';
    if (type === 'image') {
      cell.innerHTML = `<img src="${url}" style="width:100%;height:100%;object-fit:cover;">`;
    } else {
      cell.innerHTML = `<video src="${url}" style="width:100%;height:100%;object-fit:cover;" muted playsinline></video>`;
    }
    if (i === 0) {
      cell.innerHTML += `<div style="position:absolute;inset:0;border:3px solid #a855f7;border-radius:8px;pointer-events:none;"></div>`;
    }
    grid.appendChild(cell);
  });
  studioMediaSrc  = studioSelectedMedia[0].src;
  studioMediaType = studioSelectedMedia[0].type;
  const preview   = document.getElementById('media-preview-big');
  if (studioMediaType === 'image') {
    preview.innerHTML = `<img src="${studioMediaSrc}" style="width:100%;height:100%;object-fit:cover;">`;
  } else {
    preview.innerHTML = `<video src="${studioMediaSrc}" style="width:100%;height:100%;object-fit:cover;" autoplay muted loop playsinline></video>`;
  }
  if (files.length > 1) {
    preview.innerHTML += `<div style="position:absolute;bottom:10px;right:12px;background:rgba(0,0,0,0.6);color:#fff;font-size:12px;font-weight:700;padding:4px 10px;border-radius:12px;">${files.length} selected</div>`;
  }
  document.getElementById('step1-next').disabled = false;
  showToast(`${files.length} file${files.length > 1 ? 's' : ''} selected ✓`);
}

/* ── Step 2: Editor ── */
function loadEditorMedia() {
  const img = document.getElementById('editor-img');
  const vid = document.getElementById('editor-vid');
  img.style.display = 'none'; vid.style.display = 'none';
  if (!studioMediaSrc) return;
  let existing = document.getElementById('editor-emoji-bg');
  if (studioMediaSrc.startsWith('mock:')) {
    const emoji = studioMediaSrc.replace('mock:', '');
    if (!existing) {
      existing = document.createElement('div');
      existing.id = 'editor-emoji-bg';
      existing.style.cssText = 'position:absolute;inset:0;display:flex;align-items:center;justify-content:center;font-size:120px;pointer-events:none;user-select:none;';
      document.getElementById('editor-canvas').appendChild(existing);
    }
    existing.textContent = emoji;
    existing.style.display = 'flex';
  } else {
    if (existing) existing.style.display = 'none';
    if (studioMediaType === 'image') {
      img.src = studioMediaSrc; img.style.display = 'block';
    } else {
      vid.src = studioMediaSrc; vid.style.display = 'block';
    }
  }
  applyFilter(null, activeFilter);
}

/* FILTERS */
function applyFilter(el, filterId) {
  if (el) { document.querySelectorAll('.filter-item').forEach(f => f.classList.remove('on')); el.classList.add('on'); }
  activeFilter = filterId;
  ['editor-img','editor-vid','editor-emoji-bg'].map(id => document.getElementById(id)).filter(Boolean).forEach(t => {
    t.className = t.className.replace(/\bf-\w+/g,'').trim();
    t.classList.add('f-' + filterId);
  });
}

/* ADJUST */
function applyAdjust(prop, val) {
  adjustState[prop] = parseInt(val);
  const b = 1 + adjustState.brightness / 100;
  const c = 1 + adjustState.contrast   / 100;
  const s = 1 + adjustState.saturation / 100;
  const h = adjustState.warmth * 0.3;
  ['editor-img','editor-vid'].map(id => document.getElementById(id)).filter(Boolean).forEach(t => {
    t.style.filter = `brightness(${b}) contrast(${c}) saturate(${s}) hue-rotate(${h}deg)`;
  });
}

/* TEXT */
function addTextOverlay() {
  const input = document.getElementById('text-inp');
  const text  = input.value.trim();
  if (!text) { showToast('Type something first'); return; }
  const canvas = document.getElementById('editor-canvas');
  const el = document.createElement('div');
  el.className = 'text-overlay-item';
  el.textContent = text;
  el.style.color = activeTextColor;
  el.style.top   = '30%';
  el.style.left  = '10%';
  applyFontStyle(el, activeFont);
  makeDraggable(el);
  el.addEventListener('click', e => { e.stopPropagation(); selectOverlay(el); });
  canvas.appendChild(el);
  input.value = '';
  showToast('Text added — drag to position');
}

function applyFontStyle(el, font) {
  el.style.fontStyle  = font === 'Italic' ? 'italic' : 'normal';
  el.style.fontWeight = ['Bold','Outline','Shadow','Neon'].includes(font) ? '800' : '600';
  el.style.textShadow =
    font === 'Shadow'  ? '3px 3px 8px rgba(0,0,0,0.9)' :
    font === 'Neon'    ? '0 0 10px #a855f7, 0 0 20px #a855f7' :
    font === 'Outline' ? '-1px -1px 0 #000,1px -1px 0 #000,-1px 1px 0 #000,1px 1px 0 #000' :
    '0 2px 6px rgba(0,0,0,0.6)';
  el.style.webkitTextStroke = font === 'Outline' ? '1px #000' : '';
}

function selectTextColor(el, color) {
  document.querySelectorAll('.color-dot').forEach(d => d.classList.remove('on'));
  el.classList.add('on'); activeTextColor = color;
  if (selectedTextEl) selectedTextEl.style.color = color;
}

function selectFont(el, font) {
  document.querySelectorAll('.font-btn').forEach(b => b.classList.remove('on'));
  el.classList.add('on'); activeFont = font;
  if (selectedTextEl) applyFontStyle(selectedTextEl, font);
}

/* STICKERS */
function addSticker(emoji) {
  const canvas = document.getElementById('editor-canvas');
  const el = document.createElement('div');
  el.className = 'sticker-overlay-item';
  el.textContent = emoji;
  el.style.top  = '40%'; el.style.left = '35%';
  makeDraggable(el);
  el.addEventListener('click', e => { e.stopPropagation(); selectOverlay(el); });
  canvas.appendChild(el);
  showToast('Sticker added — drag to position');
}

function selectOverlay(el) {
  document.querySelectorAll('.text-overlay-item,.sticker-overlay-item').forEach(e => e.classList.remove('selected'));
  el.classList.add('selected');
  selectedTextEl = el.classList.contains('text-overlay-item') ? el : null;
}

document.addEventListener('keydown', e => {
  if (e.key === 'Delete' || e.key === 'Backspace') {
    const sel = document.querySelector('.text-overlay-item.selected, .sticker-overlay-item.selected');
    if (sel && document.activeElement.tagName !== 'INPUT' && document.activeElement.tagName !== 'TEXTAREA') {
      sel.remove(); selectedTextEl = null;
    }
  }
});

function makeDraggable(el) {
  let startX, startY, origX, origY;
  const getPos = e => e.touches ? {x:e.touches[0].clientX, y:e.touches[0].clientY} : {x:e.clientX, y:e.clientY};
  function onStart(e) {
    e.stopPropagation(); selectOverlay(el);
    const pos = getPos(e); startX = pos.x; startY = pos.y;
    const rect = el.getBoundingClientRect(); origX = rect.left; origY = rect.top;
    document.addEventListener('mousemove', onMove);
    document.addEventListener('mouseup',   onEnd);
    document.addEventListener('touchmove', onMove, {passive:false});
    document.addEventListener('touchend',  onEnd);
  }
  function onMove(e) {
    if (e.cancelable) e.preventDefault();
    const pos = getPos(e), dx = pos.x - startX, dy = pos.y - startY;
    const cv  = document.getElementById('editor-canvas').getBoundingClientRect();
    el.style.left = Math.max(0, Math.min(85, ((origX + dx - cv.left)  / cv.width  * 100))) + '%';
    el.style.top  = Math.max(0, Math.min(85, ((origY + dy - cv.top)   / cv.height * 100))) + '%';
  }
  function onEnd() {
    document.removeEventListener('mousemove', onMove); document.removeEventListener('mouseup',   onEnd);
    document.removeEventListener('touchmove', onMove); document.removeEventListener('touchend',  onEnd);
  }
  el.addEventListener('mousedown',  onStart);
  el.addEventListener('touchstart', onStart, {passive:true});
}

// editor canvas click handled in master init above

/* MUSIC — real audio preview using open-source tracks from cdnjs/freesound-like URLs */
const MUSIC_PREVIEW_URLS = [null, null, null, null, null, null]; // no real audio URLs available in static build; show "playing" state only

function selectMusic(el, idx) {
  // Stop any existing preview
  if (selectedMusicAudio) { selectedMusicAudio.pause(); selectedMusicAudio = null; }
  document.querySelectorAll('.music-item').forEach(m => {
    m.classList.remove('on');
    m.querySelector('.music-check').style.display = 'none';
  });
  el.classList.add('on');
  el.querySelector('.music-check').style.display = '';
  selectedMusic = idx;
  // Visual feedback that music is "selected"
  const track = MUSIC_TRACKS[idx];
  showToast(`🎵 ${track.name} selected`);
  // Attach music name to post
  window._selectedMusicName = `${track.name} – ${track.artist}`;
}

/* SPEED */
function setSpeed(el, sp) {
  document.querySelectorAll('#speed-strip .speed-btn').forEach(b => b.classList.remove('on'));
  el.classList.add('on'); activeSpeed = sp;
  const vid = document.getElementById('editor-vid');
  if (vid && vid.src) vid.playbackRate = parseFloat(sp);
  showToast('Speed: ' + sp);
}

/* RATIO */
function setRatio(el, ratio) {
  document.querySelectorAll('#panel-ratio .speed-btn').forEach(b => b.classList.remove('on'));
  el.classList.add('on');
  document.getElementById('editor-canvas').style.aspectRatio = ratio;
  showToast('Ratio: ' + ratio.replace('/',':'));
}

/* TRIM */
let trimDragging = null;
function initTrimDrag(e, side) {
  trimDragging = side;
  document.addEventListener('mousemove', onTrimMove);
  document.addEventListener('mouseup',   onTrimEnd);
  document.addEventListener('touchmove', onTrimMove, {passive:false});
  document.addEventListener('touchend',  onTrimEnd);
}
function onTrimMove(e) {
  if (!trimDragging) return; if (e.cancelable) e.preventDefault();
  const bar = document.querySelector('.trim-bar-wrap').getBoundingClientRect();
  const cx  = e.touches ? e.touches[0].clientX : e.clientX;
  const pct = Math.max(0, Math.min(100, ((cx - bar.left) / bar.width) * 100));
  if (trimDragging === 'left')  trimLeft  = Math.min(pct, trimRight - 5);
  if (trimDragging === 'right') trimRight = Math.max(pct, trimLeft  + 5);
  updateTrimUI();
}
function onTrimEnd() {
  trimDragging = null;
  document.removeEventListener('mousemove', onTrimMove); document.removeEventListener('mouseup',   onTrimEnd);
  document.removeEventListener('touchmove', onTrimMove); document.removeEventListener('touchend',  onTrimEnd);
}
function updateTrimUI() {
  document.getElementById('trim-left').style.left  = trimLeft + '%';
  document.getElementById('trim-right').style.left = trimRight + '%';
  const fill = document.getElementById('trim-fill');
  fill.style.left  = trimLeft + '%'; fill.style.right = (100 - trimRight) + '%';
  const dur = 15, fmt = t => `${Math.floor(t/60)}:${String(t%60).padStart(2,'0')}`;
  document.getElementById('trim-label').textContent =
    `Duration: ${fmt(Math.round((trimLeft/100)*dur))} – ${fmt(Math.round((trimRight/100)*dur))}`;
}

/* ── Step 3: Caption ── */
function loadCaptionThumb() {
  const thumb = document.getElementById('caption-thumb');
  if (!studioMediaSrc) return;
  if (studioMediaSrc.startsWith('mock:')) {
    thumb.textContent = studioMediaSrc.replace('mock:','');
  } else if (studioMediaType === 'image') {
    thumb.innerHTML = `<img src="${studioMediaSrc}" style="width:100%;height:100%;object-fit:cover;border-radius:12px;">`;
  } else {
    thumb.innerHTML = `<video src="${studioMediaSrc}" style="width:100%;height:100%;object-fit:cover;border-radius:12px;" muted playsinline></video>`;
  }
}

function insertTag(el, tag) {
  const inp = document.getElementById('caption-inp');
  inp.value = (inp.value.trimEnd() + ' ' + tag).trim();
  el.style.background = 'rgba(168,85,247,0.3)';
  setTimeout(() => el.style.background = '', 400);
}

/* Caption option cycle (Who can view, Allow comments, etc.) */
function cycleOption(el, key, options) {
  const val = el.querySelector('.caption-option-val');
  const current = val.textContent.replace(' ›','').trim();
  const idx  = options.indexOf(current);
  const next = options[(idx + 1) % options.length];
  val.textContent = next + ' ›';
  showToast(`${el.querySelector('.caption-option-label').textContent}: ${next}`);
}

/* ── PUBLISH ── */
/* ═══════════════════════════════════════════
   CLOUDINARY + FIREBASE POST SYSTEM
   Cloud Name: djqxj5twp  |  Preset: Pitchside
═══════════════════════════════════════════ */
const CLOUDINARY_CLOUD  = 'djqxj5twp';
const CLOUDINARY_PRESET = 'Pitchside';


// Called by the "🚀 Post to PitchSide" button
// Opens the Cloudinary widget; on success → saves to Firestore → refreshes feed
// publishPost: now handled by pcPublish() in the Post Creator below
function publishPost() { pcPublish(); }

/* Editor tab switching */
function switchEditorTab(el, tab) {
  document.querySelectorAll('.editor-tool-tab').forEach(t => t.classList.remove('on'));
  document.querySelectorAll('.editor-tool-panel').forEach(p => p.classList.remove('on'));
  el.classList.add('on');
  document.getElementById('panel-' + tab).classList.add('on');
}

/* ═══════════════════════════════════════════
   AI ASSISTANT — UPGRADED
═══════════════════════════════════════════ */
const AI_SYSTEM_PROMPT = `You are PitchSide AI — the smartest football assistant in the world, built into the PitchSide app for passionate football fans.

PERSONALITY: You are confident, accurate, passionate about football, and speak like a knowledgeable football analyst who also loves the game. You are direct and never vague.

YOUR EXPERTISE (always give accurate, detailed answers on):
- All major leagues: Premier League, La Liga, Bundesliga, Serie A, Ligue 1, Champions League, Europa League, AFCON, World Cup, Copa Libertadores, MLS, NPFL (Nigerian league)
- Player stats, career history, strengths, weaknesses, market value, nationality, age, trophies
- Club history, trophies, records, managers, formations, playing styles
- Football tactics and systems (4-3-3, 4-2-3-1, 3-5-2, pressing, gegenpressing, etc.)
- Transfer news, rumors, contract details (up to your knowledge cutoff)
- Match results, historical fixtures, head-to-head records
- Football rules: offside, VAR, handball, penalty rules, etc.
- Nigerian football: Super Eagles squad, NPFL clubs (Enyimba, Rivers United, Rangers, Remo Stars etc.)
- PitchSide app features: Live Scores, Explore videos, Post Studio, NPFL page, Player Search, News, AI Assistant, Dashboard, Profile

RESPONSE RULES:
1. ALWAYS give a specific, accurate answer — never say "it depends" without explaining what it depends on
2. Use real player names, real statistics, real facts
3. Format responses clearly: use **bold** for player names and key stats, use bullet points (•) for lists
4. Keep responses concise but complete — 3 to 6 sentences for simple questions, structured lists for comparisons
5. Use football emojis naturally: ⚽ 🏆 🔥 ⭐ 🎯 🥅 🏃 💪
6. If asked about very recent events (last few days), say you may not have the latest update but give the most recent info you have
7. Never make up statistics — if uncertain about a specific number, give a range or say approximately
8. For Nigerian users: always mention Nigerian players and NPFL when relevant

EXAMPLE RESPONSES:
User: "Who is the best player in the world?"
You: "Right now **Erling Haaland** and **Kylian Mbappe** are the top two debates ⚽. Haaland has a jaw-dropping goal-per-game ratio of over 1.0 at Man City, while Mbappe's combination of speed, goals (38+ per season) and creativity at Real Madrid makes him unique. The Ballon d'Or conversation also includes **Vinicius Jr** and **Jude Bellingham**. Most analysts edge towards Mbappe for overall impact 🏆."

User: "Explain the offside rule"  
You: "A player is offside if: • They are in the opponent's half • Any part of their body (except hands/arms) is closer to the goal line than both the ball AND the second-to-last defender at the moment the ball is played to them 📏. The key word is PLAYED — not when they receive it. If you're level with the defender, you are ONSIDE. VAR uses lines to check this to the millimetre. Being in an offside position is only an offense if you are ACTIVELY INVOLVED in the play ⚽."`;

let aiMessages = []; // conversation history (without system prompt)
let aiPendingAttachments = []; // [{type, dataUrl, mimeType, name}]

const AI_CHIPS = [
  "Who is the best player right now? ⭐",
  "Top scorer in Premier League? ⚽",
  "Explain the offside rule 📏",
  "Super Eagles latest squad 🦅",
  "Best football tactics 🧠",
  "UCL 2024/25 winner? 🏆",
  "Osimhen stats this season 💪",
  "Who will win El Clasico? 🔮",
];

function escHtml(str) {
  return str.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
}

function formatAiText(text) {
  return escHtml(text)
    .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
    .replace(/^• /gm, '&bull; ')
    .replace(/\n\n/g, '<br><br>')
    .replace(/\n/g, '<br>');
}

function nowTime() {
  return new Date().toLocaleTimeString([], {hour:'2-digit', minute:'2-digit'});
}

function appendAiMessage(role, text, attachments) {
  const body   = document.getElementById('ai-chat-body');
  const isBot  = role === 'bot' || role === 'assistant';
  const initials = (typeof profileData !== 'undefined' && profileData) ? profileData.initials : 'ME';
  const bubble = document.createElement('div');
  bubble.className = `ai-bubble ${isBot ? 'ai-bubble-bot' : 'ai-bubble-user'}`;

  let mediaHtml = '';
  if (attachments && attachments.length > 0) {
    attachments.forEach(a => {
      if (a.type === 'photo') {
        mediaHtml += `<div class="ai-media-preview"><img src="${a.dataUrl}" alt="photo"></div>`;
      } else if (a.type === 'video') {
        mediaHtml += `<div class="ai-media-preview"><video src="${a.dataUrl}" controls playsinline></video></div>`;
      } else {
        mediaHtml += `<div class="ai-file-chip"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/></svg>${escHtml(a.name || 'File')}</div>`;
      }
    });
  }

  bubble.innerHTML = `
    <div class="${isBot ? 'ai-avatar-bot' : 'ai-avatar-user'}">${isBot ? 'AI' : initials}</div>
    <div class="ai-msg-wrap">
      ${mediaHtml}
      <div class="ai-msg">${formatAiText(text)}</div>
      <div class="ai-time">${nowTime()}</div>
    </div>`;
  body.appendChild(bubble);
  body.scrollTop = body.scrollHeight;
}

function showAiTyping() {
  const body = document.getElementById('ai-chat-body');
  const el = document.createElement('div');
  el.id = 'ai-typing';
  el.className = 'ai-bubble ai-bubble-bot';
  el.innerHTML = `
    <div class="ai-avatar-bot">AI</div>
    <div class="ai-typing">
      <div class="ai-dot"></div>
      <div class="ai-dot"></div>
      <div class="ai-dot"></div>
    </div>`;
  body.appendChild(el);
  body.scrollTop = body.scrollHeight;
}

function hideAiTyping() {
  const el = document.getElementById('ai-typing');
  if (el) el.remove();
}

function renderAiChips() {
  const body = document.getElementById('ai-chat-body');
  const el = document.createElement('div');
  el.className = 'ai-chips';
  el.id = 'ai-chips';
  el.innerHTML = AI_CHIPS.map(c =>
    `<div class="ai-chip" onclick="sendAiMessage('${c.replace(/'/g,"\\'")}')">${c}</div>`
  ).join('');
  body.appendChild(el);
  body.scrollTop = body.scrollHeight;
}

// Attach menu
function aiToggleAttachMenu() {
  const menu = document.getElementById('ai-attach-menu');
  const btn  = document.getElementById('ai-attach-toggle');
  menu.classList.toggle('open');
  btn.style.color = menu.classList.contains('open') ? '#10b981' : '';
  btn.style.borderColor = menu.classList.contains('open') ? 'rgba(16,185,129,0.4)' : '';
}

function aiTriggerFile(accept, type) {
  const inp = document.getElementById('ai-file-input');
  inp.accept = accept;
  inp.dataset.fileType = type;
  inp.value = '';
  inp.click();
  document.getElementById('ai-attach-menu').classList.remove('open');
}

function aiHandleFileSelect(input) {
  const file = input.files[0];
  if (!file) return;
  const type = input.dataset.fileType || 'file';
  const reader = new FileReader();
  reader.onload = function(e) {
    const dataUrl = e.target.result;
    aiPendingAttachments.push({ type, dataUrl, mimeType: file.type, name: file.name });
    renderAttachPreview();
  };
  reader.readAsDataURL(file);
}

function renderAttachPreview() {
  const strip = document.getElementById('ai-attach-preview');
  strip.innerHTML = '';
  if (aiPendingAttachments.length === 0) {
    strip.classList.remove('has-items');
    return;
  }
  strip.classList.add('has-items');
  aiPendingAttachments.forEach((a, i) => {
    const thumb = document.createElement('div');
    thumb.className = 'ai-attach-thumb';
    if (a.type === 'photo') {
      thumb.innerHTML = `<img src="${a.dataUrl}" alt="">`;
    } else if (a.type === 'video') {
      thumb.innerHTML = `<video src="${a.dataUrl}"></video>`;
    } else {
      thumb.innerHTML = `<div class="ai-attach-type"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/></svg><span>${escHtml(a.name.split('.').pop().toUpperCase())}</span></div>`;
    }
    thumb.innerHTML += `<div class="ai-attach-remove" onclick="aiRemoveAttach(${i})">✕</div>`;
    strip.appendChild(thumb);
  });
}

function aiRemoveAttach(i) {
  aiPendingAttachments.splice(i, 1);
  renderAttachPreview();
}

async function sendAiMessage(presetText) {
  const input = document.getElementById('ai-input');
  const text  = (presetText || input.value).trim();
  const attachments = [...aiPendingAttachments];

  if (!text && attachments.length === 0) return;
  input.value = '';
  aiPendingAttachments = [];
  renderAttachPreview();

  // Remove welcome cards and chips
  const cards = document.getElementById('ai-welcome-cards');
  if (cards) cards.remove();
  const chips = document.getElementById('ai-chips');
  if (chips) chips.remove();

  const displayText = text || (attachments.length > 0 ? `[Sent ${attachments.length} file${attachments.length>1?'s':''}]` : '');
  appendAiMessage('user', displayText, attachments);

  // Build message content for API
  const userContent = [];

  // Add images to content
  attachments.forEach(a => {
    if (a.type === 'photo' && a.mimeType.startsWith('image/')) {
      const base64 = a.dataUrl.split(',')[1];
      userContent.push({
        type: 'image',
        source: { type: 'base64', media_type: a.mimeType, data: base64 }
      });
    }
  });

  if (text) {
    userContent.push({ type: 'text', text });
  } else if (attachments.length > 0) {
    const hasImage = attachments.some(a => a.type === 'photo');
    const hasVideo = attachments.some(a => a.type === 'video');
    const prompt = hasImage ? 'Analyze this football image and tell me everything you observe.' : hasVideo ? 'I sent a football video. Describe what kind of football content this likely is and give relevant analysis.' : 'Analyze the attached file in the context of football.';
    userContent.push({ type: 'text', text: prompt });
  }

  aiMessages.push({ role: 'user', content: userContent.length === 1 && userContent[0].type === 'text' ? userContent[0].text : userContent });
  showAiTyping();

  try {
    const res = await fetch('/api/ai', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        max_tokens: 800,
        system: AI_SYSTEM_PROMPT,
        messages: aiMessages,
      })
    });

    const data = await res.json();
    hideAiTyping();

    if (data.content && data.content[0] && data.content[0].text) {
      const reply = data.content[0].text;
      appendAiMessage('bot', reply);
      aiMessages.push({ role: 'assistant', content: reply });
      if (aiMessages.length > 40) aiMessages = aiMessages.slice(-40);
    } else if (data.error) {
      const errMsg = data.error.message || 'Something went wrong.';
      const friendly = errMsg.includes('x-api-key') || errMsg.includes('api-key') || errMsg.includes('API key')
        ? '⚠️ AI service is currently unavailable. The app owner needs to add an Anthropic API key to enable this feature.'
        : `⚠️ ${errMsg}`;
      appendAiMessage('bot', friendly);
    } else {
      appendAiMessage('bot', "Hmm, I didn't get a response. Please try again! ⚽");
    }
  } catch(e) {
    hideAiTyping();
    appendAiMessage('bot', "⚠️ Couldn't connect to AI. Check your connection and try again.");
  }
}

/* ═══════════════════════════════════════════
   PLATFORM SHARE FUNCTIONS
═══════════════════════════════════════════ */
function getShareText() {
  const caption = document.getElementById('caption-inp').value.trim();
  return caption || 'Check out this football moment on PitchSide ⚽🔥 #Football #PitchSide';
}
function shareToTikTok() {
  showToast('Opening TikTok… paste your caption there 📱');
  setTimeout(() => {
    try { window.open('tiktok://', '_blank'); } catch(e) {}
    setTimeout(() => window.open('https://www.tiktok.com/upload', '_blank'), 800);
  }, 300);
}
function shareToCapCut() {
  showToast('Opening CapCut to edit your clip ✂️');
  setTimeout(() => {
    try { window.open('capcut://', '_blank'); } catch(e) {}
    setTimeout(() => window.open('https://www.capcut.com', '_blank'), 800);
  }, 300);
}
function shareToFacebook() {
  const text = encodeURIComponent(getShareText());
  window.open(`https://www.facebook.com/sharer/sharer.php?quote=${text}`, '_blank');
  showToast('Sharing to Facebook… ');
}
function shareToInstagram() {
  showToast('Opening Instagram… share your moment there 📸');
  setTimeout(() => {
    try { window.open('instagram://', '_blank'); } catch(e) {}
    setTimeout(() => window.open('https://www.instagram.com', '_blank'), 800);
  }, 300);
}
function shareToTwitter() {
  const text = encodeURIComponent(getShareText() + ' #Football #PitchSide');
  window.open(`https://twitter.com/intent/tweet?text=${text}`, '_blank');
  showToast('Sharing to X (Twitter) 🐦');
}
function shareToWhatsApp() {
  const text = encodeURIComponent(getShareText());
  window.open(`https://wa.me/?text=${text}`, '_blank');
  showToast('Sharing to WhatsApp 💬');
}

// AI chips rendered in master init above

// Cleanup on page unload (single, correct placement)
window.addEventListener('beforeunload', function() {
  stopLiveScoresRefresh();
  stopTickerRefresh();
});

/* ═══════════════════════════════════════════
   NEWS FEED — Firebase 'news' collection is the single source of truth.
   No hardcoded articles. onSnapshot fires on every new document written
   by the robot or admin. Filter pills narrow by the 'category' field.
═══════════════════════════════════════════ */

/* ── State ── */
let _newsAllDocs     = [];   // full unfiltered list from Firestore
let _newsCurrentCat  = 'all';
let _newsUnsubscribe = null; // Firestore listener handle

/* ── Time-ago helper ── */
function _newsTimeAgo(ts) {
  try {
    const date = (ts && ts.toDate) ? ts.toDate() : new Date(ts);
    const diff = Math.floor((Date.now() - date.getTime()) / 1000);
    if (diff < 60)   return 'Just now';
    if (diff < 3600) return Math.floor(diff / 60)   + 'm ago';
    if (diff < 86400) return Math.floor(diff / 3600) + 'h ago';
    return Math.floor(diff / 86400) + 'd ago';
  } catch(_) { return ''; }
}

/* ── Category colour map for source pill ── */
function _newsCatColor(cat) {
  const map = {
    'transfer':'#f59e0b', 'transfers':'#f59e0b',
    'premier league':'#6366f1', 'pl':'#6366f1',
    'champions league':'#3b82f6', 'ucl':'#3b82f6',
    'nigeria football':'#16a34a', 'nigeria':'#16a34a', 'npfl':'#16a34a',
    'la liga':'#ef4444',
    'bundesliga':'#eab308',
  };
  return map[(cat||'').toLowerCase()] || 'var(--blue)';
}

/* ── Activate Firebase real-time listener ── */
function _activateNewsListener() {
  if (_newsUnsubscribe) return; // already listening

  const fsApi = window._psFs;
  const db    = window._psDb;
  if (!fsApi || !db || !fsApi.onSnapshot) {
    setTimeout(_activateNewsListener, 600);
    return;
  }

  const { collection, query, orderBy, limit, onSnapshot } = fsApi;
  const q = query(
    collection(db, 'news'),
    orderBy('createdAt', 'desc'),
    limit(100)
  );

  _newsUnsubscribe = onSnapshot(q,
    (snapshot) => {
      _newsAllDocs = snapshot.docs.map(doc => {
        const d = doc.data();
        return {
          id:        doc.id,
          title:     d.title      || 'Untitled',
          desc:      d.desc       || d.description || d.summary || '',
          source:    d.source     || d.publisher   || 'PitchSide',
          category:  (d.category  || d.cat         || 'general').toLowerCase(),
          imageUrl:  applyCloudinaryQuality(d.imageUrl || d.image || d.thumbnail || ''),
          url:       d.url        || d.articleUrl  || '',
          timeAgo:   _newsTimeAgo(d.createdAt || d.publishedAt || d.date),
          emoji:     d.emoji      || _newsCategoryEmoji((d.category || d.cat || '').toLowerCase()),
        };
      });
      console.log('[PitchSide] 📰 News snapshot:', _newsAllDocs.length, 'articles');
      _renderNewsFiltered(_newsCurrentCat);
      // Refresh explore "All" tab so news articles appear there too
      try {
        const activeExpPill = document.querySelector('#page-explore .pill.on');
        const onAttr = activeExpPill ? activeExpPill.getAttribute('onclick') : '';
        if (!onAttr || onAttr.includes("'all'")) {
          if (typeof _renderExploreAll === 'function') _renderExploreAll();
        }
      } catch(_) {}
    },
    (err) => {
      console.error('[PitchSide] News listener error:', err);
      _renderNewsEmpty('Connection error — pull down to retry');
    }
  );
}

/* ── Category emoji fallback ── */
function _newsCategoryEmoji(cat) {
  const map = {
    'transfer':'💸', 'transfers':'💸',
    'premier league':'🏴󠁧󠁢󠁥󠁮󠁧󠁿', 'pl':'🏴󠁧󠁢󠁥󠁮󠁧󠁿',
    'champions league':'⭐', 'ucl':'⭐',
    'nigeria football':'🦅', 'nigeria':'🦅', 'npfl':'🇳🇬',
    'la liga':'🇪🇸',
    'bundesliga':'🇩🇪',
    'serie a':'🇮🇹',
    'ligue 1':'🇫🇷',
  };
  return map[cat] || '⚽';
}

/* ── Render filtered articles ── */
/* ── News article lookup map (id → article object) ── */
window._newsLookup = {};

function _renderNewsFiltered(cat) {
  const filtered = cat === 'all'
    ? _newsAllDocs
    : _newsAllDocs.filter(n =>
        n.category.includes(cat) ||
        n.category === cat
      );

  const container = document.getElementById('news-content');
  if (!container) return;

  if (_newsAllDocs.length === 0) {
    // Still waiting for Firestore first response
    _renderNewsLoader();
    return;
  }

  if (filtered.length === 0) {
    container.innerHTML = `
      <div class="empty-state" style="padding:48px 24px;text-align:center;">
        <div class="empty-icon" style="font-size:40px;margin-bottom:12px;">📰</div>
        <div style="font-size:14px;font-weight:600;color:var(--text2);margin-bottom:6px;">No articles in this category yet</div>
        <div style="font-size:12px;color:var(--text3);">Your robot hasn't filed anything under <strong>${cat}</strong> yet. Check back soon.</div>
      </div>`;
    return;
  }

  // Store articles in lookup map so onclick can access them by id
  window._newsLookup = {};
  filtered.forEach(n => { window._newsLookup[n.id] = n; });

  container.innerHTML = filtered.map(n => {
    const catColor  = _newsCatColor(n.category);
    const hasImg    = n.imageUrl && n.imageUrl.length > 10;
    const safeId    = n.id.replace(/'/g, "\\'");
    return `
      <div class="news-card" onclick="openNewsReader(window._newsLookup['${safeId}'])">
        <div class="news-img">
          ${hasImg
            ? `<img src="${n.imageUrl}" alt="${n.title}" loading="lazy"
                 onerror="this.style.display='none';this.nextElementSibling.style.display='flex'">
               <span style="display:none;font-size:48px;">${n.emoji}</span>`
            : `<span style="font-size:48px;">${n.emoji}</span>`
          }
        </div>
        <div class="news-body">
          <div style="display:flex;align-items:center;gap:7px;margin-bottom:5px;">
            <div class="news-source" style="color:${catColor};">${n.source.toUpperCase()}</div>
            ${n.category !== 'general' ? `<span style="background:${catColor}22;color:${catColor};font-size:9px;font-weight:700;padding:2px 7px;border-radius:20px;letter-spacing:.04em;text-transform:uppercase;">${n.category}</span>` : ''}
          </div>
          <div class="news-title">${n.title}</div>
          ${n.desc ? `<div class="news-desc">${n.desc}</div>` : ''}
          <div class="news-meta">⏱ ${n.timeAgo}</div>
        </div>
      </div>`;
  }).join('');
}

/* ── Skeleton loader ── */
function _renderNewsLoader() {
  const container = document.getElementById('news-content');
  if (!container) return;
  const skeleton = () => `
    <div style="background:var(--bg2);border-radius:12px;border:1px solid var(--border);margin-bottom:14px;overflow:hidden;">
      <div style="height:150px;background:var(--bg3);animation:pulse 1.5s infinite;"></div>
      <div style="padding:12px 14px;">
        <div style="height:10px;width:30%;background:var(--bg3);border-radius:6px;margin-bottom:10px;animation:pulse 1.5s infinite;"></div>
        <div style="height:14px;background:var(--bg3);border-radius:6px;margin-bottom:8px;animation:pulse 1.5s infinite;"></div>
        <div style="height:12px;width:80%;background:var(--bg3);border-radius:6px;animation:pulse 1.5s infinite;"></div>
      </div>
    </div>`;
  container.innerHTML = `
    <div style="display:flex;flex-direction:column;align-items:center;padding:28px 0 16px;gap:6px;">
      <div style="position:relative;width:52px;height:52px;margin-bottom:8px;">
        <div style="width:52px;height:52px;border-radius:50%;border:3px solid rgba(16,185,129,0.15);border-top-color:#10b981;animation:spin .9s linear infinite;position:absolute;inset:0;"></div>
        <div style="position:absolute;inset:0;display:flex;align-items:center;justify-content:center;font-size:22px;">📡</div>
      </div>
      <div style="font-size:14px;font-weight:700;color:var(--text);">Fetching latest headlines...</div>
      <div style="font-size:12px;color:var(--text3);">Your news feed is loading</div>
    </div>
    ${Array(3).fill(0).map(skeleton).join('')}`;
}

/* ── Empty state for errors ── */
function _renderNewsEmpty(msg) {
  const container = document.getElementById('news-content');
  if (!container) return;
  container.innerHTML = `
    <div style="text-align:center;padding:52px 24px;">
      <div style="font-size:40px;margin-bottom:14px;">📡</div>
      <div style="font-size:14px;font-weight:600;color:var(--text);margin-bottom:6px;">News feed unavailable</div>
      <div style="font-size:12px;color:var(--text3);margin-bottom:20px;">${msg || 'Check your connection'}</div>
      <button onclick="_activateNewsListener()"
        style="padding:10px 22px;background:var(--blue);color:#fff;border:none;border-radius:10px;
               font-size:13px;font-weight:600;font-family:'DM Sans',sans-serif;cursor:pointer;">
        🔄 Retry
      </button>
    </div>`;
}

/* ══════════════════════════════════════════════════════
   HIGHLIGHTS SYSTEM — Three layers:
   1. Official  → Highlightly API (no YouTube player shown)
   2. Fans      → User uploaded via Cloudinary / Firebase
   3. Players   → Verified player uploads via Cloudinary / Firebase
══════════════════════════════════════════════════════ */

const HIGHLIGHTLY_KEY = ''; // Secured in Netlify
const HIGHLIGHTLY_BASE = '/api/highlights';

let _hlInitDone    = false;
let _hlCurrentTab  = 'official';
let _hlOfficialData = [];
let _hlFanData      = [];
let _hlPlayerData   = [];

/* ── Init (called once when nav tab clicked) ── */
function initHighlights() {
  // Always re-render so fresh Firebase data shows immediately
  _renderHighlightsFromVideos();
  _loadCommunityHighlights();
}

/* ── Render official highlights directly from the VIDEOS array (Firebase bot data) ── */
function _renderHighlightsFromVideos() {
  const container = document.getElementById('hl-official-content');
  if (!container) return;

  // Filter to official/bot videos only (not user posts), newest first
  const official = VIDEOS
    .filter(v => !v.userPost && !v.playerPost)
    .sort((a, b) => {
      const ta = (a.createdAt && a.createdAt.seconds) ? a.createdAt.seconds : (a.createdAt || 0);
      const tb = (b.createdAt && b.createdAt.seconds) ? b.createdAt.seconds : (b.createdAt || 0);
      return tb - ta;
    });

  if (official.length === 0) {
    // Show loading if VIDEOS is still empty (Firebase not loaded yet), else empty state
    if (VIDEOS.length === 0) {
      container.innerHTML = `
        <div class="hl-loading">
          <div class="hl-dots"><span></span><span></span><span></span></div>
          <div class="hl-loading-text">Loading highlights from Firebase…</div>
        </div>`;
      // Retry in 1.5s — Firebase may still be loading
      setTimeout(_renderHighlightsFromVideos, 1500);
    } else {
      container.innerHTML = `
        <div class="hl-empty">
          <div class="hl-empty-icon">📡</div>
          <div class="hl-empty-text">Your bot hasn't uploaded any highlights yet.<br>Check back after matches — they'll appear here automatically.</div>
          <button onclick="_renderHighlightsFromVideos()" style="margin-top:16px;padding:10px 24px;background:var(--green);color:#fff;border:none;border-radius:20px;font-weight:700;font-size:13px;cursor:pointer;">🔄 Refresh</button>
        </div>`;
    }
    return;
  }

  // Store full video objects in a lookup map so openHlPlayer can retrieve them safely
  window._hlVideoMap = {};
  official.forEach(v => { window._hlVideoMap[String(v.id)] = v; });

  container.innerHTML = official.map(v => {
    const thumb   = v.thumbnail || '';
    const title   = v.title     || 'Football Highlight';
    const league  = v.competition || v.cat || 'Football';
    const date    = v.date        || 'Today';
    const safeId  = _esc(String(v.id));
    return `
    <div class="hlcard" onclick="openHlPlayerById('${safeId}')">
      <div class="hlcard-thumb">
        ${thumb
          ? `<img src="${thumb}" alt="${_esc(title)}" loading="lazy" onerror="this.style.display='none'">`
          : `<div style="width:100%;height:100%;background:linear-gradient(135deg,#0f172a,#1e293b);display:flex;align-items:center;justify-content:center;font-size:48px;">⚽</div>`
        }
        <div class="hlcard-play"><div class="hlcard-play-btn"><svg width="24" height="24" fill="white" viewBox="0 0 24 24"><path d="M8 5v14l11-7z"/></svg></div></div>
        <div class="hlcard-league">${_esc(league).toUpperCase().slice(0,20)}</div>
        <div class="hlcard-badge">
          <span class="verified-badge">
            <svg width="9" height="9" fill="none" stroke="white" stroke-width="3" stroke-linecap="round" stroke-linejoin="round" viewBox="0 0 24 24"><path d="M20 6L9 17l-5-5"/></svg>
            OFFICIAL
          </span>
        </div>
      </div>
      <div class="hlcard-info">
        <div class="hlcard-title">${_esc(title)}</div>
        <div class="hlcard-meta">
          <span class="hlcard-date">📅 ${date}</span>
          <span style="margin-left:auto;font-size:11px;color:var(--green);font-weight:700;">▶ Watch</span>
        </div>
      </div>
    </div>`;
  }).join('') + '<div style="height:80px;"></div>';
}

/* ── Open highlights player by looking up video from map (avoids onclick attr corruption) ── */
function openHlPlayerById(id) {
  // Try _hlVideoMap first, then fall back to VIDEOS array (for explore/dash cards)
  let v = window._hlVideoMap && window._hlVideoMap[id];
  if (!v) v = (typeof VIDEOS !== 'undefined') && VIDEOS.find(x => String(x.id) === String(id));
  if (!v) { console.warn('[HL] Video not found:', id); return; }
  // Also register in map for future lookups
  if (!window._hlVideoMap) window._hlVideoMap = {};
  window._hlVideoMap[String(v.id)] = v;
  openHlPlayer(String(v.id), v.title || '', v.src || v.embedUrl || '', v.embed || '', v.thumbnail || '');
}

/* ── Tab switcher ── */
function switchHlTab(tab, btn) {
  _hlCurrentTab = tab;
  document.querySelectorAll('.hl-tab').forEach(b => b.classList.remove('active'));
  btn.classList.add('active');
  document.querySelectorAll('.hl-panel').forEach(p => p.classList.remove('active'));
  document.getElementById('hl-panel-' + tab).classList.add('active');
}

function _renderCurrentHlTab() {
  // just re-render whichever tab is active
  if (_hlCurrentTab === 'official') _renderOfficialHighlights();
  else if (_hlCurrentTab === 'fans') _renderCommunityCards('fans');
  else _renderCommunityCards('players');
}

/* ══════════════════════════════════════════════════════
   LAYER 1 — OFFICIAL HIGHLIGHTS via Highlightly API
══════════════════════════════════════════════════════ */
async function _fetchOfficialHighlights() {
  const container = document.getElementById('hl-official-content');
  container.innerHTML = `
    <div class="hl-loading">
      <div class="hl-dots"><span></span><span></span><span></span></div>
      <div class="hl-loading-text">Fetching latest highlights…</div>
    </div>`;

  try {
    // Get today's date and yesterday for fresh results
    const today = new Date();
    const yesterday = new Date(today);
    yesterday.setDate(today.getDate() - 1);
    const fmt = d => d.toISOString().split('T')[0];

    const res = await fetch(
      `${HIGHLIGHTLY_BASE}/highlights?limit=20`,
      {
        method: 'GET',
        headers: {
          'x-rapidapi-key': HIGHLIGHTLY_KEY,
          'x-rapidapi-host': 'football-highlights-api.p.rapidapi.com'
        }
      }
    );

    if (!res.ok) throw new Error('API error ' + res.status);
    const json = await res.json();

    // Highlightly returns { data: [...] } or array directly
    const items = json.data || json.highlights || json || [];
    if (!Array.isArray(items) || items.length === 0) {
      _hlOfficialData = [];
      _renderOfficialHighlights();
      return;
    }

    _hlOfficialData = items.map(h => ({
      id:        h.id || h._id || Math.random().toString(36).slice(2),
      title:     h.title || (h.homeTeam + ' vs ' + h.awayTeam) || 'Football Highlight',
      league:    h.competition?.name || h.league || h.competition || 'Football',
      thumbnail: h.thumbnail || h.thumbnailUrl || h.image || '',
      videoUrl:  h.url || h.videoUrl || h.video || '',
      embedHtml: h.embed || h.embedCode || '',
      date:      h.date ? new Date(h.date).toLocaleDateString('en-GB',{day:'numeric',month:'short'}) : 'Today',
      homeTeam:  h.homeTeam || '',
      awayTeam:  h.awayTeam || '',
      score:     (h.homeScore != null && h.awayScore != null) ? `${h.homeScore} - ${h.awayScore}` : '',
    }));

    _renderOfficialHighlights();

  } catch(err) {
    console.error('[Highlights] API error:', err);
    // Show empty state — only bot-fetched videos should appear here
    _hlOfficialData = [];
    _renderOfficialHighlights();
  }
}

function _renderOfficialHighlights() {
  const container = document.getElementById('hl-official-content');
  if (!container) return;

  if (!_hlOfficialData.length) {
    container.innerHTML = `
      <div class="hl-empty">
        <div class="hl-empty-icon">📡</div>
        <div class="hl-empty-text">Your bot hasn't uploaded any highlights yet.<br>Check back after matches — they'll appear here automatically.</div>
        <button onclick="_fetchOfficialHighlights()" style="margin-top:16px;padding:10px 24px;background:var(--green);color:#fff;border:none;border-radius:20px;font-weight:700;font-size:13px;cursor:pointer;">🔄 Refresh</button>
      </div>`;
    return;
  }

  container.innerHTML = _hlOfficialData.map(h => {
    const isFallback = !!h.ytSearch;
    const tapAction  = isFallback
      ? `onclick="openHlPlayer('${_esc(h.id)}','${_esc(h.title)}','','','','${_esc(h.ytSearch)}')"`
      : `onclick="openHlPlayer('${_esc(h.id)}','${_esc(h.title)}','${_esc(h.videoUrl)}','${_esc(h.embedHtml)}','${_esc(h.thumbnail)}')"`; 
    const gradA = h.gradA || '#0f172a';
    const gradB = h.gradB || '#1e293b';
    const thumbHtml = isFallback
      ? `<div style="width:100%;height:100%;background:linear-gradient(135deg,${gradA},${gradB});display:flex;flex-direction:column;align-items:center;justify-content:center;gap:10px;">
           <div style="font-size:52px;filter:drop-shadow(0 2px 8px rgba(0,0,0,0.5));">${h.emoji || '⚽'}</div>
           <div style="background:rgba(16,185,129,0.9);border-radius:50%;width:52px;height:52px;display:flex;align-items:center;justify-content:center;box-shadow:0 4px 20px rgba(16,185,129,0.5);">
             <svg width="24" height="24" fill="white" viewBox="0 0 24 24"><path d="M8 5v14l11-7z"/></svg>
           </div>
           ${h.score ? `<div style="background:rgba(0,0,0,0.5);color:#10b981;font-size:13px;font-weight:800;padding:4px 12px;border-radius:20px;">${h.homeTeam || ''} ${h.score} ${h.awayTeam || ''}</div>` : ''}
         </div>`
      : h.thumbnail
        ? `<img src="${h.thumbnail}" alt="${_esc(h.title)}" loading="lazy" onerror="this.style.display='none'">`
        : `<div style="width:100%;height:100%;display:flex;align-items:center;justify-content:center;font-size:40px;">⚽</div>`;

    return `
    <div class="hlcard" ${tapAction}>
      <div class="hlcard-thumb">
        ${thumbHtml}
        ${!isFallback ? `<div class="hlcard-play"><div class="hlcard-play-btn"><svg width="24" height="24" fill="white" viewBox="0 0 24 24"><path d="M8 5v14l11-7z"/></svg></div></div>` : ''}
        <div class="hlcard-league">${_esc(h.league).toUpperCase().slice(0,20)}</div>
        <div class="hlcard-badge">
          <span class="verified-badge">
            <svg width="9" height="9" fill="none" stroke="white" stroke-width="3" stroke-linecap="round" stroke-linejoin="round" viewBox="0 0 24 24"><path d="M20 6L9 17l-5-5"/></svg>
            OFFICIAL
          </span>
        </div>
        ${isFallback ? `<div style="position:absolute;bottom:8px;right:8px;background:rgba(0,0,0,0.7);color:#fff;font-size:10px;font-weight:700;padding:3px 8px;border-radius:8px;letter-spacing:.04em;">▶ WATCH NOW</div>` : ''}
      </div>
      <div class="hlcard-info">
        <div class="hlcard-title">${_esc(h.title)}${h.score ? ' <span style="color:var(--green);font-size:12px;">'+h.score+'</span>' : ''}</div>
        <div class="hlcard-meta">
          <span class="hlcard-date">📅 ${h.date}</span>
          <span style="margin-left:auto;font-size:11px;color:var(--green);font-weight:700;">▶ Watch</span>
        </div>
      </div>
    </div>`;
  }).join('') + '<div style="height:80px;"></div>';
}

/* ══════════════════════════════════════════════════════
   IN-APP VIDEO PLAYER — plays MP4 directly, no YouTube UI
══════════════════════════════════════════════════════ */
function openHlPlayer(id, title, videoUrl, embedHtml, thumbnail, ytSearch) {
  const overlay = document.getElementById('hl-player-overlay');
  const wrap    = document.getElementById('hl-video-wrap');
  const titleEl = document.getElementById('hl-player-title');

  titleEl.textContent = (title || '').replace(/\u2019/g, "'");
  wrap.innerHTML = '';
  wrap.style.position = 'relative';

  /* ── Build a clean URL: unmuted, controls visible, no autoplay force-mute ── */
  function makeCleanUrl(src) {
    try {
      const u = new URL(src);
      u.searchParams.set('mute',           '0');
      u.searchParams.set('controls',       '1');
      u.searchParams.set('rel',            '0');
      u.searchParams.set('modestbranding', '1');
      u.searchParams.set('iv_load_policy', '3');
      u.searchParams.set('playsinline',    '1');
      u.searchParams.delete('autoplay');
      if (u.hostname.includes('youtube.com')) u.hostname = 'www.youtube-nocookie.com';
      return u.toString();
    } catch(e) { return src; }
  }

  /* ── Create & inject a fully-configured iframe ── */
  function injectIframe(src) {
    const iframe = document.createElement('iframe');
    iframe.src = makeCleanUrl(src);
    iframe.setAttribute('allowfullscreen', '');
    iframe.setAttribute('allow', 'autoplay; fullscreen; picture-in-picture; encrypted-media');
    iframe.style.cssText = 'position:absolute;inset:0;width:100%;height:100%;border:none;background:#000;';
    wrap.appendChild(iframe);
    // Belt-and-suspenders: postMessage unmute after load
    iframe.addEventListener('load', function() {
      try {
        iframe.contentWindow.postMessage(JSON.stringify({event:'command',func:'unMute',args:[]}), '*');
        iframe.contentWindow.postMessage(JSON.stringify({method:'setMute',value:false}), '*');
      } catch(e) {}
    });
  }

  // Priority 1: Raw embed HTML with <iframe> inside
  if (embedHtml && embedHtml.trim().includes('<iframe')) {
    const tmp = document.createElement('div');
    tmp.innerHTML = embedHtml;
    const fr = tmp.querySelector('iframe');
    if (fr && fr.src) {
      injectIframe(fr.src);
    } else if (fr) {
      fr.removeAttribute('width'); fr.removeAttribute('height');
      fr.style.cssText = 'position:absolute;inset:0;width:100%;height:100%;border:none;background:#000;';
      fr.setAttribute('allowfullscreen','');
      fr.setAttribute('allow','autoplay; fullscreen; picture-in-picture; encrypted-media');
      wrap.appendChild(fr);
    }
  }
  // Priority 2: URL is a YouTube / embed link
  else if (videoUrl && (
    videoUrl.includes('youtube.com') || videoUrl.includes('youtu.be') ||
    videoUrl.includes('/embed/') || videoUrl.includes('streamable') ||
    videoUrl.includes('vimeo') || videoUrl.includes('dailymotion') ||
    videoUrl.includes('twitter') || videoUrl.includes('streamff')
  )) {
    injectIframe(videoUrl);
  }
  // Priority 3: Direct video file (mp4, webm, m3u8 etc.)
  else if (videoUrl) {
    const vid = document.createElement('video');
    vid.controls    = true;
    vid.playsInline = true;
    vid.muted       = false;
    vid.style.cssText = 'position:absolute;inset:0;width:100%;height:100%;object-fit:contain;background:#000;';
    if (thumbnail) vid.poster = thumbnail;
    const src = document.createElement('source');
    src.src = videoUrl;
    vid.appendChild(src);
    wrap.appendChild(vid);
    vid.muted = false;
    vid.play().catch(() => { vid.muted = false; });
  }
  else if (ytSearch) {
    const searchUrl = 'https://www.youtube.com/results?search_query=' + encodeURIComponent(ytSearch);
    wrap.innerHTML = '<div style="display:flex;flex-direction:column;align-items:center;justify-content:center;height:100%;color:#fff;gap:16px;padding:24px;text-align:center;background:linear-gradient(135deg,#0f172a,#1e293b);"><div style="font-size:56px;">🎬</div><div><div style="font-size:16px;font-weight:700;margin-bottom:8px;">' + title + '</div><div style="font-size:13px;opacity:0.8;line-height:1.5;margin-bottom:16px;">This highlight is available on YouTube.</div></div><a href="' + searchUrl + '" target="_blank" style="display:inline-flex;align-items:center;gap:8px;background:linear-gradient(135deg,#059669,#10b981);color:#fff;padding:12px 28px;border-radius:24px;text-decoration:none;font-weight:700;font-size:14px;">▶ Watch on YouTube</a></div>';
  } else {
    wrap.innerHTML = '<div style="display:flex;flex-direction:column;align-items:center;justify-content:center;height:100%;color:#fff;gap:12px;"><div style="font-size:48px;">⚽</div><div style="font-size:14px;opacity:.7;">Video not available</div></div>';
  }

  overlay.classList.add('open');
  document.body.style.overflow = 'hidden';
}


function closeHlPlayer() {
  const overlay = document.getElementById('hl-player-overlay');
  const wrap    = document.getElementById('hl-video-wrap');
  overlay.classList.remove('open');
  wrap.innerHTML = ''; // stops video/audio
  document.body.style.overflow = '';
}


/* ══════════════════════════════════════════════════════
   LAYER 2 & 3 — COMMUNITY UPLOADS (Fans + Players)
   Reads from Firebase 'posts' collection filtered by type
══════════════════════════════════════════════════════ */
function _loadCommunityHighlights() {
  const fsApi = window._psFs;
  const db    = window._psDb;
  if (!fsApi || !db) {
    setTimeout(_loadCommunityHighlights, 1200);
    return;
  }

  const { collection, query, orderBy, limit, onSnapshot, where } = fsApi;

  // Fan posts listener
  const fanQ = query(
    collection(db, 'posts'),
    orderBy('createdAt','desc'),
    limit(30)
  );

  onSnapshot(fanQ, snap => {
    const all = snap.docs.map(d => ({ id: d.id, ...d.data() }));
    _hlFanData    = all.filter(p => !p.playerPost);
    _hlPlayerData = all.filter(p => p.playerPost === true);
    _renderCommunityCards('fans');
    _renderCommunityCards('players');
  }, err => console.warn('[Highlights] Community load error:', err));
}

function _renderCommunityCards(type) {
  const data      = type === 'fans' ? _hlFanData : _hlPlayerData;
  const container = document.getElementById('hl-' + type + '-content');
  if (!container) return;

  if (!data.length) {
    const icon  = type === 'fans' ? '📱' : '⭐';
    const label = type === 'fans'
      ? 'No fan clips yet.\nBe the first to upload a moment!'
      : 'No player content yet.\nPlayers — show us your world!';
    container.innerHTML = `
      <div class="hl-empty">
        <div class="hl-empty-icon">${icon}</div>
        <div class="hl-empty-text">${label}</div>
        <button onclick="openQuickPost()" style="margin-top:16px;padding:10px 24px;background:var(--green);color:#fff;border:none;border-radius:20px;font-weight:700;font-size:13px;cursor:pointer;">
          + Upload Now
        </button>
      </div>`;
    return;
  }

  const badge = type === 'fans'
    ? `<span class="user-post-badge">👥 FAN</span>`
    : `<span class="player-badge">⭐ PLAYER</span>`;

  // Store in lookup map so player can retrieve safely
  if (!window._hlVideoMap) window._hlVideoMap = {};
  data.forEach(p => { window._hlVideoMap[String(p.id)] = p; });

  container.innerHTML = data.map(p => {
    const thumb    = p.thumbnail || p.mediaUrl || '';
    const mediaUrl = p.mediaUrl  || '';
    const title    = p.title     || 'Football Moment';
    const poster   = p.userName  || p.poster || 'PitchSide User';
    const date     = p.createdAt ? new Date(p.createdAt.toDate ? p.createdAt.toDate() : p.createdAt)
                       .toLocaleDateString('en-GB',{day:'numeric',month:'short'}) : 'Today';
    const safeId   = _esc(String(p.id));
    return `
    <div class="hlcard" onclick="openHlPlayerById('${safeId}')">
      <div class="hlcard-thumb">
        ${thumb
          ? `<img src="${thumb}" alt="${_esc(title)}" loading="lazy" onerror="this.style.display='none'">`
          : `<div style="width:100%;height:100%;display:flex;align-items:center;justify-content:center;font-size:40px;">⚽</div>`
        }
        <div class="hlcard-play">
          <div class="hlcard-play-btn">
            <svg width="24" height="24" fill="white" viewBox="0 0 24 24"><path d="M8 5v14l11-7z"/></svg>
          </div>
        </div>
        <div class="hlcard-badge">${badge}</div>
      </div>
      <div class="hlcard-info">
        <div class="hlcard-title">${_esc(title)}</div>
        <div class="hlcard-meta">
          <span class="hlcard-poster">@${_esc(poster)}</span>
          <span class="hlcard-date" style="margin-left:auto;">📅 ${date}</span>
        </div>
      </div>
    </div>`;
  }).join('') + '<div style="height:80px;"></div>';
}

/* ── Escape helper for inline onclick attrs ── */
function _esc(str) {
  return (str || '').toString()
    .replace(/\\/g,'\\\\').replace(/'/g,'\\u0027')
    .replace(/"/g,'&quot;').replace(/\n/g,' ').slice(0,300);
}

/* ══════════════════════════════════════════════════════
   QUICK POST: Let user mark upload as "player" content
   Adds a toggle in the post composer
══════════════════════════════════════════════════════ */
// Expose so pcPublish can read it
window._hlIsPlayerPost = false;

function setPostType(type) {
  window._hlIsPlayerPost = (type === 'player');
  const fanEl    = document.getElementById('post-type-fan');
  const playerEl = document.getElementById('post-type-player');
  if (!fanEl || !playerEl) return;
  if (type === 'player') {
    playerEl.style.border    = '2px solid #fbbf24';
    playerEl.style.background= 'rgba(251,191,36,0.15)';
    playerEl.querySelector('div:last-child').style.color = '#fbbf24';
    fanEl.style.border    = '2px solid rgba(255,255,255,0.1)';
    fanEl.style.background= 'rgba(255,255,255,0.04)';
    fanEl.querySelector('div:last-child').style.color = 'rgba(255,255,255,0.4)';
  } else {
    fanEl.style.border    = '2px solid #10b981';
    fanEl.style.background= 'rgba(16,185,129,0.15)';
    fanEl.querySelector('div:last-child').style.color = '#10b981';
    playerEl.style.border    = '2px solid rgba(255,255,255,0.1)';
    playerEl.style.background= 'rgba(255,255,255,0.04)';
    playerEl.querySelector('div:last-child').style.color = 'rgba(255,255,255,0.4)';
  }
}
window.setPostType = setPostType;

/* Public API */
window.initHighlights   = initHighlights;
window.switchHlTab      = switchHlTab;
window.openHlPlayer     = openHlPlayer;
window.closeHlPlayer    = closeHlPlayer;

/* ── Public API (called by nav and filter pills) ── */
function initNews() {
  // If we already have news data, render it instantly — no blank screen
  if (_newsAllDocs.length > 0) {
    _renderNewsFiltered(_newsCurrentCat);
    return;
  }
  // Show loader immediately, then wire the listener
  _renderNewsLoader();
  // Listener activates once window._psFs is ready
  const _wait = setInterval(() => {
    if (window._psFs && window._psFs.onSnapshot) {
      clearInterval(_wait);
      _activateNewsListener();
    }
  }, 200);
  setTimeout(() => { clearInterval(_wait); if (_newsAllDocs.length === 0) _renderNewsEmpty('Firebase unavailable'); }, 10000);
}

function filterNews(el, cat) {
  document.querySelectorAll('#page-news .pill').forEach(p => p.classList.remove('on'));
  el.classList.add('on');
  _newsCurrentCat = cat;
  // If we already have data, filter instantly; otherwise listener will render when it arrives
  if (_newsAllDocs.length > 0) {
    _renderNewsFiltered(cat);
  } else {
    _renderNewsLoader();
  }
}

// Legacy alias kept for any stray calls
function renderNews(cat) { _renderNewsFiltered(cat); }

// Expose for retry button
window._activateNewsListener = _activateNewsListener;

/* ═══════════════════════════════════════════
   NPFL
═══════════════════════════════════════════ */
/* ═══════════════════════════════════════════
   NPFL — Live data from API-Football
   League ID 332 = Nigeria Professional Football League
   Auto-refreshes every 60 seconds when page is open
═══════════════════════════════════════════ */
const NPFL_LEAGUE_ID  = 332;
const NPFL_SEASON     = 2024;
const APIFOOTBALL_KEY = ''; // Secured in Netlify
let   _npflRefreshInterval = null;
let   _npflCurrentTab      = 'npfl-fixtures';

/* ── Spinner HTML ── */
function _npflSpinner(msg) {
  return `<div style="display:flex;flex-direction:column;align-items:center;justify-content:center;padding:48px 24px;gap:12px;">
    <div style="position:relative;width:52px;height:52px;">
      <div style="width:52px;height:52px;border-radius:50%;border:3px solid rgba(16,185,129,0.15);border-top-color:#10b981;animation:spin .9s linear infinite;position:absolute;inset:0;"></div>
      <div style="position:absolute;inset:0;display:flex;align-items:center;justify-content:center;font-size:22px;">🇳🇬</div>
    </div>
    <div style="font-size:13px;color:var(--text2);font-weight:600;">${msg || 'Loading NPFL data…'}</div>
  </div>`;
}

/* ── Show spinner in all three tabs ── */
function _npflShowLoading() {
  ['npfl-fixtures','npfl-standings','npfl-results'].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.innerHTML = _npflSpinner();
  });
}

/* ── Map API status to our badge classes ── */
function _npflStatusClass(short) {
  if (['1H','2H','ET','BT','P','INT','LIVE'].includes(short)) return 'npfl-live';
  if (short === 'FT' || short === 'AET' || short === 'PEN')   return 'npfl-ft';
  return 'npfl-ns';
}
function _npflStatusLabel(f) {
  const s = f.fixture.status;
  if (['1H','2H','ET','BT','P','INT'].includes(s.short)) return `${s.elapsed || ''}' LIVE`;
  if (s.short === 'HT') return 'HT';
  if (s.short === 'FT') return 'FT';
  if (s.short === 'NS') {
    const d = new Date(f.fixture.date);
    return d.toLocaleTimeString([], {hour:'2-digit', minute:'2-digit'});
  }
  return s.short || 'NS';
}

/* ── Render a single match row ── */
function _npflRenderMatch(f) {
  const isLive  = ['1H','2H','ET','HT','BT','P','INT'].includes(f.fixture.status.short);
  const isFT    = ['FT','AET','PEN'].includes(f.fixture.status.short);
  const hasScore = f.goals.home !== null;
  const statusCls = _npflStatusClass(f.fixture.status.short);
  const label     = _npflStatusLabel(f);

  const scoreHTML = hasScore
    ? `<div class="npfl-score">${f.goals.home}</div><div class="npfl-score">${f.goals.away}</div>`
    : `<div style="font-size:11px;color:var(--text3);line-height:1.5;">${label}</div>`;

  const homeWin = hasScore && f.goals.home > f.goals.away;
  const awayWin = hasScore && f.goals.away > f.goals.home;

  return `
    <div class="npfl-match">
      ${isLive ? `<div style="width:6px;height:6px;background:var(--red-live);border-radius:50%;animation:blink 1s infinite;flex-shrink:0;"></div>` : ''}
      <div class="npfl-teams">
        <div class="npfl-team-row" style="${homeWin ? 'font-weight:800;' : ''}">
          <img src="${f.teams.home.logo}" style="width:22px;height:22px;object-fit:contain;border-radius:3px;"
               onerror="this.style.display='none'">
          ${f.teams.home.name}
        </div>
        <div class="npfl-team-row" style="${awayWin ? 'font-weight:800;' : ''}">
          <img src="${f.teams.away.logo}" style="width:22px;height:22px;object-fit:contain;border-radius:3px;"
               onerror="this.style.display='none'">
          ${f.teams.away.name}
        </div>
      </div>
      <div class="npfl-score-col">
        ${scoreHTML}
        ${hasScore ? `<span class="npfl-status-badge ${statusCls}">${label}</span>` : ''}
      </div>
    </div>`;
}

/* ── Fetch fixtures for today + upcoming ── */
/* ── Convert a Firebase npfl_fixtures doc into the shape _npflRenderMatch() expects ── */
function _fbFixtureToApiShape(d) {
  const statusMap = { upcoming:'NS', live:'1H', halftime:'HT', finished:'FT', result:'FT', postponed:'PST' };
  const short = statusMap[d.status] || d.status || 'NS';
  return {
    fixture: {
      id:     d.eventId || d._dedup || '',
      date:   d.date ? d.date + 'T' + (d.time || '14:00') + ':00' : null,
      status: { short, elapsed: null },
      venue:  { name: d.venue || '' }
    },
    league: { id: 332, name: d.league || 'NPFL', country: d.country || 'Nigeria', logo: '', flag: '' },
    teams: {
      home: { id: 0, name: d.homeTeam || '—', logo: '' },
      away: { id: 0, name: d.awayTeam || '—', logo: '' }
    },
    goals: {
      home: (d.homeScore !== undefined && d.homeScore !== null) ? d.homeScore : null,
      away: (d.awayScore !== undefined && d.awayScore !== null) ? d.awayScore : null
    }
  };
}

/* ══════════════════════════════════════════════════════
   NPFL AI DATA — 1 request per day shared across ALL users
   AI generates data → saved to Firebase → everyone reads it
════════════════════════════════════════════════════════ */

/* ── _npflAskAI and _npflGetOrFetchData removed:
   NPFL data now comes exclusively from Firestore collections
   (npfl_fixtures, npfl_results, npfl_standings) written by the GitHub Action bot.
   fetchLiveScores() continues to use /api/football for the global Live Scores tab. ── */

async function _npflFetchFixtures() {
  const el = document.getElementById('npfl-fixtures');
  if (!el) return;
  el.innerHTML = _npflSpinner('Loading NPFL fixtures…');
  try {
    // ── Source: Firestore npfl_fixtures (written by GitHub Action bot) ──
    const { collection, getDocs, db } = window._psFs;
    const snap = await getDocs(collection(db, 'npfl_fixtures'));

    if (snap.empty) {
      el.innerHTML = '<div style="text-align:center;padding:40px;color:var(--text3);font-size:13px;">No fixtures available</div>';
      return;
    }

    // Separate live vs upcoming; numbers may be stored as strings
    const all = snap.docs.map(d => d.data());
    const live     = all.filter(f => (f.status || '').toLowerCase() === 'live');
    const upcoming = all.filter(f => (f.status || '').toLowerCase() !== 'live');

    let html = '';

    if (live.length) {
      html += `<div style="background:rgba(244,63,94,0.08);border-bottom:1px solid rgba(244,63,94,0.2);padding:8px 14px;">
        <span style="font-size:10px;font-weight:800;color:var(--red-live);letter-spacing:.06em;">🔴 LIVE NOW</span>
      </div>`;
      html += live.map(f => {
        const hScore = f.homeScore != null ? parseInt(f.homeScore, 10) : null;
        const aScore = f.awayScore != null ? parseInt(f.awayScore, 10) : null;
        const hasScore = hScore !== null && aScore !== null;
        const homeWin  = hasScore && hScore > aScore;
        const awayWin  = hasScore && aScore > hScore;
        return `<div class="npfl-match">
          <div style="width:6px;height:6px;background:var(--red-live);border-radius:50%;animation:blink 1s infinite;flex-shrink:0;"></div>
          <div class="npfl-teams">
            <div class="npfl-team-row" style="${homeWin ? 'font-weight:800;' : ''}">🏟 ${f.homeTeam || f.home || '—'}</div>
            <div class="npfl-team-row" style="${awayWin ? 'font-weight:800;' : ''}">🏟 ${f.awayTeam || f.away || '—'}</div>
          </div>
          <div class="npfl-score-col">
            ${hasScore
              ? `<div class="npfl-score">${hScore}</div><div class="npfl-score">${aScore}</div>
                 <span class="npfl-status-badge npfl-live">LIVE</span>`
              : `<span class="npfl-status-badge npfl-live">LIVE</span>`}
          </div>
        </div>`;
      }).join('');
      html += `<div style="background:var(--bg2);border-bottom:1px solid var(--border);padding:8px 14px;">
        <span style="font-size:10px;font-weight:700;color:var(--text3);letter-spacing:.06em;">UPCOMING</span>
      </div>`;
    }

    if (upcoming.length) {
      html += upcoming.map(f => `
        <div class="npfl-match">
          <div class="npfl-teams">
            <div class="npfl-team-row">🏟 ${f.homeTeam || f.home || '—'}</div>
            <div class="npfl-team-row">🏟 ${f.awayTeam || f.away || '—'}</div>
          </div>
          <div class="npfl-score-col">
            <div style="font-size:11px;color:var(--text3);text-align:center;line-height:1.6;">${f.date || ''}</div>
            <div style="font-size:11px;color:var(--blue);font-weight:700;text-align:center;">${f.time || ''}</div>
          </div>
        </div>`).join('');
    }

    el.innerHTML = html || '<div style="text-align:center;padding:40px;color:var(--text3);font-size:13px;">No fixtures available</div>';
  } catch(e) {
    console.error('[NPFL] Fixtures error:', e);
    el.innerHTML = '<div style="text-align:center;padding:36px;color:var(--text3);font-size:13px;">⚠️ Could not load fixtures</div>';
  }
}

async function _npflFetchResults() {
  const el = document.getElementById('npfl-results');
  if (!el) return;
  el.innerHTML = _npflSpinner('Loading results…');
  try {
    // ── Source: Firestore npfl_results (written by GitHub Action bot) ──
    const { collection, getDocs, db } = window._psFs;
    const snap = await getDocs(collection(db, 'npfl_results'));

    if (snap.empty) {
      el.innerHTML = '<div style="text-align:center;padding:40px;color:var(--text3);font-size:13px;">No results available</div>';
      return;
    }

    const results = snap.docs.map(d => d.data());
    el.innerHTML = results.map(r => {
      // parseInt handles both number and string-stored scores
      const hScore = parseInt(r.homeScore ?? r.home_score ?? r.scoreH ?? 0, 10);
      const aScore = parseInt(r.awayScore ?? r.away_score ?? r.scoreA ?? 0, 10);
      const home   = r.homeTeam || r.home_team || r.home || '—';
      const away   = r.awayTeam || r.away_team || r.away || '—';
      return `<div class="npfl-match">
        <div class="npfl-teams">
          <div class="npfl-team-row" style="${hScore > aScore ? 'font-weight:800;' : ''}">🏟 ${home}</div>
          <div class="npfl-team-row" style="${aScore > hScore ? 'font-weight:800;' : ''}">🏟 ${away}</div>
        </div>
        <div class="npfl-score-col">
          <div class="npfl-score">${hScore}</div>
          <div class="npfl-score">${aScore}</div>
          <span class="npfl-status-badge npfl-ft">FT</span>
        </div>
      </div>`;
    }).join('');
  } catch(e) {
    console.error('[NPFL] Results error:', e);
    el.innerHTML = '<div style="text-align:center;padding:36px;color:var(--text3);font-size:13px;">⚠️ Could not load results</div>';
  }
}

async function _npflFetchStandings() {
  const el = document.getElementById('npfl-standings');
  if (!el) return;
  el.innerHTML = _npflSpinner('Loading standings…');
  try {
    // ── Source: Firestore npfl_standings (written by GitHub Action bot) ──
    const { collection, getDocs, db } = window._psFs;
    const snap = await getDocs(collection(db, 'npfl_standings'));

    if (snap.empty) {
      el.innerHTML = '<div style="text-align:center;padding:40px;color:var(--text3);font-size:13px;">Standings not available</div>';
      return;
    }

    // parseInt on every field — bot stores numbers as strings (e.g. "55")
    const rows = snap.docs.map(d => {
      const t = d.data();
      return {
        team:   t.team   || t.name  || t.club  || d.id  || '—',
        played: parseInt(t.played  ?? t.p   ?? t.mp     ?? 0, 10),
        won:    parseInt(t.won     ?? t.w   ?? t.wins   ?? 0, 10),
        drawn:  parseInt(t.drawn   ?? t.d   ?? t.draws  ?? 0, 10),
        lost:   parseInt(t.lost    ?? t.l   ?? t.losses ?? 0, 10),
        gf:     parseInt(t.goalsFor    ?? t.gf ?? 0, 10),
        ga:     parseInt(t.goalsAgainst ?? t.ga ?? 0, 10),
        points: parseInt(t.points  ?? t.pts ?? 0, 10),
      };
    });

    // Sort by points descending; goal difference as tiebreaker
    rows.sort((a, b) => (b.points - a.points) || ((b.gf - b.ga) - (a.gf - a.ga)));

    const hdr = `<div class="stand-row stand-hdr">
      <div class="stand-pos">#</div>
      <div class="stand-team">Club</div>
      <div class="stand-stat">P</div>
      <div class="stand-stat">W</div>
      <div class="stand-stat">D</div>
      <div class="stand-stat">L</div>
      <div class="stand-stat">GD</div>
      <div class="stand-pts">Pts</div>
    </div>`;

    const rowsHtml = rows.map((t, i) => {
      const pos   = i + 1;
      const gd    = t.gf - t.ga;
      const gdStr = gd > 0 ? `+${gd}` : `${gd}`;
      const hl    = pos <= 3 ? 'color:var(--blue);font-weight:800;' : '';
      return `<div class="stand-row">
        <div class="stand-pos" style="${hl}">${pos}</div>
        <div class="stand-team">🏟 <span style="white-space:nowrap;overflow:hidden;text-overflow:ellipsis;max-width:110px;">${t.team}</span></div>
        <div class="stand-stat">${t.played}</div>
        <div class="stand-stat">${t.won}</div>
        <div class="stand-stat">${t.drawn}</div>
        <div class="stand-stat">${t.lost}</div>
        <div class="stand-stat">${gdStr}</div>
        <div class="stand-pts" style="${hl}">${t.points}</div>
      </div>`;
    }).join('');

    el.innerHTML = hdr + rowsHtml;
  } catch(e) {
    console.error('[NPFL] Standings error:', e);
    el.innerHTML = '<div style="text-align:center;padding:36px;color:var(--text3);font-size:13px;">⚠️ Could not load standings</div>';
  }
}
/* ── Also fetch any live NPFL matches ── */
async function _npflFetchLive() {
  try {
    const { collection, getDocs, query: fsQuery, where, db } = window._psFs;
    const q = fsQuery(
      collection(db, 'npfl_fixtures'),
      where('status', '==', 'live')
    );
    const snap = await getDocs(q);
    const live = snap.docs.map(d => _fbFixtureToApiShape(d.data()));
    if (!live.length) return;
    const el = document.getElementById('npfl-fixtures');
    if (!el) return;
    const liveHTML = `
      <div style="background:rgba(244,63,94,0.08);border-bottom:1px solid rgba(244,63,94,0.2);padding:8px 14px;">
        <span style="font-size:10px;font-weight:800;color:var(--red-live);letter-spacing:.06em;">🔴 LIVE NOW</span>
      </div>
      ${live.map(_npflRenderMatch).join('')}
      <div style="background:var(--bg2);border-bottom:1px solid var(--border);padding:8px 14px;">
        <span style="font-size:10px;font-weight:700;color:var(--text3);letter-spacing:.06em;">UPCOMING</span>
      </div>`;
    const existing = el.innerHTML;
    if (!existing.includes('LIVE NOW')) {
      el.innerHTML = liveHTML + existing;
    }
  } catch(_) {}
}

/* ── Main init — called when user taps NPFL nav ── */
function initNpfl() {
  _npflShowLoading();
  // Fetch all three in parallel
  Promise.all([
    _npflFetchFixtures(),
    _npflFetchResults(),
    _npflFetchStandings(),
  ]).then(() => {
    _npflFetchLive(); // overlay live matches on top
  });
  // Auto-refresh every 60 seconds
  if (_npflRefreshInterval) clearInterval(_npflRefreshInterval);
  _npflRefreshInterval = setInterval(() => {
    if (_npflCurrentTab === 'npfl-fixtures') {
      _npflFetchFixtures().then(_npflFetchLive);
    } else if (_npflCurrentTab === 'npfl-results') {
      _npflFetchResults();
    }
  }, 60000);
}

function switchNpflTab(el, tabId) {
  _npflCurrentTab = tabId;
  document.querySelectorAll('.npfl-tab').forEach(t => t.classList.remove('on'));
  document.querySelectorAll('.npfl-content').forEach(c => c.classList.remove('on'));
  el.classList.add('on');
  document.getElementById(tabId).classList.add('on');
}

// Legacy stub kept so nothing breaks if called elsewhere
function renderNpflMatch(m) { return ''; }

/* ═══════════════════════════════════════════
   PLAYER SEARCH — Real data from API-Football
   Searches players by name, returns real stats,
   photo, nationality, position, height, weight.
   Tapping a player opens a full profile with
   AI-powered career biography.
═══════════════════════════════════════════ */
let _playerTimer       = null;
let _playerCache       = {}; // query → results cache
let _playerDetailCache = {}; // playerId → detail cache

/* ── Search players by name ── */
async function handlePlayerSearch(val) {
  clearTimeout(_playerTimer);
  const res = document.getElementById('player-results');
  if (!val || !val.trim()) {
    res.innerHTML = `
      <div class="player-empty">
        <div class="player-empty-icon">⚽</div>
        <div class="player-empty-text">Search for any football player</div>
      </div>`;
    return;
  }

  // API-Football requires at least 3 characters
  if (val.trim().length < 3) {
    res.innerHTML = `
      <div class="player-empty">
        <div class="player-empty-icon">⌨️</div>
        <div class="player-empty-text">Keep typing… (min. 3 characters)</div>
      </div>`;
    return;
  }

  // Show spinner immediately
  res.innerHTML = `<div class="player-loading"><div class="spinner"></div> Searching…</div>`;

  // Debounce — wait 500ms after user stops typing
  _playerTimer = setTimeout(async () => {
    const query = val.trim();
    const queryLower = query.toLowerCase();

    // Return cached result if available
    if (_playerCache[queryLower]) {
      _renderPlayerResults(_playerCache[queryLower], query);
      return;
    }

    try {
      // ── Step 1: Search Firebase players collection first ──
      const { collection, getDocs, db } = window._psFs;
      const snap = await getDocs(collection(db, 'players'));
      const fbPlayers = snap.docs
        .map(d => d.data())
        .filter(p => {
          const name = (p.name || p.searchName || '').toLowerCase();
          return name.includes(queryLower);
        });

      if (fbPlayers.length) {
        // Convert Firebase shape → API shape for _renderPlayerResults
        const apiShaped = fbPlayers.map(p => ({
          player: {
            id:          p.id || 0,
            _fbName:     p.searchName || p.name || '', // used for API lookup if id=0
            firstname:   (p.name || '').split(' ')[0] || '',
            lastname:    (p.name || '').split(' ').slice(1).join(' ') || '',
            photo:       p.image || '',
            nationality: p.description || '',
            age:         null,
            position:    p.position || '—'
          },
          statistics: [{
            team:  { name: '—', logo: '' },
            games: { position: p.position || '—', appearences: null, rating: null },
            goals: { total: null, assists: null }
          }]
        }));
        _playerCache[queryLower] = apiShaped;
        _renderPlayerResults(apiShaped, query);
        return;
      }

      // ── Step 2: Not in Firebase — fall back to API ──
      const response = await fetch(
        `/api/football?endpoint=players&search=${encodeURIComponent(query)}&league=332&season=2024`,
        { signal: AbortSignal.timeout(7000) }
      );

      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      let data = await response.json();

      // Detect API-level errors (quota exceeded, invalid key, etc.)
      if (data.errors && (data.errors.requests || data.errors.token || Object.keys(data.errors).length)) {
        const errMsg = data.errors.requests || data.errors.token || JSON.stringify(data.errors);
        res.innerHTML = `
          <div class="player-empty">
            <div class="player-empty-icon">⚠️</div>
            <div class="player-empty-text">API Error: ${errMsg}</div>
          </div>`;
        return;
      }

      let players = data.response || [];

      // If no results in NPFL, widen search to all leagues
      if (!players.length) {
        const r2 = await fetch(
          `/api/football?endpoint=players&search=${encodeURIComponent(query)}&season=2024`,
          { signal: AbortSignal.timeout(7000) }
        );
        if (!r2.ok) throw new Error(`HTTP ${r2.status}`);
        const d2 = await r2.json();
        if (d2.errors && Object.keys(d2.errors).length) {
          const errMsg = d2.errors.requests || d2.errors.token || JSON.stringify(d2.errors);
          res.innerHTML = `
            <div class="player-empty">
              <div class="player-empty-icon">⚠️</div>
              <div class="player-empty-text">API Error: ${errMsg}</div>
            </div>`;
          return;
        }
        players = d2.response || [];
      }

      _playerCache[queryLower] = players;
      _renderPlayerResults(players, query);

    } catch(e) {
      res.innerHTML = `
        <div class="player-empty">
          <div class="player-empty-icon">⚠️</div>
          <div class="player-empty-text">Search failed: ${e.message || 'Check your connection'}</div>
        </div>`;
    }
  }, 500);
}

/* ── Render search results list ── */
function _safeParseJSON(text) {
  try {
    // Remove markdown fences
    let clean = text.replace(/```json|```/g, '').trim();
    // Extract first JSON object found
    const match = clean.match(/\{[\s\S]*\}/);
    if (match) return JSON.parse(match[0]);
    return {};
  } catch(_) { return {}; }
}

async function _fetchPlayerStatsFromAI(playerName, nationality, position) {
  try {
    const res = await fetch('/api/ai', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        max_tokens: 300,
        system: 'You are a football stats expert. Respond with a single JSON object only. No text before or after. No markdown.',
        messages: [{ role: 'user', content: `2024/2025 season stats for ${playerName} (${nationality}, ${position}). Reply with ONLY this JSON: {"goals":12,"assists":8,"apps":25,"rating":8.1,"club":"Club Name"}` }]
      })
    });
    const data = await res.json();
    const text = data.content?.[0]?.text || '{}';
    const parsed = _safeParseJSON(text);
    return {
      goals:   parsed.goals   ?? 0,
      assists: parsed.assists ?? 0,
      apps:    parsed.apps    ?? 0,
      rating:  parsed.rating  ?? '—',
      club:    parsed.club    || 'Unknown'
    };
  } catch(_) { return { goals:0, assists:0, apps:0, rating:'—', club:'Unknown' }; }
}

function _renderPlayerResults(players, query) {
  const res = document.getElementById('player-results');
  if (!players.length) {
    res.innerHTML = `
      <div class="player-empty">
        <div class="player-empty-icon">🔍</div>
        <div class="player-empty-text">No players found for "<strong>${query}</strong>"<br>
          <span style="font-size:12px;color:var(--text3);">Try a different spelling or full name</span>
        </div>
      </div>`;
    return;
  }

  res.innerHTML = players.slice(0, 10).map((entry, idx) => {
    const p    = entry.player;
    const stat = (entry.statistics || [])[0] || {};
    const club = stat.team?.name || 'Unknown Club';
    const logo = stat.team?.logo || '';
    const pos  = stat.games?.position || p.position || '—';
    const goals   = stat.goals?.total    || 0;
    const assists = stat.goals?.assists  || 0;
    const apps    = stat.games?.appearences || 0;
    const rating  = stat.games?.rating ? parseFloat(stat.games.rating).toFixed(1) : '—';
    const allZero = goals === 0 && assists === 0 && apps === 0;
    const fullName = `${p.firstname} ${p.lastname}`.trim();

    return `
      <div class="player-card" onclick="openPlayerProfile(${p.id}, '${(p._fbName||'').replace(/'/g,"\'")}')">
        <div class="player-card-top">
          <div class="player-avatar" style="overflow:hidden;padding:0;">
            ${p.photo ? `<img src="${p.photo}" style="width:100%;height:100%;object-fit:cover;" onerror="this.parentElement.innerHTML='⚽'">` : '⚽'}
          </div>
          <div class="player-info">
            <div class="player-name">${fullName}</div>
            <div class="player-club" style="display:flex;align-items:center;gap:5px;">
              ${logo ? `<img src="${logo}" style="width:14px;height:14px;object-fit:contain;" onerror="this.style.display='none'">` : '🏟'}
              <span id="pclub-${idx}">${club}</span>
            </div>
            <div class="player-nation">
              ${p.nationality || '—'} · ${pos}
              ${p.age ? ` · Age ${p.age}` : ''}
            </div>
          </div>
        </div>
        <div class="player-stats-grid" id="pstats-${idx}">
          ${allZero ? `<div style="grid-column:1/-1;text-align:center;color:var(--text3);font-size:11px;padding:8px;">Loading stats…</div>` : `
          <div class="pstat-box"><div class="pstat-box-num">${goals}</div><div class="pstat-box-lbl">Goals</div></div>
          <div class="pstat-box"><div class="pstat-box-num">${assists}</div><div class="pstat-box-lbl">Assists</div></div>
          <div class="pstat-box"><div class="pstat-box-num">${apps}</div><div class="pstat-box-lbl">Apps</div></div>
          <div class="pstat-box"><div class="pstat-box-num">${rating}</div><div class="pstat-box-lbl">Rating</div></div>`}
        </div>
      </div>`;
  }).join('');

  // For any player with all zeros, fetch AI stats
  players.slice(0, 10).forEach(async (entry, idx) => {
    const p    = entry.player;
    const stat = (entry.statistics || [])[0] || {};
    const goals   = stat.goals?.total    || 0;
    const assists = stat.goals?.assists  || 0;
    const apps    = stat.games?.appearences || 0;
    if (goals === 0 && assists === 0 && apps === 0) {
      const fullName = `${p.firstname} ${p.lastname}`.trim();
      const aiStats = await _fetchPlayerStatsFromAI(fullName, p.nationality || '', p.position || '');
      const statsEl = document.getElementById(`pstats-${idx}`);
      const clubEl  = document.getElementById(`pclub-${idx}`);
      const g = aiStats.goals ?? 0;
      const a = aiStats.assists ?? 0;
      const ap = aiStats.apps ?? 0;
      const rt = aiStats.rating != null ? (typeof aiStats.rating === 'number' ? aiStats.rating.toFixed(1) : aiStats.rating) : '—';
      if (statsEl) statsEl.innerHTML = `
        <div class="pstat-box"><div class="pstat-box-num">${g}</div><div class="pstat-box-lbl">Goals</div></div>
        <div class="pstat-box"><div class="pstat-box-num">${a}</div><div class="pstat-box-lbl">Assists</div></div>
        <div class="pstat-box"><div class="pstat-box-num">${ap}</div><div class="pstat-box-lbl">Apps</div></div>
        <div class="pstat-box"><div class="pstat-box-num">${rt}</div><div class="pstat-box-lbl">Rating</div></div>`;
      if (clubEl && aiStats.club && aiStats.club !== 'Unknown') clubEl.textContent = aiStats.club;
    }
  });
}

/* ── Open full player profile overlay ── */
async function openPlayerProfile(playerId, fbName) {
  // Inject overlay into page if not already there
  let overlay = document.getElementById('player-profile-overlay');
  if (!overlay) {
    overlay = document.createElement('div');
    overlay.id = 'player-profile-overlay';
    overlay.style.cssText = `
      position:fixed;inset:0;z-index:2000;background:var(--bg);
      display:flex;flex-direction:column;font-family:'DM Sans',sans-serif;
      animation:fadeIn .25s ease;`;
    document.body.appendChild(overlay);
  }

  // Show loading state
  overlay.innerHTML = `
    <div style="display:flex;align-items:center;gap:12px;padding:16px;border-bottom:1px solid var(--border);flex-shrink:0;">
      <button onclick="closePlayerProfile()" style="background:var(--bg3);border:1px solid var(--border);color:var(--text);width:36px;height:36px;border-radius:50%;display:flex;align-items:center;justify-content:center;cursor:pointer;font-size:18px;">‹</button>
      <span style="font-family:'Bebas Neue',sans-serif;font-size:22px;letter-spacing:.04em;">PLAYER PROFILE</span>
    </div>
    <div style="flex:1;display:flex;align-items:center;justify-content:center;">
      <div style="text-align:center;">
        <div style="width:52px;height:52px;border-radius:50%;border:3px solid rgba(16,185,129,0.15);border-top-color:#10b981;animation:spin .9s linear infinite;margin:0 auto 12px;"></div>
        <div style="color:var(--text2);font-size:13px;">Loading player profile…</div>
      </div>
    </div>`;

  overlay.style.display = 'flex';

  // Fetch full stats — use id if available, otherwise search by name
  if (!_playerDetailCache[playerId]) {
    try {
      let url;
      if (playerId && playerId !== 0) {
        url = `/api/football?endpoint=players&id=${playerId}&season=2024`;
      } else if (fbName) {
        url = `/api/football?endpoint=players&search=${encodeURIComponent(fbName)}&season=2024`;
      }
      if (url) {
        const res = await fetch(url, { signal: AbortSignal.timeout(8000) });
        const data = await res.json();
        _playerDetailCache[playerId] = data.response?.[0] || null;
      }
    } catch(e) {
      _playerDetailCache[playerId] = null;
    }
  }

  const entry = _playerDetailCache[playerId];
  if (!entry) {
    overlay.innerHTML += `<div style="padding:24px;color:var(--text3);">Could not load player data.</div>`;
    return;
  }

  const p    = entry.player;
  const stats = entry.statistics || [];
  const main  = stats[0] || {};

  // Build career history from statistics array (one entry per club/season)
  const careerRows = stats.map(s => `
    <div style="display:flex;align-items:center;gap:10px;padding:10px 0;border-bottom:1px solid var(--border);">
      <img src="${s.team?.logo||''}" style="width:28px;height:28px;object-fit:contain;" onerror="this.style.display='none'">
      <div style="flex:1;">
        <div style="font-size:13px;font-weight:600;color:var(--text);">${s.team?.name||'—'}</div>
        <div style="font-size:11px;color:var(--text3);">${s.league?.name||''} · ${s.league?.season||''}</div>
      </div>
      <div style="text-align:right;">
        <div style="font-size:12px;font-weight:700;color:var(--text);">${s.games?.appearences||0} apps</div>
        <div style="font-size:11px;color:var(--text3);">${s.goals?.total||0}⚽ ${s.goals?.assists||0}🎯</div>
      </div>
    </div>`).join('');

  overlay.innerHTML = `
    <!-- Header -->
    <div style="display:flex;align-items:center;gap:12px;padding:16px;border-bottom:1px solid var(--border);flex-shrink:0;background:var(--bg2);">
      <button onclick="closePlayerProfile()" style="background:var(--bg3);border:1px solid var(--border);color:var(--text);width:36px;height:36px;border-radius:50%;display:flex;align-items:center;justify-content:center;cursor:pointer;font-size:18px;flex-shrink:0;">‹</button>
      <span style="font-family:'Bebas Neue',sans-serif;font-size:22px;letter-spacing:.04em;flex:1;">PLAYER PROFILE</span>
    </div>

    <div style="flex:1;overflow-y:auto;-webkit-overflow-scrolling:touch;">

      <!-- Hero card -->
      <div style="background:linear-gradient(135deg,#0a0f1e,#0d1f16);padding:24px 20px;display:flex;gap:18px;align-items:center;">
        <div style="width:80px;height:80px;border-radius:50%;overflow:hidden;border:3px solid #10b981;flex-shrink:0;background:#1e293b;display:flex;align-items:center;justify-content:center;">
          ${p.photo
            ? `<img src="${p.photo}" style="width:100%;height:100%;object-fit:cover;" onerror="this.innerHTML='⚽'">`
            : `<span style="font-size:32px;">⚽</span>`}
        </div>
        <div>
          <div style="font-family:'Bebas Neue',sans-serif;font-size:26px;color:#fff;letter-spacing:.04em;line-height:1.1;">${p.firstname}<br>${p.lastname}</div>
          <div style="font-size:12px;color:#10b981;margin-top:4px;font-weight:600;">${main.team?.name||'Free Agent'} · ${main.games?.position||p.position||'—'}</div>
          <div style="font-size:11px;color:rgba(255,255,255,.5);margin-top:2px;">${p.nationality||''} · Age ${p.age||'—'}</div>
        </div>
      </div>

      <!-- Bio stats row -->
      <div style="display:grid;grid-template-columns:repeat(4,1fr);gap:1px;background:var(--border);border-bottom:1px solid var(--border);">
        ${[
          ['Height', p.height||'—'],
          ['Weight', p.weight||'—'],
          ['Foot',   p.birth?.country||p.nationality?.slice(0,3)||'—'],
          ['Jersey', main.games?.number||'—'],
        ].map(([lbl,val]) => `
          <div style="background:var(--bg2);padding:12px 8px;text-align:center;">
            <div style="font-size:14px;font-weight:700;color:var(--text);">${val}</div>
            <div style="font-size:10px;color:var(--text3);font-weight:600;margin-top:2px;">${lbl}</div>
          </div>`).join('')}
      </div>

      <!-- This season stats -->
      <div style="padding:16px;">
        <div style="font-size:12px;font-weight:700;color:var(--text3);letter-spacing:.06em;text-transform:uppercase;margin-bottom:10px;">This Season</div>
        <div style="display:grid;grid-template-columns:repeat(4,1fr);gap:8px;">
          ${[
            ['Apps',    main.games?.appearences||0],
            ['Goals',   main.goals?.total||0],
            ['Assists', main.goals?.assists||0],
            ['Rating',  main.games?.rating ? parseFloat(main.games.rating).toFixed(1) : '—'],
          ].map(([lbl,val]) => `
            <div style="background:var(--bg2);border:1px solid var(--border);border-radius:10px;padding:12px 8px;text-align:center;">
              <div style="font-family:'Bebas Neue',sans-serif;font-size:24px;color:var(--blue);">${val}</div>
              <div style="font-size:10px;color:var(--text3);font-weight:600;margin-top:2px;">${lbl}</div>
            </div>`).join('')}
        </div>
      </div>

      <!-- AI Career Biography -->
      <div style="margin:0 16px 16px;background:linear-gradient(135deg,rgba(16,185,129,0.08),rgba(5,150,105,0.05));border:1px solid rgba(16,185,129,0.25);border-radius:12px;overflow:hidden;">
        <div style="display:flex;align-items:center;gap:8px;padding:12px 14px;border-bottom:1px solid rgba(16,185,129,0.15);">
          <div style="width:28px;height:28px;background:linear-gradient(135deg,#10b981,#059669);border-radius:8px;display:flex;align-items:center;justify-content:center;font-size:12px;font-weight:800;color:#fff;flex-shrink:0;">AI</div>
          <span style="font-size:12px;font-weight:700;color:#10b981;letter-spacing:.04em;">AI CAREER SUMMARY</span>
        </div>
        <div id="player-ai-bio-${playerId}" style="padding:14px;font-size:13px;color:var(--text2);line-height:1.6;">
          <div style="display:flex;align-items:center;gap:8px;color:var(--text3);">
            <div style="display:flex;gap:4px;">
              <span style="width:6px;height:6px;background:#10b981;border-radius:50%;animation:aiDot 1.2s ease-in-out infinite;display:inline-block;"></span>
              <span style="width:6px;height:6px;background:#10b981;border-radius:50%;animation:aiDot 1.2s ease-in-out .2s infinite;display:inline-block;"></span>
              <span style="width:6px;height:6px;background:#10b981;border-radius:50%;animation:aiDot 1.2s ease-in-out .4s infinite;display:inline-block;"></span>
            </div>
            Generating career summary…
          </div>
        </div>
      </div>

      <!-- Career history -->
      <div style="padding:0 16px 32px;">
        <div style="font-size:12px;font-weight:700;color:var(--text3);letter-spacing:.06em;text-transform:uppercase;margin-bottom:10px;">Career History</div>
        ${careerRows || '<div style="font-size:13px;color:var(--text3);">No career data available</div>'}
      </div>

    </div>`;

  // Fetch AI biography in the background
  _fetchPlayerAiBio(playerId, p);
}

/* ── Fetch AI career biography ── */
async function _fetchPlayerAiBio(playerId, p) {
  const bioEl = document.getElementById('player-ai-bio-' + playerId);
  if (!bioEl) return;

  const name = `${p.firstname} ${p.lastname}`;
  try {
    const res = await fetch('/api/ai', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        max_tokens: 300,
        messages: [{
          role: 'user',
          content: `Write a 3-sentence football career summary for ${name} (${p.nationality}, age ${p.age}, position: ${p.position}). 
Cover: where they started, peak achievements/trophies, current status. 
Be factual and specific. Use **bold** for club names and trophies. No bullet points.`
        }]
      })
    });
    const data = await res.json();
    const text = data.content?.[0]?.text || 'Career information not available.';
    if (bioEl) {
      // XSS-SAFE: formatAiText escapes HTML then applies safe markdown conversion
      bioEl.innerHTML = formatAiText(text);
    }
  } catch(e) {
    if (bioEl) bioEl.textContent = 'Career summary unavailable — check connection.';
  }
}

function closePlayerProfile() {
  const overlay = document.getElementById('player-profile-overlay');
  if (overlay) overlay.style.display = 'none';
}

window.openPlayerProfile  = openPlayerProfile;
window.closePlayerProfile = closePlayerProfile;



/* ═══════════════════════════════════════════
   433-STYLE FLASHY HOME FEED
   Sharp cards, live badges, trending pulse
═══════════════════════════════════════════ */

// Inject 433-style CSS dynamically
(function inject433Styles() {
  const s = document.createElement('style');
  s.textContent = `
  /* ── 433 Sharp Card System ── */
  .ps-card {
    background:#fff;
    border-radius:16px;
    overflow:hidden;
    box-shadow:0 2px 12px rgba(0,0,0,0.08);
    margin-bottom:14px;
    cursor:pointer;
    transition:transform .15s,box-shadow .15s;
    border:none;
    position:relative;
  }
  .ps-card:active { transform:scale(0.97); box-shadow:0 1px 6px rgba(0,0,0,0.06); }

  /* Colour-coded left accent stripe */
  .ps-card::before {
    content:'';
    position:absolute;
    left:0; top:0; bottom:0;
    width:4px;
    background:linear-gradient(180deg,#10b981,#059669);
  }
  .ps-card.trending::before { background:linear-gradient(180deg,#f43f5e,#ef4444); }
  .ps-card.ucl::before      { background:linear-gradient(180deg,#3b82f6,#1d4ed8); }
  .ps-card.npfl::before     { background:linear-gradient(180deg,#16a34a,#14532d); }

  .ps-card-img {
    width:100%;
    height:180px;
    object-fit:cover;
    display:flex;
    align-items:center;
    justify-content:center;
    font-size:72px;
    background:linear-gradient(135deg,#0f172a,#1e293b);
  }

  .ps-card-body { padding:12px 14px 14px; }
  .ps-card-meta {
    display:flex; align-items:center; gap:8px; margin-bottom:7px;
  }
  .ps-card-cat {
    font-size:10px; font-weight:800; letter-spacing:.06em;
    text-transform:uppercase; color:#10b981;
    background:rgba(16,185,129,0.1);
    padding:2px 8px; border-radius:20px;
  }
  .ps-card-cat.trending { color:#f43f5e; background:rgba(244,63,94,0.1); }
  .ps-card-cat.ucl      { color:#3b82f6; background:rgba(59,130,246,0.1); }
  .ps-card-time { font-size:11px; color:#94a3b8; margin-left:auto; }

  .ps-card-title {
    font-size:15px; font-weight:700; color:#0f172a; line-height:1.4;
    margin-bottom:10px; letter-spacing:-.01em;
  }

  .ps-card-footer {
    display:flex; align-items:center; gap:12px;
  }
  .ps-card-stat {
    display:flex; align-items:center; gap:4px;
    font-size:12px; font-weight:600; color:#64748b;
  }

  /* ── LIVE badge ── */
  .live-badge {
    display:inline-flex; align-items:center; gap:4px;
    background:#f43f5e; color:#fff;
    font-size:10px; font-weight:800; letter-spacing:.06em;
    padding:2px 8px; border-radius:20px;
    animation:livePulse 1.5s ease-in-out infinite;
  }
  @keyframes livePulse {
    0%,100%{ box-shadow:0 0 0 0 rgba(244,63,94,0.5); }
    50%    { box-shadow:0 0 0 6px rgba(244,63,94,0); }
  }
  .live-dot-sm {
    width:5px; height:5px; border-radius:50%;
    background:#fff; animation:blink 1s infinite;
  }

  /* ── TRENDING badge ── */
  .trending-badge {
    display:inline-flex; align-items:center; gap:4px;
    background:linear-gradient(90deg,#ff6b35,#f43f5e);
    color:#fff; font-size:10px; font-weight:800;
    padding:2px 8px; border-radius:20px;
  }

  /* ── Fan Streak Banner ── */
  .streak-banner {
    background:linear-gradient(135deg,#1a0a2e,#0d0d1a);
    border:1px solid rgba(251,191,36,0.3);
    border-radius:14px; padding:12px 16px;
    margin:0 14px 14px;
    display:flex; align-items:center; gap:12px;
    cursor:pointer; flex-shrink:0;
  }
  .streak-fire { font-size:28px; animation:fireShake .5s ease infinite alternate; }
  @keyframes fireShake {
    from { transform:rotate(-5deg) scale(1); }
    to   { transform:rotate(5deg) scale(1.08); }
  }
  .streak-info { flex:1; }
  .streak-count { font-family:'Bebas Neue',sans-serif; font-size:24px; color:#fbbf24; letter-spacing:.04em; line-height:1; }
  .streak-label { font-size:11px; color:rgba(255,255,255,0.6); margin-top:1px; }
  .streak-bar-wrap { width:60px; }
  .streak-bar-bg { height:4px; background:rgba(255,255,255,0.1); border-radius:4px; overflow:hidden; }
  .streak-bar-fill { height:100%; background:linear-gradient(90deg,#fbbf24,#f59e0b); border-radius:4px; transition:width .5s; }

  /* ── Interest pill tabs ── */
  .for-you-tabs {
    display:flex; gap:0; padding:0 14px;
    border-bottom:2px solid var(--border); margin-bottom:12px;
    overflow-x:auto; scrollbar-width:none; flex-shrink:0;
  }
  .for-you-tabs::-webkit-scrollbar { display:none; }
  .fyt { flex-shrink:0; padding:10px 16px; font-size:13px; font-weight:700;
    color:var(--text3); cursor:pointer; border-bottom:2px solid transparent;
    margin-bottom:-2px; transition:color .2s,border-color .2s; white-space:nowrap; }
  .fyt.on { color:#10b981; border-bottom-color:#10b981; }

  /* ── War Room Chat ── */
  #war-room-overlay {
    position:fixed; inset:0; z-index:1400;
    background:#0a0f1e; display:none; flex-direction:column;
    font-family:'DM Sans',sans-serif;
  }
  #war-room-overlay.active { display:flex; }
  .wr-hdr {
    background:linear-gradient(135deg,#0d1f16,#0a0f1e);
    padding:16px; display:flex; align-items:center; gap:12px;
    border-bottom:1px solid rgba(16,185,129,0.2); flex-shrink:0;
  }
  .wr-title { font-family:'Bebas Neue',sans-serif; font-size:22px; color:#fff; letter-spacing:.04em; flex:1; }
  .wr-close { background:rgba(255,255,255,0.08); border:none; color:#fff;
    width:36px; height:36px; border-radius:50%;
    display:flex; align-items:center; justify-content:center; cursor:pointer; }
  .wr-live-tag { background:#f43f5e; color:#fff; font-size:10px; font-weight:800;
    padding:2px 8px; border-radius:20px; letter-spacing:.05em; }
  .wr-body { flex:1; overflow-y:auto; padding:12px 14px;
    display:flex; flex-direction:column; gap:10px; -webkit-overflow-scrolling:touch; }
  .wr-msg { display:flex; gap:10px; align-items:flex-start; }
  .wr-msg.mine { flex-direction:row-reverse; }
  .wr-avatar {
    width:32px; height:32px; border-radius:50%; flex-shrink:0;
    background:linear-gradient(135deg,#10b981,#059669);
    display:flex; align-items:center; justify-content:center;
    font-size:12px; font-weight:700; color:#fff;
  }
  .wr-bubble {
    max-width:72%; padding:8px 12px; border-radius:12px;
    font-size:13px; line-height:1.45; color:#fff;
    background:rgba(255,255,255,0.1);
  }
  .wr-msg.mine .wr-bubble { background:rgba(16,185,129,0.25); border-radius:12px 12px 0 12px; }
  .wr-bubble-name { font-size:10px; font-weight:700; color:#10b981; margin-bottom:3px; }
  .wr-badge {
    display:inline-block; font-size:9px; padding:1px 5px;
    border-radius:6px; margin-left:4px; font-weight:700;
  }
  .badge-top    { background:rgba(251,191,36,0.2); color:#fbbf24; }
  .badge-ticket { background:rgba(59,130,246,0.2); color:#60a5fa; }
  .badge-new    { background:rgba(148,163,184,0.15); color:#94a3b8; }
  .wr-time { font-size:10px; color:rgba(255,255,255,0.3); margin-top:2px; }
  .wr-input-bar {
    display:flex; gap:10px; align-items:center; padding:10px 14px 20px;
    border-top:1px solid rgba(255,255,255,0.08); flex-shrink:0;
    background:#0a0f1e;
  }
  .wr-input {
    flex:1; background:rgba(255,255,255,0.08); border:1px solid rgba(255,255,255,0.12);
    border-radius:22px; padding:10px 16px; font-size:14px; color:#fff;
    font-family:'DM Sans',sans-serif; outline:none;
  }
  .wr-input::placeholder { color:rgba(255,255,255,0.3); }
  .wr-send-btn {
    width:40px; height:40px; border-radius:50%; flex-shrink:0;
    background:linear-gradient(135deg,#10b981,#059669); border:none; cursor:pointer;
    display:flex; align-items:center; justify-content:center;
  }
  .wr-online-bar {
    padding:6px 14px; background:rgba(16,185,129,0.08);
    border-bottom:1px solid rgba(16,185,129,0.15);
    font-size:11px; color:#10b981; display:flex; align-items:center; gap:6px; flex-shrink:0;
  }

  /* ── Infinite scroll sentinel ── */
  .scroll-sentinel { height:1px; pointer-events:none; }
  .load-more-spinner {
    display:flex; align-items:center; justify-content:center; gap:10px;
    padding:16px; color:var(--text3); font-size:13px;
  }

  /* ── 433 Home header ── */
  .ps-home-hdr {
    background:linear-gradient(135deg,#0a0f1e 0%,#0d1f16 100%);
    padding:16px 16px 0; flex-shrink:0;
  }
  .ps-home-logo {
    font-family:'Bebas Neue',sans-serif; font-size:30px; letter-spacing:.06em;
    color:#fff; display:flex; align-items:center; gap:10px;
  }
  .ps-home-logo span { color:#10b981; }
  .ps-home-sub { font-size:11px; color:rgba(255,255,255,0.5); margin-top:1px; padding-bottom:14px; }
  `;
  document.head.appendChild(s);
})();

// Firestore helpers now available via window._psFs (set by the module script above)
// RTDB is not used in this block — removed broken imports

/* ═══════════════════════════════════════════
   FAN STREAK SYSTEM
═══════════════════════════════════════════ */
let fanStreak = 0;
let lastCheckIn = '';

// Fix keyboard covering AI input on mobile
if (window.visualViewport) {
  window.visualViewport.addEventListener('resize', () => {
    const aiPage = document.getElementById('page-ai');
    if (!aiPage || aiPage.style.display === 'none') return;
    const keyboardHeight = window.innerHeight - window.visualViewport.height;
    const inputBar = aiPage.querySelector('.ai-input-bar');
    if (inputBar) {
      inputBar.style.paddingBottom = keyboardHeight > 50
        ? (keyboardHeight + 8) + 'px'
        : '14px';
      // Scroll to bottom of chat
      const messages = document.getElementById('ai-messages');
      if (messages) messages.scrollTop = messages.scrollHeight;
    }
  });
}

// Poll for currentUser set by the module script's onAuthStateChanged
(function initStreak() {
  const iv = setInterval(() => {
    if (window._psCurrentUser !== undefined) {
      clearInterval(iv);
      if (window._psCurrentUser) fetchUserStreak(window._psCurrentUser.uid);
      else renderStreakBanner();
    }
  }, 200);
  setTimeout(() => clearInterval(iv), 8000);
})();

async function fetchUserStreak(uid) {
  try {
    const { doc, getDoc, setDoc, db } = window._psFs || {};
    if (!doc || !db) { checkFanStreak(); return; }
    const userDocRef = doc(db, 'users', uid);
    const snap = await getDoc(userDocRef);
    if (snap.exists()) {
      const data = snap.data();
      fanStreak   = data.streakCount || 0;
      lastCheckIn = data.lastLogin ? new Date(data.lastLogin.toDate()).toDateString() : '';
    } else {
      const u = window._psCurrentUser;
      await setDoc(userDocRef, { username: (u && u.displayName) || 'Anonymous', favoriteTeam: '', streakCount: 0, lastLogin: null });
    }
  } catch(e) { console.warn('[Streak] fetchUserStreak:', e); }
  checkFanStreak();
}


async function checkFanStreak() {
  const today = new Date().toDateString();
  const isMatchDay = true;
  if (lastCheckIn === today) { renderStreakBanner(); return; }
  const yesterday = new Date(Date.now() - 86400000).toDateString();
  if (isMatchDay) {
    fanStreak = (lastCheckIn === yesterday) ? fanStreak + 1 : 1;
  }
  lastCheckIn = today;
  const _u = window._psCurrentUser;
  if (_u) {
    try {
      const { doc, updateDoc, serverTimestamp, db } = window._psFs || {};
      if (doc && db) await updateDoc(doc(db, 'users', _u.uid), { streakCount: fanStreak, lastLogin: serverTimestamp() });
    } catch(e) { console.warn('[Streak] updateDoc:', e); }
  }
  renderStreakBanner();
  if (fanStreak >= 3) setTimeout(() => showToast('🔥 ' + fanStreak + '-day streak! Keep it up!'), 1000);
}

function renderStreakBanner() {
  const grid = document.getElementById('home-grid');
  if (!grid) return;
  const existing = document.getElementById('streak-banner');
  if (existing) existing.remove();
  const pct = Math.min(100, (fanStreak / 7) * 100);
  const banner = document.createElement('div');
  banner.id = 'streak-banner';
  banner.className = 'streak-banner';
  banner.onclick = () => showToast(`🔥 ${fanStreak}-day streak! Log in daily to keep it!`);
  banner.innerHTML = `
    <div class="streak-fire">🔥</div>
    <div class="streak-info">
      <div class="streak-count">${fanStreak} DAY STREAK</div>
      <div class="streak-label">Log in daily during match days to keep it</div>
    </div>
    <div class="streak-bar-wrap">
      <div style="font-size:9px;color:rgba(255,255,255,0.4);margin-bottom:3px;text-align:right;">${fanStreak}/7</div>
      <div class="streak-bar-bg"><div class="streak-bar-fill" style="width:${pct}%"></div></div>
    </div>`;
  // Insert before home-grid's parent content
  const content = grid.closest('.content') || grid.parentElement;
  if (content) content.insertBefore(banner, content.firstChild);
}

/* ═══════════════════════════════════════════
   433-STYLE HOME FEED WITH INTEREST ALGORITHM
═══════════════════════════════════════════ */
let currentFeedTab = 'foryou';
let feedPage = 0;
const FEED_PAGE_SIZE = 6;
let isFeedLoading = false;
let feedObserver = null;

/* switchHomeFeedTab — called by the new header tab buttons */
function switchHomeFeedTab(el, tab) {
  currentFeedTab = tab;
  // Style the clicked tab active
  const tabBar = document.getElementById('home-feed-tabs');
  if (tabBar) {
    tabBar.querySelectorAll('div').forEach(t => {
      t.style.color = 'rgba(255,255,255,0.45)';
      t.style.borderBottomColor = 'transparent';
    });
    el.style.color = '#10b981';
    el.style.borderBottomColor = '#10b981';
  }
  feedPage = 0;
  renderFeedPage(true);
}

/* Also wire legacy switchFeedTab (called from .fyt elements) */
function switchFeedTab(tab, el) {
  currentFeedTab = tab;
  document.querySelectorAll('.fyt').forEach(t => t.classList.remove('on'));
  if (el) el.classList.add('on');
  feedPage = 0;
  renderFeedPage(true);
}

/* render433HomeFeed — called after VIDEOS is populated */
function render433HomeFeed() {
  feedPage = 0;
  renderFeedPage(true);
  setupInfiniteScroll();
}

/* Interest-based feed filter using live VIDEOS array */
function getFilteredFeed(tab) {
  let pool = [...VIDEOS];
  const favTeam = (profileData && profileData.favTeam) ? profileData.favTeam.toLowerCase() : '';

  if (tab === 'foryou') {
    // Score: trending + recency + fav team match
    return pool.map(v => {
      let score = 0;
      if ((v.likes || 0) > 10000) score += 40;
      if (favTeam && (v.title || '').toLowerCase().includes(favTeam)) score += 35;
      if ((v.cat || '') === 'NPFL' || (v.competition || '').toLowerCase().includes('nigeria')) score += 20;
      score += (v.likes || 0) / 2000;
      return { ...v, _score: score };
    }).sort((a, b) => b._score - a._score);

  } else if (tab === 'trending') {
    return pool.sort((a, b) => (b.likes || 0) - (a.likes || 0));

  } else if (tab === 'myteam') {
    if (!favTeam) return pool.slice(0, 8);
    const matched = pool.filter(v => (v.title || '').toLowerCase().includes(favTeam) || (v.competition || '').toLowerCase().includes(favTeam));
    return matched.length ? matched : pool.slice(0, 8);

  } else if (tab === 'npfl') {
    return pool.filter(v =>
      (v.cat || '').toLowerCase().includes('npfl') ||
      (v.competition || '').toLowerCase().includes('nigeria') ||
      (v.title || '').toLowerCase().includes('npfl')
    );

  } else {
    return pool;
  }
}

function renderFeedPage(reset) {
  const grid = document.getElementById('home-grid');
  if (!grid) return;

  const feed = getFilteredFeed(currentFeedTab);
  const start = feedPage * FEED_PAGE_SIZE;
  const slice = feed.slice(start, start + FEED_PAGE_SIZE);

  if (reset) {
    // Clear all existing cards but keep streak banner
    const content = grid.closest('.content') || grid.parentElement;
    const banner = document.getElementById('streak-banner');
    content.querySelectorAll('.ps-card, .vcard, .load-more-spinner, .scroll-sentinel, [id="home-grid"] > *').forEach(el => el.remove());
    grid.innerHTML = '';
    if (!banner && typeof renderStreakBanner === 'function') renderStreakBanner();
  }

  if (!slice.length && reset) {
    grid.innerHTML = `<div style="text-align:center;padding:40px;color:var(--text3);font-size:14px;">
      <div style="font-size:48px;margin-bottom:12px;">⚽</div>
      <div style="font-weight:600;">No videos yet</div>
      <div style="font-size:12px;margin-top:6px;">Loading live football highlights…</div>
    </div>`;
    return;
  }

  slice.forEach(v => {
    const hasThumbnail = v.thumbnail && v.thumbnail.length > 10;
    const isTrending = (v.likes || 0) > 10000;
    const isNPFL     = (v.cat === 'NPFL') || (v.competition || '').toLowerCase().includes('nigeria');
    const isUCL      = (v.cat === 'UCL')  || (v.competition || '').toLowerCase().includes('champions');
    const catClass   = isTrending ? 'trending' : isUCL ? 'ucl' : isNPFL ? 'npfl' : '';
    const badgeText  = v.competition || v.cat || 'Football';
    const catColors  = { 'UCL':'#3b82f6','PL':'#6366f1','NPFL':'#16a34a','Trending':'#f43f5e','Nigeria':'#16a34a' };
    const accentColor = catColors[v.cat] || '#10b981';

    const card = document.createElement('div');
    card.className = `ps-card ${catClass}`;
    card.style.cssText = 'margin-bottom:14px;cursor:pointer;background:#fff;border-radius:16px;overflow:hidden;box-shadow:0 2px 12px rgba(0,0,0,0.08);position:relative;';
    card.onclick = () => openHlPlayerById(String(v.id));

    card.innerHTML = `
      <!-- Thumbnail / preview area -->
      <div style="position:relative;aspect-ratio:16/9;background:linear-gradient(135deg,#0f172a,#1e293b);overflow:hidden;">
        ${hasThumbnail ? `
          <img src="${v.thumbnail}" alt="${v.title}"
            style="width:100%;height:100%;object-fit:cover;display:block;"
            loading="lazy"
            onerror="this.style.display='none'">` : `
          <div style="width:100%;height:100%;display:flex;align-items:center;justify-content:center;flex-direction:column;gap:8px;">
            <div style="font-size:40px;">${getCatEmoji(v.cat)}</div>
          </div>`}
        <!-- Play button overlay -->
        <div style="position:absolute;inset:0;display:flex;align-items:center;justify-content:center;">
          <div style="width:52px;height:52px;background:rgba(16,185,129,0.85);border-radius:50%;display:flex;align-items:center;justify-content:center;backdrop-filter:blur(4px);box-shadow:0 4px 16px rgba(16,185,129,0.4);">
            <svg width="22" height="22" fill="white" viewBox="0 0 24 24"><path d="M8 5v14l11-7z"/></svg>
          </div>
        </div>
        <!-- Competition badge -->
        <div style="position:absolute;top:8px;left:8px;background:rgba(0,0,0,0.7);backdrop-filter:blur(6px);border-radius:8px;padding:3px 9px;font-size:9px;font-weight:700;color:#fff;letter-spacing:.05em;">${badgeText.toUpperCase().slice(0,20)}</div>
        <!-- HD badge -->
        <div style="position:absolute;bottom:8px;right:8px;background:rgba(0,0,0,0.65);backdrop-filter:blur(4px);border-radius:6px;padding:2px 7px;font-size:10px;font-weight:700;color:#fff;">▶ HD</div>
        ${isTrending ? '<div style="position:absolute;top:8px;right:8px;background:linear-gradient(90deg,#ff6b35,#f43f5e);color:#fff;font-size:9px;font-weight:800;padding:2px 8px;border-radius:20px;letter-spacing:.04em;">🔥 HOT</div>' : ''}
      </div>
      <!-- Card body -->
      <div style="padding:11px 13px 13px;border-left:3px solid ${accentColor};">
        <div style="display:flex;align-items:flex-start;gap:9px;">
          <div style="width:30px;height:30px;border-radius:50%;background:linear-gradient(135deg,${accentColor},${accentColor}99);display:flex;align-items:center;justify-content:center;font-size:13px;flex-shrink:0;">${getCatEmoji(v.cat)}</div>
          <div style="flex:1;min-width:0;">
            <div style="font-weight:700;font-size:13px;color:#0f172a;line-height:1.35;margin-bottom:3px;">${v.title}</div>
            <div style="font-size:11px;color:#94a3b8;">${v.poster || '@pitchside'} · ${v.date}</div>
          </div>
        </div>
        <div style="display:flex;align-items:center;gap:10px;margin-top:9px;padding-top:9px;border-top:1px solid #f1f5f9;">
          <span style="font-size:12px;color:#64748b;display:flex;align-items:center;gap:4px;">
            <svg width="13" height="13" fill="#f43f5e" viewBox="0 0 24 24"><path d="M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z"/></svg>
            ${formatCount(v.likes || 0)}
          </span>
          <span style="font-size:12px;color:#64748b;display:flex;align-items:center;gap:4px;">
            <svg width="13" height="13" fill="#64748b" viewBox="0 0 24 24"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2v10z"/></svg>
            ${formatCount(v.comments || 0)}
          </span>
          <span style="margin-left:auto;font-size:11px;color:${accentColor};font-weight:700;background:rgba(16,185,129,0.08);padding:2px 8px;border-radius:10px;">${v.cat || 'Football'}</span>
        </div>
      </div>`;

    grid.appendChild(card);
  });

  feedPage++;

  // Infinite scroll sentinel
  const totalFeed = getFilteredFeed(currentFeedTab);
  if (totalFeed.length > feedPage * FEED_PAGE_SIZE) {
    const sentinel = document.createElement('div');
    sentinel.className = 'scroll-sentinel';
    sentinel.id = 'feed-sentinel';
    grid.appendChild(sentinel);
    if (feedObserver) feedObserver.observe(sentinel);
  }
}

function setupInfiniteScroll() {
  if (feedObserver) feedObserver.disconnect();
  feedObserver = new IntersectionObserver((entries) => {
    entries.forEach(entry => {
      if (entry.isIntersecting && !isFeedLoading) {
        isFeedLoading = true;
        const grid = document.getElementById('home-grid');
        const spinner = document.createElement('div');
        spinner.className = 'load-more-spinner';
        spinner.innerHTML = '<div class="spinner"></div> Loading more…';
        if (grid) grid.appendChild(spinner);
        setTimeout(() => {
          spinner.remove();
          renderFeedPage(false);
          isFeedLoading = false;
        }, 700);
      }
    });
  }, { threshold: 0.1 });

  const sentinel = document.getElementById('feed-sentinel');
  if (sentinel) feedObserver.observe(sentinel);
}

window.openWarRoom = openWarRoom;

/* ═══════════════════════════════════════════
   FIRESTORE SCHEMA & SECURITY RULES
   (Reference document — shown when tapped)
═══════════════════════════════════════════ */
window.PITCHSIDE_FIRESTORE_SCHEMA = {
  collections: {
    users: {
      fields: {
        uid: 'string',
        displayName: 'string',
        email: 'string',
        favTeam: 'string',
        favLeague: 'string',
        streak_count: 'number',
        last_checkin: 'timestamp',
        badges: 'array<string>',
        posts_count: 'number',
        followers: 'number',
        following: 'number',
        created_at: 'timestamp',
      },
      subcollections: { notifications: {} }
    },
    posts: {
      fields: {
        uid: 'string — author user id',
        type: '"video" | "photo" | "news"',
        title: 'string',
        caption: 'string',
        media_url: 'string — Firebase Storage URL',
        thumbnail_url: 'string',
        category: 'string',
        tags: 'array<string>',
        likes: 'number',
        comments_count: 'number',
        views: 'number',
        created_at: 'timestamp',
        trending_score: 'number — recomputed hourly',
        team_tags: 'array<string>',
      },
      subcollections: {
        likes:    '{ uid: string, created_at: timestamp }',
        comments: '{ uid, text, created_at, likes }'
      }
    },
    match_chats: {
      description: 'Realtime Database path: /chats/{fixture_id}/messages',
      fields: {
        uid: 'string',
        display_name: 'string',
        badge: '"Top Contributor" | "Season Ticket Holder" | "New Fan"',
        text: 'string',
        created_at: 'number — Date.now()',
        reactions: 'object<emoji, count>'
      }
    },
    debates: {
      fields: {
        topic: 'string',
        option_a: 'string',
        option_b: 'string',
        votes_a: 'number',
        votes_b: 'number',
        expires_at: 'timestamp',
        created_at: 'timestamp'
      }
    }
  },
  security_rules: `
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {

    // Users can only edit their own profile
    match /users/{userId} {
      allow read: if request.auth != null;
      allow write: if request.auth != null && request.auth.uid == userId;
    }

    // Posts: anyone can read; only author can update/delete
    match /posts/{postId} {
      allow read: if true;
      allow create: if request.auth != null
        && request.resource.data.uid == request.auth.uid;
      allow update: if request.auth != null
        && (resource.data.uid == request.auth.uid
            || onlyUpdatingLikes(request.resource.data, resource.data));
      allow delete: if request.auth != null
        && resource.data.uid == request.auth.uid;
    }

    // Comments: anyone authenticated can read/create; only author can delete
    match /posts/{postId}/comments/{commentId} {
      allow read: if true;
      allow create: if request.auth != null;
      allow delete: if request.auth != null
        && resource.data.uid == request.auth.uid;
    }

    // Debate votes: one vote per user
    match /debates/{debateId}/votes/{userId} {
      allow read: if true;
      allow create: if request.auth != null && request.auth.uid == userId;
      allow update, delete: if false; // No changing your vote
    }

    function onlyUpdatingLikes(newData, oldData) {
      return newData.diff(oldData).affectedKeys().hasOnly(['likes','views']);
    }
  }
}`
};

/* ═══════════════════════════════════════════
   INJECT WAR ROOM HTML OVERLAY
═══════════════════════════════════════════ */
(function injectWarRoom() {
  const div = document.createElement('div');
  div.id = 'war-room-overlay';
  div.innerHTML = `
    <div class="wr-hdr">
      <button class="wr-close" onclick="closeWarRoom()">
        <svg width="18" height="18" fill="none" stroke="currentColor" stroke-width="2.5" viewBox="0 0 24 24"><path d="M18 6 6 18M6 6l12 12"/></svg>
      </button>
      <div class="wr-title" id="wr-match-title">WAR ROOM</div>
      <div class="wr-live-tag">🔴 LIVE</div>
    </div>
    <div class="wr-online-bar">
      <div style="width:6px;height:6px;border-radius:50%;background:#10b981;animation:blink 1s infinite;"></div>
      <span id="wr-online-count">0 watching</span>
      <span style="margin-left:auto;color:rgba(255,255,255,0.3);">Live Match Chat</span>
    </div>
    <div class="wr-body" id="wr-body"></div>
    <div class="wr-input-bar">
      <input type="text" class="wr-input" id="wr-input" placeholder="Say something about the match…" maxlength="200">
      <button class="wr-send-btn" onclick="sendWarRoomMsg()">
        <svg width="18" height="18" fill="white" viewBox="0 0 24 24"><path d="M2.01 21L23 12 2.01 3 2 10l15 2-15 2z"/></svg>
      </button>
    </div>`;
  document.body.appendChild(div);
})();

/* ═══════════════════════════════════════════
   HOOK WAR ROOM INTO LIVE MATCH TAPS
═══════════════════════════════════════════ */
// Override openMatchDetail to also offer War Room for live matches
const _origOpenMatchDetail = window.openMatchDetail;
window.openMatchDetail = function(matchId, title) {
  _origOpenMatchDetail && _origOpenMatchDetail(matchId, title);
  // Add War Room button to overlay after it opens
  setTimeout(() => {
    const body = document.getElementById('match-ov-body');
    if (!body) return;
    if (body.querySelector('.wr-launch-btn')) return;
    const btn = document.createElement('div');
    btn.className = 'wr-launch-btn';
    btn.style.cssText = 'margin:0 16px 16px;';
    btn.innerHTML = `<button onclick="openWarRoom('${matchId}','${title}')"
      style="width:100%;padding:14px;background:linear-gradient(135deg,#0a0f1e,#0d1f16);
      border:1px solid rgba(16,185,129,0.4);border-radius:12px;color:#10b981;
      font-size:14px;font-weight:700;font-family:'DM Sans',sans-serif;cursor:pointer;
      display:flex;align-items:center;justify-content:center;gap:10px;">
      <div style="width:8px;height:8px;background:#f43f5e;border-radius:50%;animation:blink 1s infinite;"></div>
      Join War Room — Live Chat
    </button>`;
    body.appendChild(btn);
  }, 500);
};

/* ═══════════════════════════════════════════
   WAR ROOM — Live Match Chat
═══════════════════════════════════════════ */
let warRoomMessages = [];
let warRoomMatchId  = null;
let warRoomTimer    = null;
let warRoomOnline   = 0;

const WR_SEED = [
  { user:'EaglesNation', initials:'EN', badge:'ticket', text:"LET'S GOOO! What a start 🔥🔥🔥",          time:'2m ago',  mine:false },
  { user:'LagosFC_Fan',  initials:'LF', badge:'top',    text:'The formation today is absolute 🧠',       time:'1m ago',  mine:false },
  { user:'AbujaBoy',     initials:'AB', badge:'new',    text:'That through ball from Osimhen was insane', time:'45s ago', mine:false },
  { user:'NaijaGooner',  initials:'NG', badge:'top',    text:'4-3-3 pressing HIGH. Beautiful football 😭',time:'30s ago', mine:false },
];

const WR_AUTO = [
  'GOAAAAAAL!!! 🔥🔥🔥','VAR checking it...','OFFSIDE??? 😤','What a save!!',
  'RED CARD!!! 🟥','Penalty given! ⚽','Into the net!! 🥅','That tackle 😤',
  'Substitution coming...','Corner kick 🏴','Free kick — dangerous position!',
  'Yellow card 🟨','The crowd is ELECTRIC 🏟️','Great team move!',
];

function openWarRoom(matchId, matchTitle) {
  warRoomMatchId  = matchId || 'live-match';
  warRoomMessages = [...WR_SEED];
  warRoomOnline   = Math.floor(Math.random() * 800) + 200;
  const overlay   = document.getElementById('war-room-overlay');
  if (!overlay) return;
  overlay.classList.add('active');
  const titleEl = document.getElementById('wr-match-title');
  const countEl = document.getElementById('wr-online-count');
  if (titleEl) titleEl.textContent = (matchTitle || 'LIVE MATCH').toUpperCase();
  if (countEl) countEl.textContent = `${warRoomOnline.toLocaleString()} watching`;
  renderWarRoomMessages();
  if (warRoomTimer) clearInterval(warRoomTimer);
  warRoomTimer = setInterval(() => {
    warRoomOnline += Math.floor(Math.random() * 5) - 2;
    if (countEl) countEl.textContent = `${Math.max(100, warRoomOnline).toLocaleString()} watching`;
    const names  = ['KanoKing','AbujaFan','EnuguBoy','IbadanFC','PortHarcourt99','BendelLad'];
    const badges = ['new','new','new','top','ticket'];
    const name   = names[Math.floor(Math.random() * names.length)];
    warRoomMessages.push({
      user: name, initials: name.slice(0,2).toUpperCase(),
      badge: badges[Math.floor(Math.random() * badges.length)],
      text: WR_AUTO[Math.floor(Math.random() * WR_AUTO.length)],
      time: 'Just now', mine: false
    });
    if (warRoomMessages.length > 60) warRoomMessages = warRoomMessages.slice(-60);
    renderWarRoomMessages();
  }, 3500);
}

function closeWarRoom() {
  const overlay = document.getElementById('war-room-overlay');
  if (overlay) overlay.classList.remove('active');
  if (warRoomTimer) { clearInterval(warRoomTimer); warRoomTimer = null; }
}

function renderWarRoomMessages() {
  const body = document.getElementById('wr-body');
  if (!body) return;
  const badgeHTML = b => b === 'top'    ? '<span class="wr-badge badge-top">⭐ Top</span>'
                       : b === 'ticket' ? '<span class="wr-badge badge-ticket">🎟️ Fan</span>'
                       :                  '<span class="wr-badge badge-new">New</span>';
  // XSS-SAFE: build DOM nodes for user-provided name/text/initials
  body.innerHTML = '';
  warRoomMessages.forEach(m => {
    const msgDiv = document.createElement('div');
    msgDiv.className = 'wr-msg' + (m.mine ? ' mine' : '');

    const avatarDiv = document.createElement('div');
    avatarDiv.className = 'wr-avatar';
    avatarDiv.textContent = m.initials;

    const innerDiv = document.createElement('div');

    if (!m.mine) {
      const nameDiv = document.createElement('div');
      nameDiv.className = 'wr-bubble-name';
      nameDiv.textContent = m.user;
      // Safe badge: only whitelisted static HTML
      nameDiv.insertAdjacentHTML('beforeend', badgeHTML(m.badge));
      innerDiv.appendChild(nameDiv);
    }

    const bubbleDiv = document.createElement('div');
    bubbleDiv.className = 'wr-bubble';
    bubbleDiv.textContent = m.text;

    const timeDiv = document.createElement('div');
    timeDiv.className = 'wr-time';
    timeDiv.textContent = m.time;

    innerDiv.appendChild(bubbleDiv);
    innerDiv.appendChild(timeDiv);
    msgDiv.appendChild(avatarDiv);
    msgDiv.appendChild(innerDiv);
    body.appendChild(msgDiv);
  });
  body.scrollTop = body.scrollHeight;
}

function sendWarRoomMsg() {
  const inp = document.getElementById('wr-input');
  if (!inp) return;
  const text = inp.value.trim();
  if (!text) return;
  inp.value = '';
  warRoomMessages.push({
    user: (typeof profileData !== 'undefined' && profileData) ? profileData.name || 'You' : 'You',
    initials: (typeof profileData !== 'undefined' && profileData) ? profileData.initials || 'ME' : 'ME',
    badge: 'new', text, time: 'Just now', mine: true
  });
  renderWarRoomMessages();
}

document.addEventListener('keydown', e => {
  const inp = document.getElementById('wr-input');
  if (inp && e.key === 'Enter' && document.activeElement === inp) sendWarRoomMsg();
});

window.openWarRoom  = openWarRoom;
window.closeWarRoom = closeWarRoom;

/* ── Quick Post (green + button) ─────────────────────────────────────────────
   Opens a caption sheet → user writes caption → taps Upload → Cloudinary widget
   opens → on success saves to Firestore & refreshes feed.
   publishPost() already does all the heavy lifting — we just feed it the caption.
──────────────────────────────────────────────────────────────────────────────── */
/* ═══════════════════════════════════════════
   POST CREATOR — editor & publish
═══════════════════════════════════════════ */

const PC_FILTERS = [
  {id:'normal',  label:'Normal',  emoji:'🖼️',  css:'none'},
  {id:'vivid',   label:'Vivid',   emoji:'🌈',  css:'saturate(1.8) contrast(1.1)'},
  {id:'cool',    label:'Cool',    emoji:'❄️',  css:'hue-rotate(190deg) saturate(1.3)'},
  {id:'warm',    label:'Warm',    emoji:'🌅',  css:'sepia(.35) saturate(1.4) brightness(1.05)'},
  {id:'mono',    label:'Mono',    emoji:'⬛',  css:'grayscale(1)'},
  {id:'fade',    label:'Fade',    emoji:'☁️',  css:'brightness(1.15) saturate(.7) contrast(.85)'},
  {id:'drama',   label:'Drama',   emoji:'🎭',  css:'contrast(1.4) saturate(.9) brightness(.9)'},
  {id:'golden',  label:'Golden',  emoji:'🌟',  css:'sepia(.6) saturate(1.6) brightness(1.05)'},
  {id:'neon',    label:'Neon',    emoji:'💜',  css:'hue-rotate(260deg) saturate(2) brightness(1.1)'},
  {id:'vintage', label:'Vintage', emoji:'📷',  css:'sepia(.5) contrast(1.1) brightness(.95) saturate(.8)'},
];
const PC_STICKERS = ['⚽','🥅','🏆','🔥','❤️','😍','😭','🤯','👏','💯','🎉','🙌','⭐','🏟️','🎽','👟','🧤','🥇','🪃','🎯','⚡','🫶','🤾','💪','🏃','🎤'];
const PC_HASHTAGS = ['#Football','#PitchSide','#Goals','#Highlights','#UCL','#PremierLeague','#NPFL','#MatchDay','#LaLiga','#SuperEagles','#AFCON','#GOAT'];
const PC_MUSIC    = [
  {name:'Crowd Roar Anthem',    artist:'PitchSide Sounds', emoji:'🏟️'},
  {name:'Victory March',        artist:'Stadium Classics',  emoji:'🏆'},
  {name:'Goal Celebration Mix', artist:'Football Vibes',    emoji:'⚽'},
  {name:'Champions Intro',      artist:'Epic Sports',       emoji:'⭐'},
  {name:'Ultras Chant Vol.1',   artist:'The Kop',           emoji:'🎺'},
  {name:'Dribble Beat',         artist:'Street Football',   emoji:'🎧'},
];
const PC_SPEEDS   = ['0.5x','0.75x','1x','1.5x','2x'];

let _pcFile        = null;
let _pcFilter      = 'normal';
let _pcSticker     = '';
let _pcSpeed       = '1x';
let _pcMusic       = '';
let _pcTaggedMatch = ''; // FEATURE 4: match tagging

function openQuickPost() {
  // Reset state
  _pcFile = null; _pcFilter = 'normal'; _pcSticker = ''; _pcSpeed = '1x'; _pcMusic = ''; _pcTaggedMatch = '';
  document.getElementById('post-creator').classList.add('open');
  document.getElementById('pc-step-pick').style.display = 'flex';
  document.getElementById('pc-step-edit').style.display = 'none';
  document.getElementById('pc-step-edit').classList.remove('active');
  _pcBuildFilters();
  _pcBuildStickers();
  _pcBuildSpeeds();
  _pcBuildMusic();
  _pcBuildHashtags();
}

function closeQuickPost() {
  document.getElementById('post-creator').classList.remove('open');
  const vid = document.getElementById('pc-preview-video');
  if (vid) { vid.pause(); vid.src = ''; }
  // Reset post type to fan
  window._hlIsPlayerPost = false;
  setPostType('fan');
}

function triggerFilePick(openTab) {
  window._pcOpenTab = openTab || 'caption';
  // If file already chosen, just switch panel
  if (_pcFile && openTab) { pcShowPanel(openTab); return; }
  let fi = document.getElementById('_ps_file_input');
  if (!fi) {
    fi = document.createElement('input');
    fi.type = 'file'; fi.id = '_ps_file_input';
    fi.accept = 'video/*,image/*';
    fi.style.cssText = 'position:fixed;top:-999px;left:-999px;opacity:0;';
    document.body.appendChild(fi);
    fi.addEventListener('change', _pcFileChosen);
  }
  fi.value = '';
  fi.click();
}

function _pcFileChosen() {
  const fi = document.getElementById('_ps_file_input');
  const file = fi && fi.files && fi.files[0];
  if (!file) return;

  const isVideo = file.type.startsWith('video/');
  if (isVideo) {
    _pcFile = file;
    _pcLoadPreview(file);
    return;
  }
  _pcFile = file;
  _pcLoadPreview(file);
}

function _pcLoadPreview(file) {
  const url = URL.createObjectURL(file);
  const isVideo = file.type.startsWith('video/');

  // Show preview in the edit step
  const vid = document.getElementById('pc-preview-video');
  const img = document.getElementById('pc-preview-img');
  const ph  = document.getElementById('pc-preview-ph');

  if (isVideo) {
    vid.src = url;
    vid.style.display = 'block';
    if (img) img.style.display = 'none';
    if (ph)  ph.style.display  = 'none';
  } else {
    img.src = url;
    img.style.display = 'block';
    if (vid) vid.style.display = 'none';
    if (ph)  ph.style.display  = 'none';
  }

  // Switch to the edit step inside post-creator
  document.getElementById('pc-step-pick').style.display = 'none';
  const editStep = document.getElementById('pc-step-edit');
  editStep.style.display = 'flex';
  editStep.classList.add('active');
  // Open the tab that was requested (or caption by default)
  pcShowPanel(window._pcOpenTab || 'caption');
}

function pcBackToPick() {
  document.getElementById('pc-step-pick').style.display = 'flex';
  document.getElementById('pc-step-edit').style.display = 'none';
  document.getElementById('pc-step-edit').classList.remove('active');
  const vid = document.getElementById('pc-preview-video');
  if (vid) { vid.pause(); vid.src = ''; }
  _pcFile = null;
}

function _pcBuildFilters() {
  const strip = document.getElementById('pc-filter-strip');
  if (!strip) return;
  strip.innerHTML = PC_FILTERS.map(f => `
    <div class="pc-filter-chip ${f.id === _pcFilter ? 'on' : ''}" onclick="pcSetFilter('${f.id}','${f.css}')">
      <div class="pc-filter-thumb" style="filter:${f.css}">${f.emoji}</div>
      <div class="pc-filter-name">${f.label}</div>
    </div>`).join('');
}

function pcSetFilter(id, css) {
  _pcFilter = id;
  const vid = document.getElementById('pc-preview-video');
  const img = document.getElementById('pc-preview-img');
  if (vid) vid.style.filter = css;
  if (img) img.style.filter = css;
  _pcBuildFilters();
}

function pcShowPanel(name) {
  ['caption','stickers','speed','music'].forEach(p => {
    document.getElementById('pcp-' + p).style.display = p === name ? '' : 'none';
    const btn = document.getElementById('pct-' + p);
    if (btn) btn.classList.toggle('on', p === name);
  });
}

function _pcBuildStickers() {
  const grid = document.getElementById('pc-sticker-grid');
  if (!grid) return;
  grid.innerHTML = PC_STICKERS.map(s => `
    <div class="pc-sticker ${_pcSticker===s?'picked':''}" onclick="pcPickSticker('${s}')">${s}</div>`).join('');
}
function pcPickSticker(s) {
  _pcSticker = (_pcSticker === s) ? '' : s;
  _pcBuildStickers();
  const prev = document.getElementById('pc-sticker-preview');
  if (prev) prev.textContent = _pcSticker ? 'Selected: ' + _pcSticker + '  (will appear on your post)' : '';
}

function _pcBuildSpeeds() {
  const row = document.getElementById('pc-speed-row');
  if (!row) return;
  row.innerHTML = PC_SPEEDS.map(s => `
    <button class="pc-speed-btn ${_pcSpeed===s?'on':''}" onclick="pcSetSpeed('${s}')">${s}</button>`).join('');
}
function pcSetSpeed(s) { _pcSpeed = s; _pcBuildSpeeds(); }

function _pcBuildMusic() {
  const list = document.getElementById('pc-music-list');
  if (!list) return;
  list.innerHTML = PC_MUSIC.map(m => `
    <div onclick="pcSetMusic('${m.name}')" style="display:flex;align-items:center;gap:12px;padding:11px 0;border-bottom:1px solid rgba(255,255,255,.06);cursor:pointer;">
      <div style="font-size:24px;">${m.emoji}</div>
      <div style="flex:1;">
        <div style="font-size:13px;font-weight:600;color:${_pcMusic===m.name?'#10b981':'#fff'};">${m.name}</div>
        <div style="font-size:11px;color:rgba(255,255,255,.4);">${m.artist}</div>
      </div>
      ${_pcMusic===m.name?'<div style="color:#10b981;font-size:18px;">✓</div>':''}
    </div>`).join('');
}
function pcSetMusic(name) { _pcMusic = (_pcMusic===name)?'':name; _pcBuildMusic(); }

function _pcBuildHashtags() {
  const row = document.getElementById('pc-hashtags');
  if (!row) return;
  row.innerHTML = PC_HASHTAGS.map(h => `
    <div class="pc-hashtag" onclick="pcAddHashtag('${h}')">${h}</div>`).join('');
}
function pcAddHashtag(tag) {
  const ta = document.getElementById('pc-caption-inp');
  if (!ta) return;
  const cur = ta.value;
  ta.value = cur + (cur && !cur.endsWith(' ') ? ' ' : '') + tag + ' ';
  ta.focus();
}

/* ── FEATURE 4: Match Tagging ── */
function _pcBuildMatchTags() {
  const list = document.getElementById('pc-match-tag-list');
  if (!list) return;

  // Pull live matches from lsData (the same data used in Live Scores page)
  let matches = [];
  (lsData || []).forEach(group => {
    (group.matches || []).forEach(m => {
      matches.push({ ...m, league: group.league });
    });
  });

  if (!matches.length) {
    list.innerHTML = `<div style="padding:12px 14px;font-size:12px;color:rgba(255,255,255,.4);">No live data available — open Live Scores first.</div>`;
    return;
  }

  list.innerHTML = matches.slice(0, 20).map(m => {
    const hasScore = m.scoreH !== null && m.scoreA !== null;
    const score = hasScore ? `${m.scoreH}–${m.scoreA}` : 'vs';
    const st = m.status;
    const isLive = st !== 'FT' && st !== 'NS';
    const statusCls = isLive ? 'mti-live' : st === 'FT' ? 'mti-ft' : 'mti-ns';
    const label = `${m.home.name} ${score} ${m.away.name}`;
    const isSelected = _pcTaggedMatch === label;
    return `
      <div class="match-tag-item ${isSelected ? 'selected' : ''}" onclick="pcTagMatch('${escapeAttr(label)}','${escapeAttr(m.league || '')}')">
        <div class="mti-teams">
          <div class="mti-team">${m.home.name}</div>
          <div class="mti-team">${m.away.name}</div>
        </div>
        <div class="mti-score">${score}</div>
        <span class="mti-status ${statusCls}">${isLive ? st : st === 'FT' ? 'FT' : m.time || 'NS'}</span>
      </div>`;
  }).join('');
}

function pcToggleMatchPicker() {
  const list = document.getElementById('pc-match-tag-list');
  if (!list) return;
  const isOpen = list.classList.contains('open');
  if (!isOpen) {
    _pcBuildMatchTags();
    list.classList.add('open');
    document.getElementById('pc-match-tag-chevron').textContent = '▲';
  } else {
    list.classList.remove('open');
    document.getElementById('pc-match-tag-chevron').textContent = '▼';
  }
}

function pcTagMatch(label, league) {
  _pcTaggedMatch = _pcTaggedMatch === label ? '' : label;
  _pcBuildMatchTags();
  // Update display badge
  const display = document.getElementById('pc-tagged-match-display');
  if (display) {
    if (_pcTaggedMatch) {
      display.style.display = 'flex';
      document.getElementById('pc-tagged-match-text').textContent = '⚽ ' + _pcTaggedMatch;
    } else {
      display.style.display = 'none';
    }
  }
  // Close picker
  const list = document.getElementById('pc-match-tag-list');
  if (list) { list.classList.remove('open'); }
  const chevron = document.getElementById('pc-match-tag-chevron');
  if (chevron) chevron.textContent = '▼';
  if (_pcTaggedMatch) showToast('Tagged: ' + _pcTaggedMatch);
}

function pcClearMatchTag() {
  _pcTaggedMatch = '';
  const display = document.getElementById('pc-tagged-match-display');
  if (display) display.style.display = 'none';
}

async function pcPublish() {
  if (!_pcFile) { showToast('Please choose a file first'); return; }
  const caption = (document.getElementById('pc-caption-inp').value || '').trim();
  const btn = document.getElementById('pc-pub-btn');
  btn.disabled = true;

  // Show progress overlay
  const upDiv = document.getElementById('pc-uploading');
  const upProg = document.getElementById('pc-up-progress');
  upDiv.classList.add('show');
  upProg.textContent = 'Uploading to cloud…';

  try {
    const resourceType = _pcFile.type.startsWith('video/') ? 'video' : 'image';
    const formData = new FormData();
    formData.append('file', _pcFile);
    formData.append('upload_preset', CLOUDINARY_PRESET);
    formData.append('cloud_name',    CLOUDINARY_CLOUD);
    if (_pcFilter !== 'normal') formData.append('tags', 'filter_' + _pcFilter);

    const uploadUrl = 'https://api.cloudinary.com/v1_1/' + CLOUDINARY_CLOUD + '/' + resourceType + '/upload';
    upProg.textContent = 'Uploading… (this may take a moment)';

    // Upload with real progress tracking via XHR
    const info = await new Promise((resolve, reject) => {
      const xhr = new XMLHttpRequest();
      const timeout = setTimeout(() => { xhr.abort(); reject(new Error('Upload timed out')); }, 90000);
      xhr.upload.onprogress = (e) => {
        if (e.lengthComputable) {
          const pct = Math.round((e.loaded / e.total) * 100);
          if (upProg) upProg.textContent = 'Uploading… ' + pct + '%';
        }
      };
      xhr.onload = () => {
        clearTimeout(timeout);
        try {
          const data = JSON.parse(xhr.responseText);
          if (data.error) reject(new Error(data.error.message));
          else resolve(data);
        } catch(e) { reject(new Error('Upload response error')); }
      };
      xhr.onerror = () => { clearTimeout(timeout); reject(new Error('Network error during upload')); };
      xhr.onabort = () => reject(new Error('Upload timed out — check your connection'));
      xhr.open('POST', uploadUrl);
      xhr.send(formData);
    });

    upProg.textContent = 'Saving to your feed…';

    const rawUrl    = info.secure_url;
    // FEATURE 5: Apply f_auto,q_auto for bandwidth-efficient delivery (critical for Nigeria)
    const mediaUrl  = applyCloudinaryQuality(rawUrl);
    const mediaType = resourceType;
    const finalTitle = (caption || 'My PitchSide Moment ⚽') + (_pcSticker ? ' ' + _pcSticker : '') + (_pcTaggedMatch ? ` 📍 ${_pcTaggedMatch}` : '');

    // Save to Firestore
    const { addDoc, collection, serverTimestamp, db: _db } = window._psFs || {};
    const _cu = window._psCurrentUser;
    let docId = 'local_' + Date.now();

    if (addDoc && _db) {
      try {
        const postData = {
          title: finalTitle, mediaUrl, mediaType,
          publicId: info.public_id, format: info.format,
          duration: info.duration || null,
          thumbnail: info.thumbnail_url || mediaUrl,
          poster: '@' + ((profileData && profileData.name) || 'pitchside').replace(/\s+/g,'').toLowerCase(),
          userId: (_cu && _cu.uid) || 'anonymous',
          userName: (profileData && profileData.name) || 'PitchSide User',
          cat: 'Trending', likes: 0, comments: 0, userPost: true, playerPost: window._hlIsPlayerPost || false,
          filter: _pcFilter, speed: _pcSpeed, sticker: _pcSticker, music: _pcMusic,
          taggedMatch: _pcTaggedMatch || null,  // FEATURE 4: match tag
          createdAt: serverTimestamp(),
        };
        const docRef = await addDoc(collection(_db, 'posts'), postData);
        docId = docRef.id;
      } catch(e) { console.warn('[PC] Firestore save failed:', e); }
    }

    // Add to local VIDEOS immediately so it appears in feed
    const localVideo = {
      id: 'fs_' + docId,
      title: finalTitle,
      date: new Date().toLocaleDateString('en-GB', {day:'numeric',month:'short',year:'numeric'}),
      cat: 'Trending',
      src: mediaType === 'video' ? mediaUrl : '',
      thumbnail: info.thumbnail_url || mediaUrl,
      embed: '', embedUrl: '',
      userPost: true,
      poster: '@' + ((profileData && profileData.name) || 'pitchside').replace(/\s+/g,'').toLowerCase(),
      avatarSeed: 'user',
      likes: 0, comments: 0,
      music: _pcMusic || null,
      fromAPI: false,
    };
    VIDEOS.unshift(localVideo);

    // Persist user posts in localStorage for history
    try {
      const stored = JSON.parse(localStorage.getItem('_ps_my_videos') || '[]');
      stored.unshift(localVideo);
      localStorage.setItem('_ps_my_videos', JSON.stringify(stored.slice(0, 100)));
    } catch(e) {}

    upDiv.classList.remove('show');
    btn.disabled = false;
    closeQuickPost();
    updateProfileStats();
    refreshAllVideoGrids();

    // Go to explore feed after posting
    const exploreNav = document.querySelector('.nav-item');
    switchPage('explore', exploreNav);
    setTimeout(() => showToast('🎉 Posted to PitchSide!'), 300);

  } catch(err) {
    console.error('[PC] Upload failed:', err);
    const _upDiv2 = document.getElementById('pc-uploading');
    const _btn2   = document.getElementById('pc-pub-btn');
    if (_upDiv2) _upDiv2.classList.remove('show');
    if (_btn2)   _btn2.disabled = false;
    const msg = err && err.name === 'AbortError'
      ? 'Upload timed out — check your connection and try again'
      : 'Upload failed — please try again';
    showToast(msg);
  }
}

// Legacy submitQuickPost kept for any remaining references
function submitQuickPost() { pcPublish(); }

// Expose to window
window.openQuickPost   = openQuickPost;
window.closeQuickPost  = closeQuickPost;
window.submitQuickPost = submitQuickPost;
window.triggerFilePick = triggerFilePick;
window.pcBackToPick    = pcBackToPick;
window.pcSetFilter     = pcSetFilter;
window.pcShowPanel     = pcShowPanel;
window.pcPickSticker   = pcPickSticker;
window.pcSetSpeed      = pcSetSpeed;
window.pcSetMusic      = pcSetMusic;
window.pcAddHashtag    = pcAddHashtag;
window.pcPublish       = pcPublish;
window.pcToggleMatchPicker = pcToggleMatchPicker;
window.pcTagMatch          = pcTagMatch;
window.pcClearMatchTag     = pcClearMatchTag;
window.openAiInsight       = openAiInsight;
window.closeAiInsight      = closeAiInsight;

/* ── My Videos overlay ── */
function openMyVideos() {
  const overlay = document.getElementById('my-videos-overlay');
  if (!overlay) return;
  overlay.classList.add('open');
  _renderMyVideos();
}
function closeMyVideos() {
  const overlay = document.getElementById('my-videos-overlay');
  if (overlay) overlay.classList.remove('open');
}
function _renderMyVideos() {
  const body = document.getElementById('mv-body');
  if (!body) return;

  // Combine VIDEOS in memory + localStorage history
  let myVids = VIDEOS.filter(v => v.userPost);
  try {
    const stored = JSON.parse(localStorage.getItem('_ps_my_videos') || '[]');
    // Merge without duplicates
    stored.forEach(sv => {
      if (!myVids.find(v => v.id === sv.id)) myVids.push(sv);
    });
  } catch(e) {}

  if (!myVids.length) {
    body.innerHTML = `<div class="mv-empty">
      <div class="mv-empty-icon">🎬</div>
      <div class="mv-empty-text">No videos yet.<br>Tap the green + button to post your first moment!</div>
    </div>`;
    return;
  }

  body.style.cssText = 'display:grid;grid-template-columns:repeat(2,1fr);gap:10px;padding:14px;overflow-y:auto;flex:1;';
  body.innerHTML = myVids.map((v, idx) => `
    <div class="mv-card" onclick="openMyVideoPlayer(${idx})">
      ${v.thumbnail
        ? `<img class="mv-thumb" src="${v.thumbnail}" alt="${v.title}" onerror="this.style.display='none';this.nextSibling.style.display='flex'"><div class="mv-thumb-ph" style="display:none;">⚽</div>`
        : `<div class="mv-thumb-ph">⚽</div>`}
      <div class="mv-info">
        <div class="mv-vtitle">${v.title}</div>
        <div class="mv-vdate">${v.date || ''}</div>
      </div>
    </div>`).join('');

  // Store merged list for player access
  window._mvCurrentList = myVids;
}

function openMyVideoPlayer(idx) {
  const list = window._mvCurrentList || [];
  const v = list[idx];
  if (!v) return;
  closeMyVideos();
  // Use the existing video overlay if available
  if (typeof openVideoOverlay === 'function') {
    openVideoOverlay(v.id);
  } else if (typeof playVideo === 'function') {
    playVideo(v.id);
  } else {
    showToast('Opening: ' + v.title);
  }
}

window.openMyVideos       = openMyVideos;
window.closeMyVideos      = closeMyVideos;
window.openMyVideoPlayer  = openMyVideoPlayer;

// On load: restore any stored posts into VIDEOS so profile count is right
(function restoreStoredPosts() {
  try {
    const stored = JSON.parse(localStorage.getItem('_ps_my_videos') || '[]');
    stored.forEach(sv => {
      if (!VIDEOS.find(v => v.id === sv.id)) VIDEOS.push(sv);
    });
    updateProfileStats();
  } catch(e) {}
})();



let _currentNewsUrl = '';

function openNewsReader(n) {
  _currentNewsUrl = n.url || '';
  document.getElementById('nr-hdr-title').textContent = n.source || 'Article';

  // XSS-SAFE: news data from API — use textContent for all text fields
  const nrBody = document.getElementById('nr-body');
  nrBody.innerHTML = '';

  if (n.imageUrl && n.imageUrl.length > 10) {
    const img = document.createElement('img');
    img.className = 'nr-img';
    img.src = n.imageUrl;
    img.onerror = () => { img.style.display = 'none'; };
    nrBody.appendChild(img);
  }

  const catDiv = document.createElement('div');
  catDiv.className = 'nr-category';
  catDiv.textContent = (n.emoji || '⚽') + ' ' + (n.category || 'Football');
  nrBody.appendChild(catDiv);

  const titleDiv = document.createElement('div');
  titleDiv.className = 'nr-title';
  titleDiv.textContent = n.title;
  nrBody.appendChild(titleDiv);

  const metaDiv = document.createElement('div');
  metaDiv.className = 'nr-meta';
  const srcSpan = document.createElement('span');
  srcSpan.textContent = '📰 ' + (n.source || 'Football News');
  const timeSpan = document.createElement('span');
  timeSpan.textContent = '⏱ ' + (n.timeAgo || '');
  metaDiv.appendChild(srcSpan);
  metaDiv.appendChild(timeSpan);
  nrBody.appendChild(metaDiv);

  const descDiv = document.createElement('div');
  descDiv.className = 'nr-desc';
  descDiv.textContent = n.desc || 'Tap below to read the full article.';
  nrBody.appendChild(descDiv);

  if (n.url) {
    const btn = document.createElement('button');
    btn.className = 'nr-read-more';
    btn.textContent = '🔗 Read Full Article on ' + (n.source || 'Source');
    btn.onclick = openNewsExternal;
    nrBody.appendChild(btn);
  }

  document.getElementById('news-reader-overlay').classList.add('open');
}

function closeNewsReader() {
  document.getElementById('news-reader-overlay').classList.remove('open');
}

function openNewsExternal() {
  if (_currentNewsUrl) window.open(_currentNewsUrl, '_blank');
}
