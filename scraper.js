const axios = require('axios');
const cheerio = require('cheerio');
const admin = require('firebase-admin');

// 1. Initialize Firebase Admin securely
if (!admin.apps.length) {
    try {
        const serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT);
        admin.initializeApp({
            credential: admin.credential.cert(serviceAccount)
        });
        console.log("Firebase Admin Initialized.");
    } catch (e) {
        console.error("Failed to parse FIREBASE_SERVICE_ACCOUNT. Check your GitHub Secrets.");
        process.exit(1);
    }
}
const db = admin.firestore();

async function scrapeNPFL() {
    try {
        console.log('Bot is visiting NPFL.com.ng...');
        
        // We use the exact URL for the table
        const url = 'https://npfl.com.ng/npfl-table/'; 
        
        const { data } = await axios.get(url, {
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/110.0.0.0 Safari/537.36'
            },
            timeout: 10000 // 10 second timeout
        });

        const $ = cheerio.load(data);
        const standings = [];

        // Selecting the table rows - targetting the official site structure
        $('table tbody tr').each((i, el) => {
            const cols = $(el).find('td');
            if (cols.length >= 8) {
                standings.push({
                    rank: $(cols[0]).text().trim(),
                    team: $(cols[1]).text().trim(),
                    played: $(cols[2]).text().trim(),
                    won: $(cols[3]).text().trim(),
                    drawn: $(cols[4]).text().trim(),
                    lost: $(cols[5]).text().trim(),
                    goalsFor: $(cols[6]).text().trim(),
                    goalsAgainst: $(cols[7]).text().trim(),
                    points: $(cols[9]).text().trim() || $(cols[8]).text().trim(), // Handle table variations
                    lastUpdated: new Date().toISOString()
                });
            }
        });

        if (standings.length === 0) {
            throw new Error("Could not find any data in the table. The website structure might have changed.");
        }

        console.log(`Successfully scraped ${standings.length} teams. Syncing to Firebase...`);

        const batch = db.batch();
        standings.forEach((team) => {
            // Create a clean ID for each team (e.g., "enyimba_fc")
            const docId = team.team.toLowerCase().replace(/[^a-z0-9]/g, '_');
            const docRef = db.collection('npfl_standings').doc(docId);
            batch.set(docRef, team, { merge: true });
        });

        await batch.commit();
        console.log('✅ DATABASE UPDATED: Your app is now showing live NPFL data!');

    } catch (error) {
        console.error('❌ BOT ERROR:', error.message);
        process.exit(1);
    }
}

scrapeNPFL();
