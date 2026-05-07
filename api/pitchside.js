import { detectIntent } from './intent.js';
import { fetchFootballData } from './football_client.js';
import { formatResponse } from './ai_formatter.js';

export default async function handler(req, res) {
  // CORS Headers
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const { query } = req.body;
  if (!query) return res.status(400).json({ error: 'Query is required' });

  try {
    // 1. Intent Detection
    const { intent, entity } = await detectIntent(query);
    console.log(`Detected Intent: ${intent}, Entity: ${entity}`);

    // 2. Data Fetching (if applicable)
    let footballData = null;
    if (['live_match', 'last_match', 'next_match', 'standings'].includes(intent)) {
      footballData = await fetchFootballData(intent, entity);
    }

    // 3. AI Formatting & Final Output
    const responseText = await formatResponse(query, footballData, intent);

    return res.status(200).json({
      intent,
      entity,
      data: footballData,
      answer: responseText
    });

  } catch (error) {
    console.error('Pitchside handler error:', error);
    return res.status(500).json({ 
      error: 'Internal Server Error', 
      message: "Football data is currently unavailable for this request." 
    });
  }
}
