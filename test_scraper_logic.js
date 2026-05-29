import axios from 'axios';
import * as cheerio from 'cheerio';

const HTTP = axios.create({
    timeout: 45000,
    maxRedirects: 5,
    headers: {
        'User-Agent':      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
        'Accept-Language': 'en-US,en;q=0.9',
        'Accept':          'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
    },
});

const LEAGUE_SOURCES = [
    { id: 'pl_standings', name: 'Premier League', url: 'https://www.skysports.com/premier-league-table' },
    { id: 'laliga_standings', name: 'La Liga', url: 'https://www.skysports.com/la-liga-table' },
    { id: 'seriea_standings', name: 'Serie A', url: 'https://www.skysports.com/serie-a-table' },
    { id: 'bundesliga_standings', name: 'Bundesliga', url: 'https://www.skysports.com/bundesliga-table' },
    { id: 'ligue1_standings', name: 'Ligue 1', url: 'https://www.skysports.com/ligue-1-table' },
];

async function testScraping() {
    for (const league of LEAGUE_SOURCES) {
        try {
            console.log(`Testing ${league.name}...`);
            const { data: html } = await HTTP.get(league.url);
            const $ = cheerio.load(html);
            const standings = [];

            $('table.sdc-site-table tbody tr').each((i, el) => {
                const cols = $(el).find('td');
                if (cols.length < 10) return;
                
                const teamName = $(cols[1]).find('a').text().trim() || $(cols[1]).text().trim();
                
                standings.push({
                    rank: $(cols[0]).text().trim(),
                    team: teamName,
                    played: $(cols[2]).text().trim(),
                    won: $(cols[3]).text().trim(),
                    drawn: $(cols[4]).text().trim(),
                    lost: $(cols[5]).text().trim(),
                    goalsFor: $(cols[6]).text().trim(),
                    goalsAgainst: $(cols[7]).text().trim(),
                    goalDifference: $(cols[8]).text().trim(),
                    points: $(cols[9]).text().trim(),
                });
            });

            console.log(`✅ ${league.name}: Found ${standings.length} teams.`);
            if (standings.length > 0) {
                console.log(`   Sample: ${standings[0].rank}. ${standings[0].team} - ${standings[0].points} pts`);
            }
        } catch (err) {
            console.error(`❌ Failed ${league.name}:`, err.message);
        }
    }
}

testScraping();
