# Live Scores Enhancement Implementation Plan

## Current State Analysis

### Data Flow
1. **Frontend** (`app.js`): 
   - `fetchLiveScores()` calls `/api/football?endpoint=fixtures&date=${today}`
   - Groups matches by league and renders them in `renderLiveScores()`
   - Ticker separately calls `/api/football?endpoint=fixtures&live=all`
   - Match detail calls `/api/football?endpoint=fixtures&id=${matchId}`

2. **Backend** (`api/football.js` and `netlify/functions/football.js`):
   - Calls `https://www.thesportsdb.com/api/v1/json/123/eventsday.php?d=${date}&s=Soccer`
   - Maps TheSportsDB events to API-Football format
   - Returns grouped matches by league

### Current Limitations
- **TheSportsDB Free Tier**: `eventsday.php` returns a limited subset of matches (appears to be only major leagues or curated matches)
- **Status Handling**: Only maps to "FT" (Finished) or "NS" (Not Started); doesn't capture true live status
- **Coverage Gap**: WeScore shows comprehensive match coverage; current implementation shows only a fraction

### Available Endpoints
- `eventsday.php?d={date}&s=Soccer`: Returns events for a specific day (limited coverage)
- `eventsnextleague.php?id={leagueId}`: Returns next 15 events for a league
- `eventslastleague.php?id={leagueId}`: Returns last 15 events for a league
- Premium features: 2-minute livescores, video highlights (not available on free tier)

## Implementation Strategy

### Phase 1: Expand Match Coverage
Instead of relying solely on `eventsday.php`, aggregate matches from multiple popular leagues:
- Premier League (4328)
- La Liga (4335)
- Serie A (4334)
- Bundesliga (4331)
- Ligue 1 (4336)
- Champions League (4337)
- Other major leagues

Use `eventsnextleague.php` for each league to get upcoming matches, then combine with `eventsday.php` for today's matches.

### Phase 2: Improve Status Handling
- Parse `strStatus` field more comprehensively
- Detect live matches based on score availability and status
- Show elapsed time when available

### Phase 3: Optimize Frontend
- Ensure grouping and filtering work with larger datasets
- Implement pagination or lazy loading if needed
- Cache results to reduce API calls

## Implementation Details

### Modified `api/football.js`
```javascript
// Fetch from multiple leagues instead of just eventsday
const leagueIds = [4328, 4335, 4334, 4331, 4336, 4337, ...];
const allMatches = [];

for (const leagueId of leagueIds) {
  const res = await fetch(`${BASE_URL}/${API_KEY}/eventsnextleague.php?id=${leagueId}`);
  const data = await res.json();
  if (data.events) allMatches.push(...data.events);
}

// Also get today's matches
const todayRes = await fetch(`${BASE_URL}/${API_KEY}/eventsday.php?d=${date}&s=Soccer`);
const todayData = await todayRes.json();
if (todayData.events) allMatches.push(...todayData.events);

// Deduplicate and map
const uniqueMatches = [...new Map(allMatches.map(m => [m.idEvent, m])).values()];
const mappedResponse = uniqueMatches.map(mapToFrontendFormat);
```

### Rate Limiting
- Free tier: 30 requests per minute
- Current approach: ~7 league calls + 1 eventsday call = 8 requests per refresh
- Acceptable for 5-minute refresh intervals

### Caching Strategy
- Cache results for 5 minutes when live games are on
- Cache for 30 minutes when no live games
- Deduplicate matches across multiple league calls
