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
    // 📋 ENDPOINT: FIXTURES/MATCHES (Live scores)
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
        const transformed = data.map((match) => {
          // Parse Highlightly response structure
          const homeTeam = match.teams?.home || {};
          const awayTeam = match.teams?.away || {};
          const status = match.status?.description || 'Not Started';

          return {
            fixture: {
              id: String(match.id || match.fixture_id),
              date: match.starting_at || match.date,
              timestamp: new Date(match.starting_at || match.date).getTime() / 1000,
              timezone: 'UTC',
              status: {
                long: status,
                short: getStatusShort(status),
                elapsed: getElapsedMinutes(match.starting_at || match.date, status),
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
              country: match.league?.country?.code || 'XX',
              logo: match.league?.logo || '',
              flag: '',
              season: match.season?.year || new Date().getFullYear(),
              round: match.round || null,
            },
            teams: {
              home: {
                id: homeTeam.id || 0,
                name: homeTeam.name || 'Home',
                logo: homeTeam.logo_path || homeTeam.image_path || '⚽',
              },
              away: {
                id: awayTeam.id || 0,
                name: awayTeam.name || 'Away',
                logo: awayTeam.logo_path || awayTeam.image_path || '⚽',
              },
            },
            goals: {
              home: match.result?.home ?? match.goals?.home ?? null,
              away: match.result?.away ?? match.goals?.away ?? null,
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
            bookmakers: match.bookmakers || [],
            odds: match.odds || [],
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

    // ════════════════════════════════════════════════════════════════════════════
    // 📊 MATCH DETAILS BY ID
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

        const matchData = await matchResponse.json();

        if (!matchData) {
          console.error(`❌ Match not found: ${id}`);
          return res.status(404).json({ response: [] });
        }

        const homeTeam = matchData.teams?.home || {};
        const awayTeam = matchData.teams?.away || {};
        const status = matchData.status?.description || 'Not Started';

        const completeMatch = {
          fixture: {
            id: String(matchData.id),
            date: matchData.starting_at,
            timestamp: new Date(matchData.starting_at).getTime() / 1000,
            status: {
              long: status,
              short: getStatusShort(status),
              elapsed: getElapsedMinutes(matchData.starting_at, status),
            },
            venue: {
              id: matchData.venue?.id || null,
              name: matchData.venue?.name || 'TBD',
              city: matchData.venue?.city || '',
            },
          },
          league: {
            id: matchData.league?.id || 0,
            name: matchData.league?.name || 'Unknown',
            country: matchData.league?.country?.code || 'XX',
            season: matchData.season?.year || new Date().getFullYear(),
          },
          teams: {
            home: {
              id: homeTeam.id || 0,
              name: homeTeam.name || 'Home',
              logo: homeTeam.logo_path || homeTeam.image_path || '⚽',
            },
            away: {
              id: awayTeam.id || 0,
              name: awayTeam.name || 'Away',
              logo: awayTeam.logo_path || awayTeam.image_path || '⚽',
            },
          },
          goals: {
            home: matchData.result?.home ?? matchData.goals?.home ?? null,
            away: matchData.result?.away ?? matchData.goals?.away ?? null,
          },
          score: {
            halftime: {
              home: matchData.result_period?.first_half?.home ?? null,
              away: matchData.result_period?.first_half?.away ?? null,
            },
            fulltime: {
              home: matchData.result?.home ?? null,
              away: matchData.result?.away ?? null,
            },
          },
          statistics: matchData.statistics || [],
          lineups: matchData.lineups || [],
          events: matchData.events || [],
          bookmakers: matchData.bookmakers || [],
          odds: matchData.odds || [],
          h2h: matchData.head_to_head || [],
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
