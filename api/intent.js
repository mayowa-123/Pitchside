import Groq from 'groq-sdk';

const groq = new Groq({ apiKey: process.env.GROQ_API_KEY });

export async function detectIntent(query) {
  const prompt = `
    Classify the following football-related user query into exactly one of these categories:
    - live_match: Query about currently ongoing matches.
    - last_match: Query about the most recent result of a specific team.
    - next_match: Query about the upcoming fixture of a specific team.
    - standings: Query about league tables or rankings.
    - general_football_knowledge: Anything else (history, player bios, rules).

    Also, extract the team name or league name if applicable.

    Return ONLY a JSON object like this:
    {
      "intent": "category",
      "entity": "team or league name or null"
    }

    User Query: "${query}"
  `;

  try {
    const completion = await groq.chat.completions.create({
      messages: [{ role: 'user', content: prompt }],
      model: 'llama-3.3-70b-versatile',
      response_format: { type: 'json_object' },
    });

    return JSON.parse(completion.choices[0].message.content);
  } catch (error) {
    console.error('Intent detection failed:', error);
    return { intent: 'general_football_knowledge', entity: null };
  }
}
