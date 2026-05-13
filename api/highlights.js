import { initializeApp, getApps, cert } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';

if (!getApps().length) {
  initializeApp({
    credential: cert(JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT))
  });
}

const db = getFirestore();
const CACHE_TTL = 3 * 60 * 60 * 1000; // 3 hours

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') return res.status(200).end();

  try {
    const { query = 'football highlights today' } = req.query;
    const cacheKey = query.toLowerCase().replace(/\s+/g, '_');
    const cacheRef = db.collection('youtube_highlights_cache').doc(cacheKey);

    // Check cache first
    const cached = await cacheRef.get();
    if (cached.exists) {
      const data = cached.data();
      const age = Date.now() - data.cachedAt;
      if (age < CACHE_TTL) {
        return res.status(200).json({ videos: data.videos, cached: true });
      }
    }

    // Fetch from YouTube
    const params = new URLSearchParams({
      part: 'snippet',
      q: query,
      type: 'video',
      maxResults: '12',
      order: 'date',
      videoDuration: 'medium',
      key: process.env.YOUTUBE_API_KEY,
    });

    const response = await fetch(
      `https://www.googleapis.com/youtube/v3/search?${params}`
    );

    if (!response.ok) {
      const err = await response.json();
      return res.status(response.status).json({ error: 'YouTube API error', detail: err });
    }

    const data = await response.json();

    const videos = (data.items || []).map(item => ({
      videoId: item.id.videoId,
      title: item.snippet.title,
      thumbnail: item.snippet.thumbnails?.medium?.url || '',
      channel: item.snippet.channelTitle,
      publishedAt: item.snippet.publishedAt,
    }));

    // Save to cache
    await cacheRef.set({ videos, cachedAt: Date.now(), query });

    return res.status(200).json({ videos, cached: false });

  } catch (err) {
    return res.status(500).json({ error: 'Highlights error', detail: err.message });
  }
}
