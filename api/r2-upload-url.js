/**
 * 🎥 PITCHSIDE FAN VIDEO UPLOAD — Presigned URL Generator
 *
 * Why presigned URLs instead of uploading through this function directly:
 * Vercel serverless functions have a body size limit (~4.5MB on free/hobby tier).
 * A football clip is almost always bigger than that. Instead, this endpoint
 * gives the fan's phone a temporary, secure "permission slip" (a presigned URL)
 * that lets their browser upload the video FILE DIRECTLY to Cloudflare R2 —
 * completely bypassing Vercel and its size limit. This function never touches
 * the actual video bytes; it only generates the permission slip.
 *
 * Flow:
 * 1. Frontend calls this endpoint → gets back a presigned upload URL + public video URL
 * 2. Frontend uploads the raw video file directly to that presigned URL (PUT request)
 *    IMPORTANT: the PUT request's Content-Type header MUST exactly match the
 *    fileType sent to this endpoint, or R2 will reject the upload with a
 *    signature mismatch (the ContentType is baked into the signed URL).
 * 3. Frontend saves the public video URL + metadata into Firestore (separate step)
 *
 * FIX (this version): the old code built the "public" URL using R2's private,
 * authenticated S3 API endpoint (accountid.r2.cloudflarestorage.com). That
 * endpoint requires AWS-signature auth on every request — it is never public,
 * so videos uploaded fine but could never play. This version uses the actual
 * public R2.dev URL (or a custom domain) from the R2_PUBLIC_URL env var.
 */

import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';

const R2_ACCOUNT_ID = process.env.R2_ACCOUNT_ID;
const R2_ACCESS_KEY_ID = process.env.R2_ACCESS_KEY_ID;
const R2_SECRET_ACCESS_KEY = process.env.R2_SECRET_ACCESS_KEY;
const R2_BUCKET_NAME = process.env.R2_BUCKET_NAME;

// The PUBLIC-facing base URL for reading files back out of the bucket.
// Set this in Vercel env vars to your bucket's "Public Development URL"
// (Cloudflare dashboard → R2 → pitchside-video → Settings → Public Development URL),
// e.g. https://pub-f73c880a8b364a3fa1c270605c1a....r2.dev
// If you later connect a custom domain to the bucket, put that here instead.
const R2_PUBLIC_URL = process.env.R2_PUBLIC_URL;

// R2's S3-compatible endpoint — built from your Account ID (used ONLY for
// generating presigned upload URLs, never for public playback URLs)
const R2_ENDPOINT = `https://${R2_ACCOUNT_ID}.r2.cloudflarestorage.com`;

const s3Client = new S3Client({
  region: 'auto', // R2 doesn't use AWS regions, but the SDK requires this field
  endpoint: R2_ENDPOINT,
  credentials: {
    accessKeyId: R2_ACCESS_KEY_ID,
    secretAccessKey: R2_SECRET_ACCESS_KEY,
  },
});

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed. Use POST.' });
  }

  if (!R2_ACCOUNT_ID || !R2_ACCESS_KEY_ID || !R2_SECRET_ACCESS_KEY || !R2_BUCKET_NAME) {
    console.error('❌ Missing R2 environment variables');
    return res.status(500).json({ error: 'R2 storage not configured on server' });
  }

  if (!R2_PUBLIC_URL) {
    console.error('❌ Missing R2_PUBLIC_URL environment variable');
    return res.status(500).json({ error: 'R2_PUBLIC_URL not configured on server' });
  }

  try {
    const { fileName, fileType, uploaderId } = req.body;

    if (!fileName || !fileType) {
      return res.status(400).json({ error: 'fileName and fileType are required' });
    }

    // Basic safety: only allow common video + image formats
    const allowedTypes = [
      'video/mp4', 'video/quicktime', 'video/webm', 'video/x-matroska',
      'image/jpeg', 'image/png', 'image/webp'
    ];
    if (!allowedTypes.includes(fileType)) {
      return res.status(400).json({
        error: 'Unsupported file type. Allowed: mp4, mov, webm, mkv, jpeg, png, webp',
      });
    }

    // Build a unique, safe object key so fans' filenames never collide or overwrite each other
    const timestamp = Date.now();
    const randomId = Math.random().toString(36).slice(2, 10);
    const safeExt = fileName.split('.').pop().toLowerCase();
    const objectKey = `fan-videos/${uploaderId || 'anon'}_${timestamp}_${randomId}.${safeExt}`;

    const command = new PutObjectCommand({
      Bucket: R2_BUCKET_NAME,
      Key: objectKey,
      ContentType: fileType,
    });

    // This URL is valid for 10 minutes — enough time to complete the upload,
    // but expires quickly so it can't be reused or shared maliciously.
    const presignedUrl = await getSignedUrl(s3Client, command, { expiresIn: 600 });

    // The real PUBLIC url where the video will be viewable once uploaded.
    // Built from R2_PUBLIC_URL, NOT the private S3 API endpoint.
    const publicUrl = `${R2_PUBLIC_URL.replace(/\/$/, '')}/${objectKey}`;

    console.log(`✅ Generated presigned upload URL for: ${objectKey}`);

    return res.status(200).json({
      uploadUrl: presignedUrl,
      publicUrl: publicUrl,
      objectKey: objectKey,
      requiredContentType: fileType,
      expiresIn: 600,
    });
  } catch (error) {
    console.error('❌ Presigned URL generation error:', error.message);
    return res.status(500).json({ error: error.message });
  }
};
