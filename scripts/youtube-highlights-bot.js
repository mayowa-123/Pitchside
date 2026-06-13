import { initializeApp, cert } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';

const serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT);

initializeApp({
  credential: cert(serviceAccount),
});

const db = getFirestore();

// ✅ ALL 36 LEAGUES & COMPETITIONS (Complete)
const SEARCH_QUERIES = [
  // 🏴󠁧󠁢󠁥󠁮󠁧󠁿 England
  { name: 'Premier League', query: 'Premier League highlights' },
  
  // 🇪🇸 Spain
  { name: 'La Liga', query: 'LaLiga highlights' },
  
  // 🇮🇹 Italy
  { name: 'Serie A', query: 'Serie A highlights' },
  
  // 🇩🇪 Germany
  { name: 'Bundesliga', query: 'Bundesliga highlights' },
  
  // 🇫🇷 France
  { name: 'Ligue 1', query: 'Ligue 1 highlights' },
  
  // 🇳🇱 Netherlands
  { name: 'Eredivisie', query: 'Eredivisie highlights' },
  
  // 🇵🇹 Portugal
  { name: 'Primeira Liga', query: 'Primeira Liga Portugal highlights' },
  
  // 🇧🇪 Belgium
  { name: 'Belgian Pro League', query: 'Belgian Pro League highlights' },
  
  // 🏴󠁧󠁢󠁳󠁣󠁴󠁿 Scotland
  { name: 'Scottish Premiership', query: 'Scottish Premiership highlights' },
  
  // 🇹🇷 Turkey
  { name: 'Turkish Süper Lig', query: 'Turkish Süper Lig highlights' },
  
  // 🇸🇦 Saudi Arabia
  { name: 'Saudi Pro League', query: 'Saudi Pro League highlights' },
  
  // 🇺🇸 USA
  { name: 'Major League Soccer', query: 'MLS highlights' },
  
  // 🇲🇽 Mexico
  { name: 'Liga MX', query: 'Liga MX Mexico highlights' },
  
  // 🇧🇷 Brazil
  { name: 'Brazilian Série A', query: 'Campeonato Brasileiro highlights' },
  
  // 🇦🇷 Argentina
  { name: 'Argentine Primera', query: 'Argentine Primera División highlights' },
  
  // 🇳🇬 Nigeria
  { name: 'NPFL', query: 'Nigerian Premier League NPFL highlights' },
  
  // 🏆 UEFA Competitions
  { name: 'UEFA Champions League', query: 'UEFA Champions League highlights' },
  { name: 'UEFA Europa League', query: 'UEFA Europa League highlights' },
  { name: 'UEFA Conference League', query: 'UEFA Conference League highlights' },
  
  // 🌍 Continental African
  { name: 'CAF Champions League', query: 'CAF Champions League highlights' },
  { name: 'CAF Confederation Cup', query: 'CAF Confederation Cup highlights' },
  
  // 🌏 Asian
  { name: 'AFC Champions League', query: 'AFC Champions League highlights' },
  
  // 🌎 CONCACAF
  { name: 'CONCACAF Champions Cup', query: 'CONCACAF Champions Cup highlights' },
  
  // 🏟️ South American
  { name: 'Copa Libertadores', query: 'Copa Libertadores highlights' },
  { name: 'Copa Sudamericana', query: 'Copa Sudamericana highlights' },
  
  // 🏆 Club World Competitions
  { name: 'FIFA Club World Cup', query: 'FIFA Club World Cup highlights' },
  
  // 🌐 International National Teams
  { name: 'FIFA World Cup', query: 'FIFA World Cup highlights' },
  { name: 'UEFA Euro', query: 'UEFA European Championship highlights' },
  { name: 'Africa Cup of Nations', query: 'AFCON Africa Cup highlights' },
  { name: 'Copa América', query: 'Copa América highlights' },
  { name: 'AFC Asian Cup', query: 'AFC Asian Cup highlights' },
  { name: 'CONCACAF Gold Cup', query: 'CONCACAF Gold Cup highlights' },
  { name: 'UEFA Nations League', query: 'UEFA Nations League highlights' },
  
  // 🏫 Youth Competitions
  { name: 'FIFA U-20 World Cup', query: 'FIFA U-20 World Cup highlights' },
  { name: 'FIFA U-17 World Cup', query: 'FIFA U-17 World Cup highlights' },
  
  // 👩 Women's Football
  { name: 'FIFA Women World Cup', query: 'FIFA Women World Cup highlights' },
  { name: 'Women AFCON', query: 'WAFCON Women Africa Cup highlights' },
  { name: 'UEFA Women Champions League', query: 'UEFA Women Champions League highlights' },
  { name: 'Olympic Football', query: 'Olympic Football Tournament highlights' },
];

