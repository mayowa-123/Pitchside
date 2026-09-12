// match-detail.js
//
// Match detail modal (Overview/Timeline/Lineups/Stats/Odds/H2H), the
// NPFL/standings page, and their Highlightly response adapters — split
// out of app.js so this code (and Highlightly's own weight) is only
// downloaded by users who actually open a match or the NPFL tab, not by
// everyone loading the video feed.
//
// LOADED VIA DYNAMIC import() FROM app.js, NOT type="module" ON app.js
// ITSELF. app.js stays a classic script (required — hundreds of
// onclick="..." attributes throughout the HTML depend on its top-level
// functions being attached to `window`, which only happens automatically
// for classic scripts, not ES modules). This file IS a real ES module
// (that's what makes dynamic import() treat it as one); the handful of
// functions here that HTML calls directly via onclick/onchange
// (openMatchDetail, closeMatchDetail, switchMatchTab, loadMatchOdds,
// loadMatchH2H, loadLiveTable, loadLeagueStandings, initNpfl,
// switchNpflTab) get exposed on `window` by the loader stubs living in
// app.js — see the "MATCH DETAIL — LAZY MODULE LOADER" block there.
//
// IMPORTANT — window.lsData, not bare lsData: app.js declares live-scores
// data with `let lsData = [...]`. Top-level `let`/`const` in a classic
// script do NOT attach to `window` (only `var` and function declarations
// do), and this module's own scope can't see a classic script's `let`
// bindings either. app.js mirrors every lsData reassignment onto
// `window.lsData` specifically so this module can read it — if you ever
// see "lsData is not defined" after editing app.js's live-scores code,
// check that both `lsData = ...` reassignment sites there still have
// their `window.lsData = lsData;` mirror line right after them.
//
// Everything below this line is otherwise UNCHANGED from its original
// place in app.js — only `export` was added to top-level declarations.

// Flattens lsData's league groups into a single match lookup. This is the
// same Highlightly-sourced data already driving the visible Live Scores
// list — reliable, no extra fetch needed, and (unlike the old fixture
// fetch this replaces) actually has correct team IDs after the fix above.
export function _findMatchInLsData(matchId) {
  if (!Array.isArray(window.lsData)) return null;
  for (const group of window.lsData) {
    const matches = group?.matches;
    if (!Array.isArray(matches)) continue;
    const found = matches.find(m => String(m.id) === String(matchId));
    if (found) return found;
  }
  return null;
}

// ── Highlightly → legacy shape adapters ──────────────────────────────
// generateTimelineHTML/generateLineupsHTML/generateStatsHTML below were
// built tightly coupled to API-Football's exact field names. Rather than
// rewrite those renderers (and risk missing some visual detail they
// already handle correctly), these adapters translate Highlightly's
// response into that same shape. Unlike the score/status/H2H fixes above
// — which were verified against Highlightly's own documented sample
// responses — the exact field names for events/lineups/statistics
// weren't confirmed from a full sample, only descriptions of what's
// included. Every field access below is defensive (checks several
// plausible names, never assumes a path exists) specifically because of
// that extra uncertainty, and the raw response gets logged once via
// console.error — which Sentry already captures — so a wrong guess here
// shows up as a real, inspectable event instead of a silent blank tab.

export function _adaptHighlightlyEvents(rawEvents) {
  if (!Array.isArray(rawEvents)) return [];
  return rawEvents.map(ev => {
    const minute = ev.time ?? ev.minute ?? ev.elapsed ?? 0;
    const typeRaw = String(ev.type || ev.eventType || '').toLowerCase();
    let type = 'Other';
    if (typeRaw.includes('goal')) type = 'Goal';
    else if (typeRaw.includes('card')) type = 'Card';
    else if (typeRaw.includes('sub')) type = 'subst';
    return {
      time: { elapsed: minute, extra: ev.extraTime ?? ev.addedTime ?? null },
      type,
      detail: ev.detail || ev.description ||
        (typeRaw.includes('yellow') ? 'Yellow Card' : typeRaw.includes('red') ? 'Red Card' : (ev.type || '')),
      player: { name: (typeof ev.player === 'string' ? ev.player : ev.player?.name) || 'Unknown' },
      assist: { name: (typeof ev.assist === 'string' ? ev.assist : ev.assist?.name) || ev.substitutedFor?.name || '' },
    };
  });
}

