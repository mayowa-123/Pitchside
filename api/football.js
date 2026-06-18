/**
 * 🎯 PITCHSIDE FOOTBALL API - HIGHLIGHTLY INTEGRATION
 * Replaces: /api/football
 * Returns: Live scores + Match details (lineups, stats, bookmakers, etc.)
 */

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();

  const HIGHLIGHTLY_API_KEY = process.env.HIGHLIGHTLY_API_KEY_DIRECT;
  const BASE_URL = 'https://soccer.highlightly.net';

  if (!HIGHLIGHTLY_API_KEY) {
    return res.status(500).json({ error: 'Highlightly API key not configured' });
  }

  try {
    const { endpoint, date, id, live } = req.query;

    // ════════════════════════════════════════════════════════════════════════════
    // 📋 ENDPOINT: FIXTURES (Live scores list)
    // ════════════════════════════════════════════════════════════════════════════
    if (endpoint === 'fixtures') {
      const fetchDate = date || new Date().toISOString().split('T')[0];

      try {
        // Fetch matches for the given date
        const response = await fetch(
          `${BASE_URL}/matches?date=${fetchDate}&timezone=Etc/UTC&limit=100`,
          {
            headers: { 'X-RapidAPI-Key': HIGHLIGHTLY_API_KEY },
            timeout: 15000,
          }
        );

        if (!response.ok) {
          return res.status(response.status).json({
            errors: { api: `Highlightly API returned ${response.status}` },
            response: [],
          });
        }

        const data = await response.json();

        if (!data.data || !Array.isArray(data.data)) {
          return res.status(200).json({ response: [] });
        }

        // Transform Highlightly matches to API-Football format
        const transformed = data.data.map((match) => ({
          fixture: {
            id: match.id,
            date: match.starting_at,
            timestamp: new Date(match.starting_at).getTime() / 1000,
            timezone: 'UTC',
            status: {
              long: match.state?.description || 'Not Started',
              short: getStatusShort(match.state?.description),
              elapsed: getElapsedMinutes(match.starting_at, match.state?.description),
            },
            venue: {
              id: match.venue?.id || null,
              name: match.venue?.name || 'TBD',
              city: match.venue?.city || '',
              surface: null,
            },
            referee: null,
          },
          league: {
            id: match.league?.id || 0,
            name: match.league?.name || 'Unknown League',
            country: match.league?.country?.code || '',
            logo: match.league?.image_path || '',
            flag: '',
            season: match.season?.year || new Date().getFullYear(),
            round: null,
          },
          teams: {
            home: {
              id: match.home_team?.id || 0,
              name: match.home_team?.name || 'Home',
              logo: match.home_team?.image_path || '⚽',
            },
            away: {
              id: match.away_team?.id || 0,
              name: match.away_team?.name || 'Away',
              logo: match.away_team?.image_path || '⚽',
            },
          },
          goals: {
            home: match.result?.home ?? null,
            away: match.result?.away ?? null,
          },
          score: {
            halftime: {
              home: match.result_period?.first_half?.home ?? null,
              away: match.result_period?.first_half?.away ?? null,
            },
            fulltime: {
              home: match.result?.home ?? null,
              away: match.result?.away ?? null,
            },
            extratime: { home: null, away: null },
            penalty: { home: null, away: null },
          },
          statistics: [],
          lineups: [],
          events: [],
          // Store original match ID for fetching details
          _matchId: match.id,
        }));

        return res.status(200).json({ response: transformed });
      } catch (error) {
        console.error('Highlightly fixtures error:', error);
        return res.status(500).json({
          errors: { api: error.message },
          response: [],
        });
      }
    }

    // ════════════════════════════════════════════════════════════════════════════
    // 📊 ENDPOINT: MATCH DETAILS (By ID)
    // ════════════════════════════════════════════════════════════════════════════
    if (endpoint === 'fixtures' && id) {
      try {
        // Fetch single match details from Highlightly
        const matchResponse = await fetch(`${BASE_URL}/matches/${id}`, {
          headers: { 'X-RapidAPI-Key': HIGHLIGHTLY_API_KEY },
        });

        if (!matchResponse.ok) {
          return res.status(matchResponse.status).json({ response: [] });
        }

        const matchData = await matchResponse.json();
        const match = matchData.data;

        if (!match) {
          return res.status(404).json({ response: [] });
        }

        // Fetch LINEUPS for this match
        let lineups = [];
        try {
          const lineupsResponse = await fetch(
            `${BASE_URL}/matches/${id}/lineups`,
            { headers: { 'X-RapidAPI-Key': HIGHLIGHTLY_API_KEY } }
          );
          if (lineupsResponse.ok) {
            const lineupsData = await lineupsResponse.json();
            lineups = transformLineups(lineupsData.data) || [];
          }
        } catch (e) {
          console.warn('Lineups fetch error:', e.message);
        }

        // Fetch EVENTS (goals, cards, subs)
        let events = [];
        try {
          const eventsResponse = await fetch(
            `${BASE_URL}/matches/${id}/events`,
            { headers: { 'X-RapidAPI-Key': HIGHLIGHTLY_API_KEY } }
          );
          if (eventsResponse.ok) {
            const eventsData = await eventsResponse.json();
            events = transformEvents(eventsData.data) || [];
          }
        } catch (e) {
          console.warn('Events fetch error:', e.message);
        }

        // Fetch STATISTICS
        let statistics = [];
        try {
          const statsResponse = await fetch(
            `${BASE_URL}/matches/${id}/statistics`,
            { headers: { 'X-RapidAPI-Key': HIGHLIGHTLY_API_KEY } }
          );
          if (statsResponse.ok) {
            const statsData = await statsResponse.json();
            statistics = transformStatistics(statsData.data) || [];
          }
        } catch (e) {
          console.warn('Statistics fetch error:', e.message);
        }

        // Fetch BOOKMAKERS/ODDS
        let bookmakers = [];
        try {
          const booksResponse = await fetch(
            `${BASE_URL}/matches/${id}/bookmakers`,
            { headers: { 'X-RapidAPI-Key': HIGHLIGHTLY_API_KEY } }
          );
          if (booksResponse.ok) {
            const booksData = await booksResponse.json();
            bookmakers = booksData.data || [];
          }
        } catch (e) {
          console.warn('Bookmakers fetch error:', e.message);
        }

        // Fetch HEAD-TO-HEAD
        let h2h = [];
        try {
          const h2hResponse = await fetch(
            `${BASE_URL}/fixtures/head-to-head?teamIdOne=${match.home_team?.id}&teamIdTwo=${match.away_team?.id}&limit=10`,
            { headers: { 'X-RapidAPI-Key': HIGHLIGHTLY_API_KEY } }
          );
          if (h2hResponse.ok) {
            const h2hData = await h2hResponse.json();
            h2h = h2hData.data || [];
          }
        } catch (e) {
          console.warn('H2H fetch error:', e.message);
        }

        // Build complete match detail response
        const completeMatch = {
          fixture: {
            id: match.id,
            date: match.starting_at,
            timestamp: new Date(match.starting_at).getTime() / 1000,
            status: {
              long: match.state?.description || 'Not Started',
              short: getStatusShort(match.state?.description),
              elapsed: getElapsedMinutes(match.starting_at, match.state?.description),
            },
            venue: {
              id: match.venue?.id || null,
              name: match.venue?.name || 'TBD',
              city: match.venue?.city || '',
            },
            referee: null,
          },
          league: {
            id: match.league?.id || 0,
            name: match.league?.name || 'Unknown',
            country: match.league?.country?.code || '',
            season: match.season?.year || new Date().getFullYear(),
          },
          teams: {
            home: {
              id: match.home_team?.id || 0,
              name: match.home_team?.name || 'Home',
              logo: match.home_team?.image_path || '⚽',
            },
            away: {
              id: match.away_team?.id || 0,
              name: match.away_team?.name || 'Away',
              logo: match.away_team?.image_path || '⚽',
            },
          },
          goals: {
            home: match.result?.home ?? null,
            away: match.result?.away ?? null,
          },
          score: {
            halftime: {
              home: match.result_period?.first_half?.home ?? null,
              away: match.result_period?.first_half?.away ?? null,
            },
            fulltime: {
              home: match.result?.home ?? null,
              away: match.result?.away ?? null,
            },
          },
          statistics,
          lineups,
          events,
          bookmakers, // NEW: Odds and betting
          h2h, // NEW: Head-to-head history
        };

        return res.status(200).json({ response: [completeMatch] });
      } catch (error) {
        console.error('Match details error:', error);
        return res.status(500).json({
          errors: { api: error.message },
          response: [],
        });
      }
    }

    res.status(400).json({ error: 'Invalid endpoint' });
  } catch (error) {
    console.error('Handler error:', error);
    res.status(500).json({ error: error.message });
  }
}

