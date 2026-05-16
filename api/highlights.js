export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') return res.status(200).end();

  try {
    const { query } = req.query;

    // For "All" tab — one broad search, fast single call
    const searchQuery = query || 'football match highlights 2026';

    const params = new URLSearchParams({
      part: 'snippet',
      q: searchQuery,
      type: 'video',
      maxResults: '50',
      order: 'date',
      videoDuration: 'medium',
      key: process.env.YOUTUBE_API_KEY,
    });

    const response = await fetch(
      `https://www.googleapis.com/youtube/v3/search?${params}`
    );

    const data = await response.json();

    if (!response.ok) {
      return res.status(response.status).json({ error: 'YouTube API error', detail: data });
    }

    const videos = (data.items || []).map(item => ({
      videoId: item.id.videoId,
      title: item.snippet.title,
      thumbnail: item.snippet.thumbnails?.medium?.url || '',
      channel: item.snippet.channelTitle,
      publishedAt: item.snippet.publishedAt,
    }));

    res.setHeader('Cache-Control', 's-maxage=7200, stale-while-revalidate');
    return res.status(200).json({ videos, cachedAt: Date.now() });

  } catch (err) {
    return res.status(500).json({ error: 'Highlights error', detail: err.message });
  }
}
