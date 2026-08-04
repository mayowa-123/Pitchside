/**
 * 🎬 HIGHLIGHTLY BOT
 * Pulls real match highlights from Highlightly's Football API (not Scorebat —
 * this workflow used to call Scorebat by mistake despite being named and
 * budgeted around Highlightly's actual free/paid tier limits).
 *
 * Runs on a schedule (see .github/workflows/highlightly-bot.yml). Each run:
 *   1. Fetches up to REQUESTS_PER_RUN pages of highlights (paginated via offset)
 *   2. Labels each clip's Nigeria availability using the state/embeddable
 *      fields Highlightly already includes in the response — no extra
 *      per-clip API call needed for this.
 *   3. Saves new clips to Firestore, skipping ones already saved (dedup by videoId)
 *   4. Deletes any saved highlight older than RETENTION_DAYS, so the
 *      collection doesn't grow forever
 */

const admin = require('firebase-admin');
const axios = require('axios');

// Firebase Init
const serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT);
admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
});

const db = admin.firestore();

const CONFIG = {
  BASE_URL: 'https://soccer.highlightly.net',
  API_KEY: process.env.HIGHLIGHTLY_KEY, // was previously injected but never used — now actually used
  REQUESTS_PER_RUN: 10,
  ITEMS_PER_REQUEST: 40, // Highlightly's per-request max
  RETENTION_DAYS: 90,    // ~3 months, per plan — keeps Firestore from growing forever
};

class HighlightlyClient {
  constructor() {
    this.requestCount = 0;
  }

  async getHighlights(offset) {
    try {
      const url = `${CONFIG.BASE_URL}/highlights?limit=${CONFIG.ITEMS_PER_REQUEST}&offset=${offset}`;
      console.log(`📡 Fetching offset ${offset}: ${url}`);

      const response = await axios.get(url, {
        headers: {
          'x-rapidapi-key': CONFIG.API_KEY,
          'x-rapidapi-host': 'soccer.highlightly.net',
        },
        timeout: 15000,
      });

      this.requestCount++;
      console.log(`✅ Request successful`);

      const data = response.data;
      const items = Array.isArray(data) ? data : (data?.data || []);
      console.log(`   → Got ${items.length} highlights from this page`);
      return items;
    } catch (error) {
      const status = error.response?.status;
      if (status === 401 || status === 403) {
        console.error(`❌ Auth/plan error (${status}) — check HIGHLIGHTLY_KEY is set and current`);
      } else {
        console.error(`❌ API Error:`, error.message);
      }
      return [];
    }
  }

  getRequestsUsed() {
    return this.requestCount;
  }
}

// Reads the geo-restriction info Highlightly already includes on each
// highlight (state + embeddable fields) and decides Nigeria availability
// from it — no separate per-clip API call needed for this.
function checkNigeriaRestriction(video) {
  // embeddable === false means it can't be embedded ANYWHERE, Nigeria included.
  if (video.embeddable === false) return true;

  // `state` can be a flat string ('available'/'restricted') or, on some
  // responses, an object listing specific restricted country codes.
  const state = video.state;
  if (typeof state === 'string') {
    return state.toLowerCase().includes('restrict');
  }
  if (state && Array.isArray(state.restrictedCountries)) {
    return state.restrictedCountries.some(c => String(c).toUpperCase() === 'NG');
  }
  if (state && typeof state === 'object' && state.NG !== undefined) {
    return state.NG === 'restricted' || state.NG === false;
  }

  // No restriction data present at all → assume available. This gets more
  // precise once the paid-tier geo-restriction checker is active (Friday) —
  // for now this bundled field is the best signal we have, and defaulting
  // to "available" means we show a clip unless we have a real reason not to,
  // rather than hiding things unnecessarily.
  return false;
}

