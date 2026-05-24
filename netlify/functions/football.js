export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();

  const API_KEY = '123'; // TheSportsDB Free Key
  const BASE_URL = 'https://www.thesportsdb.com/api/v1/json';

  // Popular football leagues to cover
  const LEAGUE_IDS = [
    4328, // English Premier League
    4335, // Spanish La Liga
    4334, // Italian Serie A
    4331, // German Bundesliga
    4336, // French Ligue 1
    4337, // UEFA Champions League
    4338, // UEFA Europa League
    4329, // English Championship
    4332, // Portuguese Primeira Liga
    4333, // Dutch Eredivisie
    4344, // Turkish Super Lig
    4345, // Russian Premier League
    4346, // Greek Super League
    4347, // Belgian Pro League
    4348, // Swedish Allsvenskan
    4349, // Norwegian Eliteserien
    4350, // Danish Superligaen
    4351, // Polish Ekstraklasa
    4352, // Czech First League
    4353, // Hungarian Super League
    4354, // Romanian Super League
    4355, // Serbian Super League
    4356, // Croatian First Football League
    4357, // Slovenian PrvaLiga
    4358, // Icelandic Úrvalsdeild
    4359, // Irish Premier Division
    4360, // Scottish Premiership
    4361, // Welsh Premier League
    4362, // Northern Irish Premiership
  ];

  try {
    const params = { ...req.query };
    const date = params.date || new Date().toISOString().split('T')[0];
    
    let allEvents = [];
    const eventIds = new Set(); // Track unique events to avoid duplicates

    // ── Fetch today's matches from all sports ───────────────────────────
    console.log('[football-enhanced.js] Fetching today\'s soccer matches...');
    try {
      const todayUrl = `${BASE_URL}/${API_KEY}/eventsday.php?d=${date}&s=Soccer`;
      const todayRes = await fetch(todayUrl);
      if (todayRes.ok) {
        const todayData = await todayRes.json();
        if (todayData.events && Array.isArray(todayData.events)) {
          todayData.events.forEach(e => {
            if (e.idEvent && !eventIds.has(e.idEvent)) {
              allEvents.push(e);
              eventIds.add(e.idEvent);
            }
          });
        }
      }
    } catch (err) {
      console.warn('[football-enhanced.js] Today\'s matches fetch failed:', err.message);
    }

    // ── Fetch next matches from major leagues ───────────────────────────
    console.log('[football-enhanced.js] Fetching next matches from major leagues...');
    for (const leagueId of LEAGUE_IDS) {
      try {
        const leagueUrl = `${BASE_URL}/${API_KEY}/eventsnextleague.php?id=${leagueId}`;
        const leagueRes = await fetch(leagueUrl);
        if (leagueRes.ok) {
          const leagueData = await leagueRes.json();
          if (leagueData.events && Array.isArray(leagueData.events)) {
            leagueData.events.forEach(e => {
              if (e.idEvent && !eventIds.has(e.idEvent)) {
                allEvents.push(e);
                eventIds.add(e.idEvent);
              }
            });
          }
        }
      } catch (err) {
        console.warn(`[football-enhanced.js] League ${leagueId} fetch failed:`, err.message);
      }
    }

    console.log(`[football-enhanced.js] Total unique events collected: ${allEvents.length}`);

    if (allEvents.length === 0) {
      return res.status(200).json({ response: [] });
    }

    // ── Map TheSportsDB events to API-Football format ────────────────────
    const mappedResponse = allEvents.map(event => {
      // Determine if match is finished
      const isFinished = event.strStatus === 'Match Finished' || 
                        (event.intHomeScore !== null && event.intAwayScore !== null && 
                         event.strStatus && event.strStatus.toLowerCase().includes('finished'));
      
      // Determine status short code
      let statusShort = 'NS'; // Default: Not Started
      if (isFinished) {
        statusShort = 'FT';
      } else if (event.intHomeScore !== null && event.intAwayScore !== null) {
        // If scores exist but not marked as finished, it's live
        statusShort = 'LIVE';
      }

      // Calculate elapsed time if live
      let elapsed = 0;
      if (statusShort === 'LIVE' && event.strTime) {
        // Try to estimate elapsed time from event time
        try {
          const eventTime = new Date(`${event.dateEvent}T${event.strTime}`);
          const now = new Date();
          elapsed = Math.floor((now - eventTime) / 60000); // Minutes
          if (elapsed < 0) elapsed = 0;
          if (elapsed > 90) elapsed = 90;
        } catch (e) {
          elapsed = 0;
        }
      }

      return {
        fixture: {
          id: event.idEvent,
          date: `${event.dateEvent}T${event.strTime}`,
          status: {
            short: statusShort,
            elapsed: elapsed
          }
        },
        league: {
          id: event.idLeague,
          name: event.strLeague,
          country: event.strCountry || 'World',
          season: event.strSeason || 'Current'
        },
        teams: {
          home: { 
            name: event.strHomeTeam, 
            logo: event.strHomeTeamBadge || '' 
          },
          away: { 
            name: event.strAwayTeam, 
            logo: event.strAwayTeamBadge || '' 
          }
        },
        goals: {
          home: event.intHomeScore !== null ? parseInt(event.intHomeScore) : null,
          away: event.intAwayScore !== null ? parseInt(event.intAwayScore) : null
        }
      };
    });

    // ── Sort by date ────────────────────────────────────────────────────
    mappedResponse.sort((a, b) => new Date(a.fixture.date) - new Date(b.fixture.date));

    return res.status(200).json({ response: mappedResponse });

  } catch (err) {
    console.error('[football-enhanced.js] Error:', err.message);
    return res.status(500).json({ error: err.message, response: [] });
  }
}
