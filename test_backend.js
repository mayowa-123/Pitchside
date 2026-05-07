import dotenv from 'dotenv';
dotenv.config();

import { detectIntent } from './api/intent.js';
import { fetchFootballData } from './api/football_client.js';
import { formatResponse } from './api/ai_formatter.js';

async function runTest(query) {
  console.log(`\n--- Testing Query: "${query}" ---`);
  
  const { intent, entity } = await detectIntent(query);
  console.log(`Intent: ${intent}, Entity: ${entity}`);

  let data = null;
  if (['live_match', 'last_match', 'next_match', 'standings'].includes(intent)) {
    data = await fetchFootballData(intent, entity);
    console.log(`Data Fetched: ${data ? 'Yes (' + data.length + ' items)' : 'No'}`);
  }

  const answer = await formatResponse(query, data, intent);
  console.log(`AI Answer: ${answer}`);
}

async function main() {
  if (!process.env.GROQ_API_KEY || !process.env.APIFOOTBALL_KEY) {
    console.error('Missing API keys in environment variables.');
    return;
  }

  await runTest("How did Arsenal do in their last match?");
  await runTest("Are there any live matches right now?");
  await runTest("When is Chelsea's next game?");
  await runTest("Show me the Premier League standings.");
  await runTest("Who won the World Cup in 1966?");
}

main();
