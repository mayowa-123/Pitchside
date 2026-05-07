import Groq from 'groq-sdk';

const groq = new Groq({ apiKey: process.env.GROQ_API_KEY });

export async function formatResponse(query, data, intent) {
  if (!data && intent !== 'general_football_knowledge') {
    return "Football data is currently unavailable for this request.";
  }

  const systemPrompt = `
    You are Pitchside AI, a professional football assistant.
    Your goal is to explain football data in simple, conversational language.
    
    STRICT RULES:
    1. If data is provided, use ONLY that data for facts, scores, and results.
    2. NEVER guess or invent scores or match details.
    3. If no data is provided for a specific match/standing query, state that the data is unavailable.
    4. For general knowledge, you can use your internal training data but keep it factual.
  `;

  const userPrompt = `
    User Query: "${query}"
    Retrieved Data: ${JSON.stringify(data)}
    Intent: ${intent}
    
    Please provide a conversational response based on the rules.
  `;

  try {
    const completion = await groq.chat.completions.create({
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt }
      ],
      model: 'llama-3.3-70b-versatile',
    });

    return completion.choices[0].message.content;
  } catch (error) {
    console.error('AI formatting failed:', error);
    return "I'm sorry, I encountered an error while processing your request.";
  }
}
