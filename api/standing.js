import * as cheerio from 'cheerio';

const LEAGUE_URLS = {
  PL:  'https://fbref.com/en/comps/9/Premier-League-Stats',
  PD:  'https://fbref.com/en/comps/12/La-Liga-Stats',
  SA:  'https://fbref.com/en/comps/11/Serie-A-Stats',
  BL1: 'https://fbref.com/en/comps/20/Bundesliga-Stats',
  CL:  'https://fbref.com/en/comps/8/Champions-League-Stats',
  FL1: 'https://fbref.com/en/comps/13/Ligue-1-Stats',
};

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') return res.status(200).end();

  try {
    const { league = 'PL' } = req.query;
    const url = LEAGUE_URLS[league] || LEAGUE_URLS['PL'];

    const response = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'Accept-Language': 'en-US,en;q=0.9',
      },
    });

    const html = await response.text();
    const $ = cheerio.load(html);

    const standings = [];

    // fbref standings table has id starting with "results" and contains "overall"
    $('table[id*="overall"]').first().find('tbody tr').each((i, el) => {
      if ($(el).hasClass('spacer') || $(el).hasClass('thead')) return;

      const rank = $(el).find('th').text().trim();
      const team = $(el).find('td[data-stat="team"] a').text().trim();
      const played = $(el).find('td[data-stat="games"]').text().trim();
      const won = $(el).find('td[data-stat="wins"]').text().trim();
      const drawn = $(el).find('td[data-stat="ties"]').text().trim();
      const lost = $(el).find('td[data-stat="losses"]').text().trim();
      const goalsFor = $(el).find('td[data-stat="goals_for"]').text().trim();
      const goalsAgainst = $(el).find('td[data-stat="goals_against"]').text().trim();
      const points = $(el).find('td[data-stat="points"]').text().trim();

      if (!team) return;

      const gf = parseInt(goalsFor) || 0;
      const ga = parseInt(goalsAgainst) || 0;

      standings.push({
        rank: parseInt(rank) || (i + 1),
        team,
        badge: '',
        played: parseInt(played) || 0,
        won: parseInt(won) || 0,
        drawn: parseInt(drawn) || 0,
        lost: parseInt(lost) || 0,
        goalsFor: gf,
        goalsAgainst: ga,
        goalDifference: gf - ga,
        points: parseInt(points) || 0,
      });
    });

    if (!standings.length) {
      return res.status(404).json({ error: 'No standings found' });
    }

    res.setHeader('Cache-Control', 's-maxage=3600, stale-while-revalidate');
    return res.status(200).json({ standings });

  } catch (err) {
    return res.status(500).json({ error: 'Standings error', detail: err.message });
  }
}
