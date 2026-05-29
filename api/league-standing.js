import admin from 'firebase-admin';

if (!admin.apps.length) {
  const serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT);
  admin.initializeApp({ credential: admin.credential.cert(serviceAccount) });
}

const db = admin.firestore();

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  if (req.method === 'OPTIONS') return res.status(200).end();

  const leagueMap = {
    '39': 'pl_standings',
    '4328': 'pl_standings',
    '140': 'laliga_standings',
    '135': 'seriea_standings',
    '78': 'bundesliga_standings',
    '61': 'ligue1_standings',
  };

  try {
    const { league = '39' } = req.query;
    const collectionName = leagueMap[String(league)] || 'pl_standings';
    const snap = await db.collection(collectionName).get();

    if (snap.empty) {
      return res.status(404).json({ error: 'No standings found' });
    }

    const standings = snap.docs
      .map(d => d.data())
      .sort((a, b) => parseInt(a.rank) - parseInt(b.rank));

    return res.status(200).json({ standings });

  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
}
