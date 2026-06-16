/**
 * ═════════════════════════════════════════════════════════════════════════════
 * 🎬 PITCHSIDE HIGHLIGHTLY BOT - Latest Only Edition
 * ═════════════════════════════════════════════════════════════════════════════
 * 
 * Strategy:
 * - Runs 9 times per day (every 2h 40m)
 * - Fetches highlights from LAST 7 DAYS only
 * - No complex date logic
 * - Simple, reliable, clean
 * - Users get LATEST content first!
 * 
 * Within 3-6 months: 500+ fresh highlights
 * Free Tier: 9 runs × 10 requests = ~90/day (safe!)
 * ═════════════════════════════════════════════════════════════════════════════
 */

const admin = require('firebase-admin');
const axios = require('axios');

// Firebase Init
const serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT);
admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
});

const db = admin.firestore();
const HIGHLIGHTLY_KEY = process.env.HIGHLIGHTLY_KEY;

const CONFIG = {
  API_KEY: HIGHLIGHTLY_KEY,
  BASE_URL: 'https://sport-highlights-api.p.rapidapi.com',
  REQUESTS_PER_RUN: 10,
  DAYS_BACK: 7, // Fetch last 7 days
};

// ════════════════════════════════════════════════════════════════════════════
// 🔗 HIGHLIGHTLY API CLIENT
// ════════════════════════════════════════════════════════════════════════════

class HighlightlyClient {
  constructor(apiKey) {
    this.apiKey = apiKey;
    this.baseURL = CONFIG.BASE_URL;
    this.requestCount = 0;
  }

  async makeRequest(endpoint, params = {}) {
    if (this.requestCount >= CONFIG.REQUESTS_PER_RUN) {
      console.log('⚠️ Request limit reached for this run');
      return null;
    }

    try {
      const url = `${this.baseURL}${endpoint}`;
      const response = await axios.get(url, {
        params: {
          ...params,
        },
        headers: {
          'X-RapidAPI-Key': this.apiKey,
          'X-RapidAPI-Host': 'sport-highlights-api.p.rapidapi.com',
        },
        timeout: 10000,
      });

      this.requestCount++;
      console.log(`📡 Request ${this.requestCount}/${CONFIG.REQUESTS_PER_RUN}: ${endpoint}`);

      return response.data;
    } catch (error) {
      console.error(`❌ API Error (${endpoint}):`, error.message);
      return null;
    }
  }

  async getMatches(startDate, endDate) {
    return await this.makeRequest('/matches', {
      date_start: startDate,
      date_end: endDate,
      limit: 50,
    });
  }

  async getMatchHighlights(matchId) {
    return await this.makeRequest(`/matches/${matchId}/highlights`);
  }

  getRequestsUsed() {
    return this.requestCount;
  }
}

// ════════════════════════════════════════════════════════════════════════════
// 💾 FIREBASE STORAGE
// ════════════════════════════════════════════════════════════════════════════

class FirebaseStorage {
  async saveHighlights(highlights) {
    if (!highlights || highlights.length === 0) return 0;

    const highlightsRef = db.collection('highlights');
    let saved = 0;

    for (const video of highlights) {
      try {
        const videoId = video.videoId || video.id || video.match_id;
        if (!videoId) continue;

        // Check if already exists
        const existing = await highlightsRef
          .where('videoId', '==', String(videoId))
          .limit(1)
          .get();

        if (!existing.empty) {
          console.log(`⏭️  Already saved: ${video.title}`);
          continue;
        }

        // Save new video
        const docData = {
          videoId: String(videoId),
          youtubeId: video.youtubeId || String(videoId),
          title: video.title || 'Highlight',
          thumbnail: video.thumbnail || video.image || '',
          channel: 'Highlightly',
          channelTitle: 'Highlightly',
          source: 'highlightly',
          embedUrl: video.embedUrl || video.embed_url || '',
          embed: video.embed || '',
          src: video.url || '',
          publishedAt: new Date(video.date || Date.now()),
          createdAt: new Date().toISOString(),
          verified: true,
          filtered: true,
          matchId: video.matchId || '',
          homeTeam: video.homeTeam?.name || video.home_team || '',
          awayTeam: video.awayTeam?.name || video.away_team || '',
          competition: video.league?.name || video.competition || 'Football',
          category: video.league?.name || video.competition || 'Football',
        };

        await highlightsRef.add(docData);
        saved++;
        console.log(`✅ Saved: ${video.title}`);
      } catch (error) {
        console.error(`Failed to save video:`, error.message);
      }
    }

    return saved;
  }