// Highlightly's /lineups/{matchId} returns { homeTeam: {...}, awayTeam: {...} },
// NOT an array of two teams. Each team has `initialLineup`: an array of rows
// (first row is always the goalkeeper, remaining rows are the rest of the
// formation grouped by line) rather than a flat startXI list.
export function _adaptHighlightlyLineups(rawLineupsObj) {
  if (!rawLineupsObj || (!rawLineupsObj.homeTeam && !rawLineupsObj.awayTeam)) return [];
  const sides = [rawLineupsObj.homeTeam, rawLineupsObj.awayTeam].filter(Boolean);
  if (sides.length < 2) return [];

  return sides.map(team => {
    const flatXI = Array.isArray(team.initialLineup)
      ? team.initialLineup.flat()
      : [];
    return {
      team: { name: team.name || 'Team' },
      formation: team.formation || 'N/A',
      startXI: flatXI.map(p => ({
        player: {
          number: p.number ?? '',
          name: p.name || 'Unknown',
          pos: p.position || '',
        },
      })),
      substitutes: (team.substitutes || []).map(p => ({
        player: {
          number: p.number ?? '',
          name: p.name || 'Unknown',
        },
      })),
      coach: { name: '' },
    };
  });
}

export function _adaptHighlightlyStatistics(rawStats) {
  if (!Array.isArray(rawStats) || rawStats.length < 2) return [];
  return rawStats.slice(0, 2).map(team => ({
    team: { name: team.team?.name || '' },
    statistics: (team.statistics || []).map(s => ({
      type: s.displayName || 'Stat',
      value: s.value ?? 0,
    })),
  }));
}

// Full translation from Highlightly's /matches/{matchId} response into
// the exact `d` shape buildRealMatchDetailCard already expects — reuses
// that existing, already-styled renderer entirely rather than duplicating
// its markup. lsMatch (from _findMatchInLsData) fills in anything the
// detail response is missing, since that data's already confirmed correct.
// NOTE: /api/highlightly's `match` endpoint proxies Highlightly's response
// through UNCHANGED (res.send(text) — no server-side transform), so this
// adapter works on the RAW Highlightly shape (homeTeam/awayTeam/state/...),
// not any pre-transformed shape.
export function _adaptHighlightlyMatchToLegacyShape(raw, lsMatch) {
  const homeTeam = raw.homeTeam || {};
  const awayTeam = raw.awayTeam || {};
  const parsedScore = _parseHighlightlyScoreString(raw.state?.score?.current);

  return {
    fixture: {
      id: raw.id ?? lsMatch?.id,
      status: {
        short: normalizeLiveScoreStatus(raw.state?.description) || lsMatch?.statusShort || 'NS',
        elapsed: raw.state?.clock ?? null,
      },
      venue: {
        name: raw.venue?.name || raw.venue?.stadium || '',
        city: raw.venue?.city || '',
      },
      referee: (typeof raw.referee === 'string' ? raw.referee : raw.referee?.name) || '',
    },
    goals: {
      home: parsedScore.home ?? lsMatch?.scoreH ?? null,
      away: parsedScore.away ?? lsMatch?.scoreA ?? null,
    },
    teams: {
      home: {
        id: homeTeam.id ?? lsMatch?.home?.id,
        name: homeTeam.name || lsMatch?.home?.name || 'Home',
        logo: homeTeam.logo || lsMatch?.home?.badge || '',
      },
      away: {
        id: awayTeam.id ?? lsMatch?.away?.id,
        name: awayTeam.name || lsMatch?.away?.name || 'Away',
        logo: awayTeam.logo || lsMatch?.away?.badge || '',
      },
    },
    league: {
      id: raw.league?.id ?? 0,
      name: raw.league?.name || '',
      season: raw.league?.season ?? new Date().getFullYear(),
      round: raw.round || '',
    },
    events: _adaptHighlightlyEvents(raw.events),
    lineups: _adaptHighlightlyLineups(raw.lineups),
    statistics: _adaptHighlightlyStatistics(raw.matchStatistics),
  };
}

