const axios = require('axios');
const cheerio = require('cheerio');
const admin = require('firebase-admin');

// 1. Initialize Firebase Admin (Using the Key you got in Step 1)
const serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT);
admin.initializeApp({
  credential: admin.credential.cert(serviceAccount)
});
const db = admin.firestore();

async function scrapeNPFL() {
  try {
    // 2. Fetch the Official NPFL Table Page
    const { data } = await axios.get('https://npfl.com.ng/stats/table');
    const $ = cheerio.load(data);
    const standings = [];

    // 3. The "Scraping" Logic: Finding rows in the table
    $('table tbody tr').each((i, el) => {
      const row = $(el).find('td');
      if (row.length > 0) {
        standings.push({
          rank: $(row[0]).text().trim(),
          team: $(row[1]).text().trim(),
          played: $(row[2]).text().trim(),
          points: $(row[9]).text().trim(), // NPFL table usually has points in the 10th column
          lastUpdated: new Date().toISOString()
        });
      }
    });

    // 4. Update Firebase
    const batch = db.batch();
    standings.forEach((team) => {
      const docRef = db.collection('npfl_standings').doc(team.team.replace(/\s+/g, '_'));
      batch.set(docRef, team);
    });
    
    await batch.commit();
    console.log('✅ NPFL Table Updated Successfully!');
  } catch (error) {
    console.error('❌ Error scraping NPFL:', error);
  }
}

scrapeNPFL();
