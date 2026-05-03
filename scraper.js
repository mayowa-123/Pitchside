const axios = require('axios');
const cheerio = require('cheerio');
const admin = require('firebase-admin');

// ─── Firebase Init ────────────────────────────────────────────────────────────
if (!admin.apps.length) {
    try {
        const serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT);
        admin.initializeApp({ credential: admin.credential.cert(serviceAccount) });
        console.log('Firebase Admin Initialized.');
    } catch (e) {
        console.error('Failed to parse FIREBASE_SERVICE_ACCOUNT. Check your GitHub Secrets.');
        process.exit(1);
    }
}
const db = admin.firestore();

// ─── NPFL team names — used to validate scraped rows ─────────────────────────
// If a row doesn't contain at least one of these, it is NOT an NPFL team.
const NPFL_TEAMS = [
    'enyimba', 'rivers united', 'remo stars', 'shooting stars', 'kano pillars',
    'plateau united', 'kwara united', 'bendel insurance', 'lobi stars',
    'rangers international', 'bayelsa united', 'heartland', 'nasarawa united',
    'akwa united', 'doma united', 'gombe united', 'sunshine stars',
    'wikki tourists', 'niger tornadoes', 'crown fc', 'abia warriors',
    'fc ifeanyi ubah', 'enugu rangers'
];

// ─── Strict NPFL identity check ───────────────────────────────────────────────
// Returns true only if the text looks like it belongs to a Nigerian football page.
function isNPFLPage(htmlText) {
    const lower = htmlText.toLowerCase();
    const signals = [
        'npfl',
        'nigeria professional football league',
        'npfl.com.ng',
        'nigerian football',
    ];
    const found = signals.filter(s => lower.includes(s));
    if (found.length === 0) {
        console.error(`❌ VALIDATION FAILED: Page contains none of the NPFL identity signals.`);
        console.error(`   Signals checked: ${signals.join(', ')}`);
        return false;
    }
    console.log(`✅ Page identity confirmed (matched: "${found[0]}")`);
    return true;
}

// ─── Per-row NPFL validation ──────────────────────────────────────────────────
// Returns true if the team name matches a known NPFL club.
function isNPFLTeam(teamName) {
    const lower = teamName.toLowerCase();
    return NPFL_TEAMS.some(t => lower.includes(t));
}

// ─── Main scraper ─────────────────────────────────────────────────────────────
async function scrapeNPFL() {
    // SOURCE: Official NPFL website — only ever read from this domain.
    const STANDINGS_URL = 'https://npfl.com.ng/npfl-table/';
    const ALLOWED_DOMAIN = 'npfl.com.ng';

    // Sanity-check: make sure the URL we're about to hit is actually npfl.com.ng
    if (!STANDINGS_URL.includes(ALLOWED_DOMAIN)) {
        console.error(`❌ ABORT: URL "${STANDINGS_URL}" is not on ${ALLOWED_DOMAIN}. Refusing to scrape.`);
        process.exit(1);
    }

    console.log(`Bot is visiting ${STANDINGS_URL} ...`);

    let rawHtml;
    try {
        const { data } = await axios.get(STANDINGS_URL, {
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/110.0.0.0 Safari/537.36'
            },
            timeout: 15000,
            maxRedirects: 3,           // allow at most 3 redirects
        });
        rawHtml = data;
    } catch (err) {
        console.error('❌ Failed to fetch page:', err.message);
        process.exit(1);
    }

    // ── GATE 1: Confirm this page is actually about NPFL ─────────────────────
    if (!isNPFLPage(rawHtml)) {
        console.error('❌ ABORT: The fetched page does not appear to be an NPFL page.');
        console.error('   The website structure may have changed. No data written to Firebase.');
        process.exit(1);
    }

    const $ = cheerio.load(rawHtml);
    const standings = [];
    const skipped   = [];

    $('table tbody tr').each((i, el) => {
        const cols = $(el).find('td');
        if (cols.length < 8) return; // skip header-like or malformed rows

        const teamRaw = $(cols[1]).text().trim();

        // ── GATE 2: Per-row competition filter ───────────────────────────────
        // Skip any row whose team name doesn't match a known NPFL club.
        if (!isNPFLTeam(teamRaw)) {
            skipped.push(teamRaw || `(row ${i})`);
            return;
        }

        const points = $(cols[9]).text().trim() || $(cols[8]).text().trim();

        standings.push({
            rank:         $(cols[0]).text().trim(),
            team:         teamRaw,
            played:       $(cols[2]).text().trim(),
            won:          $(cols[3]).text().trim(),
            drawn:        $(cols[4]).text().trim(),
            lost:         $(cols[5]).text().trim(),
            goalsFor:     $(cols[6]).text().trim(),
            goalsAgainst: $(cols[7]).text().trim(),
            points,
            // Keep these as strings — app.js uses parseInt() on all fields
            lastUpdated:  new Date().toISOString(),
            source:       'npfl.com.ng',
        });
    });

    // Log any rows that were skipped so you can see them in GitHub Actions logs
    if (skipped.length > 0) {
        console.warn(`⚠️  Skipped ${skipped.length} non-NPFL row(s): ${skipped.join(', ')}`);
    }

    // ── GATE 3: Refuse to write if no valid NPFL rows were found ─────────────
    if (standings.length === 0) {
        console.error('❌ ABORT: After filtering, zero valid NPFL teams were found.');
        console.error('   This usually means the page layout changed or it returned wrong data.');
        console.error('   Nothing was written to Firebase. Existing data preserved.');
        process.exit(1);
    }

    console.log(`Found ${standings.length} valid NPFL teams. Syncing to Firebase...`);

    // ── Write to Firestore in a single atomic batch ───────────────────────────
    try {
        const batch = db.batch();
        standings.forEach((team) => {
            const docId  = team.team.toLowerCase().replace(/[^a-z0-9]/g, '_');
            const docRef = db.collection('npfl_standings').doc(docId);
            batch.set(docRef, team, { merge: true });
        });
        await batch.commit();
        console.log(`✅ DATABASE UPDATED: ${standings.length} NPFL teams saved to npfl_standings.`);
    } catch (err) {
        console.error('❌ Firestore write failed:', err.message);
        process.exit(1);
    }
}

scrapeNPFL();
