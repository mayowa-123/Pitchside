/**
 * ═════════════════════════════════════════════════════════════════════════════
 * 🎬 PITCHSIDE SCOREBAT BOT - Latest Highlights Edition
 * ═════════════════════════════════════════════════════════════════════════════
 * 
 * Strategy:
 * - Runs 9 times per day (every 2h 40m)
 * - Fetches LATEST highlights only
 * - NO historical data needed
 * - Simple, clean, reliable
 * - Real-time fresh content!
 * 
 * Free Tier: 9 runs × 10 requests = ~90/day (safe!)
 * No subscriptions, no drama!
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
const SCOREBAT_API_KEY = process.env.HIGHLIGHTLY_KEY; // Use same key for Scorebat

const CONFIG = {
  API_KEY: SCOREBAT_API_KEY,
  BASE_URL: 'https://scorebat-video-api.p.rapidapi.com',
  HOST: 'scorebat-video-api.p.rapidapi.com',
  REQUESTS_PER_RUN: 10,
};

// ════════════════════════════════════════════════════════════════════════════
// 🔗 SCOREBAT API CLIENT
// ════════════════════════════════════════════════════════════════════════════

class ScorebatClient {
  constructor(apiKey, host) {
    this.apiKey = apiKey;
    this.host = host;
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
        params: params,
        headers: {
          'x-rapidapi-key': this.apiKey,
          'x-rapidapi-host': this.host,
        },
        timeout: 10000,
      });

      this.requestCount++;
      console.log(`📡 Request ${this.requestCount}/${CONFIG.REQUESTS_PER_RUN}: ${endpoint}`);

      return response.data;
    } catch (error) {
      console.error(`❌ API Error (${endpoint}):`, error.message);
      if (error.response?.status === 403) {
        console.error('⚠️ 403 Forbidden - Check your API key!');
      }
      return null;
    }
  }

  async getLatestHighlights() {
    // Scorebat endpoint for latest highlights
    return await this.makeRequest('/v1/latest', {
      limit: 50,
    });
  }

  async getHighlightsByDate(date) {
    // Get highlights for a specific date (yyyy-mm-dd format)
    return await this.makeRequest(`/v1/latest`, {
      date: date,
      limit: 50,
    });
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
        // Scorebat uses 'id' or we generate one
        const videoId = video.id || video.video_id || `scorebat_${Date.now()}_${Math.random()}`;
        if (!videoId) continue;

        // Check if already exists
        const existing = await highlightsRef
          .where('videoId', '==', String(videoId))
          .limit(1)
          .get();

        if (!existing.empty) {
          console.log(`⏭️  Already saved: ${video.title || 'Video'}`);
          continue;
        }

        // Parse teams and competition from title
        let homeTeam = '';
        let awayTeam = '';
        let competition = 'Football';

        if (video.title) {
          // Try to extract teams from title (e.g., "Team A vs Team B - Competition")
          const parts = video.title.split('-');
          if (parts.length >= 2) {
            const matchPart = parts[0].trim();
            const teams = matchPart.split('vs');
            if (teams.length === 2) {
              homeTeam = teams[0].trim();
              awayTeam = teams[1].trim();
            }
            if (parts.length > 1) {
              competition = parts[parts.length - 1].trim();
            }
          }
        }

        // Save new video
        const docData = {
          videoId: String(videoId),
          title: video.title || 'Match Highlight',
          thumbnail: video.thumbnail || video.thumbnailUrl || '',
          channel: 'Scorebat',
          channelTitle: 'Scorebat',
          source: 'scorebat',
          embedUrl: video.embed || '',
          embed: video.embed || '',
          src: video.url || '',
          publishedAt: new Date(video.date || video.published || Date.now()),
          createdAt: new Date().toISOString(),
          verified: true,
          filtered: true,
          homeTeam: homeTeam,
          awayTeam: awayTeam,
          competition: competition,
          category: competition,
          rating: video.rating || 0,
          views: video.views || 0,
        };

        await highlightsRef.add(docData);
        saved++;
        console.log(`✅ Saved: ${video.title || 'Highlight'}`);
      } catch (error) {
        console.error(`Failed to save video:`, error.message);
      }
    }

    return saved;
  }

  async getVideoCount() {
    try {
      const snap = await db.collection('highlights')
        .where('source', '==', 'scorebat')
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

class ScorebatBot {
  constructor() {
    this.client = new ScorebatClient(CONFIG.API_KEY, CONFIG.HOST);
    this.storage = new FirebaseStorage();
  }

  async run() {
    console.log('\n' + '='.repeat(80));
    console.log('🤖 SCOREBAT BOT - Latest Football Highlights');
    console.log('='.repeat(80) + '\n');

    try {
      await this.fetchLatestHighlights();
    } catch (error) {
      console.error('Main error:', error.message);
    }
  }

  async fetchLatestHighlights() {
    console.log(`📅 Fetching latest highlights...\n`);

    // Get latest highlights
    const highlightsData = await this.client.getLatestHighlights();

    if (!highlightsData || !highlightsData.results || highlightsData.results.length === 0) {
      console.log('ℹ️  No new highlights available right now');
      console.log('✅ BOT RUN COMPLETED (waiting for new matches)');
      return;
    }

    console.log(`🎬 Found ${highlightsData.results.length} highlights available\n`);

    // Save highlights
    const videosSaved = await this.storage.saveHighlights(highlightsData.results);

    console.log('\n' + '='.repeat(80));
    console.log(`📊 RESULTS:`);
    console.log(`   New videos saved: ${videosSaved}`);
    console.log(`   API requests used: ${this.client.getRequestsUsed()}/${CONFIG.REQUESTS_PER_RUN}`);
    
    const totalVideos = await this.storage.getVideoCount();
    console.log(`   Total Scorebat library: ${totalVideos} videos`);
    console.log('='.repeat(80));

    if (videosSaved > 0) {
      console.log(`\n✨ Successfully added ${videosSaved} new highlights to your library!`);
    }
  }
}

// ════════════════════════════════════════════════════════════════════════════
// 🚀 MAIN EXECUTION
// ════════════════════════════════════════════════════════════════════════════

async function main() {
  try {
    const bot = new ScorebatBot();
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

module.exports = { ScorebatBot };
