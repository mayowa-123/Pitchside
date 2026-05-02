const axios = require('axios');
const cheerio = require('cheerio');
const admin = require('firebase-admin');

// 1. Initialize Firebase Admin
if (!admin.apps.length) {
    const serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT);
    admin.initializeApp({
        credential: admin.credential.cert(serviceAccount)
    });
}
const db = admin.firestore();

async function scrapeNPFL() {
    try {
        console.log('Fetching NPFL Table...');
        // We use a custom User-Agent to make sure the website doesn't block the bot
        const { data } = await axios.get('https://npfl.com.ng/stats/table', {
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36'
            }
        });

        const $ = cheerio.load(data);
        const standings = [];

        // Scrape the table rows
        $('table tbody tr').each((i, el) => {
            const row = $(el).find('td');
            if (row.length >= 10) {
                standings.push({
                    rank: parseInt($(row[0]).text().trim()),
                    team: $(row[1]).text().trim(),
                    played: parseInt($(row[2]).text().trim()),
                    won: parseInt($(row[3]).text().trim()),
                    drawn: parseInt($(row[4]).text().trim()),
                    lost: parseInt($(row[5]).text().trim()),
                    goalsFor: parseInt($(row[6]).text().trim()),
                    goalsAgainst: parseInt($(row[7]).text().trim()),
                    goalDifference: $(row[8]).text().trim(),
                    points: parseInt($(row[9]).text().trim()),
                    lastUpdated: admin.firestore.FieldValue.serverTimestamp()
                });
            }
        });

        console.log(`Found ${standings.length} teams. Updating Firebase...`);

        // 4. Update Firebase using a Batch (saves time/money)
        const batch = db.batch();
        standings.forEach((team) => {
            // This creates/updates a document for each team
            const docId = team.team.toLowerCase().replace(/\s+/g, '_');
            const docRef = db.collection('npfl_standings').doc(docId);
            batch.set(docRef, team);
        });
        
        await batch.commit();
        console.log('✅ NPFL Table Updated Successfully!');
    } catch (error) {
        console.error('❌ Error details:', error.message);
        process.exit(1); // Tell GitHub it failed
    }
}

scrapeNPFL();
