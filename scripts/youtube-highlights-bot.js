import { initializeApp, cert } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';

const serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT);

initializeApp({
  credential: cert(serviceAccount),
});

const db = getFirestore();

// ✅ FIXED: Search by channel name + keywords (more reliable)
const SEARCH_QUERIES = [
  { name: 'UEFA Champions League', query: 'UEFA Champions League highlights' },
  { name: 'LaLiga', query: 'LaLiga highlights 2024 2025 2026' },
  { name: 'Bundesliga', query: 'Bundesliga highlights 2024 2025 2026' },
  { name: 'Serie A', query: 'Serie A highlights 2024 2025 2026' },
  { name: 'Copa Libertadores', query: 'Copa Libertadores highlights' },
  { name: 'NPFL', query: 'NPFL Nigeria football highlights' },
  { name: 'J-League', query: 'J-League Japan football highlights' },
  { name: 'FIFA World Cup', query: 'FIFA World Cup highlights' },
  { name: 'CBS Sports Golazo', query: 'CBS Sports Golazo football' },
  { name: 'AFCON', query: 'AFCON Africa Cup highlights' },
  { name: 'Ligue 1', query: 'Ligue 1 France highlights' },
];

// Videos per search query
const VIDEOS_PER_QUERY = 50;
const MAX_VIDEOS = 250;

// Backfill from January 2024
const BACKFILL_DATE = new Date('2024-01-01').toISOString();

const YOUTUBE_API_KEY = process.env.YOUTUBE_API_KEY;

/**
 * ✅ FIXED: Fetch videos by search query (not channel ID)
 */
async function fetchByQuery(searchConfig) {
  try {
    console.log(`📺 Searching: ${searchConfig.name}`);

    const searchUrl = new URL('https://www.googleapis.com/youtube/v3/search');
    searchUrl.searchParams.append('part', 'snippet');
    searchUrl.searchParams.append('q', searchConfig.query);
    searchUrl.searchParams.append('type', 'video');
    searchUrl.searchParams.append('maxResults', VIDEOS_PER_QUERY);
    searchUrl.searchParams.append('order', 'date'); // Latest first
    searchUrl.searchParams.append('publishedAfter', BACKFILL_DATE); // From Jan 2024
    searchUrl.searchParams.append('relevanceLanguage', 'en');
    searchUrl.searchParams.append('key', YOUTUBE_API_KEY);

    const res = await fetch(searchUrl.toString());
    const data = await res.json();

    if (!data.items || data.items.length === 0) {
      console.log(`   ⚠️ No results for ${searchConfig.name}`);
      return [];
    }

    console.log(`   ✅ Found ${data.items.length} results`);

    return data.items.map(item => ({
      videoId: item.id.videoId,
      youtubeId: item.id.videoId,
      title: item.snippet.title,
      thumbnail: item.snippet.thumbnails?.high?.url || item.snippet.thumbnails?.default?.url,
      channelTitle: item.snippet.channelTitle,
      channel: searchConfig.name, // Use the search category name
      publishedAt: new Date(item.snippet.publishedAt),
      createdAt: new Date().toISOString(),
      source: 'youtube',
      fetchedAt: new Date().toISOString(),
    }));
  } catch (err) {
    console.error(`   ❌ Error for ${searchConfig.name}:`, err.message);
    return [];
  }
}

/**
 * Main run function
 */
async function run() {
  console.log('\n' + '='.repeat(60));
  console.log('🚀 YouTube Highlights Bot - OPTION 3 (FIXED)');
  console.log('⏰ Running at:', new Date().toISOString());
  console.log('📺 Search queries:', SEARCH_QUERIES.length);
  console.log('📹 Videos/Query:', VIDEOS_PER_QUERY);
  console.log('📅 Backfill from:', BACKFILL_DATE);
  console.log('💰 Cost: FREE (under quota)');
  console.log('='.repeat(60) + '\n');

  const allVideos = [];

  // Search for all queries
  for (const query of SEARCH_QUERIES) {
    try {
      const videos = await fetchByQuery(query);
      console.log(`   → Added ${videos.length} videos\n`);
      allVideos.push(...videos);

      if (allVideos.length >= MAX_VIDEOS) {
        console.log(`⚠️ Reached max (${MAX_VIDEOS}). Stopping search.`);
        break;
      }
    } catch (err) {
      console.error(`Error with ${query.name}:`, err.message);
    }

    // Small delay to avoid rate limiting
    await new Promise(resolve => setTimeout(resolve, 300));
  }

  if (allVideos.length === 0) {
    console.log('❌ No videos fetched.');
    return;
  }

  console.log(`📊 Total fetched: ${allVideos.length}`);

  // Check existing videos
  const colRef = db.collection('highlights');
  const existing = await colRef.orderBy('createdAt', 'asc').get();
  const existingCount = existing.size;

  console.log(`📦 Existing in DB: ${existingCount}`);

  // Build set of existing IDs
  const existingIds = new Set();
  existing.docs.forEach(doc => {
    existingIds.add(doc.data().videoId);
  });

  // Filter new videos
  const newVideos = allVideos.filter(v => !existingIds.has(v.videoId));
  console.log(`✨ New videos: ${newVideos.length}\n`);

  if (newVideos.length === 0) {
    console.log('ℹ️ No new videos this run.');
    return;
  }

  // Batch write to Firestore
  const addBatch = db.batch();
  let batchCount = 0;
  let batchNum = 1;

  newVideos.forEach((video, index) => {
    const ref = colRef.doc(video.videoId);
    addBatch.set(ref, video, { merge: true });
    batchCount++;

    // Commit every 450 (Firestore limit)
    if (batchCount === 450 || index === newVideos.length - 1) {
      addBatch.commit();
      console.log(`✅ Batch ${batchNum} committed (${batchCount} videos)`);
      batchNum++;
      batchCount = 0;
    }
  });

  console.log(`\n🎉 Added ${newVideos.length} new videos!`);
  console.log(`📈 Total videos in DB: ${existingCount + newVideos.length}`);
  console.log('='.repeat(60) + '\n');
}

run().catch(console.error);
