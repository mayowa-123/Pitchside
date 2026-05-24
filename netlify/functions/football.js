const fetch = require('node-fetch');

exports.handler = async function (event) {
  const headers = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Content-Type': 'application/json'
  };

  if (event.httpMethod === 'OPTIONS') return { statusCode: 200, headers, body: '' };

  const API_KEY = '123'; // TheSportsDB Free Key
  const BASE_URL = 'https://www.thesportsdb.com/api/v1/json';

  try {
    const params = event.queryStringParameters || {};
    const date = params.date || new Date().toISOString().split('T')[0];

    const url = `${BASE_URL}/${API_KEY}/eventsday.php?d=${date}&s=Soccer`;
    const response = await fetch(url);
    const data = await response.json();

    if (!data.events) {
      return {
        statusCode: 200,
        headers,
        body: JSON.stringify({ response: [] })
      };
    }

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

    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({ response: mappedResponse })
    };

  } catch (err) {
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({ error: err.message, response: [] })
    };
  }
};
