/**
 * 🎯 PITCHSIDE FOOTBALL API - HIGHLIGHTLY INTEGRATION (CORRECTED)
 * Base URL: https://soccer.highlightly.net
 * Auth: x-rapidapi-key header
 */

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();

  const HIGHLIGHTLY_API_KEY = process.env.HIGHLIGHTLY_API_KEY_DIRECT;
  // CORRECT base URL from Highlightly docs
  const BASE_URL = 'https://soccer.highlightly.net';

  if (!HIGHLIGHTLY_API_KEY) {
    console.error('❌ Highlightly API key not found');
    return res.status(500).json({ error: 'Highlightly API key not configured', errors: {} });
  }

  try {
    const { endpoint, date, id } = req.query;

    // ════════════════════════════════════════════════════════════════════════════
    // 📊 MATCH DETAILS BY ID — must be checked BEFORE the generic list block,
    // otherwise endpoint==='fixtures' always matches first and id is ignored.
    // ════════════════════════════════════════════════════════════════════════════
    if (endpoint === 'fixtures' && id) {
      console.log(`[Highlightly] Fetching match ${id}`);

      try {
        const matchResponse = await fetch(`${BASE_URL}/matches/${id}`, {
          headers: {
            'x-rapidapi-key': HIGHLIGHTLY_API_KEY,
            'x-rapidapi-host': 'soccer.highlightly.net',
            'Content-Type': 'application/json',
          },
        });

        if (!matchResponse.ok) {
          console.error(`❌ Match details error: ${matchResponse.status}`);
          return res.status(matchResponse.status).json({ response: [] });
        }

        const rawMatchData = await matchResponse.json();
        const matchData = Array.isArray(rawMatchData) ? rawMatchData[0] : rawMatchData;

        if (!matchData) {
          console.error(`❌ Match not found: ${id}`);
          return res.status(404).json({ response: [] });
        }

        const homeTeam = matchData.homeTeam || {};
        const awayTeam = matchData.awayTeam || {};
        const status = matchData.state?.description || 'Not started';

        let homeGoals = null;
        let awayGoals = null;
        const scoreStr = matchData.state?.score?.current;
        if (scoreStr && typeof scoreStr === 'string') {
          const parts = scoreStr.split('-').map((p) => p.trim());
          if (parts.length === 2 && !isNaN(parts[0]) && !isNaN(parts[1])) {
            homeGoals = parseInt(parts[0], 10);
            awayGoals = parseInt(parts[1], 10);
          }
        }

        const completeMatch = {
          fixture: {
            id: String(matchData.id),
            date: matchData.date,
            timestamp: new Date(matchData.date).getTime() / 1000,
            status: {
              long: status,
              short: getStatusShort(status),
              elapsed: matchData.state?.clock ?? null,
            },
            venue: {
              name: matchData.venue?.name || 'TBD',
              city: matchData.venue?.city || '',
            },
            referee: matchData.referee?.name || null,
          },
          league: {
            id: matchData.league?.id || 0,
            name: matchData.league?.name || 'Unknown',
            country: matchData.country?.name || matchData.country?.code || 'XX',
            season: matchData.league?.season || new Date().getFullYear(),
          },
          teams: {
            home: {
              id: homeTeam.id || 0,
              name: homeTeam.name || 'Home',
              logo: homeTeam.logo || '⚽',
            },
            away: {
              id: awayTeam.id || 0,
              name: awayTeam.name || 'Away',
              logo: awayTeam.logo || '⚽',
            },
          },
          goals: {
            home: homeGoals,
            away: awayGoals,
          },
          score: {
            halftime: { home: null, away: null },
            fulltime: { home: homeGoals, away: awayGoals },
          },
          statistics: matchData.statistics || [],
          lineups: [],
          events: matchData.events || [],
          bookmakers: [],
          odds: [],
          h2h: [],
          predictions: matchData.predictions || null,
          news: matchData.news || [],
          forecast: matchData.forecast || null,
        };

        return res.status(200).json({ response: [completeMatch] });
      } catch (error) {
        console.error('❌ Match details error:', error.message);
        return res.status(500).json({
          errors: { api: error.message },
          response: [],
        });
      }
    }

    // ════════════════════════════════════════════════════════════════════════════
    // 👤 PLAYERS — search by name, or fetch one player's profile/stats by id
    // ════════════════════════════════════════════════════════════════════════════
    if (endpoint === 'players') {
      const { search } = req.query;

      // ── Search by name ──
      if (search) {
        console.log(`[Highlightly] Searching players: ${search}`);
        try {
          const url = `${BASE_URL}/players?name=${encodeURIComponent(search)}&limit=10`;
          const r = await fetch(url, {
            headers: {
              'x-rapidapi-key': HIGHLIGHTLY_API_KEY,
              'x-rapidapi-host': 'soccer.highlightly.net',
            },
          });
          if (!r.ok) {
            console.error(`❌ Player search error: ${r.status}`);
            return res.status(r.status).json({ response: [] });
          }
          const raw = await r.json();
          const list = Array.isArray(raw) ? raw : (raw?.data || []);
          const transformed = list.map((p) => ({
            player: {
              id: p.id,
              firstname: p.firstName || (p.name || '').split(' ')[0] || '',
              lastname: p.lastName || (p.name || '').split(' ').slice(1).join(' ') || '',
              photo: p.image || p.photo || '',
              nationality: p.nationality || p.country?.name || '—',
              age: p.age || null,
              position: p.position || '—',
            },
            statistics: [{
              team: { name: p.club?.name || p.team?.name || '—', logo: p.club?.logo || p.team?.logo || '' },
              games: { position: p.position || '—', appearences: null, rating: null },
              goals: { total: null, assists: null },
            }],
          }));
          return res.status(200).json({ response: transformed });
        } catch (error) {
          console.error('❌ Player search error:', error.message);
          return res.status(500).json({ errors: { api: error.message }, response: [] });
        }
      }

      // ── Single player profile by id ──
      if (id) {
        console.log(`[Highlightly] Fetching player ${id}`);
        try {
          const r = await fetch(`${BASE_URL}/players/${id}`, {
            headers: {
              'x-rapidapi-key': HIGHLIGHTLY_API_KEY,
              'x-rapidapi-host': 'soccer.highlightly.net',
            },
          });
          if (!r.ok) return res.status(r.status).json({ response: [] });
          const p = await r.json();
          const pd = p.data || p;
          return res.status(200).json({
            response: [{
              player: {
                id,
                firstname: pd.firstName || (pd.name || '').split(' ')[0] || '',
                lastname: pd.lastName || (pd.name || '').split(' ').slice(1).join(' ') || '',
                photo: pd.image || pd.photo || '',
                nationality: pd.nationality || pd.country?.name || '—',
                age: pd.age || null,
                height: pd.height || '',
                position: pd.position || '—',
              },
            }],
          });
        } catch (error) {
          console.error('❌ Player profile error:', error.message);
          return res.status(500).json({ errors: { api: error.message }, response: [] });
        }
      }

      return res.status(400).json({ error: 'players endpoint needs search= or id=' });
    }

    // ════════════════════════════════════════════════════════════════════════════
    // 📈 PLAYER SEASON STATISTICS
    // ════════════════════════════════════════════════════════════════════════════
    if (endpoint === 'player-stats' && id) {
      console.log(`[Highlightly] Fetching stats for player ${id}`);
      try {
        const r = await fetch(`${BASE_URL}/players/${id}/statistics`, {
          headers: {
            'x-rapidapi-key': HIGHLIGHTLY_API_KEY,
            'x-rapidapi-host': 'soccer.highlightly.net',
          },
        });
        if (!r.ok) return res.status(r.status).json({ response: [] });
        const raw = await r.json();
        const seasons = raw.data || raw.statistics || raw || [];
        return res.status(200).json({ response: Array.isArray(seasons) ? seasons : [seasons] });
      } catch (error) {
        console.error('❌ Player stats error:', error.message);
        return res.status(500).json({ errors: { api: error.message }, response: [] });
      }
    }

    // ════════════════════════════════════════════════════════════════════════════
    // 📊 MATCH STATISTICS (possession, shots, corners, fouls, cards etc.)
    // ════════════════════════════════════════════════════════════════════════════
    if (endpoint === 'match-statistics' && id) {
      console.log(`[Highlightly] Fetching statistics for match ${id}`);
      try {
        const r = await fetch(`${BASE_URL}/statistics/${id}`, {
          headers: {
            'x-rapidapi-key': HIGHLIGHTLY_API_KEY,
            'x-rapidapi-host': 'soccer.highlightly.net',
          },
        });
        if (!r.ok) return res.status(r.status).json({ response: [] });
        const raw = await r.json();
        const teams = raw.data || raw || [];
        // Transformed into the [{team, statistics:[{type,value}]}, ...] shape
        // generateStatsHTML() already expects — same convention as fixtures.
        const transformed = (Array.isArray(teams) ? teams : []).map((t) => ({
          team: { id: t.team?.id || t.teamId, name: t.team?.name || t.name || '—' },
          statistics: (t.statistics || t.stats || []).map((s) => ({
            type: s.name || s.type || s.displayName || 'Stat',
            value: s.value ?? s.total ?? 0,
          })),
        }));
        return res.status(200).json({ response: transformed });
      } catch (error) {
        console.error('❌ Match statistics error:', error.message);
        return res.status(500).json({ errors: { api: error.message }, response: [] });
      }
    }

    // ════════════════════════════════════════════════════════════════════════════
    // 👥 LINEUPS — confirmed starting XI, formations, bench, subs
    // ════════════════════════════════════════════════════════════════════════════
    if (endpoint === 'lineups' && id) {
      console.log(`[Highlightly] Fetching lineups for match ${id}`);
      try {
        const r = await fetch(`${BASE_URL}/lineups/${id}`, {
          headers: {
            'x-rapidapi-key': HIGHLIGHTLY_API_KEY,
            'x-rapidapi-host': 'soccer.highlightly.net',
          },
        });
        if (!r.ok) return res.status(r.status).json({ response: [] });
        const raw = await r.json();
        const teams = raw.data || raw || [];
        // Transformed into the shape generateLineupsHTML() expects:
        // { team, formation, startXI:[{player:{number,name,pos}}], substitutes:[...], coach:{name} }
        const mapPlayer = (p) => ({
          player: {
            number: p.number ?? p.shirtNumber ?? '',
            name: p.name || p.playerName || 'Unknown',
            pos: p.position || p.pos || '',
          },
        });
        const transformed = (Array.isArray(teams) ? teams : []).map((t) => ({
          team: { id: t.team?.id || t.teamId, name: t.team?.name || t.name || '—' },
          formation: t.formation || 'N/A',
          startXI: (t.startXI || t.starters || []).map(mapPlayer),
          substitutes: (t.substitutes || t.bench || []).map(mapPlayer),
          coach: { name: t.coach?.name || t.manager?.name || 'Unknown' },
        }));
        return res.status(200).json({ response: transformed });
      } catch (error) {
        console.error('❌ Lineups error:', error.message);
        return res.status(500).json({ errors: { api: error.message }, response: [] });
      }
    }

    // ════════════════════════════════════════════════════════════════════════════
    // 🎯 PLAYER BOX SCORES — the Google-style "38 mins, 4 shots, 0 goals" per player
    // ════════════════════════════════════════════════════════════════════════════
    if (endpoint === 'match-boxscore' && id) {
      console.log(`[Highlightly] Fetching player box scores for match ${id}`);
      try {
        const r = await fetch(`${BASE_URL}/players-statistics/${id}`, {
          headers: {
            'x-rapidapi-key': HIGHLIGHTLY_API_KEY,
            'x-rapidapi-host': 'soccer.highlightly.net',
          },
        });
        if (!r.ok) return res.status(r.status).json({ response: [] });
        const raw = await r.json();
        return res.status(200).json({ response: raw.data || raw || [] });
      } catch (error) {
        console.error('❌ Box score error:', error.message);
        return res.status(500).json({ errors: { api: error.message }, response: [] });
      }
    }

    // ════════════════════════════════════════════════════════════════════════════
    // 🔮 PREDICTIONS — win probabilities, form-based forecast
    // ════════════════════════════════════════════════════════════════════════════
    if (endpoint === 'predictions' && id) {
      console.log(`[Highlightly] Fetching predictions for match ${id}`);
      try {
        const r = await fetch(`${BASE_URL}/predictions/${id}`, {
          headers: {
            'x-rapidapi-key': HIGHLIGHTLY_API_KEY,
            'x-rapidapi-host': 'soccer.highlightly.net',
          },
        });
        if (!r.ok) return res.status(r.status).json({ response: [] });
        const raw = await r.json();
        return res.status(200).json({ response: raw.data || raw || [] });
      } catch (error) {
        console.error('❌ Predictions error:', error.message);
        return res.status(500).json({ errors: { api: error.message }, response: [] });
      }
    }

    // ════════════════════════════════════════════════════════════════════════════
    // 💰 ODDS — paid tier only. Until upgraded, Highlightly returns a plan
    // restriction response here, which we pass through cleanly as empty —
    // the frontend already shows "No odds available" for that case.
    // ════════════════════════════════════════════════════════════════════════════
    if (endpoint === 'odds' && id) {
      console.log(`[Highlightly] Fetching odds for match ${id}`);
      try {
        const r = await fetch(`${BASE_URL}/odds?matchId=${id}&oddsType=prematch`, {
          headers: {
            'x-rapidapi-key': HIGHLIGHTLY_API_KEY,
            'x-rapidapi-host': 'soccer.highlightly.net',
          },
        });
        if (!r.ok) {
          // Expected on free tier until the paid plan is active — not a real error.
          console.log(`[Highlightly] Odds not available yet (${r.status}) — likely still on free tier`);
          return res.status(200).json({ response: [] });
        }
        const raw = await r.json();
        const list = raw.data || raw || [];
        // Transformed into the [{name, odds:{home_win,draw,away_win}}] shape
        // renderBookmakers() already expects.
        const transformed = (Array.isArray(list) ? list : []).map((b) => ({
          name: b.bookmaker?.name || b.name || 'Bookmaker',
          odds: {
            home_win: b.markets?.find(m => m.name === '1X2')?.selections?.find(s => s.name === 'Home')?.odds
                      ?? b.homeOdds ?? null,
            draw: b.markets?.find(m => m.name === '1X2')?.selections?.find(s => s.name === 'Draw')?.odds
                  ?? b.drawOdds ?? null,
            away_win: b.markets?.find(m => m.name === '1X2')?.selections?.find(s => s.name === 'Away')?.odds
                      ?? b.awayOdds ?? null,
          },
        }));
        return res.status(200).json({ response: transformed });
      } catch (error) {
        console.error('❌ Odds error:', error.message);
        return res.status(200).json({ response: [] }); // degrade quietly, odds are non-critical
      }
    }

    // ════════════════════════════════════════════════════════════════════════════
    // 📈 HEAD-TO-HEAD — needs two team IDs, not a match ID. Works on free tier.
    // ════════════════════════════════════════════════════════════════════════════
    if (endpoint === 'h2h') {
      const { teamIdOne, teamIdTwo } = req.query;
      if (!teamIdOne || !teamIdTwo) {
        return res.status(400).json({ error: 'h2h needs teamIdOne and teamIdTwo', response: [] });
      }
      console.log(`[Highlightly] Fetching H2H: ${teamIdOne} vs ${teamIdTwo}`);
      try {
        const r = await fetch(`${BASE_URL}/head-2-head?teamIdOne=${teamIdOne}&teamIdTwo=${teamIdTwo}`, {
          headers: {
            'x-rapidapi-key': HIGHLIGHTLY_API_KEY,
            'x-rapidapi-host': 'soccer.highlightly.net',
          },
        });
        if (!r.ok) return res.status(200).json({ response: [] });
        const raw = await r.json();
        const matches = raw.data || raw || [];
        // Transformed into the shape renderH2H() expects
        const transformed = (Array.isArray(matches) ? matches : []).map((m) => {
          const homeTeam = m.homeTeam || {};
          const awayTeam = m.awayTeam || {};
          const scoreStr = m.state?.score?.current || '';
          const parts = scoreStr.split('-').map(p => p.trim());
          const homeGoals = parts[0] && !isNaN(parts[0]) ? parseInt(parts[0], 10) : null;
          const awayGoals = parts[1] && !isNaN(parts[1]) ? parseInt(parts[1], 10) : null;
          return {
            teams: { home: { name: homeTeam.name || 'Home' }, away: { name: awayTeam.name || 'Away' } },
            goals: { home: homeGoals, away: awayGoals },
          };
        });
        return res.status(200).json({ response: transformed });
      } catch (error) {
        console.error('❌ H2H error:', error.message);
        return res.status(200).json({ response: [] });
      }
    }

    // ════════════════════════════════════════════════════════════════════════════
    // 🕐 RECENT MATCH — a player's most recent finished game + their box score
    //    line from it (the "38 mins, 4 shots, 0 goals" Google-style summary)
    // ════════════════════════════════════════════════════════════════════════════
    if (endpoint === 'recent-match') {
      const { teamId, playerId } = req.query;
      if (!teamId) return res.status(400).json({ error: 'recent-match needs teamId', response: null });

      console.log(`[Highlightly] Fetching recent match for team ${teamId}`);
      try {
        const r = await fetch(`${BASE_URL}/last-five-games?teamId=${teamId}`, {
          headers: {
            'x-rapidapi-key': HIGHLIGHTLY_API_KEY,
            'x-rapidapi-host': 'soccer.highlightly.net',
          },
        });
        if (!r.ok) return res.status(200).json({ response: null });
        const raw = await r.json();
        const games = raw.data || raw || [];
        if (!Array.isArray(games) || !games.length) return res.status(200).json({ response: null });

        // Most recent = first entry (API returns newest-first per docs)
        const recent = games[0];
        const matchId = recent.id || recent.matchId;

        let playerLine = null;
        if (playerId && matchId) {
          try {
            const bsRes = await fetch(`${BASE_URL}/players-statistics/${matchId}`, {
              headers: {
                'x-rapidapi-key': HIGHLIGHTLY_API_KEY,
                'x-rapidapi-host': 'soccer.highlightly.net',
              },
            });
            if (bsRes.ok) {
              const bsRaw = await bsRes.json();
              const teams = bsRaw.data || bsRaw || [];
              // Search both team's boxscores for this player
              for (const t of (Array.isArray(teams) ? teams : [])) {
                const found = (t.boxScores || t.players || []).find(
                  (p) => String(p.playerId || p.id) === String(playerId)
                );
                if (found) { playerLine = found; break; }
              }
            }
          } catch (e) {
            console.warn('[Highlightly] box score lookup for recent match failed:', e.message);
          }
        }

        return res.status(200).json({
          response: {
            matchId,
            date: recent.date || recent.kickoff || null,
            home: { name: recent.homeTeam?.name || 'Home', logo: recent.homeTeam?.logo || '' },
            away: { name: recent.awayTeam?.name || 'Away', logo: recent.awayTeam?.logo || '' },
            score: recent.state?.score?.current || `${recent.homeGoals ?? '-'} - ${recent.awayGoals ?? '-'}`,
            status: recent.state?.description || 'Full-time',
            playerLine, // null if we don't have a playerId or couldn't find them in the box score
          },
        });
      } catch (error) {
        console.error('❌ Recent match error:', error.message);
        return res.status(200).json({ response: null });
      }
    }

    // ════════════════════════════════════════════════════════════════════════════
    // 📋 ENDPOINT: FIXTURES/MATCHES (Live scores list — only when no id given)
    // ════════════════════════════════════════════════════════════════════════════
    if (endpoint === 'fixtures') {
      const fetchDate = date || new Date().toISOString().split('T')[0];
      console.log(`[Highlightly] Fetching fixtures for: ${fetchDate}`);

      try {
        // CORRECT endpoint, auth header, and timezone param (fixes UTC date-window mismatch)
        const url = `${BASE_URL}/matches?date=${fetchDate}&timezone=Africa/Lagos`;
        console.log(`[Highlightly] URL: ${url}`);

        const response = await fetch(url, {
          method: 'GET',
          headers: {
            'x-rapidapi-key': HIGHLIGHTLY_API_KEY,
            'x-rapidapi-host': 'soccer.highlightly.net',
            'Content-Type': 'application/json',
          },
          timeout: 15000,
        });

        console.log(`[Highlightly] Response status: ${response.status}`);

        if (!response.ok) {
          const errorText = await response.text();
          console.error(`❌ Highlightly error: ${response.status}`);
          console.error('Response:', errorText);
          return res.status(response.status).json({
            errors: { api: `Highlightly returned ${response.status}` },
            response: [],
          });
        }

        const rawResponse = await response.json();
        // Highlightly wraps results in a "data" envelope: { data: [...], pagination: {...}, plan: {...} }
        const data = Array.isArray(rawResponse) ? rawResponse : (rawResponse?.data || []);
        console.log(`✅ Got ${data.length} matches from Highlightly`);
        if (rawResponse?.plan) {
          console.log(`[Highlightly] Plan tier: ${rawResponse.plan.tier} - ${rawResponse.plan.message || ''}`);
        }

        if (!data || data.length === 0) {
          console.log('No matches returned for this date/timezone');
          return res.status(200).json({ response: [] });
        }

        // Transform Highlightly response to API-Football format
        // REAL Highlightly match fields: id, round, date, country, homeTeam, awayTeam, league, state{description, clock, score{current}}
        const transformed = data.map((match) => {
          const homeTeam = match.homeTeam || {};
          const awayTeam = match.awayTeam || {};
          const status = match.state?.description || 'Not started';

          // score.current comes as a string like "3 - 1" — must be parsed
          let homeGoals = null;
          let awayGoals = null;
          const scoreStr = match.state?.score?.current;
          if (scoreStr && typeof scoreStr === 'string') {
            const parts = scoreStr.split('-').map((p) => p.trim());
            if (parts.length === 2 && !isNaN(parts[0]) && !isNaN(parts[1])) {
              homeGoals = parseInt(parts[0], 10);
              awayGoals = parseInt(parts[1], 10);
            }
          }

          return {
            fixture: {
              id: String(match.id),
              date: match.date,
              timestamp: new Date(match.date).getTime() / 1000,
              timezone: 'UTC',
              status: {
                long: status,
                short: getStatusShort(status),
                elapsed: match.state?.clock ?? null,
              },
              venue: {
                name: 'TBD',
                city: '',
              },
              referee: null,
            },
            league: {
              id: match.league?.id || 0,
              name: match.league?.name || 'Unknown',
              country: match.country?.name || match.country?.code || 'XX',
              logo: match.league?.logo || '',
              flag: match.country?.logo || '',
              season: match.league?.season || new Date().getFullYear(),
              round: match.round || null,
            },
            teams: {
              home: {
                id: homeTeam.id || 0,
                name: homeTeam.name || 'Home',
                logo: homeTeam.logo || '⚽',
              },
              away: {
                id: awayTeam.id || 0,
                name: awayTeam.name || 'Away',
                logo: awayTeam.logo || '⚽',
              },
            },
            goals: {
              home: homeGoals,
              away: awayGoals,
            },
            score: {
              halftime: { home: null, away: null },
              fulltime: { home: homeGoals, away: awayGoals },
              extratime: { home: null, away: null },
              penalty: { home: null, away: null },
            },
            statistics: [],
            lineups: [],
            events: [],
            bookmakers: [],
            odds: [],
          };
        });

        return res.status(200).json({ response: transformed });
      } catch (error) {
        console.error('❌ Fixtures fetch error:', error.message);
        return res.status(500).json({
          errors: { api: error.message },
          response: [],
        });
      }
    }


    res.status(400).json({ error: 'Invalid endpoint' });
  } catch (error) {
    console.error('❌ Handler error:', error);
    res.status(500).json({ error: error.message });
  }
}

// ════════════════════════════════════════════════════════════════════════════
// HELPERS
// ════════════════════════════════════════════════════════════════════════════

function getStatusShort(statusDescription) {
  if (!statusDescription) return 'NS';
  const desc = statusDescription.toLowerCase();
  if (desc.includes('finished') || desc.includes('ended')) return 'FT';
  if (desc.includes('halftime') || desc.includes('half-time')) return 'HT';
  if (
    desc.includes('live') ||
    desc.includes('playing') ||
    desc.includes('progress') ||
    desc.includes('in progress')
  )
    return 'LIVE';
  if (desc.includes('postponed')) return 'PST';
  if (desc.includes('cancelled') || desc.includes('canceled')) return 'CANC';
  return 'NS';
}

function getElapsedMinutes(startTime, status) {
  if (!status) return null;
  const desc = status.toLowerCase();
  if (!desc.includes('live') && !desc.includes('playing') && !desc.includes('progress'))
    return null;

  try {
    const start = new Date(startTime).getTime();
    const now = Date.now();
    return Math.floor((now - start) / 60000);
  } catch (e) {
    return null;
  }
}
