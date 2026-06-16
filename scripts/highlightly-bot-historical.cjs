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
  REQUESTS_PER_RUN: 9,
  START_YEAR: 2020,
  END_YEAR: 2026,
};

class ProgressTracker {
  async getProgress() {
    try {
      const doc = await db.collection('bot_progress').doc('highlightly_historical').get();
      
      if (!doc.exists) {
        return {
          currentYear: CONFIG.START_YEAR,
          currentMonth: 1,
          mode: 'historical',
          videosProcessed: 0,
          lastRun: new Date().toISOString(),
        };
      }

      return doc.data();
    } catch (error) {
      console.error('Get progress error:', error.message);
      return {
        currentYear: CONFIG.START_YEAR,
        currentMonth: 1,
        mode: 'historical',
        videosProcessed: 0,
      };
    }
  }

  async updateProgress(data) {
    try {
      await db.collection('bot_progress').doc('highlightly_historical').set({
        ...data,
        lastRun: new Date().toISOString(),
      }, { merge: true });
      
      console.log('✅ Progress updated:', data);
    } catch (error) {
      console.error('Update progress error:', error.message);
    }
  }

  getDateRange(year, month) {
    try {
      // Create dates safely
      const startDay = 1;
      const startDate = new Date(year, month - 1, startDay);
      
      // Get last day of month
      const endDate = new Date(year, month, 0);
      
      // Format as YYYY-MM-DD
      const startStr = startDate.toISOString().split('T')[0];
      const endStr = endDate.toISOString().split('T')[0];
      
      console.log(`📆 Date range: ${startStr} to ${endStr}`);
      
      return {
        startDate: startStr,
        endDate: endStr,
        label: `${year}-${String(month).padStart(2, '0')}`
      };
    } catch (error) {
      console.error('Date range error:', error.message);
      // Return a safe default
      return {
        startDate: `${year}-${String(month).padStart(2, '0')}-01`,
        endDate: `${year}-${String(month).padStart(2, '0')}-28`,
        label: `${year}-${String(month).padStart(2, '0')}`
      };
    }
  }

  advanceMonth(year, month) {
    if (month === 12) {
      return { year: year + 1, month: 1 };
    }
    return { year, month: month + 1 };
  }
}

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
      console.error(`API Error (${endpoint}):`, error.message);
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
          console.log(`⏭️  Video already exists: ${video.title}`);
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

class HighlightlyBot {
  constructor() {
    this.progressTracker = new ProgressTracker();
    this.client = new HighlightlyClient(CONFIG.API_KEY);
    this.storage = new FirebaseStorage();
  }

  async run() {
    console.log('\n' + '='.repeat(80));
    console.log('🤖 HIGHLIGHTLY BOT - Historical Archive Builder');
    console.log('='.repeat(80) + '\n');

    try {
      const progress = await this.progressTracker.getProgress();
      console.log('📍 Current Progress:', progress);

      if (progress.mode === 'latest' || progress.currentYear >= CONFIG.END_YEAR) {
        await this.runLatestMode();
        return;
      }

      await this.runHistoricalMode(progress);
    } catch (error) {
      console.error('Main error:', error.message);
    }
  }

  async runHistoricalMode(progress) {
    console.log(`\n📅 Fetching highlights for: ${progress.currentYear}-${String(progress.currentMonth).padStart(2, '0')}`);

    const dateRange = this.progressTracker.getDateRange(progress.currentYear, progress.currentMonth);
    console.log(`📆 Date range: ${dateRange.startDate} to ${dateRange.endDate}`);

    const matchesData = await this.client.getMatches(dateRange.startDate, dateRange.endDate);

    if (!matchesData || !matchesData.data || matchesData.data.length === 0) {
      console.log('ℹ️  No matches found for this period');
      const nextMonth = this.progressTracker.advanceMonth(progress.currentYear, progress.currentMonth);
      await this.progressTracker.updateProgress(nextMonth);
      return;
    }

    console.log(`🎬 Found ${matchesData.data.length} matches`);

    let videosSaved = 0;
    const matchesToProcess = matchesData.data.slice(0, 5);

    for (const match of matchesToProcess) {
      const highlightsData = await this.client.getMatchHighlights(match.id);

      if (highlightsData && highlightsData.data && Array.isArray(highlightsData.data)) {
        const highlights = highlightsData.data.map(h => ({
          ...h,
          matchId: match.id,
          homeTeam: match.homeTeam,
          awayTeam: match.awayTeam,
          league: match.league,
        }));

        const saved = await this.storage.saveHighlights(highlights);
        videosSaved += saved;
      }
    }

    console.log(`\n✅ Saved ${videosSaved} new videos this run`);
    console.log(`📡 API requests used: ${this.client.getRequestsUsed()}/${CONFIG.REQUESTS_PER_RUN}`);

    const nextMonth = this.progressTracker.advanceMonth(progress.currentYear, progress.currentMonth);
    const totalVideos = await this.storage.getVideoCount();

    await this.progressTracker.updateProgress({
      currentYear: nextMonth.year,
      currentMonth: nextMonth.month,
      mode: nextMonth.year >= CONFIG.END_YEAR ? 'latest' : 'historical',
      videosProcessed: totalVideos,
    });

    console.log(`\n➡️  Next run will fetch: ${nextMonth.year}-${String(nextMonth.month).padStart(2, '0')}`);
  }

  async runLatestMode() {
    console.log('\n🔄 Running in LATEST MODE');
    
    const today = new Date();
    const sevenDaysAgo = new Date(today.getTime() - 7 * 24 * 60 * 60 * 1000);
    
    const startStr = sevenDaysAgo.toISOString().split('T')[0];
    const endStr = today.toISOString().split('T')[0];

    console.log(`📆 Fetching from: ${startStr} to ${endStr}`);

    const matchesData = await this.client.getMatches(startStr, endStr);

    if (!matchesData || !matchesData.data || matchesData.data.length === 0) {
      console.log('ℹ️  No recent matches found');
      return;
    }

    console.log(`🎬 Found ${matchesData.data.length} recent matches`);

    let videosSaved = 0;
    const matchesToProcess = matchesData.data.slice(0, 8);

    for (const match of matchesToProcess) {
      const highlightsData = await this.client.getMatchHighlights(match.id);

      if (highlightsData && highlightsData.data && Array.isArray(highlightsData.data)) {
        const highlights = highlightsData.data.map(h => ({
          ...h,
          matchId: match.id,
          homeTeam: match.homeTeam,
          awayTeam: match.awayTeam,
          league: match.league,
        }));

        const saved = await this.storage.saveHighlights(highlights);
        videosSaved += saved;
      }
    }

    console.log(`\n✅ Saved ${videosSaved} new videos from recent matches`);
  }
}

async function main() {
  try {
    const bot = new HighlightlyBot();
    await bot.run();
    
    console.log('\n' + '='.repeat(80));
    console.log('✅ BOT RUN COMPLETED SUCCESSFULLY');
    console.log('='.repeat(80) + '\n');
    
    process.exit(0);
  } catch (error) {
    console.error('\n❌ BOT ERROR:', error.message);
    console.error(error);
    process.exit(1);
  }
}

main();

module.exports = { HighlightlyBot };