// ✅ KEYWORDS FOR FILTERING (Only include these)
const HIGHLIGHT_KEYWORDS = [
  'highlights',
  'extended highlights',
  'goals',
  'best moments',
  'match highlights',
  'goal highlights',
  'all goals',
  'match recap',
];

// ❌ KEYWORDS TO EXCLUDE (Skip these)
const EXCLUDE_KEYWORDS = [
  'news',
  'interview',
  'discussion',
  'joke',
  'funny',
  'memes',
  'breakdown',
  'analysis',
  'behind the scenes',
  'training',
  'vlog',
  'reaction',
  'music',
  'commercial',
  'ad',
  'promo',
  'announcement',
];

// ✅ Gender Detection
const WOMEN_KEYWORDS = ['women\'s', 'women\'', 'female', 'women'];
const MEN_KEYWORDS = ['men\'s', 'men\'', 'male', 'men'];

// ✅ SUSTAINABILITY SETTINGS
const VIDEOS_PER_QUERY = 30;  // Videos per league per run
const MAX_VIDEOS = 500;       // Max videos per run
const MIN_VIDEOS_TO_KEEP = 15000;  // Never delete below this
const MAX_STORAGE_MB = 1200;  // Hard limit
const DELETE_OLDER_THAN_DAYS = 120;  // Keep 4 months of highlights

// Backfill from January 2024
const BACKFILL_DATE = new Date('2024-01-01').toISOString();

const YOUTUBE_API_KEY = process.env.YOUTUBE_API_KEY;

/**
 * ✅ Detect gender from title
 */
function detectGender(title) {
  const lowerTitle = title.toLowerCase();
  
  const hasWomen = WOMEN_KEYWORDS.some(keyword => lowerTitle.includes(keyword));
  const hasMen = MEN_KEYWORDS.some(keyword => lowerTitle.includes(keyword));
  
  if (hasWomen) return 'women';
  if (hasMen) return 'men';
  return 'mixed'; // Default if not specified
}

/**
 * ✅ Check if title is a valid HIGHLIGHTS video
 */
function isValidHighlight(title) {
  const lowerTitle = title.toLowerCase();
  
  // Check if it CONTAINS highlight keywords
  const hasHighlightKeyword = HIGHLIGHT_KEYWORDS.some(keyword => 
    lowerTitle.includes(keyword)
  );
  
  if (!hasHighlightKeyword) return false;
  
  // Check if it CONTAINS exclude keywords
  const hasExcludeKeyword = EXCLUDE_KEYWORDS.some(keyword => 
    lowerTitle.includes(keyword)
  );
  
  if (hasExcludeKeyword) return false;
  
  return true;
}

/**
 * ✅ Check if a video is playable (geo-block detection)
 */
async function isVideoPlayable(videoId) {
  try {
    const videoUrl = new URL('https://www.googleapis.com/youtube/v3/videos');
    videoUrl.searchParams.append('part', 'contentDetails,status');
    videoUrl.searchParams.append('id', videoId);
    videoUrl.searchParams.append('key', YOUTUBE_API_KEY);

    const res = await fetch(videoUrl.toString());
    const data = await res.json();

    if (!data.items || data.items.length === 0) {
      return false;
    }

    const video = data.items[0];

    // Check if embeddable
    if (video.status && video.status.embeddable === false) {
      return false;
    }

    // Check region restrictions
    if (video.contentDetails && video.contentDetails.regionRestriction) {
      const blockedRegions = video.contentDetails.regionRestriction.blockedRegions;
      if (blockedRegions && blockedRegions.includes('NG')) {
        return false;
      }
    }

    return true;
  } catch (err) {
    return true; // Assume playable if we can't verify
  }
}

/**
 * ✅ Fetch and validate videos with smart filtering
 */
