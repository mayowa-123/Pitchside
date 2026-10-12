// Shared helpers for /api functions. (Files starting with "_" are not routed
// as serverless functions by Vercel.)
import admin from 'firebase-admin';

function ensureAdmin() {
  if (!admin.apps.length) {
    if (!process.env.FIREBASE_SERVICE_ACCOUNT) throw new Error('FIREBASE_SERVICE_ACCOUNT not set');
    admin.initializeApp({ credential: admin.credential.cert(JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT)) });
  }
  return admin;
}

// Returns the verified Firebase user, or null after sending a 401.
export async function requireUser(req, res) {
  const m = /^Bearer (.+)$/.exec(req.headers.authorization || '');
  if (!m) { res.status(401).json({ error: 'Please sign in.' }); return null; }
  try {
    return await ensureAdmin().auth().verifyIdToken(m[1]);
  } catch (e) {
    res.status(401).json({ error: 'Session expired — please sign in again.' });
    return null;
  }
}

// Best-effort per-instance rate limit (serverless instances are short-lived, so
// this slows abuse but is not a hard guarantee).
const buckets = new Map();
export function rateLimit(key, max, windowMs) {
  const now = Date.now();
  const b = (buckets.get(key) || []).filter(t => now - t < windowMs);
  if (b.length >= max) { buckets.set(key, b); return false; }
  b.push(now); buckets.set(key, b);
  if (buckets.size > 5000) buckets.clear();
  return true;
}
