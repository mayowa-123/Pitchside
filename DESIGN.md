# Pitchside Backend Design

## Architecture
The system follows a pipeline architecture to ensure data integrity and minimize AI hallucinations.

1.  **Intent Detection Layer**: Classifies user queries into `live_match`, `last_match`, `next_match`, `standings`, or `general_football_knowledge`.
2.  **Data Layer (API-FOOTBALL)**: Fetches real-time data based on the detected intent.
3.  **Caching Layer**: Stores API responses to reduce costs and improve performance (TTL: 10-30 mins).
4.  **AI Response Layer (Groq)**: Formats the retrieved data into a conversational response.

## Components

### 1. Intent Classifier
Uses a lightweight LLM call (Groq) or pattern matching to determine the user's goal.
- **Input**: User query string.
- **Output**: One of the five predefined categories + extracted entities (team name, league).

### 2. Football Data Client
Handles communication with API-FOOTBALL v3.
- **Endpoints**:
    - `live_match`: `/fixtures?live=all`
    - `last_match`: `/fixtures?last=1&team={id}`
    - `next_match`: `/fixtures?next=1&team={id}`
    - `standings`: `/standings?league={id}&season={year}`
- **Entity Resolution**: Translates team names to IDs using `/teams?search={name}`.

### 3. Cache Manager
In-memory cache with TTL support.
- **Key Format**: `intent:entity:params`
- **TTL**: 15 minutes (default).

### 4. AI Formatter
Uses Groq's `llama-3.3-70b-versatile` to turn JSON data into human-friendly text.
- **Constraint**: Must not add information not present in the data layer for categories 1-4.

## Error Handling
- If API-FOOTBALL returns no data or fails, the system returns a standard "Data unavailable" message.
- AI is strictly forbidden from guessing scores or results.