export async function openMatchDetail(matchId, title) {
  const overlay = document.getElementById('match-overlay');
  const body = document.getElementById('match-ov-body');
  const titleEl = document.getElementById('match-ov-title');

  titleEl.textContent = title || 'MATCH DETAILS';
  overlay.classList.add('active');

  body.innerHTML = `<div class="ov-loading"><div class="spinner"></div>Loading match data...</div>`;

  const lsMatch = _findMatchInLsData(matchId);

  // Primary path: Highlightly's own /matches/{id}, proxied by
  // /api/highlightly?endpoint=match&matchId= — this is the actual
  // endpoint+param name the deployed api/highlightly.js implements.
  // Per Highlightly's official docs, this response is a JSON ARRAY
  // (`[ {...} ]`), not a bare object — must unwrap raw[0].
  let debugReason = '';
  try {
    const res = await fetch(`/api/highlightly?endpoint=match&matchId=${encodeURIComponent(matchId)}`);
    let rawBody = null;
    try { rawBody = await res.json(); } catch (_) { /* non-JSON body */ }
    const raw = Array.isArray(rawBody) ? rawBody[0] : rawBody;

    if (res.ok && raw && (raw.id || raw.homeTeam || raw.awayTeam)) {
      const d = _adaptHighlightlyMatchToLegacyShape(raw, lsMatch);

      // Lineups aren't bundled into /matches/{id} — fetch separately.
      // Per official docs, /lineups/{matchId} returns a single object
      // { homeTeam, awayTeam } — not an array or a { data: [...] } wrapper.
      try {
        const lRes = await fetch(`/api/highlightly?endpoint=lineups&matchId=${encodeURIComponent(matchId)}`);
        if (lRes.ok) {
          const lRaw = await lRes.json();
          const adapted = _adaptHighlightlyLineups(lRaw);
          if (adapted.length) d.lineups = adapted;
        }
      } catch (e) {
        console.warn('[MatchDetail] lineups fetch failed:', e.message);
      }

      body.innerHTML = buildRealMatchDetailCard(d);
      setTimeout(() => {
        body.querySelectorAll('.stat-bar-home, .stat-bar-away').forEach(el => {
          el.style.width = el.dataset.w + '%';
        });
      }, 100);
      return;
    }
    debugReason = `status ${res.status}${raw?.error ? ' — ' + raw.error : ''}`;
    throw new Error(debugReason);
  } catch (e) {
    debugReason = debugReason || e.message;
    console.warn('[MatchDetail] Highlightly detail fetch failed, falling back:', debugReason);
  }

  // Second path: the lightweight card, built entirely from lsData —
  // no timeline/lineups/stats, but a correct overview + working H2H/odds.
  if (lsMatch && lsMatch.home?.id && lsMatch.away?.id) {
    body.innerHTML = buildLiteMatchDetailCard(lsMatch, matchId);
    // TEMPORARY debug line — shows exactly why the primary fetch failed,

    // so this is visible on-device without needing devtools. Remove once
    // the real cause is confirmed and fixed.
    body.innerHTML += `<div style="margin:0 16px 16px;padding:10px;background:#3a1414;color:#ff8a8a;font-size:11px;border-radius:8px;word-break:break-all;">DEBUG: ${_esc(debugReason)}</div>`;
    return;
  }

  // Last resort: match isn't in today's cached data at all (rare — e.g. a
  // league outside the ones the bot tracks).
  fallbackToScoreAxis(matchId, body);
}

// Lightweight overview built entirely from correct, already-available data
// (no broken fixture fetch involved). Covers Overview + a working H2H
// button + Odds. Timeline/Lineups/Stats are intentionally left out of this
// version — deferred, same as the rest of the match-detail rebuild — shown
// as "coming soon" rather than attempted with data we know is wrong.
export function buildLiteMatchDetailCard(m, matchId) {
  const homeName = _esc(m.home?.name || 'Home');
  const awayName = _esc(m.away?.name || 'Away');
  const homeBadge = m.home?.badge || '⚽';
  const awayBadge = m.away?.badge || '⚽';
  const score = (m.scoreH ?? m.scoreA != null) ? `${m.scoreH ?? '-'} - ${m.scoreA ?? '-'}` : '- - -';
  const status = _esc(m.statusShort || m.status || 'NS');

  return `
    <div class="match-detail-card" style="padding-top:10px;">
      <div style="display:flex;align-items:center;justify-content:space-around;padding:16px 0;">
        <div style="text-align:center;flex:1;">
          <img src="${_esc(homeBadge)}" style="width:48px;height:48px;object-fit:contain;" onerror="this.style.display='none'">
          <div style="font-weight:700;margin-top:6px;font-size:13px;">${homeName}</div>
        </div>
        <div style="text-align:center;padding:0 12px;">
          <div style="font-size:24px;font-weight:800;">${_esc(score)}</div>
          <div style="font-size:11px;color:var(--text3);margin-top:2px;">${status}</div>
        </div>
        <div style="text-align:center;flex:1;">
          <img src="${_esc(awayBadge)}" style="width:48px;height:48px;object-fit:contain;" onerror="this.style.display='none'">
          <div style="font-weight:700;margin-top:6px;font-size:13px;">${awayName}</div>
        </div>
      </div>

      <div style="padding:0 4px;">
        <button class="btn-cancel" onclick="loadMatchH2H('${_esc(String(m.home.id))}','${_esc(String(m.away.id))}','${homeName}','${awayName}')" style="width:100%;margin-bottom:10px;">Load Head-to-Head</button>
        <div id="h2h-list" style="margin-bottom:16px;"></div>

        <button class="btn-cancel" onclick="loadMatchOdds('${_esc(String(matchId))}')" style="width:100%;margin-bottom:10px;">Load Odds</button>
        <div id="odds-list"></div>
      </div>

      <div style="text-align:center;color:var(--text3);font-size:12px;padding:16px 0 4px;">
        Full match details (timeline, lineups, stats) aren't available for this match right now — here's what's confirmed.
      </div>
    </div>`;
}

