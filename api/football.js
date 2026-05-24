export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();

  const apiKey = process.env.APIFOOTBALL_KEY;
  if (!apiKey) {
    return res.status(500).json({ errors: { token: 'APIFOOTBALL_KEY not set in Vercel' }, response: [] });
  }

  try {
    const params   = { ...req.query };
    const endpoint = params.endpoint || 'fixtures';
    delete params.endpoint;

    const queryString = Object.keys(params).length
      ? '?' + new URLSearchParams(params).toString()
      : '';

    const url = `https://v3.football.api-sports.io/${endpoint}${queryString}`;
    console.log('[football.js] Calling:', url);

    const response = await fetch(url, {
      headers: { 'x-apisports-key': apiKey },
      signal: AbortSignal.timeout(8000),
    });

    const remaining = response.headers.get('x-ratelimit-requests-remaining');
    const limit     = response.headers.get('x-ratelimit-requests-limit');
    if (remaining !== null) {
      console.log(`[football.js] Quota: ${remaining}/${limit} remaining today`);
    }

    if (response.status === 429) {
      return res.status(429).json({ errors: { requests: 'Rate limit exceeded' }, response: [] });
    }

    if (!response.ok) {
      return res.status(response.status).json({ errors: { api: response.status }, response: [] });
    }

    const data = await response.json();
    return res.status(200).json(data);

  } catch (err) {
    console.error('[football.js] Error:', err.message);
    return res.status(500).json({ errors: { server: err.message }, response: [] });
  }
}
