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
    const intent = params.intent || 'live_match';
    const entity = params.entity || '';

    let endpoint = '';
    let apiParams = {};

    switch (intent) {
      case 'live_match':
        endpoint = 'eventsday.php';
        const today = new Date().toISOString().split('T')[0];
        apiParams = { d: today, s: 'Soccer' };
        break;
      case 'last_match':
        if (!entity) return { statusCode: 400, headers, body: JSON.stringify({ error: 'Entity required' }) };
        const searchRes = await fetch(`${BASE_URL}/${API_KEY}/searchteams.php?t=${entity}`);
        const searchData = await searchRes.json();
        const teamId = searchData.teams?.[0]?.idTeam;
        if (!teamId) return { statusCode: 404, headers, body: JSON.stringify({ error: 'Team not found' }) };
        endpoint = 'eventslast.php';
        apiParams = { id: teamId };
        break;
      case 'standings':
        endpoint = 'lookuptable.php';
        apiParams = { l: 4328, s: '2023-2024' };
        break;
      default:
        endpoint = 'eventsday.php';
        apiParams = { d: new Date().toISOString().split('T')[0], s: 'Soccer' };
    }

    const queryString = new URLSearchParams(apiParams).toString();
    const url = `${BASE_URL}/${API_KEY}/${endpoint}?${queryString}`;
    
    const response = await fetch(url);
    const data = await response.json();

    return {
      statusCode: 200,
      headers,
      body: JSON.stringify(data)
    };

  } catch (err) {
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({ error: err.message })
    };
  }
};
