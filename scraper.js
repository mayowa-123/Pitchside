import axios from 'axios';
import * as cheerio from 'cheerio';
import admin from 'firebase-admin';

if (!admin.apps.length) {
    try {
        const serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT);
        admin.initializeApp({ credential: admin.credential.cert(serviceAccount) });
        console.log('✅ Firebase Admin Initialized.');
    } catch (e) {
        console.error('❌ Failed to parse FIREBASE_SERVICE_ACCOUNT.');
        process.exit(1);
    }
}
const db = admin.firestore();

const HTTP = axios.create({
    timeout: 45000,
    maxRedirects: 5,
    headers: {
        'User-Agent':      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
        'Accept-Language': 'en-US,en;q=0.9',
        'Accept':          'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
    },
});

const NPFL_TEAMS = [
    'enyimba', 'rivers united', 'remo stars', 'shooting stars', 'kano pillars',
    'plateau united', 'kwara united', 'bendel insurance', 'lobi stars',
    'rangers international', 'bayelsa united', 'heartland', 'nasarawa united',
    'akwa united', 'doma united', 'gombe united', 'sunshine stars',
    'wikki tourists', 'niger tornadoes', 'crown fc', 'abia warriors',
    'enugu rangers', 'warri wolves', 'ikorodu city', 'katsina united',
    'el kanemi', 'el-kanemi', 'kanemi', 'barau', 'kun khalifat',
];

function isNPFLTeam(name) {
    const lower = (name || '').toLowerCase();
    if (lower.endsWith(' fc') && lower.length >= 5) return true;
    return NPFL_TEAMS.some(t => lower.includes(t));
}

function makeDocId(name) {
    return (name || 'unknown')
        .toLowerCase()
        .replace(/[^a-z0-9]/g, '_')
        .replace(/_+/g, '_')
        .replace(/^_|_$/g, '');
}

const LEAGUE_SOURCES = [
    { id: 'pl_standings', name: 'Premier League', url: 'https://www.skysports.com/premier-league-table' },
    { id: 'laliga_standings', name: 'La Liga', url: 'https://www.skysports.com/la-liga-table' },
    { id: 'seriea_standings', name: 'Serie A', url: 'https://www.skysports.com/serie-a-table' },
    { id: 'bundesliga_standings', name: 'Bundesliga', url: 'https://www.skysports.com/bundesliga-table' },
    { id: 'ligue1_standings', name: 'Ligue 1', url: 'https://www.skysports.com/ligue-1-table' },
];

async function scrapeLeagueStandings() {
    console.log('\n🌍 Scraping TOP LEAGUE STANDINGS from Sky Sports...');

    for (const league of LEAGUE_SOURCES) {
        try {
            const { data: html } = await HTTP.get(league.url);
            const $ = cheerio.load(html);
            const standings = [];

            // Sky Sports uses table.sdc-site-table
            $('table.sdc-site-table tbody tr').each((i, el) => {
                const cols = $(el).find('td');
                if (cols.length < 10) return;
                
                // Sky Sports table structure:
                // 0: Rank, 1: Team, 2: Played, 3: Won, 4: Drawn, 5: Lost, 6: For, 7: Against, 8: GD, 9: Pts
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
                    lastUpdated: new Date().toISOString(),
                    source: 'skysports.com',
                });
            });

            if (standings.length === 0) {
                console.warn(`⚠️ No standings found for ${league.name}`);
                continue;
            }

            const oldDocs = await db.collection(league.id).listDocuments();
            if (oldDocs.length > 0) {
                const delBatch = db.batch();
                oldDocs.forEach(ref => delBatch.delete(ref));
                await delBatch.commit();
            }

            const batch = db.batch();
            standings.forEach((t, i) => {
                batch.set(db.collection(league.id).doc(`team_${i + 1}`), t);
            });
            await batch.commit();
            console.log(`✅ ${league.name}: ${standings.length} teams saved → ${league.id}`);

        } catch (err) {
            console.error(`❌ Failed ${league.name}:`, err.message);
        }
    }
}

async function scrapeStandings() {
    console.log('\n📋 [1/2] Scraping STANDINGS...');
    let html;
    try {
        const { data } = await HTTP.get('https://npfl.com.ng/npfl-table/');
        html = data;
    } catch (err) {
        console.error('❌ Standings fetch failed:', err.message);
        return;
    }

    if (!html.toLowerCase().includes('npfl')) {
        console.error('❌ Page does not look like NPFL. Skipping.');
        return;
    }

    const $ = cheerio.load(html);
    const standings = [];
    const skipped = [];

    $('table tbody tr').each((i, el) => {
        const cols = $(el).find('td');
        if (cols.length < 8) return;
        const team = $(cols[1]).text().trim();
        if (!isNPFLTeam(team)) { skipped.push(team || `row${i}`); return; }

        standings.push({
            rank: $(cols[0]).text().trim(),
            team,
            played: $(cols[2]).text().trim(),
            won: $(cols[3]).text().trim(),
            drawn: $(cols[4]).text().trim(),
            lost: $(cols[5]).text().trim(),
            goalsFor: $(cols[6]).text().trim(),
            goalsAgainst: $(cols[7]).text().trim(),
            points: $(cols[9]).text().trim() || $(cols[8]).text().trim(),
            lastUpdated: new Date().toISOString(),
            source: 'npfl.com.ng',
        });
    });

    if (skipped.length) console.warn(`   ⚠️  Skipped: ${skipped.join(' | ')}`);
    if (standings.length === 0) { console.error('❌ No standings found.'); return; }

    try {
        const oldDocs = await db.collection('npfl_standings').listDocuments();
        if (oldDocs.length > 0) {
            const delBatch = db.batch();
            oldDocs.forEach(ref => delBatch.delete(ref));
            await delBatch.commit();
        }
    } catch (err) {
        console.warn('   ⚠️  Could not clear old standings:', err.message);
    }

    const batch = db.batch();
    standings.forEach(t =>
        batch.set(db.collection('npfl_standings').doc(makeDocId(t.team)), t)
    );
    await batch.commit();
    console.log(`✅ Standings: ${standings.length} teams saved.`);
}

