import axios from 'axios';
import NodeCache from 'node-cache';

const cache = new NodeCache({ stdTTL: 900 }); // 15 minutes default
const API_KEY = '123'; // Free key
const BASE_URL = 'https://www.thesportsdb.com/api/v1/json';

const apiClient = axios.create({
  baseURL: `${BASE_URL}/${API_KEY}`,
});

async function getTeamId(teamName) {
  const cacheKey = `team_id:${teamName.toLowerCase()}`;
  const cachedId = cache.get(cacheKey);
  if (cachedId) return cachedId;

  try {
    // TheSportsDB search is limited in free tier, but let's try
    const response = await apiClient.get('/searchteams.php', { params: { t: teamName } });
    const teamId = response.data.teams?.[0]?.idTeam;
    if (teamId) {
      cache.set(cacheKey, teamId);
      return teamId;
    }
  } catch (error) {
    console.error('Error fetching team ID from TheSportsDB:', error);
  }
  return null;
}

export async function fetchFootballData(intent, entity) {
  const cacheKey = `${intent}:${entity || 'all'}`;
  const cachedData = cache.get(cacheKey);
  if (cachedData) return cachedData;

  let endpoint = '';
  let params = {};

  try {
    switch (intent) {
      case 'live_match':
        // TheSportsDB free tier doesn't have a direct "live all" for free.
        // We use today's events as a fallback for "live" context in free tier.
        endpoint = '/eventsday.php';
        const today = new Date().toISOString().split('T')[0];
        params = { d: today, s: 'Soccer' };
        break;
      case 'last_match':
        if (!entity) return null;
        const lastTeamId = await getTeamId(entity);
        if (!lastTeamId) return null;
        endpoint = '/eventslast.php';
        params = { id: lastTeamId };
        break;
      case 'next_match':
        if (!entity) return null;
        const nextTeamId = await getTeamId(entity);
        if (!nextTeamId) return null;
        endpoint = '/eventsnext.php';
        params = { id: nextTeamId };
        break;
      case 'standings':
        // Defaulting to Premier League (id: 4328)
        endpoint = '/lookuptable.php';
        params = { l: 4328, s: '2023-2024' }; 
        break;
      default:
        return null;
    }

    const response = await apiClient.get(endpoint, { params });
    // TheSportsDB returns different keys based on endpoint
    const data = response.data.events || response.data.table || response.data.results;
    
    if (data && data.length > 0) {
      cache.set(cacheKey, data);
      return data;
    }
    return null;
  } catch (error) {
    console.error('TheSportsDB fetch error:', error);
    return null;
  }
}