class FirebaseStorage {
  async saveHighlights(highlights) {
    if (!highlights || highlights.length === 0) return 0;

    const highlightsRef = db.collection('highlights');
    let saved = 0;

    for (const video of highlights) {
      try {
        const videoId = video.id;
        if (!videoId) continue;

        const existing = await highlightsRef
          .where('videoId', '==', String(videoId))
          .limit(1)
          .get();

        if (!existing.empty) continue;

        const homeTeam = video.match?.homeTeam?.name || '';
        const awayTeam = video.match?.awayTeam?.name || '';
        const competition = video.league?.name || video.competition?.name || 'Football';
        const title = video.title || (homeTeam && awayTeam ? `${homeTeam} vs ${awayTeam}` : 'Match Highlight');

        const docData = {
          videoId: String(videoId),
          title,
          thumbnail: video.thumbnail || video.imgUrl || '',
          channel: video.channel || 'Highlightly',
          channelTitle: video.channel || 'Highlightly',
          source: 'highlightly',
          embedUrl: video.embedUrl || video.embed || '',
          embed: video.embedUrl || video.embed || '',
          src: video.url || video.embedUrl || '',
          publishedAt: new Date(video.date || video.publishedAt || Date.now()),
          createdAt: new Date().toISOString(),
          verified: true,
          filtered: true,
          homeTeam,
          awayTeam,
          competition,
          category: competition,
          // Shown in the UI as "Not available in your region" instead of
          // silently hiding the clip — per plan, transparent not hidden.
          nigeriaRestricted: checkNigeriaRestriction(video),
        };

        await highlightsRef.add(docData);
        saved++;
      } catch (error) {
        console.error(`Failed to save one highlight:`, error.message);
      }
    }

    return saved;
  }

  // Deletes any highlight older than RETENTION_DAYS so Firestore storage
  // doesn't grow forever — keeps the feed feeling fresh too.
  async cleanupOldHighlights() {
    const cutoff = new Date(Date.now() - CONFIG.RETENTION_DAYS * 24 * 60 * 60 * 1000);
    console.log(`\n🧹 Cleaning up highlights older than ${cutoff.toISOString().slice(0, 10)}...`);

    let deleted = 0;
    try {
      const oldOnes = await db.collection('highlights')
        .where('publishedAt', '<', cutoff)
        .limit(500) // batched — Firestore batch delete limit is 500
        .get();

      if (oldOnes.empty) {
        console.log('   → Nothing to clean up');
        return 0;
      }

      const batch = db.batch();
      oldOnes.docs.forEach(doc => batch.delete(doc.ref));
      await batch.commit();
      deleted = oldOnes.docs.length;
      console.log(`   → Deleted ${deleted} old highlights`);
    } catch (error) {
      console.error('   → Cleanup error:', error.message);
    }
    return deleted;
  }

  async getVideoCount() {
    try {
      const snap = await db.collection('highlights')
        .where('source', '==', 'highlightly')
        .count()
        .get();
      return snap.data().count;
    } catch (error) {
      return 0;
    }
  }
}

class HighlightlyBot {
  constructor() {
    this.client = new HighlightlyClient();
    this.storage = new FirebaseStorage();
  }

  async run() {
    console.log('\n' + '='.repeat(80));
    console.log('🤖 HIGHLIGHTLY BOT');
    console.log('='.repeat(80) + '\n');

    if (!CONFIG.API_KEY) {
      console.error('❌ HIGHLIGHTLY_KEY environment variable is not set — aborting run');
      process.exit(1);
    }

    try {
      let totalSaved = 0;

      for (let i = 0; i < CONFIG.REQUESTS_PER_RUN; i++) {
        const offset = i * CONFIG.ITEMS_PER_REQUEST;
        console.log(`\n📥 Page ${i + 1}/${CONFIG.REQUESTS_PER_RUN} (offset ${offset})...`);

        const highlightsData = await this.client.getHighlights(offset);

        if (!highlightsData || highlightsData.length === 0) {
          console.log('ℹ️  No highlights found at this offset — stopping pagination early');
          break; // ran out of pages, no point continuing to higher offsets
        }

        const saved = await this.storage.saveHighlights(highlightsData);
        totalSaved += saved;
        console.log(`   → Saved ${saved} new videos`);

        if (i < CONFIG.REQUESTS_PER_RUN - 1) {
          await new Promise(resolve => setTimeout(resolve, 500));
        }
      }

      const deleted = await this.storage.cleanupOldHighlights();

      console.log('\n' + '='.repeat(80));
      console.log(`📊 RUN RESULTS:`);
      console.log(`   • Total new videos saved: ${totalSaved}`);
      console.log(`   • Old videos cleaned up: ${deleted}`);
      console.log(`   • Requests used: ${this.client.getRequestsUsed()}/${CONFIG.REQUESTS_PER_RUN}`);

      const totalVideos = await this.storage.getVideoCount();
      console.log(`   • Total library: ${totalVideos} videos`);
      console.log('='.repeat(80));
    } catch (error) {
      console.error('Bot error:', error.message);
    }
  }
}

async function main() {
  try {
    const bot = new HighlightlyBot();
    await bot.run();

    console.log('\n✅ BOT COMPLETED SUCCESSFULLY\n');
    process.exit(0);
  } catch (error) {
    console.error('\n❌ ERROR:', error.message);
    process.exit(1);
  }
}

main();
