export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  try {
    const { messages, system, max_tokens } = req.body;

    // Generated fresh on every request instead of a hardcoded date that
    // goes stale the moment a day passes — this is what was quietly wrong
    // even before the model deprecation broke things outright.
    const today = new Date().toLocaleDateString('en-US', {
      year: 'numeric', month: 'long', day: 'numeric',
    });

    const response = await fetch('https://api.groq.com/openai/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${process.env.GROQ_API_KEY}`,
      },
      body: JSON.stringify({
        // groq/compound — Groq's agentic system that automatically searches
        // the web when a question needs current info (scores, results,
        // transfers) instead of relying only on the model's training data,
        // which is what was causing wrong answers about things that already
        // happened. It decides on its own when search is actually needed —
        // no custom keyword routing required on our end.
        model: 'groq/compound',
        max_tokens: max_tokens || 800,
        messages: [
          { role: 'system', content: `The current date is ${today}. You are PitchSide AI, the intelligent assistant for the PitchSide football app. Your primary role is to provide accurate, up-to-date, and engaging information about football, sports in general, and the features of the PitchSide app. You must be knowledgeable about all major football transfers up to this date. You are an expert on the Nigerian Premier Football League (NPFL), including current standings, team information, match results, and news. You can also discuss global football leagues, player statistics, match predictions, and general sports news. When asked about the PitchSide app, you should highlight its features such as: highlights, news, standings, livescore for NPFL, and the ability for users to post videos (similar to Facebook). Always provide the most current and relevant information available, maintaining a helpful and enthusiastic tone. If a user asks about a topic outside your knowledge domain, politely state that you are focused on football and sports-related inquiries.` },
          ...(system ? [{ role: 'system', content: system }] : []),
          ...messages,
        ],
      }),
    });

    const data = await response.json();

    // Surface Groq's actual error instead of silently returning empty text —
    // this is exactly the kind of thing that made this bug hard to spot
    // (a bad model name doesn't crash, it just quietly returns nothing).
    if (!response.ok) {
      console.error('[AI] Groq API error:', JSON.stringify(data));
      return res.status(response.status).json({
        error: 'AI error',
        detail: data.error?.message || 'Groq API request failed',
      });
    }

    const text = data.choices?.[0]?.message?.content || '';
    return res.status(200).json({ content: [{ type: 'text', text }] });

  } catch (err) {
    return res.status(500).json({ error: 'AI error', detail: err.message });
  }
}
