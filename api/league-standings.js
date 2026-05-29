import admin from 'firebase-admin';

if (!admin.apps.length) {
  try {
    const serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT);
    admin.initializeApp({ credential: admin.credential.cert(serviceAccount) });
  } catch (e) {
    console.error('❌ Failed to parse FIREBASE_SERVICE_ACCOUNT in API.');
  }
}

const db = admin.firestore();

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  
  if (req.method === 'OPTIONS') return res.status(200).end();

  // League ID mapping: 39=PL, 140=La Liga, 135=Serie A, 78=Bundesliga, 61=Ligue 1
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

    console.log(`Fetching collection: ${collectionName}`);
    const snap = await db.collection(collectionName).get();

    if (snap.empty) {
      console.warn(`Collection ${collectionName} is empty.`);
      return res.status(404).json({ error: `No standings found for league ${league}` });
    }

    const standings = snap.docs
      .map(d => d.data())
      .sort((a, b) => parseInt(a.rank) - parseInt(b.rank));

    return res.status(200).json({ standings });

  } catch (err) {
    console.error('API Error:', err.message);
    return res.status(500).json({ error: err.message });
  }
}
