/**
 * ═════════════════════════════════════════════════════════════════════════════
 * 🎬 PITCHSIDE HIGHLIGHTLY BOT - Historical Archive Builder
 * ═════════════════════════════════════════════════════════════════════════════
 * 
 * Strategy:
 * - Runs 9 times per day (~2.67 hours apart)
 * - Fetches highlights from 2020 onwards
 * - Within ~1 year: Complete 2020-2026 archive
 * - Auto-switches to "latest only" mode at 2026
 * - Users can search highlights from 2020-present
 * 
 * Free Tier Usage: 9 runs × 11 requests = ~99/day (safe buffer!)
 * 
 * Deploy: GitHub Actions (scheduled every 2h 40m)
 * Firebase Integration: Store highlights + progress tracking
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
const BASE_URL = 'https://football.highlightly.net';

// ════════════════════════════════════════════════════════════════════════════
// 🎯 CONFIGURATION
// ════════════════════════════════════════════════════════════════════════════

const CONFIG = {
  API_KEY: HIGHLIGHTLY_KEY,
  BASE_URL: BASE_URL,
  REQUESTS_PER_RUN: 11, // Safe limit to stay under 100/day
  START_YEAR: 2020,
  END_YEAR: 2026,
  LEAGUES: [
    'Premier League', 'La Liga', 'Serie A', 'Bundesliga', 'Ligue 1',
    'MLS', 'Nigerian Premier League', 'UEFA Champions League',
    'UEFA Europa League', 'FIFA World Cup', 'AFC Champions League',
    'Copa Libertadores'
  ]
};

// ════════════════════════════════════════════════════════════════════════════
// 📊 PROGRESS TRACKING
// ════════════════════════════════════════════════════════════════════════════

class ProgressTracker {
  async getProgress() {
    try {
      const doc = await db.collection('bot_progress').doc('highlightly_historical').get();
      
      if (!doc.exists) {
        return {
          currentYear: CONFIG.START_YEAR,
          currentMonth: 1,
          mode: 'historical', // 'historical' or 'latest'
          videosProcessed: 0,
          lastRun: new Date().toISOString(),
        };
      }

      return doc.data();
    } catch (error) {
      console.error('Get progress error:', error);
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
      console.error('Update progress error:', error);
    }
  }

  getDateRange(year, month) {
    const startDate = new Date(year, month - 1, 1);
    const endDate = new Date(year, month, 0);
    
    return {
      startDate: startDate.toISOString().split('T')[0],
      endDate: endDate.toISOString().split('T')[0],
      label: `${year}-${String(month).padStart(2, '0')}`
    };
  }

  advanceMonth(year, month) {
    if (month === 12) {
      return { year: year + 1, month: 1 };
    }
    return { year, month: month + 1 };
  }
}

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
          rapidapi_key: this.apiKey,
        },
        headers: {
          'X-RapidAPI-Key': this.apiKey,
          'X-RapidAPI-Host': 'football-highlights-api.p.rapidapi.com',
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
      startDate,
      endDate,
      limit: 50,
    });
  }

  async getMatchHighlights(matchId) {
    return await this.makeRequest(`/matches/${matchId}/highlights`);
  }

  async getLeagues() {
    return await this.makeRequest('/leagues', { limit: 100 });
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
        // Check if already exists
        const existing = await highlightsRef
          .where('videoId', '==', video.videoId || video.id)
          .limit(1)
          .get();

        if (!existing.empty) {
          console.log(`⏭️  Video already exists: ${video.title}`);
          continue;
        }

        // Save new video
        const docData = {
          videoId: video.videoId || video.id,
          youtubeId: video.youtubeId || video.videoId || video.id,
          title: video.title || 'Highlight',
          thumbnail: video.thumbnail || video.image || '',
          channel: video.league?.name || 'Highlightly',
          channelTitle: video.league?.name || 'Highlightly',
          source: 'highlightly',
          embedUrl: video.embedUrl || '',
          embed: video.embed || '',
          src: video.url || '',
          publishedAt: new Date(video.date || Date.now()),
          createdAt: new Date().toISOString(),
          verified: true,
          filtered: true,
          matchId: video.matchId || '',
          homeTeam: video.homeTeam?.name || '',
          awayTeam: video.awayTeam?.name || '',
          competition: video.league?.name || 'Football',
          category: video.league?.name || 'Football',
        };

        await highlightsRef.add(docData);
        saved++;
        console.log(`✅ Saved: ${video.title}`);
      } catch (error) {
        console.error(`Failed to save video: ${video.title}`, error.message);
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
      console.error('Get count error:', error);
      return 0;
    }
  }
}

// ════════════════════════════════════════════════════════════════════════════
// 🤖 MAIN BOT LOGIC
// ════════════════════════════════════════════════════════════════════════════

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

    // Get current progress
    const progress = await this.progressTracker.getProgress();
    console.log('📍 Current Progress:', progress);

    // Check if we've reached 2026
    if (progress.mode === 'latest' || progress.currentYear >= CONFIG.END_YEAR) {
      await this.runLatestMode();
      return;
    }

    // Run historical mode
    await this.runHistoricalMode(progress);
  }

  async runHistoricalMode(progress) {
    console.log(`\n📅 Fetching highlights for: ${progress.currentYear}-${String(progress.currentMonth).padStart(2, '0')}`);

    const dateRange = this.progressTracker.getDateRange(progress.currentYear, progress.currentMonth);
    console.log(`📆 Date range: ${dateRange.startDate} to ${dateRange.endDate}`);

    // Get matches in this month
    const matchesData = await this.client.getMatches(dateRange.startDate, dateRange.endDate);

    if (!matchesData || !matchesData.data || matchesData.data.length === 0) {
      console.log('ℹ️  No matches found for this period');
      
      // Advance to next month anyway
      const nextMonth = this.progressTracker.advanceMonth(progress.currentYear, progress.currentMonth);
      await this.progressTracker.updateProgress(nextMonth);
      return;
    }

    console.log(`🎬 Found ${matchesData.data.length} matches`);

    // Get highlights for first few matches (respecting request limit)
    let videosSaved = 0;
    const matchesToProcess = matchesData.data.slice(0, 5); // Process 5 matches per run

    for (const match of matchesToProcess) {
      // Get highlights for this match
      const highlightsData = await this.client.getMatchHighlights(match.id);

      if (highlightsData && highlightsData.data) {
        // Prepare highlight videos
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

    // Advance to next month
    const nextMonth = this.progressTracker.advanceMonth(progress.currentYear, progress.currentMonth);
    const totalVideos = await this.storage.getVideoCount();

    await this.progressTracker.updateProgress({
      currentYear: nextMonth.year,
      currentMonth: nextMonth.month,
      mode: nextMonth.year >= CONFIG.END_YEAR ? 'latest' : 'historical',
      videosProcessed: totalVideos,
    });

    console.log(`\n➡️  Next run will fetch: ${nextMonth.year}-${String(nextMonth.month).padStart(2, '0')}`);
    
    if (nextMonth.year >= CONFIG.END_YEAR) {
      console.log('🎉 Historical archive complete! Switching to latest mode next run.');
    }
  }

  async runLatestMode() {
    console.log('\n🔄 Running in LATEST MODE - Fetching today\'s highlights');

    const today = new Date().toISOString().split('T')[0];
    const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000)
      .toISOString()
      .split('T')[0];

    console.log(`📆 Fetching from: ${sevenDaysAgo} to ${today}`);

    const matchesData = await this.client.getMatches(sevenDaysAgo, today);

    if (!matchesData || !matchesData.data || matchesData.data.length === 0) {
      console.log('ℹ️  No recent matches found');
      return;
    }

    console.log(`🎬 Found ${matchesData.data.length} recent matches`);

    let videosSaved = 0;
    const matchesToProcess = matchesData.data.slice(0, 10);

    for (const match of matchesToProcess) {
      const highlightsData = await this.client.getMatchHighlights(match.id);

      if (highlightsData && highlightsData.data) {
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
    console.log(`📡 API requests used: ${this.client.getRequestsUsed()}/${CONFIG.REQUESTS_PER_RUN}`);
  }
}

// ════════════════════════════════════════════════════════════════════════════
// 🚀 MAIN EXECUTION
// ════════════════════════════════════════════════════════════════════════════

async function main() {
  try {
    const bot = new HighlightlyBot();
    await bot.run();
    
    console.log('\n' + '='.repeat(80));
    console.log('✅ BOT RUN COMPLETED SUCCESSFULLY');
    console.log('='.repeat(80) + '\n');
    
    process.exit(0);
  } catch (error) {
    console.error('\n❌ BOT ERROR:', error);
    process.exit(1);
  }
}

main();

module.exports = { HighlightlyBot };
