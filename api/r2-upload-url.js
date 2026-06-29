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
 * 3. Frontend saves the public video URL + metadata into Firestore (separate step)
 */

import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';

const R2_ACCOUNT_ID = process.env.R2_ACCOUNT_ID;
const R2_ACCESS_KEY_ID = process.env.R2_ACCESS_KEY_ID;
const R2_SECRET_ACCESS_KEY = process.env.R2_SECRET_ACCESS_KEY;
const R2_BUCKET_NAME = process.env.R2_BUCKET_NAME;

// R2's S3-compatible endpoint — built from your Account ID
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

  try {
    const { fileName, fileType, uploaderId } = req.body;

    if (!fileName || !fileType) {
      return res.status(400).json({ error: 'fileName and fileType are required' });
    }

    // Basic safety: only allow common video formats
    const allowedTypes = ['video/mp4', 'video/quicktime', 'video/webm', 'video/x-matroska'];
    if (!allowedTypes.includes(fileType)) {
      return res.status(400).json({
        error: 'Unsupported file type. Allowed: mp4, mov, webm, mkv',
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

    // The PUBLIC url where the video will be viewable once uploaded.
    // This requires public access to be enabled on the bucket (or a custom domain connected).
    const publicUrl = `https://${R2_BUCKET_NAME}.${R2_ACCOUNT_ID}.r2.cloudflarestorage.com/${objectKey}`;

    console.log(`✅ Generated presigned upload URL for: ${objectKey}`);

    return res.status(200).json({
      uploadUrl: presignedUrl,
      publicUrl: publicUrl,
      objectKey: objectKey,
      expiresIn: 600,
    });
  } catch (error) {
    console.error('❌ Presigned URL generation error:', error.message);
    return res.status(500).json({ error: error.message });
  }
};
