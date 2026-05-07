# Pitchside Backend Implementation

This repository now contains a production-grade backend system for the Pitchside AI assistant.

## Core Features
- **Intent Detection**: Automatically classifies queries into live matches, last results, next fixtures, or standings.
- **Truth Layer**: Uses API-FOOTBALL v3 as the exclusive source for all match data.
- **Caching**: Implements a 15-minute cache to reduce API costs and improve speed.
- **AI Explanation**: Uses Groq (Llama 3.3 70B) to format data into conversational responses without hallucinating scores.

## File Structure
- `api/pitchside.js`: Main entry point for the backend.
- `api/intent.js`: LLM-powered intent classification.
- `api/football_client.js`: API-FOOTBALL integration with caching.
- `api/ai_formatter.js`: Groq-powered response formatting.

## Setup
1. Copy `.env.example` to `.env`.
2. Add your `APIFOOTBALL_KEY` and `GROQ_API_KEY`.
3. Install dependencies: `pnpm install`.
4. Run tests: `node test_backend.js`.

## Deployment
The system is designed to work as Serverless Functions (compatible with Vercel or Netlify).
- **Vercel**: The `api/` directory is automatically picked up.
- **Netlify**: Functions are located in `netlify/functions/`. (Note: You may need to update the Netlify functions to match the new logic in `api/`).
