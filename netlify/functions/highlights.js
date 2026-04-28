exports.handler = async function (event) {
  const headers = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
  };

  if (event.httpMethod === 'OPTIONS') return { statusCode: 200, headers, body: '' };

  try {
    const queryString = event.queryStringParameters
      ? '?' + new URLSearchParams(event.queryStringParameters).toString()
      : '';

    const path = event.path.replace('/.netlify/functions/highlights', '');
    const url = `https://football-highlights-api.p.rapidapi.com${path}${queryString}`;

    const response = await fetch(url, {
      headers: {
        'x-rapidapi-key': process.env.HIGHLIGHTLY_KEY, // 🔒 Stored in Netlify dashboard
        'x-rapidapi-host': 'football-highlights-api.p.rapidapi.com',
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
      body: JSON.stringify({ error: 'Highlights API error', detail: err.message }),
    };
  }
};