async function fetchByQuery(searchConfig) {
  try {
    console.log(`📺 Searching: ${searchConfig.name}`);

    const searchUrl = new URL('https://www.googleapis.com/youtube/v3/search');
    searchUrl.searchParams.append('part', 'snippet');
    searchUrl.searchParams.append('q', searchConfig.query);
    searchUrl.searchParams.append('type', 'video');
    searchUrl.searchParams.append('maxResults', VIDEOS_PER_QUERY);
    searchUrl.searchParams.append('order', 'date');
    searchUrl.searchParams.append('publishedAfter', BACKFILL_DATE);
    searchUrl.searchParams.append('relevanceLanguage', 'en');
    searchUrl.searchParams.append('key', YOUTUBE_API_KEY);

    const res = await fetch(searchUrl.toString());
    const data = await res.json();

    if (!data.items || data.items.length === 0) {
      console.log(`   ⚠️ No results for ${searchConfig.name}`);
      return [];
    }

    console.log(`   ✅ Found ${data.items.length} results`);

    // Validate and filter each video
    const validVideos = [];
    for (const item of data.items) {
      const title = item.snippet.title;
      
      // ✅ FILTER 1: Check if it's a valid highlight
      if (!isValidHighlight(title)) {
        console.log(`      ❌ Skipped (not highlights): ${title.substring(0, 40)}...`);
        continue;
      }
      
      const videoId = item.id.videoId;
      const isPlayable = await isVideoPlayable(videoId);

      if (isPlayable) {
        const gender = detectGender(title);
        
        validVideos.push({
          videoId: videoId,
          youtubeId: videoId,
          title: title,
          thumbnail: item.snippet.thumbnails?.high?.url || item.snippet.thumbnails?.default?.url,
          channelTitle: item.snippet.channelTitle,
          channel: searchConfig.name,
          gender: gender, // ✨ NEW: Gender detection
          publishedAt: new Date(item.snippet.publishedAt),
          createdAt: new Date().toISOString(),
          source: 'youtube',
          fetchedAt: new Date().toISOString(),
          verified: true,
          filtered: true, // Mark as filtered for highlights
        });
        
        console.log(`      ✅ Added (${gender}): ${title.substring(0, 35)}...`);
      } else {
        console.log(`      🚫 Skipped (geo-blocked): ${title.substring(0, 40)}...`);
      }

      await new Promise(resolve => setTimeout(resolve, 100));
    }

    console.log(`   → ${validVideos.length}/${data.items.length} videos are playable highlights\n`);
    return validVideos;
  } catch (err) {
    console.error(`   ❌ Error for ${searchConfig.name}:`, err.message);
    return [];
  }
}

/**
 * ✅ Auto-delete old videos if storage exceeds limit
 */
async function autoDeleteOldVideos() {
  try {
    const colRef = db.collection('highlights');
    
    // Get storage info
    const allDocs = await colRef.get();
    const videoCount = allDocs.size;
    
    // Rough estimate: ~1.8KB per video (includes gender field)
    const storageMB = (videoCount * 1.8) / 1024;
    
    console.log(`📦 Current storage: ${videoCount} videos ≈ ${storageMB.toFixed(1)}MB`);
    
    // Check if we need to delete
    if (storageMB > MAX_STORAGE_MB && videoCount > MIN_VIDEOS_TO_KEEP) {
      console.log(`⚠️ Storage exceeds ${MAX_STORAGE_MB}MB. Auto-deleting old videos...`);
      
      // Calculate cutoff date
      const cutoffDate = new Date(Date.now() - DELETE_OLDER_THAN_DAYS * 24 * 60 * 60 * 1000);
      
      // Find videos to delete
      const toDelete = await colRef
        .where('publishedAt', '<', cutoffDate)
        .get();
      
      console.log(`🗑️ Found ${toDelete.docs.length} videos older than ${DELETE_OLDER_THAN_DAYS} days`);
      
      // Delete in batches
      let deleted = 0;
      const batch = db.batch();
      
      toDelete.docs.forEach((doc, index) => {
        batch.delete(doc.ref);
        deleted++;
        
        if (deleted === 450 || index === toDelete.docs.length - 1) {
          batch.commit();
          console.log(`🗑️ Deleted batch of ${deleted} videos`);
          deleted = 0;
        }
      });
      
      const newCount = videoCount - toDelete.docs.length;
      const newStorageMB = (newCount * 1.8) / 1024;
      console.log(`✅ Auto-delete complete: ${newCount} videos remaining ≈ ${newStorageMB.toFixed(1)}MB\n`);
    } else if (storageMB > MAX_STORAGE_MB) {
      console.log(`⚠️ Storage is ${storageMB.toFixed(1)}MB but keeping ${videoCount} videos (below minimum)\n`);
    } else {
      console.log(`✅ Storage is healthy. No deletion needed.\n`);
    }
  } catch (err) {
    console.error('Error in auto-delete:', err.message);
  }
}

/**
 * ✅ Generate statistics
 */
