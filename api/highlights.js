export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') return res.status(200).end();

  try {
    const queryString = Object.keys(req.query).length
      ? '?' + new URLSearchParams(req.query).toString()
      : '';

    const path = req.url.replace('/api/highlights', '');
    const url = `https://football-highlights-api.p.rapidapi.com${path}${queryString}`;

    const response = await fetch(url, {
      headers: {
        'x-rapidapi-key': process.env.HIGHLIGHTLY_KEY,
        'x-rapidapi-host': 'football-highlights-api.p.rapidapi.com',
      },
    });

    const data = await response.json();
    return res.status(200).json(data);

  } catch (err) {
    return res.status(500).json({ error: 'Highlights API error', detail: err.message });
  }
}