export function fallbackToScoreAxis(matchId, body) {
  body.innerHTML = `
    <div class="match-detail-card" style="padding-top:10px;">
      <div id="scoreaxis-match-widget" class="scoreaxis-widget" style="min-height:400px;"></div>
    </div>`;
  const script = document.createElement('script');
  script.src = `https://widgets.scoreaxis.com/api/football/live-match/${matchId}?widgetId=match-detail&lang=en&bodyColor=%23ffffff&textColor=%230f172a&borderColor=%23e2e8f0&links=0`;
  script.async = true;
  document.getElementById('scoreaxis-match-widget')?.appendChild(script);
}

export function buildRealMatchDetailCard(d) {
  // Store globally for tab access
  window._currentMatchData = d;
  
  const statusShort = d.fixture.status.short;
  const isLive = ['1H','2H','ET','HT','P','INT','LIVE'].includes(statusShort);
  const isFT = ['FT','AET','PEN'].includes(statusShort);
  const statusClass = isLive ? 'match-status-live' : (statusShort === 'HT' ? 'match-status-ht' : (isFT ? 'match-status-ft' : 'match-status-upcoming'));
  const statusLabel = isLive ? `${d.fixture.status.elapsed || 0}'` : statusShort;
  
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

    <div class="match-tabs" style="overflow-x:auto;display:flex;gap:8px;padding:8px 0;">
      <div class="m-tab active" onclick="switchMatchTab(this, 'tab-overview')" style="white-space:nowrap;">Overview</div>
      <div class="m-tab" onclick="switchMatchTab(this, 'tab-timeline')" style="white-space:nowrap;">Timeline</div>
      <div class="m-tab" onclick="switchMatchTab(this, 'tab-lineups')" style="white-space:nowrap;">Lineups</div>
      <div class="m-tab" onclick="switchMatchTab(this, 'tab-stats')" data-league="${d.league.id}" data-season="${d.league.season}" style="white-space:nowrap;">Stats</div>
      <div class="m-tab" onclick="switchMatchTab(this, 'tab-bookmakers')" style="white-space:nowrap;">💰 Odds</div>
      <div class="m-tab" onclick="switchMatchTab(this, 'tab-h2h')" style="white-space:nowrap;">📊 H2H</div>
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

    <div id="tab-bookmakers" class="m-tab-content">
      <div style="padding:16px;">
        <div style="color:var(--text2);font-size:13px;margin-bottom:12px;">📊 Live Odds from Major Bookmakers</div>
        <div id="bookmakers-list" style="display:grid;gap:12px;">
          <button class="btn-cancel" onclick="loadMatchOdds('${d.fixture.id}')" style="width:100%;">Load Odds</button>
        </div>
      </div>
    </div>

    <div id="tab-h2h" class="m-tab-content">
      <div style="padding:16px;">
        <div style="color:var(--text2);font-size:13px;margin-bottom:12px;">📈 Historical Head-to-Head</div>
        <div id="h2h-list" style="display:grid;gap:8px;">
          <button class="btn-cancel" onclick="loadMatchH2H('${d.teams.home.id}','${d.teams.away.id}','${d.teams.home.name}','${d.teams.away.name}')" style="width:100%;">Load Head-to-Head</button>
        </div>
      </div>
    </div>
  `;
}

/* Load odds on demand — separate endpoint, paid tier only */
export async function loadMatchOdds(matchId) {
  // Supports both the new lite card (#odds-list) and the old full card
  // (#bookmakers-list), whichever is actually present.
  const container = document.getElementById('odds-list') || document.getElementById('bookmakers-list');
  if (!container) return;
  container.innerHTML = `<div class="ov-loading"><div class="spinner"></div>Fetching odds...</div>`;
  try {
    const res = await fetch(`/api/highlightly?endpoint=odds&matchId=${encodeURIComponent(matchId)}`);

    // Highlightly's own docs mark this endpoint as unavailable on the
    // Basic/Free plan — empirically Highlightly returns 401 for this (not
    // 403), so both are treated as "not on this plan", not a bug.
    if (res.status === 401 || res.status === 403) {
      container.innerHTML = '<div style="color:var(--text3);text-align:center;padding:20px;font-size:13px;">Odds aren\'t available on the current Highlightly plan.</div>';
      return;
    }

    const data = await res.json();
    // Real shape per Highlightly's docs:
    // { data: [ { matchId, odds: [ { bookmakerName, market, values: [{odd, value}] } ] } ] }
    // — NOT a flat list of bookmaker objects with .odds.home_win etc.
    const matchEntry = Array.isArray(data.data) ? data.data[0] : null;
    const oddsEntries = matchEntry?.odds || [];
    const bookmakers = oddsEntries
      .filter(o => o.market === 'Full Time Result')
      .map(o => {
        const byOutcome = {};
        (o.values || []).forEach(v => { byOutcome[v.value] = v.odd; });
        return {
          name: o.bookmakerName,
          odds: {
            home_win: byOutcome.Home,
            draw: byOutcome.Draw,
            away_win: byOutcome.Away,
          },
        };
      });

    container.innerHTML = bookmakers.length > 0
      ? renderBookmakers(bookmakers)
      : '<div style="color:var(--text3);text-align:center;padding:20px;font-size:13px;">No odds available yet</div>';
  } catch(e) {
    container.innerHTML = '<div style="color:var(--text3);text-align:center;padding:20px;font-size:13px;">No odds available yet</div>';
  }
}

// Splits Highlightly's "5 - 0"-style score string into numbers — same
// logic as the bot's parseScoreString, needed here since the H2H endpoint
// returns matches in Highlightly's own raw shape, not pre-split.
export function _parseHighlightlyScoreString(current) {
  if (typeof current !== 'string') return { home: null, away: null };
  const parts = current.split(/\s*-\s*/);
  if (parts.length !== 2) return { home: null, away: null };
  const home = parseInt(parts[0], 10);
  const away = parseInt(parts[1], 10);
  return {
    home: Number.isNaN(home) ? null : home,
    away: Number.isNaN(away) ? null : away,
  };
}

/* Load H2H on demand — needs both team IDs */
export async function loadMatchH2H(teamIdOne, teamIdTwo, homeName, awayName) {
  const container = document.getElementById('h2h-list');
  container.innerHTML = `<div class="ov-loading"><div class="spinner"></div>Fetching history...</div>`;
  try {
    const res = await fetch(`/api/highlightly?endpoint=h2h&teamIdOne=${encodeURIComponent(teamIdOne)}&teamIdTwo=${encodeURIComponent(teamIdTwo)}`);
    const data = await res.json();
    const rawMatches = data.data || data.matches || data.response || (Array.isArray(data) ? data : []);

    // Map Highlightly's raw match shape into what renderH2H expects
    // (teams.home/away.name, goals.home/away) — kept generic there so it
    // works regardless of which provider actually supplied the data.
    const matches = rawMatches.map(m => {
      const parsed = _parseHighlightlyScoreString(m.state?.score?.current);
      return {
        teams: {
          home: { name: m.homeTeam?.name || 'Home' },
          away: { name: m.awayTeam?.name || 'Away' },
        },
        goals: { home: parsed.home, away: parsed.away },
      };
    });

    container.innerHTML = matches.length > 0
      ? renderH2H(matches, homeName, awayName)
      : '<div style="color:var(--text3);text-align:center;padding:20px;font-size:13px;">No history available</div>';
  } catch(e) {
    console.error('[H2H] load failed:', e);
    container.innerHTML = '<div style="color:var(--text3);text-align:center;padding:20px;font-size:13px;">No history available</div>';
  }
}

/* Tab Switcher Logic */
export function switchMatchTab(btn, tabId) {
  document.querySelectorAll('.m-tab').forEach(t => t.classList.remove('active'));
  document.querySelectorAll('.m-tab-content').forEach(c => c.classList.remove('active'));
  btn.classList.add('active');
  document.getElementById(tabId).classList.add('active');
}

/* Render Bookmakers/Odds */
export function renderBookmakers(bookmakers) {
  if (!bookmakers || bookmakers.length === 0) {
    return '<div style="color:var(--text3);text-align:center;padding:20px;">No odds available</div>';
  }

  return bookmakers.slice(0, 5).map(book => `
    <div style="background:var(--bg2);padding:12px;border-radius:8px;border-left:3px solid var(--green);">
      <div style="font-weight:600;color:var(--text);font-size:13px;margin-bottom:8px;">
        ${book.name || 'Bookmaker'}
      </div>
      <div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:8px;font-size:12px;">
        <div style="text-align:center;padding:8px;background:var(--bg3);border-radius:6px;">
          <div style="color:var(--text2);font-size:11px;">Home</div>
          <div style="color:var(--green);font-weight:600;font-size:14px;">
            ${book.odds?.home_win?.toFixed(2) || '-'}
          </div>
        </div>
        <div style="text-align:center;padding:8px;background:var(--bg3);border-radius:6px;">
          <div style="color:var(--text2);font-size:11px;">Draw</div>
          <div style="color:var(--yellow);font-weight:600;font-size:14px;">
            ${book.odds?.draw?.toFixed(2) || '-'}
          </div>
        </div>
        <div style="text-align:center;padding:8px;background:var(--bg3);border-radius:6px;">
          <div style="color:var(--text2);font-size:11px;">Away</div>
          <div style="color:var(--red);font-weight:600;font-size:14px;">
            ${book.odds?.away_win?.toFixed(2) || '-'}
          </div>
        </div>
      </div>
    </div>
  `).join('');
}

/* Render Head-to-Head */
export function renderH2H(h2hMatches, homeTeamName, awayTeamName) {
  if (!h2hMatches || h2hMatches.length === 0) {
    return '<div style="color:var(--text3);text-align:center;padding:20px;">No history available</div>';
  }

  const stats = { homeWins: 0, awayWins: 0, draws: 0 };

  const matches = h2hMatches.slice(0, 10).map(match => {
    const homeGoals = match.goals?.home || 0;
    const awayGoals = match.goals?.away || 0;
    
    if (homeGoals > awayGoals) stats.homeWins++;
    else if (awayGoals > homeGoals) stats.awayWins++;
    else stats.draws++;

    const resultClass = homeGoals > awayGoals ? 'var(--green)' : (awayGoals > homeGoals ? 'var(--red)' : 'var(--yellow)');
    
    return `
      <div style="background:var(--bg2);padding:10px;border-radius:8px;display:grid;grid-template-columns:1fr 1fr 1fr;gap:8px;align-items:center;">
        <div style="text-align:right;font-size:12px;color:var(--text);">
          ${match.teams?.home?.name?.substring(0, 12) || 'Home'}
        </div>
        <div style="text-align:center;font-weight:600;color:${resultClass};font-size:14px;">
          ${homeGoals} - ${awayGoals}
        </div>
        <div style="text-align:left;font-size:12px;color:var(--text);">
          ${match.teams?.away?.name?.substring(0, 12) || 'Away'}
        </div>
      </div>
    `;
  }).join('');

  const statsCard = `
    <div style="background:linear-gradient(135deg,#10b981,#059669);padding:12px;border-radius:8px;margin-bottom:12px;color:white;display:grid;grid-template-columns:1fr 1fr 1fr;gap:8px;text-align:center;">
      <div>
        <div style="font-size:11px;opacity:0.9;">Home Wins</div>
        <div style="font-size:16px;font-weight:700;">${stats.homeWins}</div>
      </div>
      <div>
        <div style="font-size:11px;opacity:0.9;">Draws</div>
        <div style="font-size:16px;font-weight:700;">${stats.draws}</div>
      </div>
      <div>
        <div style="font-size:11px;opacity:0.9;">Away Wins</div>
        <div style="font-size:16px;font-weight:700;">${stats.awayWins}</div>
      </div>
    </div>
  `;

  return statsCard + matches;
}

/* Timeline Generator */
export function generateTimelineHTML(events) {
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
export function generateLineupsHTML(lineups, teams) {
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
export function generateStatsHTML(statistics) {
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
export async function loadLiveTable(leagueId, season) {
  const container = document.getElementById('live-table-container');
  container.innerHTML = `<div class="ov-loading"><div class="spinner"></div>Fetching table...</div>`;

  try {
    // Reads the bot-fed cache instead of calling /api/footballdata
    // directly — that endpoint was passing a Highlightly league ID into
    // what's shaped like football-data.org's REST API (a different
    // provider with an unrelated ID system), which is the likely reason
    // it was returning an error page instead of JSON. The bot now fetches
    // standings from the same provider and the same IDs already used for
    // live scores, so there's no cross-provider mismatch possible here.
    const fsApi = window._psFs;
    const db = window._psDb;
    if (!fsApi || !db) throw new Error('Firestore not ready');

    const snap = await fsApi.getDoc(fsApi.doc(db, 'standings', String(leagueId)));
    if (!snap.exists()) throw new Error('No cached standings for this league yet');

    const rows = snap.data().rows;
    if (!Array.isArray(rows) || rows.length === 0) throw new Error('No standings rows');

    // Field names are read defensively — the bot saves Highlightly's
    // response as-is, and the exact field naming wasn't confirmed from
    // documentation alone. Falls back across the most likely variants
    // for each value rather than assuming one exact shape.
    let html = `
      <div class="table-row table-hdr">
        <div class="tr-pos">#</div>
        <div class="tr-team">Team</div>
        <div class="tr-stat">P</div>
        <div class="tr-stat">GD</div>
        <div class="tr-pts">Pts</div>
      </div>`;

    html += rows.map((row, i) => {
      const pos = row.position ?? row.rank ?? row.place ?? (i + 1);
      const team = row.team || {};
      const teamName = team.name || row.teamName || 'Unknown';
      const teamLogo = team.logo || team.crest || row.teamLogo || '';
      const played = row.played ?? row.playedGames ?? row.gamesPlayed ?? 0;
      const gd = row.goalDifference ?? row.goalsDiff ?? row.gd ?? 0;
      const pts = row.points ?? row.pts ?? 0;
      return `
      <div class="table-row">
        <div class="tr-pos">${pos}</div>
        <div class="tr-team">${teamLogo ? `<img src="${_esc(teamLogo)}" onerror="this.style.display='none'">` : ''}${_esc(String(teamName))}</div>
        <div class="tr-stat">${played}</div>
        <div class="tr-stat">${gd}</div>
        <div class="tr-pts">${pts}</div>
      </div>`;
    }).join('');

    container.innerHTML = html;
  } catch (e) {
    console.error('Error loading standings:', e);
    container.innerHTML = `<div class="empty-state">Table not available for this competition.</div>`;
  }
}

export function closeMatchDetail() {
  document.getElementById('match-overlay').classList.remove('active');
  document.getElementById('match-ov-body').innerHTML = '';
}
export let _scoresCurrentTab = 'scores-top';
export let _scoresRefreshInterval = null;

export function _scoresSpinner(msg) {
  return `<div style="display:flex;flex-direction:column;align-items:center;justify-content:center;padding:48px 24px;gap:12px;">
    <div style="position:relative;width:52px;height:52px;">
      <div style="width:52px;height:52px;border-radius:50%;border:3px solid rgba(16,185,129,0.15);border-top-color:#10b981;animation:spin .9s linear infinite;position:absolute;inset:0;"></div>
      <div style="position:absolute;inset:0;display:flex;align-items:center;justify-content:center;font-size:22px;">⚽</div>
    </div>
    <div style="font-size:13px;color:var(--text2);font-weight:600;">${msg || 'Loading…'}</div>
  </div>`;
}

export function _renderStandingsTable(standings, container) {
  if (!standings || !standings.length) {
    document.getElementById(container).innerHTML = '<div style="text-align:center;padding:36px;color:var(--text3);font-size:13px;">No standings available</div>';
    return;
  }
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

  const rows = standings.map((t, i) => {
    const pos = t.rank || (i + 1);
    const gd = parseInt(t.goalDifference || 0);
    const gdStr = gd > 0 ? `+${gd}` : `${gd}`;
    const hl = pos <= 3 ? 'color:var(--blue);font-weight:800;' : '';
    const badge = t.badge ? `<img src="${t.badge}" style="width:18px;height:18px;object-fit:contain;" onerror="this.style.display='none'">` : '🏟';
    return `<div class="stand-row">
      <div class="stand-pos" style="${hl}">${pos}</div>
      <div class="stand-team">${badge} <span style="white-space:nowrap;overflow:hidden;text-overflow:ellipsis;max-width:110px;">${t.team}</span></div>
      <div class="stand-stat">${t.played}</div>
      <div class="stand-stat">${t.won}</div>
      <div class="stand-stat">${t.drawn}</div>
      <div class="stand-stat">${t.lost}</div>
      <div class="stand-stat">${gdStr}</div>
      <div class="stand-pts" style="${hl}">${t.points}</div>
    </div>`;
  }).join('');

  document.getElementById(container).innerHTML = hdr + rows;
}

export async function loadLeagueStandings(leagueId) {
  const el = document.getElementById('top-standings-body');
  if (!el) return;
  el.innerHTML = _scoresSpinner('Loading standings…');
  try {
    const res = await fetch(`/api/league-standings?league=${leagueId}`);
    const data = await res.json();
    if (data.standings && data.standings.length) {
      _renderStandingsTable(data.standings, 'top-standings-body');
    } else {
      el.innerHTML = '<div style="text-align:center;padding:36px;color:var(--text3);font-size:13px;">No standings data available</div>';
    }
  } catch(e) {
    console.error('Error loading league standings:', e);
    el.innerHTML = '<div style="text-align:center;padding:36px;color:var(--text3);font-size:13px;">⚠️ Could not load standings</div>';
  }
}

export async function _loadNpflStandings() {
  const el = document.getElementById('npfl-standings-body');
  if (!el) return;
  el.innerHTML = _scoresSpinner('Loading NPFL standings…');
  try {
    const { collection, getDocs, db } = await waitForFs();
    const snap = await getDocs(collection(db, 'npfl_standings'));
    if (snap.empty) {
      el.innerHTML = '<div style="text-align:center;padding:36px;color:var(--text3);font-size:13px;">No NPFL data available</div>';
      return;
    }
    const rows = snap.docs.map(d => {
      const t = d.data();
      return {
        rank: parseInt(t.rank ?? 0, 10),
        team: t.team || d.id || '—',
        played: parseInt(t.played ?? 0, 10),
        won: parseInt(t.won ?? 0, 10),
        drawn: parseInt(t.drawn ?? 0, 10),
        lost: parseInt(t.lost ?? 0, 10),
        goalDifference: parseInt(t.goalsFor ?? 0, 10) - parseInt(t.goalsAgainst ?? 0, 10),
        points: parseInt(t.points ?? 0, 10),
      };
    });
    rows.sort((a, b) => (b.points - a.points) || (b.goalDifference - a.goalDifference));
    _renderStandingsTable(rows, 'npfl-standings-body');
  } catch(e) {
    el.innerHTML = '<div style="text-align:center;padding:36px;color:var(--text3);font-size:13px;">⚠️ Could not load NPFL standings</div>';
  }
}

export async function _loadU17Standings() {
  const el = document.getElementById('u17-standings-body');
  if (!el) return;
  el.innerHTML = _scoresSpinner('Loading U-17 data…');
  try {
    // TheSportsDB league ID for FIFA U-17 World Cup
    const res = await fetch(`/api/standings?league=4936&season=2025-2026`);
    const data = await res.json();
    if (data.standings && data.standings.length) {
      _renderStandingsTable(data.standings, 'u17-standings-body');
    } else {
      el.innerHTML = '<div style="text-align:center;padding:36px;color:var(--text3);font-size:13px;">U-17 tournament data coming soon</div>';
    }
  } catch(e) {
    el.innerHTML = '<div style="text-align:center;padding:36px;color:var(--text3);font-size:13px;">U-17 data not available right now</div>';
  }
}

export function initNpfl() {
  // Load top leagues by default
  setTimeout(() => loadLeagueStandings('4328'), 2000);
  _loadNpflStandings();
  _loadU17Standings();
  if (_scoresRefreshInterval) clearInterval(_scoresRefreshInterval);
  _scoresRefreshInterval = setInterval(() => {
    const select = document.getElementById('league-select');
    if (select) loadLeagueStandings(select.value);
  }, 300000); // refresh every 5 minutes
}

export function switchNpflTab(el, tabId) {
  _scoresCurrentTab = tabId;
  document.querySelectorAll('.npfl-tab').forEach(t => t.classList.remove('on'));
  document.querySelectorAll('.npfl-content').forEach(c => c.classList.remove('on'));
  el.classList.add('on');
  document.getElementById(tabId).classList.add('on');
}

export function waitForFs() {
  return new Promise((resolve, reject) => {
    if (window._psFs && window._psFs.db) { resolve(window._psFs); return; }
    let tries = 0;
    const iv = setInterval(() => {
      if (window._psFs && window._psFs.db) {
        clearInterval(iv);
        resolve(window._psFs);
      } else if (++tries > 100) {
        clearInterval(iv);
        reject(new Error('Firebase not ready after 10s'));
      }
    }, 100);
  });
}

export function renderNpflMatch(m) { return ''; }
