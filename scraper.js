const axios   = require('axios');
const cheerio = require('cheerio');
const admin   = require('firebase-admin');

// ─── Firebase Init ────────────────────────────────────────────────────────────
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

// ─── Shared HTTP client ───────────────────────────────────────────────────────
const HTTP = axios.create({
    timeout: 20000,
    maxRedirects: 5,
    headers: {
        'User-Agent':      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
        'Accept-Language': 'en-US,en;q=0.9',
        'Accept':          'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
    },
});

// ─── NPFL team whitelist ──────────────────────────────────────────────────────
const NPFL_TEAMS = [
    'enyimba', 'rivers united', 'remo stars', 'shooting stars', 'kano pillars',
    'plateau united', 'kwara united', 'bendel insurance', 'lobi stars',
    'rangers international', 'bayelsa united', 'heartland', 'nasarawa united',
    'akwa united', 'doma united', 'gombe united', 'sunshine stars',
    'wikki tourists', 'niger tornadoes', 'crown fc', 'abia warriors',
    'enugu rangers', 'warri wolves', 'ikorodu city', 'katsina united',
    'el kanemi warriors', 'barau', 'kun khalifat',
];

function isNPFLTeam(name) {
    const lower = (name || '').toLowerCase();
    return NPFL_TEAMS.some(t => lower.includes(t));
}

function makeDocId(name) {
    return (name || 'unknown').toLowerCase().replace(/[^a-z0-9]/g, '_').replace(/_+/g, '_');
}

// ══════════════════════════════════════════════════════════════════════════════
//  TASK 1 — STANDINGS from npfl.com.ng/npfl-table/
// ══════════════════════════════════════════════════════════════════════════════
async function scrapeStandings() {
    console.log('\n📋 [1/2] Scraping STANDINGS from npfl.com.ng...');
    let html;
    try {
        const { data } = await HTTP.get('https://npfl.com.ng/npfl-table/');
        html = data;
    } catch (err) {
        console.error('❌ Standings fetch failed:', err.message);
        return;
    }

    if (!html.toLowerCase().includes('npfl')) {
        console.error('❌ Page does not look like NPFL — skipping standings write.');
        return;
    }

    const $         = cheerio.load(html);
    const standings = [];
    const skipped   = [];

    $('table tbody tr').each((i, el) => {
        const cols = $(el).find('td');
        if (cols.length < 8) return;
        const team = $(cols[1]).text().trim();
        if (!isNPFLTeam(team)) { skipped.push(team || `row${i}`); return; }

        standings.push({
            rank:         $(cols[0]).text().trim(),
            team,
            played:       $(cols[2]).text().trim(),
            won:          $(cols[3]).text().trim(),
            drawn:        $(cols[4]).text().trim(),
            lost:         $(cols[5]).text().trim(),
            goalsFor:     $(cols[6]).text().trim(),
            goalsAgainst: $(cols[7]).text().trim(),
            points:       $(cols[9]).text().trim() || $(cols[8]).text().trim(),
            lastUpdated:  new Date().toISOString(),
            source:       'npfl.com.ng',
        });
    });

    if (skipped.length) console.warn(`   ⚠️  Skipped non-NPFL rows: ${skipped.join(', ')}`);

    if (standings.length === 0) {
        console.error('❌ No valid standings rows found — nothing written.');
        return;
    }

    const batch = db.batch();
    standings.forEach(t =>
        batch.set(db.collection('npfl_standings').doc(makeDocId(t.team)), t, { merge: true })
    );
    await batch.commit();
    console.log(`✅ Standings done: ${standings.length} teams → npfl_standings`);
}

