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

// ─── HTTP client ──────────────────────────────────────────────────────────────
const HTTP = axios.create({
    timeout: 20000,
    maxRedirects: 5,
    headers: {
        'User-Agent':      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
        'Accept-Language': 'en-US,en;q=0.9',
        'Accept':          'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'Referer':         'https://npfl.com.ng/',
    },
});

// ─── NPFL team whitelist ──────────────────────────────────────────────────────
// Lowercase, partial-match — "el kanemi" matches "El-Kanemi Warriors FC" etc.
const NPFL_TEAMS = [
    'enyimba', 'rivers united', 'remo stars', 'shooting stars', 'kano pillars',
    'plateau united', 'kwara united', 'bendel insurance', 'lobi stars',
    'rangers international', 'bayelsa united', 'heartland', 'nasarawa united',
    'akwa united', 'doma united', 'gombe united', 'sunshine stars',
    'wikki tourists', 'niger tornadoes', 'crown fc', 'abia warriors',
    'enugu rangers', 'warri wolves', 'ikorodu city', 'katsina united',
    'el kanemi', 'el-kanemi', 'kanemi',          // catch all variants
    'barau', 'kun khalifat', 'rivers united fc',
];

function isNPFLTeam(name) {
    const lower = (name || '').toLowerCase();
    // Also accept any name that ends with " fc" and is at least 5 chars (Nigerian clubs)
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

// ══════════════════════════════════════════════════════════════════════════════
//  TASK 1 — STANDINGS  (npfl.com.ng/npfl-table/)
// ══════════════════════════════════════════════════════════════════════════════
async function scrapeStandings() {
    console.log('\n📋 [1/2] Scraping STANDINGS from npfl.com.ng/npfl-table/...');
    let html;
    try {
        const { data } = await HTTP.get('https://npfl.com.ng/npfl-table/');
        html = data;
    } catch (err) {
        console.error('❌ Standings fetch failed:', err.message);
        return;
    }

    if (!html.toLowerCase().includes('npfl')) {
        console.error('❌ Standings page does not look like NPFL. Skipping.');
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

    if (skipped.length) console.warn(`   ⚠️  Skipped rows: ${skipped.join(' | ')}`);

    if (standings.length === 0) {
        console.error('❌ No valid standings found. Nothing written.');
        return;
    }

    const batch = db.batch();
    standings.forEach(t =>
        batch.set(db.collection('npfl_standings').doc(makeDocId(t.team)), t, { merge: true })
    );
    await batch.commit();
    console.log(`✅ Standings: ${standings.length} teams saved.`);
}

// ══════════════════════════════════════════════════════════════════════════════
//  TASK 2 — FIXTURES + RESULTS  (npfl.com.ng/fixtures/ and /results/)
//
//  Strategy:
//  1. Fetch the page and dump the first table's column structure to the log
//     so we can see exactly what we're working with.
//  2. Try multiple selector strategies and use whichever finds NPFL teams.
// ══════════════════════════════════════════════════════════════════════════════
async function scrapeFixturesAndResults() {
    console.log('\n⚽ [2/2] Scraping FIXTURES + RESULTS from npfl.com.ng...');

    const fixtures = [];
    const results  = [];

    // ── Fixtures page ─────────────────────────────────────────────────────────
    await scrapePage(
        'https://npfl.com.ng/fixtures/',
        'fixtures',
        fixtures,
        results
    );

    // ── Results page ──────────────────────────────────────────────────────────
    await scrapePage(
        'https://npfl.com.ng/results/',
        'results',
        fixtures,
        results
    );

    console.log(`\n   📊 Total found: ${fixtures.length} fixtures, ${results.length} results`);

    // ── Always wipe npfl_fixtures first to kill any stale bad data ───────────
    try {
        const oldDocs = await db.collection('npfl_fixtures').listDocuments();
        if (oldDocs.length > 0) {
            const delBatch = db.batch();
            oldDocs.forEach(ref => delBatch.delete(ref));
            await delBatch.commit();
            console.log(`   🗑️  Cleared ${oldDocs.length} stale fixture docs.`);
        }
    } catch (err) {
        console.warn('   ⚠️  Could not clear old fixtures:', err.message);
    }

    // ── Write fixtures ────────────────────────────────────────────────────────
    if (fixtures.length > 0) {
        const batch = db.batch();
        fixtures.forEach(f => {
            const id = `${makeDocId(f.homeTeam)}_vs_${makeDocId(f.awayTeam)}`;
            batch.set(db.collection('npfl_fixtures').doc(id), f);
        });
        await batch.commit();
        console.log(`✅ Fixtures: ${fixtures.length} matches saved to npfl_fixtures.`);
    } else {
        console.warn('   ⚠️  No fixtures written — collection cleared but left empty.');
    }

    // ── Write results ─────────────────────────────────────────────────────────
    if (results.length > 0) {
        const batch = db.batch();
        results.forEach((r, i) => {
            const id = `${makeDocId(r.homeTeam)}_vs_${makeDocId(r.awayTeam)}_${i}`;
            batch.set(db.collection('npfl_results').doc(id), r, { merge: true });
        });
        await batch.commit();
        console.log(`✅ Results: ${results.length} matches saved to npfl_results.`);
    } else {
        console.warn('   ⚠️  No results written.');
    }
}

// ─── Generic page scraper with debug logging ──────────────────────────────────
async function scrapePage(url, label, fixtures, results) {
    console.log(`\n   Fetching ${label} page: ${url}`);
    let html;
    try {
        const { data } = await HTTP.get(url);
        html = data;
    } catch (err) {
        console.warn(`   ⚠️  ${label} page failed: ${err.message}`);
        return;
    }

    const $ = cheerio.load(html);

    // ── DEBUG: log the first table's column count and first 3 rows ───────────
    const firstTable = $('table').first();
    if (firstTable.length) {
        const headerCols = firstTable.find('thead th, thead td');
        const headers    = [];
        headerCols.each((_, h) => headers.push($(h).text().trim()));
        console.log(`   Table headers (${headers.length} cols): [${headers.join(' | ')}]`);

        firstTable.find('tbody tr').slice(0, 3).each((i, row) => {
            const cells = [];
            $(row).find('td').each((_, td) => cells.push($(td).text().trim().substring(0, 20)));
            console.log(`   Row ${i}: [${cells.join(' | ')}]`);
        });
    } else {
        // No table — look for div-based match cards
        console.log('   No <table> found. Looking for div-based match cards...');
        const cardCount = $('[class*="match"], [class*="fixture"], [class*="game"]').length;
        console.log(`   Found ${cardCount} div match cards.`);
    }

    // ── Strategy A: table rows ────────────────────────────────────────────────
    let found = 0;
    $('table tbody tr').each((i, el) => {
        const cols    = $(el).find('td');
        const colTexts = [];
        cols.each((_, td) => colTexts.push($(td).text().trim()));

        if (colTexts.length < 3) return;

        // Find which columns contain NPFL team names
        const npflCols = colTexts
            .map((t, idx) => ({ idx, text: t }))
            .filter(c => isNPFLTeam(c.text));

        if (npflCols.length < 1) return;   // no NPFL team in this row at all

        // home = first NPFL team col, away = last NPFL team col
        // (handles both "Home | Score | Away" and "Date | Home | Away | Time" layouts)
        const homeCol = npflCols[0];
        const awayCol = npflCols.length > 1 ? npflCols[npflCols.length - 1] : null;

        if (!awayCol || homeCol.idx === awayCol.idx) {
            // Only one team found — try adjacent columns
            const adj = colTexts[homeCol.idx + 1] || colTexts[homeCol.idx - 1] || '';
            if (!adj || adj === homeCol.text) return;
        }

        const home = homeCol.text;
        const away = awayCol ? awayCol.text : colTexts[homeCol.idx + 1] || '';

        if (!home || !away || home === away) return;

        // Score detection — look for "N-N" or "N:N" pattern in any column
        let homeScore = null, awayScore = null, isFT = false;
        for (const cell of colTexts) {
            const m = cell.match(/^(\d+)\s*[-:]\s*(\d+)$/);
            if (m) {
                homeScore = m[1];
                awayScore = m[2];
                isFT      = label === 'results' || /ft/i.test(colTexts.join(' '));
                break;
            }
        }

        // Date/time detection
        const dateCell = colTexts.find(t => /\d{4}[-/]\d{2}[-/]\d{2}|\d{1,2}[-/]\d{1,2}[-/]\d{2,4}/.test(t)) || '';
        const timeCell = colTexts.find(t => /^\d{1,2}:\d{2}(:\d{2})?$/.test(t)) || '16:00';

        const entry = {
            homeTeam:    home,
            awayTeam:    away,
            date:        dateCell || new Date().toISOString().split('T')[0],
            time:        timeCell,
            status:      isFT ? 'FT' : 'NS',
            lastUpdated: new Date().toISOString(),
            source:      `npfl.com.ng/${label}`,
        };

        if (homeScore !== null) { entry.homeScore = homeScore; entry.awayScore = awayScore; }

        if (isFT) {
            results.push(entry);
        } else {
            fixtures.push(entry);
        }
        found++;
    });

    // ── Strategy B: div/article match cards (if table strategy found nothing) ─
    if (found === 0) {
        console.log(`   Table strategy found 0 rows. Trying div card strategy...`);
        $('[class*="match"], [class*="fixture"], [class*="event"], article').each((i, el) => {
            const text   = $(el).text();
            const allNames = [];

            // Extract all text nodes that look like team names
            $(el).find('*').each((_, child) => {
                if ($(child).children().length === 0) {  // leaf node
                    const t = $(child).text().trim();
                    if (t.length >= 4 && t.length <= 50 && isNPFLTeam(t)) {
                        allNames.push(t);
                    }
                }
            });

            if (allNames.length < 2) return;
            const [home, away] = [allNames[0], allNames[allNames.length - 1]];
            if (home === away) return;

            const scoreM = text.match(/(\d+)\s*[-:]\s*(\d+)/);
            const isFT   = label === 'results' || /\bft\b/i.test(text);

            const entry = {
                homeTeam:    home,
                awayTeam:    away,
                date:        new Date().toISOString().split('T')[0],
                time:        '16:00',
                status:      isFT ? 'FT' : 'NS',
                lastUpdated: new Date().toISOString(),
                source:      `npfl.com.ng/${label}/divcard`,
            };
            if (scoreM) { entry.homeScore = scoreM[1]; entry.awayScore = scoreM[2]; }
            isFT ? results.push(entry) : fixtures.push(entry);
            found++;
        });
    }

    console.log(`   ${label}: found ${found} valid NPFL rows.`);
}

// ══════════════════════════════════════════════════════════════════════════════
//  MAIN
// ══════════════════════════════════════════════════════════════════════════════
async function main() {
    console.log('🚀 NPFL Scraper Bot —', new Date().toUTCString());

    const jobs = await Promise.allSettled([
        scrapeStandings(),
        scrapeFixturesAndResults(),
    ]);

    jobs.forEach((j, i) => {
        if (j.status === 'rejected')
            console.error(`❌ Job ${i + 1} unhandled error:`, j.reason);
    });

    console.log('\n🏁 Done.');
}

main().catch(err => { console.error('❌ Fatal:', err); process.exit(1); });
