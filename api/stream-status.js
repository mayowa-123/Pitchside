// Checks whether a Cloudflare Stream video has finished processing, and
// returns its playback URLs once ready. The frontend polls this after
// upload finishes, since transcoding takes a few seconds to ~1 minute.
//
// Requires the same CF_ACCOUNT_ID / CF_STREAM_TOKEN env vars as
// api/stream-upload-url.js.

export default async function handler(req, res) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { uid } = req.query;
  if (!uid) {
    return res.status(400).json({ error: 'Missing uid' });
  }

  const accountId = process.env.CF_ACCOUNT_ID;
  const token = process.env.CF_STREAM_TOKEN;

  if (!accountId || !token) {
    return res.status(500).json({ error: 'Cloudflare Stream is not configured (missing env vars)' });
  }

  try {
    const cfRes = await fetch(
      `https://api.cloudflare.com/client/v4/accounts/${accountId}/stream/${uid}`,
      { headers: { Authorization: `Bearer ${token}` } }
    );
    const data = await cfRes.json();

    if (!cfRes.ok || !data.success) {
      console.error('[stream-status] Cloudflare error:', JSON.stringify(data));
      return res.status(500).json({ error: 'Could not fetch Stream status' });
    }

    const result = data.result;
    const state = result?.status?.state || 'unknown'; // 'inprogress' | 'ready' | 'error'

    return res.status(200).json({
      state,
      ready: state === 'ready',
      hlsUrl: result?.playback?.hls || null,
      dashUrl: result?.playback?.dash || null,
      thumbnail: result?.thumbnail || null,
      errorReason: result?.status?.errorReasonText || null,
    });
  } catch (e) {
    console.error('[stream-status] error:', e);
    return res.status(500).json({ error: 'Server error checking Stream status' });
  }
}
