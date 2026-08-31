// api/highlightly.js
//
// Secure proxy for the Highlightly-based features that were previously
// wired to /api/football (an API-Football-shaped endpoint). That endpoint
// was being fed Highlightly IDs — a different, unrelated provider's ID
// system — which is why H2H and Odds never actually returned real data.
// This proxy talks to Highlightly directly, using the same IDs already
// flowing through the rest of the app (live scores, standings), so there's
// no cross-provider mismatch possible here.
//
// Add HIGHLIGHTLY_API_KEY to your Vercel project's Environment Variables
// (same key your GitHub Actions bot already uses) — never hardcode it here.

const BASE_URL = 'https://soccer.highlightly.net';

module.exports = async function handler(req, res) {
  const { endpoint, teamIdOne, teamIdTwo, matchId } = req.query;

  const apiKey = process.env.HIGHLIGHTLY_API_KEY;
  if (!apiKey) {
    res.status(500).json({ error: 'HIGHLIGHTLY_API_KEY is not configured on the server' });
    return;
  }

  try {
    let url;

    if (endpoint === 'h2h') {
      if (!teamIdOne || !teamIdTwo) {
        res.status(400).json({ error: 'teamIdOne and teamIdTwo are required for h2h' });
        return;
      }
      url = `${BASE_URL}/h2h?teamIdOne=${encodeURIComponent(teamIdOne)}&teamIdTwo=${encodeURIComponent(teamIdTwo)}`;
    } else if (endpoint === 'odds') {
      if (!matchId) {
        res.status(400).json({ error: 'matchId is required for odds' });
        return;
      }
      // Highlightly's own docs note this endpoint is not available on the
      // Basic/Free plan — this call is expected to fail gracefully until
      // the account is upgraded. The client handles that response as
      // "not available yet", not as a bug.
      url = `${BASE_URL}/odds?matchId=${encodeURIComponent(matchId)}`;
    } else {
      res.status(400).json({ error: `Unknown or missing endpoint: ${endpoint}` });
      return;
    }

    const response = await fetch(url, {
      headers: {
        'x-rapidapi-key': apiKey,
        'x-rapidapi-host': 'soccer.highlightly.net',
      },
    });

    const text = await response.text();

    // Forward Highlightly's real status code so the client can tell the
    // difference between "no data yet" (e.g. 403 on free tier for odds)
    // and a genuine server error, instead of both looking like a crash.
    res.status(response.status);
    res.setHeader('Content-Type', 'application/json');
    res.send(text);
  } catch (error) {
    res.status(502).json({ error: 'Failed to reach Highlightly', detail: error.message });
  }
};
