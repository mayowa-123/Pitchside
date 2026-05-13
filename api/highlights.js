export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') return res.status(200).end();

  try {
    const { query } = req.query;

    const searches = query
      ? [query]
      : [
          'Premier League highlights 2026',
          'La Liga highlights 2026',
          'Serie A highlights 2026',
          'Bundesliga highlights 2026',
          'Champions League highlights 2026',
          'Ligue 1 highlights 2026',
          'football highlights today 2026',
        ];

    const results = await Promise.all(
      searches.map(q =>
        fetch(`https://www.googleapis.com/youtube/v3/search?${new URLSearchParams({
          part: 'snippet',
          q,
          type: 'video',
          maxResults: '15',
          order: 'date',
          videoDuration: 'medium',
          key: process.env.YOUTUBE_API_KEY,
        })}`)
        .then(r => r.json())
        .then(data => (data.items || []).map(item => ({
          videoId: item.id.videoId,
          title: item.snippet.title,
          thumbnail: item.snippet.thumbnails?.medium?.url || '',
          channel: item.snippet.channelTitle,
          publishedAt: item.snippet.publishedAt,
        })))
        .catch(() => [])
      )
    );

    // Flatten and deduplicate by videoId
    const seen = new Set();
    const videos = results.flat().filter(v => {
      if (seen.has(v.videoId)) return false;
      seen.add(v.videoId);
      return true;
    });

    // Cache control — tell frontend to cache for 2 hours
    res.setHeader('Cache-Control', 's-maxage=7200, stale-while-revalidate');

    return res.status(200).json({ videos, cachedAt: Date.now() });

  } catch (err) {
    return res.status(500).json({ error: 'Highlights error', detail: err.message });
  }
}