// ════════════════════════════════════════════════════════════════════════════
// HELPER FUNCTIONS
// ════════════════════════════════════════════════════════════════════════════

function getStatusShort(statusDescription) {
  if (!statusDescription) return 'NS';
  const desc = statusDescription.toLowerCase();
  if (desc.includes('finished') || desc.includes('ended')) return 'FT';
  if (desc.includes('halftime')) return 'HT';
  if (desc.includes('live') || desc.includes('playing') || desc.includes('progress'))
    return 'LIVE';
  if (desc.includes('postponed')) return 'PST';
  if (desc.includes('cancelled')) return 'CANC';
  return 'NS';
}

function getElapsedMinutes(startTime, status) {
  if (!status) return null;
  const desc = status.toLowerCase();
  if (!desc.includes('live') && !desc.includes('playing')) return null;
  const start = new Date(startTime).getTime();
  const now = Date.now();
  return Math.floor((now - start) / 60000);
}

function transformLineups(lineupsData) {
  if (!lineupsData || !Array.isArray(lineupsData)) return [];
  return lineupsData.map((team) => ({
    team: {
      id: team.team?.id,
      name: team.team?.name,
      logo: team.team?.image_path,
    },
    formation: team.formation || 'Unknown',
    startXI: (team.starting_lineup || []).map((p) => ({
      player: {
        id: p.player?.id,
        name: p.player?.name,
        number: p.shirt_number,
        pos: p.player_position || 'Unknown',
      },
    })),
    substitutes: (team.substitutes || []).map((p) => ({
      player: {
        id: p.player?.id,
        name: p.player?.name,
        number: p.shirt_number,
        pos: p.player_position || 'Sub',
      },
    })),
  }));
}

function transformEvents(eventsData) {
  if (!eventsData || !Array.isArray(eventsData)) return [];
  return eventsData.map((event) => ({
    type: event.type?.toLowerCase() || 'other',
    detail: event.detail?.toLowerCase() || '',
    minute: event.minute || 0,
    team: {
      id: event.team?.id,
      name: event.team?.name,
    },
    player: event.player?.name || 'Unknown',
    assist: event.related_player?.name || null,
    comments: event.comments || null,
  }));
}

function transformStatistics(statsData) {
  if (!statsData || !Array.isArray(statsData)) return [];
  return statsData.map((team) => ({
    team: {
      id: team.team?.id,
      name: team.team?.name,
      logo: team.team?.image_path,
    },
    statistics: (team.statistics || []).map((stat) => ({
      type: stat.type || 'Unknown',
      value: stat.value,
    })),
  }));
}
