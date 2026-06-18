/**
 * 🎬 SCOREBAT BOT - WORKING VERSION
 * Correctly parses nested Scorebat response
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
  BASE_URL: 'https://www.scorebat.com/video-api/',
  REQUESTS_PER_RUN: 10,
};

class ScorebatClient {
  constructor() {
    this.baseURL = CONFIG.BASE_URL;
    this.requestCount = 0;
  }

  async getLatestHighlights() {
    try {
      console.log(`📡 Fetching from: ${this.baseURL}`);
      
      const response = await axios.get(this.baseURL, {
        timeout: 15000,
      });

      this.requestCount++;
      console.log(`✅ Request successful`);

      // Parse the response - Scorebat returns matches with nested videos
      const data = response.data;
      let allVideos = [];

      // Handle different response formats
      if (Array.isArray(data)) {
        // If it's already an array
        allVideos = data;
      } else if (typeof data === 'object') {
        // If it's an object with matches as keys
        Object.values(data).forEach(match => {
          if (match && match.videos && Array.isArray(match.videos)) {
            allVideos = allVideos.concat(match.videos);
          }
        });
      }

      console.log(`   → Extracted ${allVideos.length} videos from response`);
      return allVideos;
    } catch (error) {
      console.error(`❌ API Error:`, error.message);
      return [];
    }
  }

  getRequestsUsed() {
    return this.requestCount;
  }
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

        // Check if exists
        const existing = await highlightsRef
          .where('videoId', '==', String(videoId))
          .limit(1)
          .get();

        if (!existing.empty) continue;

        // Parse teams
        let homeTeam = '';
        let awayTeam = '';
        let competition = 'Football';

        if (video.title) {
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

        // Save
        const docData = {
          videoId: String(videoId),
          title: video.title || 'Match Highlight',
          thumbnail: video.thumbnail || '',
          channel: 'Scorebat',
          channelTitle: 'Scorebat',
          source: 'scorebat',
          embedUrl: video.embed || '',
          embed: video.embed || '',
          src: video.url || '',
          publishedAt: new Date(video.date || Date.now()),
          createdAt: new Date().toISOString(),
          verified: true,
          filtered: true,
          homeTeam: homeTeam,
          awayTeam: awayTeam,
          competition: competition,
          category: competition,
        };

        await highlightsRef.add(docData);
        saved++;
      } catch (error) {
        console.error(`Failed:`, error.message);
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
      return 0;
    }
  }
}

class ScorebatBot {
  constructor() {
    this.client = new ScorebatClient();
    this.storage = new FirebaseStorage();
  }

  async run() {
    console.log('\n' + '='.repeat(80));
    console.log('🤖 SCOREBAT BOT - WORKING VERSION');
    console.log('='.repeat(80) + '\n');

    try {
      let totalSaved = 0;

      for (let i = 0; i < CONFIG.REQUESTS_PER_RUN; i++) {
        console.log(`\n📥 Request ${i + 1}/${CONFIG.REQUESTS_PER_RUN}...`);

        const highlightsData = await this.client.getLatestHighlights();

        if (!highlightsData || highlightsData.length === 0) {
          console.log('ℹ️  No highlights found');
          continue;
        }

        const saved = await this.storage.saveHighlights(highlightsData);
        totalSaved += saved;
        console.log(`   → Saved ${saved} new videos`);

        if (i < CONFIG.REQUESTS_PER_RUN - 1) {
          await new Promise(resolve => setTimeout(resolve, 500));
        }
      }

      console.log('\n' + '='.repeat(80));
      console.log(`📊 RUN RESULTS:`);
      console.log(`   • Total new videos saved: ${totalSaved}`);
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
    const bot = new ScorebatBot();
    await bot.run();
    
    console.log('\n✅ BOT COMPLETED SUCCESSFULLY\n');
    process.exit(0);
  } catch (error) {
    console.error('\n❌ ERROR:', error.message);
    process.exit(1);
  }
}

main();
