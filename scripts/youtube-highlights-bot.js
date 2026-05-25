import { initializeApp, cert } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';

initializeApp({
  credential: cert({
    projectId: process.env.FIREBASE_PROJECT_ID,
    clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
    privateKey: process.env.FIREBASE_PRIVATE_KEY.replace(/\\n/g, '\n'),
  }),
});

const db = getFirestore();

const CHANNELS = [
  { id: 'UCqZQlzSHbVJrwrn5XvzrzcA', name: 'Premier League' },
  { id: 'UCwnQn3ekqzmDR5Q2Jlv8DGg', name: 'UEFA Champions League' },
  { id: 'UCTVHMnE6rFIWU3AZMhGGXKg', name: 'La Liga' },
  { id: 'UCGCMqMTsAnaWFMdlBSmfpaA', name: 'Bundesliga' },
  { id: 'UCpcTrCXblq78Gn28UoJFrJg', name: 'FIFA' },
  { id: 'UCRm8dSNzxSlkHQC5YIhDmjQ', name: 'SuperSport' },
  { id: 'UCrSRYnsVysagRHHIGxh-cjQ', name: 'Soccer Highlights TV' },
  { id: 'UC9rBxCttrSdScP1dEKsQC1Q', name: 'TVF Goal Zone' },
];

const YOUTUBE_API_KEY = process.env.YOUTUBE_API_KEY;
const MAX_VIDEOS = 100;
const VIDEOS_PER_CHANNEL = 2;

async function fetchFromChannel(channelId) {
  const url = `https://www.googleapis.com/youtube/v3/search?part=snippet&channelId=${channelId}&q=highlights&type=video&order=date&maxResults=${VIDEOS_PER_CHANNEL}&key=${YOUTUBE_API_KEY}`;
  const res = await fetch(url);
  const data = await res.json();
  if (!data.items) return [];
  return data.items.map(item => ({
    videoId: item.id.videoId,
    title: item.snippet.title,
    thumbnail: item.snippet.thumbnails?.high?.url || item.snippet.thumbnails?.default?.url,
    channelTitle: item.snippet.channelTitle,
    publishedAt: item.snippet.publishedAt,
    source: 'youtube',
    fetchedAt: new Date().toISOString(),
  }));
}

async function run() {
  console.log('Fetching highlights from YouTube...');
  const allVideos = [];

  for (const channel of CHANNELS) {
    try {
      const videos = await fetchFromChannel(channel.id);
      console.log(`${channel.name}: ${videos.length} videos`);
      allVideos.push(...videos);
    } catch (err) {
      console.error(`Failed for ${channel.name}:`, err.message);
    }
  }

  if (allVideos.length === 0) {
    console.log('No videos fetched, exiting.');
    return;
  }

  const colRef = db.collection('highlights');

  const existing = await colRef.orderBy('fetchedAt', 'asc').get();
  const existingCount = existing.size;
  const totalAfterAdd = existingCount + allVideos.length;

  if (totalAfterAdd > MAX_VIDEOS) {
    const toDelete = totalAfterAdd - MAX_VIDEOS;
    const batch = db.batch();
    existing.docs.slice(0, toDelete).forEach(doc => batch.delete(doc.ref));
    await batch.commit();
    console.log(`Deleted ${toDelete} old videos`);
  }

  const addBatch = db.batch();
  allVideos.forEach(video => {
    const ref = colRef.doc(`yt_${video.videoId}`);
    addBatch.set(ref, video, { merge: true });
  });
  await addBatch.commit();
  console.log(`Added ${allVideos.length} new videos. Done!`);
}

run().catch(console.error);
