exports.handler = async function (event) {
  const headers = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
  };

  if (event.httpMethod === 'OPTIONS') return { statusCode: 200, headers, body: '' };
  if (event.httpMethod !== 'POST') return { statusCode: 405, headers, body: JSON.stringify({ error: 'Method not allowed' }) };

  try {
    const body = JSON.parse(event.body);

    const response = await fetch('https://api.x.ai/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${process.env.GROK_API_KEY}`, // 🔒 Stored in Netlify dashboard
      },
      body: JSON.stringify({
        model: 'grok-3-mini', // or grok-3 if you have access
        max_tokens: body.max_tokens || 800,
        messages: body.messages,
        ...(body.system ? { system: body.system } : {}),
      }),
    });

    const data = await response.json();

    // Normalize Grok response to match Anthropic format your app expects
    const text = data.choices?.[0]?.message?.content || '';
    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({
        content: [{ type: 'text', text }]
      }),
    };

  } catch (err) {
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({ error: 'AI error', detail: err.message }),
    };
  }
};
