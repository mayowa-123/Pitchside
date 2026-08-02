// Requests a one-time direct-upload URL from Cloudflare Stream.
// The browser then uploads the video file straight to that URL —
// Cloudflare transcodes it into multiple quality renditions automatically.
//
// Requires these two Vercel environment variables (Project Settings → Environment Variables):
//   CF_ACCOUNT_ID    — your Cloudflare account ID
//   CF_STREAM_TOKEN  — an API token with "Edit Cloudflare Stream" permission
//
// NOTE: if your existing api/r2-upload-url.js uses `module.exports = ...`
// instead of `export default`, change the line below to match — Vercel
// needs one consistent style per function file.

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const accountId = process.env.CF_ACCOUNT_ID;
  const token = process.env.CF_STREAM_TOKEN;

  if (!accountId || !token) {
    return res.status(500).json({ error: 'Cloudflare Stream is not configured (missing env vars)' });
  }

  try {
    const cfRes = await fetch(
      `https://api.cloudflare.com/client/v4/accounts/${accountId}/stream/direct_upload`,
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          maxDurationSeconds: 3600,
          requireSignedURLs: false,
        }),
      }
    );

    const data = await cfRes.json();

    if (!cfRes.ok || !data.success) {
      console.error('[stream-upload-url] Cloudflare rejected request:', JSON.stringify(data));
      return res.status(500).json({ error: 'Could not get Stream upload URL', detail: data.errors });
    }

    return res.status(200).json({
      uploadURL: data.result.uploadURL,
      uid: data.result.uid,
    });
  } catch (e) {
    console.error('[stream-upload-url] error:', e);
    return res.status(500).json({ error: 'Server error requesting Stream upload URL' });
  }
}
