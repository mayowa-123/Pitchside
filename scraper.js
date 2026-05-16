import axios from 'axios';
import * as cheerio from 'cheerio';
import admin from 'firebase-admin';
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
    timeout: 45000,
    maxRedirects: 5,
    headers: {
        'User-Agent':      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
        'Accept-Language': 'en-US,en;q=0.9',
        'Accept':          'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'Referer':         'https://npfl.com.ng/',
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

// ══════════════════════════════════════════════════════════════════════════════
//  TASK 1 — STANDINGS  (npfl.com.ng/npfl-table/)
// ══════════════════════════════════════════════════════════════════════════════
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

    if (skipped.length) console.warn(`   ⚠️  Skipped: ${skipped.join(' | ')}`);
    if (standings.length === 0) { console.error('❌ No standings found.'); return; }

    const batch = db.batch();
    standings.forEach(t =>
        batch.set(db.collection('npfl_standings').doc(makeDocId(t.team)), t, { merge: true })
    );
    await batch.commit();
    console.log(`✅ Standings: ${standings.length} teams saved.`);
}

// ══════════════════════════════════════════════════════════════════════════════
//  TASK 2 — FIXTURES + RESULTS  (npfl.com.ng/fixtures/)
//
//  The fixtures page stores the ENTIRE season in one table.
//  Column layout (confirmed from log):
//    col[0] = Date+Time  e.g. "2024-08-31 16:00:30A"
//    col[1] = Home Team  e.g. "Rangers International"
//    col[2] = Score      e.g. "0 - 0"  (or empty if not played yet)
//    col[3] = League     e.g. "Nigeria Premier Foot"
//    col[4] = Ground
//    col[5] = Matchday
//
//  Classification:
//    - Has score + date is in the past  →  npfl_results  (last 10 only)
//    - No score + date is today/future  →  npfl_fixtures (next 20 only)
// ══════════════════════════════════════════════════════════════════════════════
async function scrapeFixturesAndResults() {
    console.log('\n⚽ [2/2] Scraping FIXTURES + RESULTS from npfl.com.ng/fixtures/...');

    let html;
    try {
        const { data } = await HTTP.get('https://npfl.com.ng/fixtures/');
        html = data;
    } catch (err) {
        console.error('❌ Fixtures page failed:', err.message);
        return;
    }

    const $       = cheerio.load(html);
    const today   = new Date();
    today.setHours(0, 0, 0, 0);

    const allFixtures = [];
    const allResults  = [];

    $('table tbody tr').each((i, el) => {
        const cols     = $(el).find('td');
        if (cols.length < 3) return;

        // ── Extract using confirmed column layout ─────────────────────────────
        const rawDate  = $(cols[0]).text().trim();   // "2024-08-31 16:00:30A"
        const home     = $(cols[1]).text().trim();   // "Rangers International"
        const scoreRaw = $(cols[2]).text().trim();   // "0 - 0" or ""
        // col[3] = league, col[4] = ground, col[5] = matchday (not needed)

        // Skip if home team isn't a known NPFL team
        if (!isNPFLTeam(home)) return;

        // Away team: npfl.com.ng fixtures table only has Home in col[1]
        // The away team is sometimes in a separate cell or embedded in the score cell.
        // From the log "0 - 0" is in col[2], so we need to find away team.
        // Check if there's a col after score that has a team name.
        let away = '';
        for (let c = 3; c < cols.length; c++) {
            const cellText = $(cols[c]).text().trim();
            if (isNPFLTeam(cellText)) { away = cellText; break; }
        }
        // If still no away team, skip — we can't render a match without both teams
        if (!away) return;

        // ── Parse date ────────────────────────────────────────────────────────
        // Format: "2026-05-25 16:00:30A" — use regex to avoid suffix issues
        // new Date('YYYY-MM-DD') parses as UTC and can shift by timezone;
        // we construct with explicit local parts to stay in the correct day.
        const datePart  = (rawDate.match(/(\d{4}-\d{2}-\d{2})/) || [])[1] || '';
        const timeMatch = rawDate.match(/(\d{1,2}:\d{2})/);
        const timePart  = timeMatch ? timeMatch[1] : '16:00';
        if (!datePart) return;
        const [yr, mo, dy] = datePart.split('-').map(Number);
        const matchDate    = new Date(yr, mo - 1, dy);   // local midnight, no UTC shift

        // ── Score parsing ─────────────────────────────────────────────────────
        const scoreMatch = scoreRaw.match(/(\d+)\s*[-:]\s*(\d+)/);
        const hasScore   = !!scoreMatch;
        const isPast     = matchDate < today;
        const isFuture   = matchDate >= today;

        const entry = {
            homeTeam:    home,
            awayTeam:    away,
            date:        datePart,
            time:        timePart,
            lastUpdated: new Date().toISOString(),
            source:      'npfl.com.ng',
        };

        if (hasScore && isPast) {
            // Finished match with score → result
            entry.homeScore = scoreMatch[1];
            entry.awayScore = scoreMatch[2];
            entry.status    = 'FT';
            allResults.push({ ...entry, _matchDate: matchDate });
        } else if (!hasScore) {
            // No score = upcoming or postponed — save as fixture regardless of date
            // (catches today's matches + future matchdays)
            entry.status = 'NS';
            allFixtures.push({ ...entry, _matchDate: matchDate });
        }
        // scored past matches already handled above
    });

    // ── Sort and trim ─────────────────────────────────────────────────────────
    // Fixtures: soonest first, max 20
    allFixtures.sort((a, b) => a._matchDate - b._matchDate);
    const fixtures = allFixtures.slice(0, 20).map(({ _matchDate, ...f }) => f);

    // Results: most recent first, max 15
    allResults.sort((a, b) => b._matchDate - a._matchDate);
    const results = allResults.slice(0, 15).map(({ _matchDate, ...r }) => r);

    console.log(`   Found: ${allFixtures.length} upcoming, ${allResults.length} finished`);
    console.log(`   Saving: ${fixtures.length} fixtures, ${results.length} results`);

    // ── Always wipe npfl_fixtures first ──────────────────────────────────────
    try {
        const oldDocs = await db.collection('npfl_fixtures').listDocuments();
        if (oldDocs.length > 0) {
            const delBatch = db.batch();
            oldDocs.forEach(ref => delBatch.delete(ref));
            await delBatch.commit();
            console.log(`   🗑️  Cleared ${oldDocs.length} old fixture docs.`);
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
        console.log(`✅ Fixtures: ${fixtures.length} matches → npfl_fixtures`);
        fixtures.forEach(f => console.log(`   📅 ${f.date} ${f.time}  ${f.homeTeam} vs ${f.awayTeam}`));
    } else {
        console.warn('   ⚠️  No upcoming fixtures found.');
    }

    // ── Write results ─────────────────────────────────────────────────────────
    if (results.length > 0) {
        const batch = db.batch();
        results.forEach((r, i) => {
            const id = `${makeDocId(r.homeTeam)}_vs_${makeDocId(r.awayTeam)}_${i}`;
            batch.set(db.collection('npfl_results').doc(id), r, { merge: true });
        });
        await batch.commit();
        console.log(`✅ Results: ${results.length} matches → npfl_results`);
        results.slice(0, 5).forEach(r =>
            console.log(`   🏁 ${r.date}  ${r.homeTeam} ${r.homeScore}-${r.awayScore} ${r.awayTeam}`)
        );
    } else {
        console.warn('   ⚠️  No results found.');
    }
}

// ══════════════════════════════════════════════════════════════════════════════
//  MAIN
// ══════════════════════════════════════════════════════════════════════════════
async function main() {
    console.log('🚀 NPFL Scraper —', new Date().toUTCString());

    const jobs = await Promise.allSettled([
        scrapeStandings(),
        scrapeFixturesAndResults(),
    ]);

    jobs.forEach((j, i) => {
        if (j.status === 'rejected')
            console.error(`❌ Job ${i + 1} error:`, j.reason);
    });

    console.log('\n🏁 Done.');
}

main().catch(err => { console.error('❌ Fatal:', err); process.exit(1); });
