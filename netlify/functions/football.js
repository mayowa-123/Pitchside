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
    4346, // Greek Super League
    4347, // Belgian Pro League
    4391, // MLS
    4392, // Mexican Liga MX
    4401, // Swiss Super League
    4360, // Scottish Premiership
    4340, // Brazilian Serie A
    4341, // Argentinian Primera
  ];

  try {
    const params = { ...req.query };
    const date = params.date || new Date().toISOString().split('T')[0];
    
    let allEvents = [];
    const eventIds = new Set();

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

    // 1. Fetch today's matches
    try {
      const todayRes = await fetch(`${BASE_URL}/${API_KEY}/eventsday.php?d=${date}&s=Soccer`);
      if (todayRes.ok) {
        const todayData = await todayRes.json();
        addEvents(todayData.events);
      }
    } catch (e) {}

    // 2. Fetch from specific leagues (Last & Next)
    // To keep it fast and stay within rate limits, we'll pick a subset of major leagues for detailed fetching
    const majorLeagues = [4328, 4335, 4334, 4331, 4336, 4337, 4391, 4392];
    for (const id of majorLeagues) {
      try {
        const [last, next] = await Promise.all([
          fetch(`${BASE_URL}/${API_KEY}/eventslastleague.php?id=${id}`).then(r => r.json()),
          fetch(`${BASE_URL}/${API_KEY}/eventsnextleague.php?id=${id}`).then(r => r.json())
        ]);
        addEvents(last.events);
        addEvents(next.events);
      } catch (e) {}
    }

    if (allEvents.length === 0) {
      return res.status(200).json({ response: [] });
    }

    // Map to API-Football format
    const mappedResponse = allEvents.map(event => {
      const statusStr = (event.strStatus || '').toLowerCase();
      const hasScores = event.intHomeScore !== null && event.intAwayScore !== null;
      
      let statusShort = 'NS';
      if (statusStr.includes('finished') || statusStr.includes('ft')) statusShort = 'FT';
      else if (statusStr.includes('halftime') || statusStr.includes('ht')) statusShort = 'HT';
      else if (hasScores || statusStr.includes('live') || statusStr.includes('progress')) statusShort = 'LIVE';

      // Estimate elapsed time
      let elapsed = 0;
      if (statusShort === 'LIVE' || statusShort === 'HT') {
        try {
          const eventTime = new Date(`${event.dateEvent}T${event.strTime}`);
          elapsed = Math.floor((new Date() - eventTime) / 60000);
          if (elapsed < 0) elapsed = 0;
          if (elapsed > 120) elapsed = 90;
        } catch (e) {}
      } else if (statusShort === 'FT') {
        elapsed = 90;
      }

      return {
        fixture: {
          id: parseInt(event.idEvent),
          date: `${event.dateEvent}T${event.strTime}`,
          status: {
            short: statusShort,
            elapsed: elapsed
          }
        },
        league: {
          id: parseInt(event.idLeague),
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
    return res.status(500).json({ error: err.message, response: [] });
  }
}
