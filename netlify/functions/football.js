exports.handler = async function (event) {
  const headers = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
  };

  if (event.httpMethod === 'OPTIONS') return { statusCode: 200, headers, body: '' };

  try {
    const params = { ...(event.queryStringParameters || {}) };
    const endpoint = params.endpoint || 'fixtures';
    delete params.endpoint;

    const queryString = Object.keys(params).length
      ? '?' + new URLSearchParams(params).toString()
      : '';

    const url = `https://v3.football.api-sports.io/${endpoint}${queryString}`;

    const response = await fetch(url, {
      headers: {
        'x-apisports-key': process.env.APIFOOTBALL_KEY,
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
