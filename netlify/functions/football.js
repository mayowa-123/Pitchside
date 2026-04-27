exports.handler = async function (event) {
  const headers = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
  };

  if (event.httpMethod === 'OPTIONS') return { statusCode: 200, headers, body: '' };

  try {
    // Pass through the query string from the original request
    const queryString = event.queryStringParameters
      ? '?' + new URLSearchParams(event.queryStringParameters).toString()
      : '';

    const url = `https://v3.football.api-sports.io${event.path.replace('/.netlify/functions/football', '')}${queryString}`;

    const response = await fetch(url, {
      headers: {
        'x-apisports-key': process.env.APIFOOTBALL_KEY, // 🔒 Stored in Netlify dashboard
      },
    });

    const data = await response.json();
    return {
      statusCode: 200,
      headers,
      body: JSON.stringify(data),
    };

  } catch (err) {
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({ error: 'Football API error', detail: err.message }),
    };
  }
};
