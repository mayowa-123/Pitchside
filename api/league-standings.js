import admin from 'firebase-admin';

if (!admin.apps.length) {
  try {
    if (!process.env.FIREBASE_SERVICE_ACCOUNT) {
      throw new Error('FIREBASE_SERVICE_ACCOUNT environment variable is missing');
    }
    const serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT);
    admin.initializeApp({ credential: admin.credential.cert(serviceAccount) });
    console.log('✅ Firebase Admin Initialized successfully in API');
  } catch (e) {
    console.error('❌ Firebase Init Error:', e.message);
    // We don't exit(1) here because it's a serverless function, but we log it
  }
}

const db = admin.firestore();

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  
  if (req.method === 'OPTIONS') return res.status(200).end();

  const leagueMap = {
    '39': 'pl_standings',
    '140': 'laliga_standings',
    '135': 'seriea_standings',
    '78': 'bundesliga_standings',
    '61': 'ligue1_standings',
  };

  try {
    const { league = '39' } = req.query;
    const collectionName = leagueMap[String(league)];
    
    if (!collectionName) {
      return res.status(400).json({ error: 'Invalid league ID' });
    }

    // Try to get data from Firestore
    try {
      const snap = await db.collection(collectionName).get();
      if (!snap.empty) {
        const standings = snap.docs
          .map(d => d.data())
          .sort((a, b) => parseInt(a.rank) - parseInt(b.rank));
        return res.status(200).json({ standings });
      }
    } catch (fsError) {
      console.error('Firestore Error:', fsError.message);
    }

    // Fallback or if Firestore failed, return empty to avoid 500
    return res.status(200).json({ standings: [], note: 'Data loading, please check back in a few minutes.' });

  } catch (err) {
    return res.status(200).json({ standings: [], error: err.message });
  }
}
