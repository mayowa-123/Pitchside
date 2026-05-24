export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();

  const API_KEY = '123'; // TheSportsDB Free Key
  const BASE_URL = 'https://www.thesportsdb.com/api/v1/json';

  try {
    const params = { ...req.query };
    const date = params.date || new Date().toISOString().split('T')[0];
    
    // Fetch today's events from TheSportsDB
    const url = `${BASE_URL}/${API_KEY}/eventsday.php?d=${date}&s=Soccer`;
    console.log('[football.js] Calling TheSportsDB:', url);

    const response = await fetch(url);
    if (!response.ok) {
      return res.status(response.status).json({ error: 'TheSportsDB API error', response: [] });
    }

    const data = await response.json();
    
    if (!data.events) {
      return res.status(200).json({ response: [] });
    }

    // Map TheSportsDB events to API-Football format expected by app.js
    const mappedResponse = data.events.map(event => {
      const isFinished = event.strStatus === 'Match Finished' || event.intHomeScore !== null;
      const statusShort = isFinished ? 'FT' : 'NS';
      
      return {
        fixture: {
          id: event.idEvent,
          date: `${event.dateEvent}T${event.strTime}`,
          status: {
            short: statusShort,
            elapsed: isFinished ? 90 : 0
          }
        },
        league: {
          id: event.idLeague,
          name: event.strLeague,
          country: event.strCountry || 'World'
        },
        teams: {
          home: { name: event.strHomeTeam, logo: event.strHomeTeamBadge || '' },
          away: { name: event.strAwayTeam, logo: event.strAwayTeamBadge || '' }
        },
        goals: {
          home: event.intHomeScore !== null ? parseInt(event.intHomeScore) : null,
          away: event.intAwayScore !== null ? parseInt(event.intAwayScore) : null
        }
      };
    });

    return res.status(200).json({ response: mappedResponse });

  } catch (err) {
    console.error('[football.js] Error:', err.message);
    return res.status(500).json({ error: err.message, response: [] });
  }
}