async function scrapeFixturesAndResults() {
    console.log('\n⚽ [2/2] Scraping FIXTURES + RESULTS...');

    let html;
    try {
        const { data } = await HTTP.get('https://npfl.com.ng/fixtures/');
        html = data;
    } catch (err) {
        console.error('❌ Fixtures page failed:', err.message);
        return;
    }

    const $ = cheerio.load(html);
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const allFixtures = [];
    const allResults = [];

    $('table tbody tr').each((i, el) => {
        const cols = $(el).find('td');
        if (cols.length < 3) return;

        const rawDate = $(cols[0]).text().trim();
        const home = $(cols[1]).text().trim();
        const scoreRaw = $(cols[2]).text().trim();

        if (!isNPFLTeam(home)) return;

        let away = '';
        for (let c = 3; c < cols.length; c++) {
            const cellText = $(cols[c]).text().trim();
            if (isNPFLTeam(cellText)) { away = cellText; break; }
        }
        if (!away) return;

        const datePart = (rawDate.match(/(\d{4}-\d{2}-\d{2})/) || [])[1] || '';
        const timeMatch = rawDate.match(/(\d{1,2}:\d{2})/);
        const timePart = timeMatch ? timeMatch[1] : '16:00';
        if (!datePart) return;
        const [yr, mo, dy] = datePart.split('-').map(Number);
        const matchDate = new Date(yr, mo - 1, dy);

        const scoreMatch = scoreRaw.match(/(\d+)\s*[-:]\s*(\d+)/);
        const hasScore = !!scoreMatch;
        const isPast = matchDate < today;

        const entry = {
            homeTeam: home,
            awayTeam: away,
            date: datePart,
            time: timePart,
            lastUpdated: new Date().toISOString(),
            source: 'npfl.com.ng',
        };

        if (hasScore && isPast) {
            entry.homeScore = scoreMatch[1];
            entry.awayScore = scoreMatch[2];
            entry.status = 'FT';
            allResults.push({ ...entry, _matchDate: matchDate });
        } else if (!hasScore) {
            entry.status = 'NS';
            allFixtures.push({ ...entry, _matchDate: matchDate });
        }
    });

    allFixtures.sort((a, b) => a._matchDate - b._matchDate);
    const fixtures = allFixtures.slice(0, 20).map(({ _matchDate, ...f }) => f);

    allResults.sort((a, b) => b._matchDate - a._matchDate);
    const results = allResults.slice(0, 15).map(({ _matchDate, ...r }) => r);

    try {
        const oldDocs = await db.collection('npfl_fixtures').listDocuments();
        if (oldDocs.length > 0) {
            const delBatch = db.batch();
            oldDocs.forEach(ref => delBatch.delete(ref));
            await delBatch.commit();
        }
    } catch (err) {
        console.warn('   ⚠️  Could not clear old fixtures:', err.message);
    }

    try {
        const oldDocs = await db.collection('npfl_results').listDocuments();
        if (oldDocs.length > 0) {
            const delBatch = db.batch();
            oldDocs.forEach(ref => delBatch.delete(ref));
            await delBatch.commit();
        }
    } catch (err) {
        console.warn('   ⚠️  Could not clear old results:', err.message);
    }

    if (fixtures.length > 0) {
        const batch = db.batch();
        fixtures.forEach(f => {
            const id = `${makeDocId(f.homeTeam)}_vs_${makeDocId(f.awayTeam)}`;
            batch.set(db.collection('npfl_fixtures').doc(id), f);
        });
        await batch.commit();
        console.log(`✅ Fixtures: ${fixtures.length} saved.`);
    }

    if (results.length > 0) {
        const batch = db.batch();
        results.forEach((r, i) => {
            const id = `${makeDocId(r.homeTeam)}_vs_${makeDocId(r.awayTeam)}_${i}`;
            batch.set(db.collection('npfl_results').doc(id), r);
        });
        await batch.commit();
        console.log(`✅ Results: ${results.length} saved.`);
    }
}

async function main() {
    console.log('🚀 PitchSide Scraper —', new Date().toUTCString());

    const jobs = await Promise.allSettled([
        scrapeStandings(),
        scrapeFixturesAndResults(),
        scrapeLeagueStandings(),
    ]);

    jobs.forEach((j, i) => {
        if (j.status === 'rejected')
            console.error(`❌ Job ${i + 1} error:`, j.reason);
    });

    console.log('\n🏁 Done.');
}

main().catch(err => { console.error('❌ Fatal:', err); process.exit(1); });
