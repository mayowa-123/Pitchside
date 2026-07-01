# Upload instructions for PitchSide — Cloudflare R2

This document explains how to configure Cloudflare R2 CORS for browser uploads and how to debug presigned PUT uploads from the PitchSide frontend.

## Problem
When using presigned PUT URLs with Cloudflare R2, browsers perform an OPTIONS preflight followed by a PUT. If the presigned signature includes headers (e.g., Content-Type) the browser must send exactly the same header value as signed. Mobile browsers sometimes send slightly different MIME values (different casing or vendor-specific strings), which leads to 403 signature mismatch errors.

To avoid this, we updated `api/r2-upload-url.js` to not include `ContentType` in the signed PutObjectCommand. The original content type is stored as object metadata (`originalContentType`).

---

## Cloudflare R2 CORS settings (recommended)
Use the Cloudflare dashboard to edit the bucket's CORS policy to match these values. If the UI accepts JSON, use this JSON block. Otherwise, add the entries in the form fields.

```json
[
  {
    "allowed_origins": [
      "https://pitchside.vercel.app",
      "https://x-mayowa-123s-projects.vercel.app",
      "http://localhost:3000"
    ],
    "allowed_methods": ["GET","HEAD","PUT","POST","DELETE","OPTIONS"],
    "allowed_headers": ["*"],
    "expose_headers": [],
    "max_age_seconds": 600
  }
]
```

Notes:
- Replace the origins with the exact origin(s) your frontend uses (scheme + host + port).
- While debugging you may temporarily set allowed_origins to ["*"], but avoid leaving that in production.
- If you use a custom domain for R2, set the DNS to DNS-only (grey cloud) during PUT uploads or use the direct R2 domain in presigned URLs.

---

## Frontend upload snippet (use this exact code)
Place this in the frontend function that gets the presigned URL and uploads the file.

```javascript
async function uploadWithPresignedUrl(uploadUrl, file) {
  console.log('Uploading file', file.name, 'type=', file.type);
  const res = await fetch(uploadUrl, {
    method: 'PUT',
    headers: {
      'Content-Type': file.type
    },
    body: file,
    mode: 'cors'
  });

  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`Upload failed: ${res.status} ${res.statusText} ${text}`);
  }
  return res;
}
```

Notes:
- Keep headers minimal. Do not send Authorization unless it was part of the signature.
- Logging file.type helps when debugging signature/content-type mismatches.

---

## Debugging steps (browser)
1. Open DevTools → Network → Preserve log.
2. Request a new presigned URL from your app and then attempt the upload.
3. Inspect the OPTIONS request (preflight):
   - Response must include Access-Control-Allow-Origin (your origin) and Access-Control-Allow-Methods which includes PUT.
   - Access-Control-Allow-Headers should include Content-Type or be `*`.
4. Inspect the PUT request: success (200/201) or error (403, 405, 0).
5. If 403: signature mismatch — likely Content-Type was signed and didn't match the uploaded header. With the presign change this should be less common.
6. If 405: method not allowed — ensure bucket policy allows PUT and Cloudflare proxy is not blocking it.
7. If status 0 / CORS error: bucket CORS misconfigured or Cloudflare proxy interfering.

---

## Quick curl tests
Replace placeholders and run from your terminal.

Preflight test:

```bash
curl -i -X OPTIONS "https://<bucket>.<account>.r2.cloudflarestorage.com/<objectKey>" \
  -H "Origin: https://pitchside.vercel.app" \
  -H "Access-Control-Request-Method: PUT"
```

Upload test (use the exact presigned URL returned by `api/r2-upload-url`):

```bash
curl -i -X PUT "PRESIGNED_URL_HERE" \
  -H "Content-Type: video/mp4" \
  --data-binary @small-test.mp4
```

---

## What I pushed
1. api/r2-upload-url.js: removed ContentType from signature, store originalContentType metadata.
2. docs/UPLOAD_INSTRUCTIONS.md: this file with the instructions and debug steps above.

---

If you want, next I will:
- Add lightweight frontend logging and the exact upload snippet in `app.js` where `pcPublish`/`pcPublish` calls happen.
- Add a retry UI and better error messages.

Tell me if you want me to proceed to push the frontend changes to `main` now.