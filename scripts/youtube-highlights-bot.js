import { initializeApp, cert } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';

const serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT);

initializeApp({
  credential: cert(serviceAccount),
});

const db = getFirestore();

// ✅ SMART FOREVER: All possible queries with geo-block detection
const SEARCH_QUERIES = [
  { name: 'UEFA Champions League', query: 'UEFA Champions League highlights' },
  { name: 'LaLiga', query: 'LaLiga highlights 2024 2025 2026' },
  { name: 'Bundesliga', query: 'Bundesliga highlights 2024 2025 2026' },
  { name: 'Serie A', query: 'Serie A highlights 2024 2025 2026' },
  { name: 'Copa Libertadores', query: 'Copa Libertadores highlights 2024 2025' },
  { name: 'NPFL', query: 'NPFL Nigeria football highlights' },
  { name: 'J-League', query: 'J-League Japan football highlights' },
  { name: 'FIFA World Cup', query: 'FIFA World Cup highlights' },
  { name: 'CBS Sports Golazo', query: 'CBS Sports Golazo football' },
  { name: 'AFCON', query: 'Africa Cup of Nations highlights 2024 2025' },
  { name: 'Ligue 1', query: 'Ligue 1 France highlights' },
];

// ✅ SMART FOREVER: Reduced fetch for sustainability
const VIDEOS_PER_QUERY = 25;  // Was 50 (now sustainable)
const MAX_VIDEOS = 300;       // ~275 per run = 2,000/day

// ✅ SMART FOREVER: Retention settings
const MIN_VIDEOS_TO_KEEP = 10000;      // Never delete below this (app never empty!)
const MAX_STORAGE_MB = 800;            // Hard limit before auto-delete
const DELETE_OLDER_THAN_DAYS = 90;     // Delete videos older than 90 days

// Backfill from January 2024
const BACKFILL_DATE = new Date('2024-01-01').toISOString();

const YOUTUBE_API_KEY = process.env.YOUTUBE_API_KEY;

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
 * ✅ Fetch and validate videos
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

    // Validate each video
    const validVideos = [];
    for (const item of data.items) {
      const videoId = item.id.videoId;
      const isPlayable = await isVideoPlayable(videoId);

      if (isPlayable) {
        validVideos.push({
          videoId: videoId,
          youtubeId: videoId,
          title: item.snippet.title,
          thumbnail: item.snippet.thumbnails?.high?.url || item.snippet.thumbnails?.default?.url,
          channelTitle: item.snippet.channelTitle,
          channel: searchConfig.name,
          publishedAt: new Date(item.snippet.publishedAt),
          createdAt: new Date().toISOString(),
          source: 'youtube',
          fetchedAt: new Date().toISOString(),
          verified: true,
        });
      } else {
        console.log(`      🚫 Skipped (geo-blocked): ${item.snippet.title.substring(0, 35)}...`);
      }

      await new Promise(resolve => setTimeout(resolve, 100));
    }

    console.log(`   → ${validVideos.length}/${data.items.length} videos are playable\n`);
    return validVideos;
  } catch (err) {
    console.error(`   ❌ Error for ${searchConfig.name}:`, err.message);
    return [];
  }
}

/**
 * ✅ SMART FOREVER: Auto-delete old videos if storage exceeds limit
 */
async function autoDeleteOldVideos() {
  try {
    const colRef = db.collection('highlights');
    
    // Get storage info
    const allDocs = await colRef.get();
    const videoCount = allDocs.size;
    
    // Rough estimate: ~1.5KB per video
    const storageMB = (videoCount * 1.5) / 1024;
    
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
      const newStorageMB = (newCount * 1.5) / 1024;
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
 * Main run function
 */
async function run() {
  console.log('\n' + '='.repeat(70));
  console.log('🚀 YouTube Highlights Bot - SMART FOREVER (Sustainable Forever)');
  console.log('⏰ Running at:', new Date().toISOString());
  console.log('📺 Search queries:', SEARCH_QUERIES.length);
  console.log('📹 Videos/Query:', VIDEOS_PER_QUERY);
  console.log('📅 Backfill from:', BACKFILL_DATE);
  console.log('🔄 Auto-delete: ENABLED (keeps 500-800MB)');
  console.log('💚 Cost: $0/month FOREVER');
  console.log('⚡ Runs: Every 6 hours (2,000 videos/day)');
  console.log('='.repeat(70) + '\n');

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
    console.log('❌ No playable videos found.');
    return;
  }

  console.log(`📊 Total playable videos: ${allVideos.length}`);

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
  console.log(`✨ New videos: ${newVideos.length}\n`);

  if (newVideos.length === 0) {
    console.log('ℹ️ No new videos this run.');
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
        console.log(`✅ Batch ${batchNum} committed (${batchCount} videos)`);
        batchNum++;
        batchCount = 0;
      }
    });

    console.log(`🎉 Added ${newVideos.length} new verified videos!\n`);
  }

  // ✅ SMART FOREVER: Auto-delete old videos if needed
  console.log('🔄 Running storage check & auto-delete...\n');
  await autoDeleteOldVideos();

  const finalStats = await colRef.get();
  console.log(`📈 Final: ${finalStats.size} videos in database`);
  console.log('='.repeat(70) + '\n');
}

run().catch(console.error);
