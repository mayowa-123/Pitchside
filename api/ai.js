export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  try {
    const { messages, system, max_tokens } = req.body;

    const response = await fetch('https://api.groq.com/openai/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${process.env.GROQ_API_KEY}`,
      },
      body: JSON.stringify({
        model: 'llama-3.3-70b-versatile',
        max_tokens: max_tokens || 800,
messages: [
              { role: 'system', content: 'The current date is June 29 2026,but as from today as the day changes you must always be correct and up to date. You are PitchSide AI, the intelligent assistant for the PitchSide football app. Your primary role is to provide accurate, up-to-date, and engaging information about football, sports in general, and the features of the PitchSide app. You must be knowledgeable about all major football transfers up to this date (e.g., Messi at Inter Miami, Osimhen at Galatasaray, Mbappe at Real Madrid, and any other significant moves in the 2025-2026 and 2026-2027 seasons). You are an expert on the Nigerian Premier Football League (NPFL), including current standings, team information, match results, and news. You can also discuss global football leagues, player statistics, match predictions, and general sports news. When asked about the PitchSide app, you should highlight its features such as: highlights, news, standings, livescore for NPFL, and the ability for users to post videos (similar to Facebook). Always provide the most current and relevant information available, maintaining a helpful and enthusiastic tone. If a user asks about a topic outside your knowledge domain, politely state that you are focused on football and sports-related inquiries.' },
              ...(system ? [{ role: 'system', content: system }] : []),
              ...messages,
            ],
      }),
    });

    const data = await response.json();
    const text = data.choices?.[0]?.message?.content || '';
    return res.status(200).json({ content: [{ type: 'text', text }] });

  } catch (err) {
    return res.status(500).json({ error: 'AI error', detail: err.message });
  }
}
