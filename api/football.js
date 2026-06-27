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
