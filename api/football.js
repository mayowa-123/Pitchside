export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();

  const API_KEY = '123'; // TheSportsDB Free Key
  const BASE_URL = 'https://www.thesportsdb.com/api/v1/json';

  // Popular football leagues to cover (expanded with MLS and Mexican league)
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
    4391, // MLS (Major League Soccer)
    4392, // Mexican Liga MX
  ];

  try {
    const params = { ...req.query };
    const date = params.date || new Date().toISOString().split('T')[0];
    
    let allEvents = [];
    const eventIds = new Set(); // Track unique events to avoid duplicates

    // Helper function to add events without duplicates
    const addEvents = (events) => {
      if (events && Array.isArray(events)) {
        events.forEach(e => {
          if (e.idEvent && !eventIds.has(e.idEvent)) {
            allEvents.push(e);
            eventIds.add(e.idEvent);
          }
        });
      }
    };

    // ── Fetch today's matches from all sports ───────────────────────────
    console.log('[football-v2.js] Fetching today\'s soccer matches...');
    try {
      const todayUrl = `${BASE_URL}/${API_KEY}/eventsday.php?d=${date}&s=Soccer`;
      const todayRes = await fetch(todayUrl);
      if (todayRes.ok) {
        const todayData = await todayRes.json();
        addEvents(todayData.events);
      }
    } catch (err) {
      console.warn('[football-v2.js] Today\'s matches fetch failed:', err.message);
    }

    // ── Fetch last matches from each league (to catch ongoing/finished matches) ───
    console.log('[football-v2.js] Fetching last matches from major leagues...');
    for (const leagueId of LEAGUE_IDS) {
      try {
        const lastUrl = `${BASE_URL}/${API_KEY}/eventslastleague.php?id=${leagueId}`;
        const lastRes = await fetch(lastUrl);
        if (lastRes.ok) {
          const lastData = await lastRes.json();
          addEvents(lastData.events);
        }
      } catch (err) {
        console.warn(`[football-v2.js] League ${leagueId} last matches fetch failed:`, err.message);
      }
    }

    // ── Fetch next matches from major leagues ───────────────────────────
    console.log('[football-v2.js] Fetching next matches from major leagues...');
    for (const leagueId of LEAGUE_IDS) {
      try {
        const nextUrl = `${BASE_URL}/${API_KEY}/eventsnextleague.php?id=${leagueId}`;
        const nextRes = await fetch(nextUrl);
        if (nextRes.ok) {
          const nextData = await nextRes.json();
          addEvents(nextData.events);
        }
      } catch (err) {
        console.warn(`[football-v2.js] League ${leagueId} next matches fetch failed:`, err.message);
      }
    }

    console.log(`[football-v2.js] Total unique events collected: ${allEvents.length}`);

    if (allEvents.length === 0) {
      return res.status(200).json({ response: [] });
    }

    // ── Map TheSportsDB events to API-Football format ────────────────────
    const mappedResponse = allEvents.map(event => {
      // Parse status more robustly
      const statusStr = (event.strStatus || '').toLowerCase();
      const hasScores = event.intHomeScore !== null && event.intAwayScore !== null;
      
      // Determine status short code
      let statusShort = 'NS'; // Default: Not Started
      
      if (statusStr.includes('finished') || statusStr.includes('ft') || statusStr.includes('full time')) {
        statusShort = 'FT';
      } else if (statusStr.includes('halftime') || statusStr.includes('ht') || statusStr.includes('half time')) {
        statusShort = 'HT';
      } else if (hasScores && !statusStr.includes('finished')) {
        // If scores exist and not marked as finished, it's live
        statusShort = 'LIVE';
      } else if (statusStr.includes('live') || statusStr.includes('in progress')) {
        statusShort = 'LIVE';
      }

      // Calculate elapsed time if live or halftime
      let elapsed = 0;
      if ((statusShort === 'LIVE' || statusShort === 'HT') && event.strTime) {
        try {
          const eventTime = new Date(`${event.dateEvent}T${event.strTime}`);
          const now = new Date();
          elapsed = Math.floor((now - eventTime) / 60000); // Minutes
          if (elapsed < 0) elapsed = 0;
          if (elapsed > 120) elapsed = 90; // Cap at 90 for display
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

    // ── Sort by date (most recent first for today's matches) ────────────
    mappedResponse.sort((a, b) => {
      const dateA = new Date(a.fixture.date);
      const dateB = new Date(b.fixture.date);
      // For today's matches, show live/finished first, then upcoming
      const now = new Date();
      const isAToday = dateA.toDateString() === now.toDateString();
      const isBToday = dateB.toDateString() === now.toDateString();
      
      if (isAToday && !isBToday) return -1;
      if (!isAToday && isBToday) return 1;
      
      // Within the same day, sort by status priority: LIVE > HT > FT > NS
      const statusPriority = { 'LIVE': 0, 'HT': 1, 'FT': 2, 'NS': 3 };
      const priorityA = statusPriority[a.fixture.status.short] ?? 4;
      const priorityB = statusPriority[b.fixture.status.short] ?? 4;
      
      if (priorityA !== priorityB) return priorityA - priorityB;
      
      // Then sort by date
      return dateA - dateB;
    });

    return res.status(200).json({ response: mappedResponse });

  } catch (err) {
    console.error('[football-v2.js] Error:', err.message);
    return res.status(500).json({ error: err.message, response: [] });
  }
}
