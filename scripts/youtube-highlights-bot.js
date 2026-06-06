import { initializeApp, cert } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';

const serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT);

initializeApp({
  credential: cert(serviceAccount),
});

const db = getFirestore();

// ✅ OPTION 3: 11 specific channels (verified globally accessible)
const CHANNELS = [
  { id: 'UCEZnlktMZkS_o3YCwKEHnrw', name: 'UEFA', searchTerm: 'UEFA Champions League highlights' },
  { id: 'UCKt-VYy5-oqXz6xqDNBnqWw', name: 'LaLiga', searchTerm: 'LaLiga highlights' },
  { id: 'BVB', name: 'Bundesliga', searchTerm: 'Bundesliga highlights' },
  { id: 'SerieA', name: 'Serie A', searchTerm: 'Serie A highlights' },
  { id: 'CONMEBOL', name: 'Copa Libertadores', searchTerm: 'Copa Libertadores highlights' },
  { id: 'NPFL', name: 'NPFL', searchTerm: 'NPFL Nigeria highlights' },
  { id: 'JLEAGUEInternational', name: 'J-League', searchTerm: 'J-League highlights' },
  { id: 'FIFA', name: 'World Cup', searchTerm: 'FIFA World Cup highlights' },
  { id: 'CBSSportsGolazo', name: 'CBS Sports Golazo', searchTerm: 'CBS Sports Golazo highlights' },
  { id: 'CAF', name: 'AFCON', searchTerm: 'AFCON highlights' },
  { id: 'Ligue1', name: 'Ligue 1', searchTerm: 'Ligue 1 highlights' },
];

// ✅ OPTION 3: 50 videos per channel (was 100) - FREE tier safe
const VIDEOS_PER_CHANNEL = 50;

// ✅ OPTION 3: Max 250 videos per run (was 500)
const MAX_VIDEOS = 250;

// ✅ Backfill from January 2024
const BACKFILL_DATE = new Date('2024-01-01').toISOString();

// YouTube API Key
const YOUTUBE_API_KEY = process.env.YOUTUBE_API_KEY;

/**
 * Fetch videos from a specific channel
 */
async function fetchFromChannel(channel) {
  try {
    console.log(`📺 Fetching from: ${channel.name}`);

    const searchUrl = new URL('https://www.googleapis.com/youtube/v3/search');
    searchUrl.searchParams.append('part', 'snippet');
    searchUrl.searchParams.append('channelId', channel.id);
    searchUrl.searchParams.append('q', channel.searchTerm);
    searchUrl.searchParams.append('type', 'video');
    searchUrl.searchParams.append('maxResults', VIDEOS_PER_CHANNEL);
    searchUrl.searchParams.append('order', 'date');
    searchUrl.searchParams.append('publishedAfter', BACKFILL_DATE);
    searchUrl.searchParams.append('key', YOUTUBE_API_KEY);

    const res = await fetch(searchUrl.toString());
    const data = await res.json();

    if (!data.items) {
      console.log(`⚠️ No items for ${channel.name}`);
      return [];
    }

    return data.items.map(item => ({
      videoId: item.id.videoId,
      youtubeId: item.id.videoId,
      title: item.snippet.title,
      thumbnail: item.snippet.thumbnails?.high?.url || item.snippet.thumbnails?.default?.url,
      channelTitle: item.snippet.channelTitle,
      channel: channel.name,
      publishedAt: new Date(item.snippet.publishedAt),
      createdAt: new Date().toISOString(),
      source: 'youtube',
      fetchedAt: new Date().toISOString(),
    }));
  } catch (err) {
    console.error(`❌ Failed to fetch ${channel.name}:`, err.message);
    return [];
  }
}

/**
 * Main run function
 */
async function run() {
  console.log('\n' + '='.repeat(60));
  console.log('🚀 YouTube Highlights Bot - OPTION 3');
  console.log('⏰ Running at:', new Date().toISOString());
  console.log('📺 Channels:', CHANNELS.length);
  console.log('📹 Videos/Channel:', VIDEOS_PER_CHANNEL);
  console.log('📅 Backfill from:', BACKFILL_DATE);
  console.log('💰 Cost: FREE (under quota)');
  console.log('='.repeat(60) + '\n');

  const allVideos = [];

  // Fetch from all 11 channels
  for (const channel of CHANNELS) {
    try {
      const videos = await fetchFromChannel(channel);
      console.log(`✅ ${channel.name.padEnd(20)} → ${videos.length} videos`);
      allVideos.push(...videos);

      if (allVideos.length >= MAX_VIDEOS) {
        console.log(`⚠️ Reached max (${MAX_VIDEOS}). Stopping.`);
        break;
      }
    } catch (err) {
      console.error(`❌ Error with ${channel.name}:`, err.message);
    }

    // Small delay to avoid rate limiting
    await new Promise(resolve => setTimeout(resolve, 300));
  }

  if (allVideos.length === 0) {
    console.log('❌ No videos fetched.');
    return;
  }

  console.log(`\n📊 Total fetched: ${allVideos.length}`);

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

    // Commit every 450 (Firestore batch limit is 500)
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
