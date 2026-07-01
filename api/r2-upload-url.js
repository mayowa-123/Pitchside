/**
 * 🎥 PITCHSIDE FAN VIDEO UPLOAD — Presigned URL Generator
 *
 * Changes made (2026-07-01):
 * - Removed `ContentType` from the signed PutObjectCommand so the presigned
 *   URL does NOT require the browser to send an exact Content-Type header.
 *   This avoids common 403 signature-mismatch errors when mobile browsers
 *   report slightly different MIME strings.
 * - Preserve the original MIME in object metadata (`originalContentType`) so
 *   the file type can be known later when reading the object.
 * - Kept permissive CORS on this endpoint (this only affects the presign
 *   endpoint). The bucket's CORS still needs to be configured in the
 *   Cloudflare dashboard (instructions in docs/UPLOAD_INSTRUCTIONS.md).
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
  // CORS for the presign endpoint (this is NOT the bucket CORS)
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
    const allowedTypes = [
      'video/mp4', 'video/quicktime', 'video/webm', 'video/x-matroska',
      'image/jpeg', 'image/png', 'image/webp'
    ];
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

    // IMPORTANT: do NOT include ContentType in the PutObjectCommand when
    // generating the presigned PUT URL. If ContentType is included, the
    // browser must sign and send the exact same header value otherwise the
    // signature will be invalid (common source of 403s). Instead, we store
    // the original content type as metadata so it can be read later.
    const command = new PutObjectCommand({
      Bucket: R2_BUCKET_NAME,
      Key: objectKey,
      Metadata: {
        originalContentType: fileType,
      },
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
