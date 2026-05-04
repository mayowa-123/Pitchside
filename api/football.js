export default async function handler(req, res) {
  // ── CORS Headers ──────────────────────────────────────────────────────────
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
 
  if (req.method === 'OPTIONS') return res.status(200).end();
 
  // ── API Key Validation ────────────────────────────────────────────────────
  const apiKey = process.env.APIFOOTBALL_KEY;
  if (!apiKey) {
    console.error('[football.js] APIFOOTBALL_KEY env var is not set!');
    return res.status(500).json({ error: 'API key not configured in environment variables' });
  }
 
  try {
    const params    = { ...req.query };
    const endpoint  = params.endpoint || 'fixtures';
    delete params.endpoint;
 
    // ── Build Query String ──────────────────────────────────────────────────
    const queryString = Object.keys(params).length
      ? '?' + new URLSearchParams(params).toString()
      : '';
 
    // ── API Selection ───────────────────────────────────────────────────────
    // The user's key "ba3f1918..." is a standard API-Sports / API-Football key.
    // Base URL: v3.football.api-sports.io
    const url = `https://v3.football.api-sports.io/${endpoint}${queryString}`;
    console.log('[football.js] Calling:', url);
 
    const response = await fetch(url, {
      method: 'GET',
      headers: {
        'x-apisports-key': apiKey,
      },
    });
 
    // ── Rate Limit Monitoring ───────────────────────────────────────────────
    const remaining = response.headers.get('x-ratelimit-requests-remaining');
    const limit     = response.headers.get('x-ratelimit-requests-limit');
    if (remaining !== null) {
      console.log(`[football.js] API quota: ${remaining}/${limit} remaining`);
    }
 
    // ── Handle HTTP Errors ──────────────────────────────────────────────────
    if (response.status === 429) {
      console.error('[football.js] Rate limit exceeded (429)');
      return res.status(429).json({ 
        error: 'Rate limit exceeded', 
        message: 'The API-Football free tier allows 10 requests per minute.' 
      });
    }
 
    if (!response.ok) {
      const errorText = await response.text();
      console.error(`[football.js] API returned ${response.status}: ${errorText}`);
      return res.status(response.status).json({ error: `API error ${response.status}`, detail: errorText });
    }
 
    const data = await response.json();
 
    // ── Handle API-Level Errors (Returned in 200 OK body) ────────────────────
    if (data.errors && Object.keys(data.errors).length > 0) {
      console.error('[football.js] API body errors:', JSON.stringify(data.errors));
      // Return 200 but include the errors so the frontend can handle them
      return res.status(200).json(data);
    }
 
    // ── Success ─────────────────────────────────────────────────────────────
    return res.status(200).json(data);
 
  } catch (err) {
    console.error('[football.js] Handler error:', err.message);
    return res.status(500).json({ error: 'Football API error', detail: err.message });
  }
}