// ══════════════════════════════════════════════════════════════════════════════
//  TASK 2 — FIXTURES + RESULTS from scoreaxis.com
//
//  scoreaxis.com/en/nigeria/npfl  lists the current NPFL matchday
//  We read each match row, classify as upcoming (NS) / live / finished (FT)
//  and split into npfl_fixtures and npfl_results collections.
// ══════════════════════════════════════════════════════════════════════════════
async function scrapeFixturesAndResults() {
    console.log('\n⚽ [2/2] Scraping FIXTURES + RESULTS from scoreaxis.com...');

    // These two scoreaxis URLs give us everything we need
    const PAGES = [
        { url: 'https://www.scoreaxis.com/en/nigeria/npfl',         label: 'NPFL main page'    },
        { url: 'https://www.scoreaxis.com/en/nigeria/npfl/results',  label: 'NPFL results page' },
    ];

    const fixtures = [];
    const results  = [];

    for (const page of PAGES) {
        let html;
        try {
            const { data } = await HTTP.get(page.url);
            html = data;
            console.log(`   Fetched: ${page.label}`);
        } catch (err) {
            console.warn(`   ⚠️  ${page.label} failed: ${err.message}`);
            continue;
        }

        const $ = cheerio.load(html);

        // scoreaxis uses a consistent match-card structure
        // Each match block contains team names and a score/time element
        $('div[class*="match"], li[class*="match"], div[class*="event"]').each((i, el) => {

            // ── Team names ────────────────────────────────────────────────────
            const teamEls = $(el).find('[class*="team"] [class*="name"], [class*="participant"]');
            const teams   = [];
            teamEls.each((_, t) => { const n = $(t).text().trim(); if (n) teams.push(n); });

            // fallback: grab first two non-empty text nodes that look like team names
            if (teams.length < 2) {
                $(el).find('span, a').each((_, s) => {
                    const t = $(s).text().trim();
                    if (t.length > 2 && t.length < 40 && !/^\d+$/.test(t)) teams.push(t);
                });
            }

            if (teams.length < 2) return;
            const [home, away] = [teams[0], teams[1]];

            // ── NPFL validation — skip anything that isn't a known NPFL team ──
            if (!isNPFLTeam(home) && !isNPFLTeam(away)) return;

            // ── Score / status ────────────────────────────────────────────────
            const scoreText  = $(el).find('[class*="score"], [class*="result"]').first().text().trim();
            const statusText = $(el).find('[class*="status"], [class*="minute"]').first().text().trim().toUpperCase();
            const timeText   = $(el).find('[class*="time"], [class*="hour"]').first().text().trim();
            const dateAttr   = $(el).find('time').attr('datetime') || '';
            const dateText   = $(el).find('[class*="date"]').first().text().trim();

            const isFT    = statusText === 'FT' || statusText.includes('FINISHED') ||
                            scoreText.includes('-') && !timeText.includes(':');
            const isLive  = ['1H','2H','HT','ET','LIVE','\''].some(s => statusText.includes(s));
            const scoreM  = scoreText.match(/(\d+)\s*[:\-]\s*(\d+)/);

            const entry = {
                homeTeam:    home,
                awayTeam:    away,
                date:        dateAttr || dateText || new Date().toISOString().split('T')[0],
                time:        timeText || '16:00',
                status:      isFT ? 'FT' : isLive ? 'LIVE' : 'NS',
                lastUpdated: new Date().toISOString(),
                source:      'scoreaxis.com',
            };

            if (scoreM) {
                entry.homeScore = scoreM[1];
                entry.awayScore = scoreM[2];
            }

            if (isFT) {
                results.push(entry);
            } else {
                fixtures.push(entry);
            }
        });
    }

    // ── If scoreaxis returned nothing, fall back to npfl.com.ng/fixtures ─────
    if (fixtures.length === 0 && results.length === 0) {
        console.warn('   ⚠️  scoreaxis returned 0 NPFL rows — trying npfl.com.ng/fixtures fallback...');
        await npflFixturesFallback(fixtures, results);
    }

    // ── WRITE FIXTURES ────────────────────────────────────────────────────────
    // Always clear the collection first so stale bad data (Ice Hockey etc.) is gone
    try {
        const oldDocs = await db.collection('npfl_fixtures').listDocuments();
        if (oldDocs.length > 0) {
            const delBatch = db.batch();
            oldDocs.forEach(ref => delBatch.delete(ref));
            await delBatch.commit();
            console.log(`   🗑️  Cleared ${oldDocs.length} old fixture docs`);
        }
    } catch (err) {
        console.warn('   ⚠️  Could not clear old fixtures:', err.message);
    }

    if (fixtures.length > 0) {
        const batch = db.batch();
        fixtures.forEach((f, i) => {
            const id = `${makeDocId(f.homeTeam)}_vs_${makeDocId(f.awayTeam)}`;
            batch.set(db.collection('npfl_fixtures').doc(id), f);
        });
        await batch.commit();
        console.log(`✅ Fixtures done: ${fixtures.length} matches → npfl_fixtures`);
    } else {
        console.warn('   ⚠️  No fixtures to write — collection left empty.');
    }

    // ── WRITE RESULTS ─────────────────────────────────────────────────────────
    if (results.length > 0) {
        const batch = db.batch();
        results.forEach((r, i) => {
            const id = `${makeDocId(r.homeTeam)}_vs_${makeDocId(r.awayTeam)}_${i}`;
            batch.set(db.collection('npfl_results').doc(id), r, { merge: true });
        });
        await batch.commit();
        console.log(`✅ Results done: ${results.length} matches → npfl_results`);
    } else {
        console.warn('   ⚠️  No results to write.');
    }
}

// ─── Fallback: npfl.com.ng/fixtures ──────────────────────────────────────────
async function npflFixturesFallback(fixtures, results) {
    try {
        const { data } = await HTTP.get('https://npfl.com.ng/fixtures/');
        const $        = cheerio.load(data);

        $('table tbody tr').each((i, el) => {
            const cols = $(el).find('td');
            if (cols.length < 3) return;

            const home   = $(cols[0]).text().trim();
            const away   = $(cols[cols.length - 1]).text().trim();
            if (!isNPFLTeam(home) && !isNPFLTeam(away)) return;

            const mid    = $(cols[Math.floor(cols.length / 2)]).text().trim();
            const scores = mid.match(/(\d+)\s*[-:]\s*(\d+)/);
            const isFT   = /ft/i.test(mid) && !!scores;

            const entry = {
                homeTeam:    home,
                awayTeam:    away,
                date:        new Date().toISOString().split('T')[0],
                time:        '16:00',
                status:      isFT ? 'FT' : 'NS',
                lastUpdated: new Date().toISOString(),
                source:      'npfl.com.ng/fixtures',
            };
            if (isFT && scores) { entry.homeScore = scores[1]; entry.awayScore = scores[2]; }
            isFT ? results.push(entry) : fixtures.push(entry);
        });

        console.log(`   Fallback: ${fixtures.length} fixtures, ${results.length} results`);
    } catch (err) {
        console.warn('   ⚠️  Fallback also failed:', err.message);
    }
}

// ══════════════════════════════════════════════════════════════════════════════
//  MAIN
// ══════════════════════════════════════════════════════════════════════════════
async function main() {
    console.log('🚀 NPFL Bot starting —', new Date().toUTCString());

    const jobs = await Promise.allSettled([
        scrapeStandings(),
        scrapeFixturesAndResults(),
    ]);

    jobs.forEach((j, i) => {
        if (j.status === 'rejected')
            console.error(`❌ Job ${i + 1} threw unhandled error:`, j.reason);
    });

    console.log('\n🏁 Bot finished.');
}

main().catch(err => { console.error('❌ Fatal:', err); process.exit(1); });