  async getVideoCount() {
    try {
      const snap = await db.collection('highlights')
        .where('source', '==', 'highlightly')
        .count()
        .get();
      
      return snap.data().count;
    } catch (error) {
      console.error('Get count error:', error.message);
      return 0;
    }
  }
}

// ════════════════════════════════════════════════════════════════════════════
// 🤖 MAIN BOT LOGIC
// ════════════════════════════════════════════════════════════════════════════

class HighlightlyLatestBot {
  constructor() {
    this.client = new HighlightlyClient(CONFIG.API_KEY);
    this.storage = new FirebaseStorage();
  }

  async run() {
    console.log('\n' + '='.repeat(80));
    console.log('🤖 HIGHLIGHTLY BOT - Latest Highlights Only');
    console.log('='.repeat(80) + '\n');

    try {
      await this.fetchLatestHighlights();
    } catch (error) {
      console.error('Main error:', error.message);
    }
  }

  async fetchLatestHighlights() {
    // Calculate date range: last 7 days
    const today = new Date();
    const sevenDaysAgo = new Date(today.getTime() - CONFIG.DAYS_BACK * 24 * 60 * 60 * 1000);
    
    const startStr = sevenDaysAgo.toISOString().split('T')[0];
    const endStr = today.toISOString().split('T')[0];

    console.log(`📅 Fetching highlights from: ${startStr} to ${endStr}`);
    console.log(`📆 (Last ${CONFIG.DAYS_BACK} days)\n`);

    // Get matches for last 7 days
    const matchesData = await this.client.getMatches(startStr, endStr);

    if (!matchesData || !matchesData.data || matchesData.data.length === 0) {
      console.log('ℹ️  No matches found in the last 7 days');
      console.log('✅ BOT RUN COMPLETED (no new data)');
      return;
    }

    console.log(`🎬 Found ${matchesData.data.length} matches with potential highlights\n`);

    // Process matches and get highlights
    let videosSaved = 0;
    let videosChecked = 0;
    
    // Process first 8 matches (respects request limit)
    const matchesToProcess = matchesData.data.slice(0, 8);

    for (const match of matchesToProcess) {
      if (this.client.getRequestsUsed() >= CONFIG.REQUESTS_PER_RUN - 1) {
        console.log('\n⚠️ Request limit nearly reached, stopping early');
        break;
      }

      console.log(`🔍 Checking: ${match.homeTeam?.name || 'Unknown'} vs ${match.awayTeam?.name || 'Unknown'}`);
      
      const highlightsData = await this.client.getMatchHighlights(match.id);
      videosChecked++;

      if (highlightsData && highlightsData.data && Array.isArray(highlightsData.data)) {
        console.log(`   → Found ${highlightsData.data.length} highlights`);
        
        const highlights = highlightsData.data.map(h => ({
          ...h,
          matchId: match.id,
          homeTeam: match.homeTeam,
          awayTeam: match.awayTeam,
          league: match.league,
        }));

        const saved = await this.storage.saveHighlights(highlights);
        videosSaved += saved;
      } else {
        console.log(`   → No highlights available`);
      }
    }

    console.log('\n' + '='.repeat(80));
    console.log(`📊 RESULTS:`);
    console.log(`   Matches checked: ${videosChecked}`);
    console.log(`   New videos saved: ${videosSaved}`);
    console.log(`   API requests used: ${this.client.getRequestsUsed()}/${CONFIG.REQUESTS_PER_RUN}`);
    
    const totalVideos = await this.storage.getVideoCount();
    console.log(`   Total library: ${totalVideos} videos`);
    console.log('='.repeat(80));
  }
}

// ════════════════════════════════════════════════════════════════════════════
// 🚀 MAIN EXECUTION
// ════════════════════════════════════════════════════════════════════════════

async function main() {
  try {
    const bot = new HighlightlyLatestBot();
    await bot.run();
    
    console.log('\n✅ BOT RUN COMPLETED SUCCESSFULLY\n');
    process.exit(0);
  } catch (error) {
    console.error('\n❌ BOT ERROR:', error.message);
    console.error(error);
    process.exit(1);
  }
}

main();

module.exports = { HighlightlyLatestBot };