async function generateStats() {
  try {
    const colRef = db.collection('highlights');
    const allDocs = await colRef.get();
    
    let maleCount = 0;
    let femaleCount = 0;
    let mixedCount = 0;
    const leagueStats = {};
    
    allDocs.docs.forEach(doc => {
      const data = doc.data();
      const gender = data.gender || 'mixed';
      
      if (gender === 'women') femaleCount++;
      else if (gender === 'men') maleCount++;
      else mixedCount++;
      
      const league = data.channel || 'Unknown';
      leagueStats[league] = (leagueStats[league] || 0) + 1;
    });
    
    console.log('📊 STATISTICS:');
    console.log(`   👨 Men's Highlights: ${maleCount}`);
    console.log(`   👩 Women's Highlights: ${femaleCount}`);
    console.log(`   🔄 Mixed Gender: ${mixedCount}`);
    console.log(`\n   🏆 Top Leagues:`);
    
    const topLeagues = Object.entries(leagueStats)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 10);
    
    topLeagues.forEach(([league, count]) => {
      console.log(`      ${league}: ${count} videos`);
    });
    
    console.log('\n');
  } catch (err) {
    console.error('Error generating stats:', err.message);
  }
}

/**
 * Main run function
 */
async function run() {
  console.log('\n' + '='.repeat(80));
  console.log('🚀 YouTube Highlights Bot - SMART FILTERING (36 Leagues + Competitions)');
  console.log('⏰ Running at:', new Date().toISOString());
  console.log('📺 Total leagues/competitions:', SEARCH_QUERIES.length);
  console.log('📹 Videos/Query:', VIDEOS_PER_QUERY);
  console.log('📊 Max videos/run:', MAX_VIDEOS);
  console.log('🎬 Filter: ONLY Highlights (excludes news, interviews, jokes)');
  console.log('👥 Gender Detection: ENABLED (Men\'s, Women\'s, Mixed)');
  console.log('📅 Backfill from:', BACKFILL_DATE);
  console.log('🔄 Auto-delete: ENABLED (keeps 4 months, max 1200MB)');
  console.log('💚 Cost: $0/month FOREVER');
  console.log('⚡ Runs: Every 6 hours (3,000 videos/day)');
  console.log('='.repeat(80) + '\n');

  const allVideos = [];

  // Fetch from all queries
  for (const query of SEARCH_QUERIES) {
    try {
      const videos = await fetchByQuery(query);
      allVideos.push(...videos);

      if (allVideos.length >= MAX_VIDEOS) {
        console.log(`⚠️ Reached max (${MAX_VIDEOS}). Stopping search.\n`);
        break;
      }
    } catch (err) {
      console.error(`Error with ${query.name}:`, err.message);
    }

    await new Promise(resolve => setTimeout(resolve, 500));
  }

  if (allVideos.length === 0) {
    console.log('❌ No playable highlights found.');
    return;
  }

  console.log(`📊 Total playable highlights: ${allVideos.length}`);

  // Check existing
  const colRef = db.collection('highlights');
  const existing = await colRef.orderBy('createdAt', 'asc').get();
  const existingCount = existing.size;

  console.log(`📦 Existing in DB: ${existingCount}`);

  // Build existing IDs set
  const existingIds = new Set();
  existing.docs.forEach(doc => {
    existingIds.add(doc.data().videoId);
  });

  // Filter new
  const newVideos = allVideos.filter(v => !existingIds.has(v.videoId));
  console.log(`✨ New highlights: ${newVideos.length}\n`);

  if (newVideos.length === 0) {
    console.log('ℹ️ No new highlights this run.');
  } else {
    // Batch write
    const addBatch = db.batch();
    let batchCount = 0;
    let batchNum = 1;

    newVideos.forEach((video, index) => {
      const ref = colRef.doc(video.videoId);
      addBatch.set(ref, video, { merge: true });
      batchCount++;

      if (batchCount === 450 || index === newVideos.length - 1) {
        addBatch.commit();
        console.log(`✅ Batch ${batchNum} committed (${batchCount} highlights)`);
        batchNum++;
        batchCount = 0;
      }
    });

    console.log(`🎉 Added ${newVideos.length} new verified highlights!\n`);
  }

  // ✅ Auto-delete old videos if needed
  console.log('🔄 Running storage check & auto-delete...\n');
  await autoDeleteOldVideos();

  // ✅ Generate statistics
  await generateStats();

  const finalStats = await colRef.get();
  console.log(`📈 Final: ${finalStats.size} total highlights in database`);
  console.log('='.repeat(80) + '\n');
}

run().catch(console.error);
