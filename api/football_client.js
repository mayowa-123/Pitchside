import axios from 'axios';
import NodeCache from 'node-cache';

const cache = new NodeCache({ stdTTL: 900 }); // 15 minutes default
const API_KEY = process.env.APIFOOTBALL_KEY;
const BASE_URL = 'https://v3.football.api-sports.io';

const apiClient = axios.create({
  baseURL: BASE_URL,
  headers: { 'x-apisports-key': API_KEY },
});

async function getTeamId(teamName) {
  const cacheKey = `team_id:${teamName.toLowerCase()}`;
  const cachedId = cache.get(cacheKey);
  if (cachedId) return cachedId;

  try {
    const response = await apiClient.get('/teams', { params: { search: teamName } });
    const teamId = response.data.response?.[0]?.team?.id;
    if (teamId) {
      cache.set(cacheKey, teamId);
      return teamId;
    }
  } catch (error) {
    console.error('Error fetching team ID:', error);
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
        endpoint = '/fixtures';
        params = { live: 'all' };
        break;
      case 'last_match':
        if (!entity) return null;
        const lastTeamId = await getTeamId(entity);
        if (!lastTeamId) return null;
        endpoint = '/fixtures';
        params = { team: lastTeamId, last: 1 };
        break;
      case 'next_match':
        if (!entity) return null;
        const nextTeamId = await getTeamId(entity);
        if (!nextTeamId) return null;
        endpoint = '/fixtures';
        params = { team: nextTeamId, next: 1 };
        break;
      case 'standings':
        // Defaulting to Premier League (id: 39) if no league entity is found, 
        // or we could search for league ID similarly to team ID.
        endpoint = '/standings';
        params = { league: 39, season: 2024 }; // Simplified for now
        break;
      default:
        return null;
    }

    const response = await apiClient.get(endpoint, { params });
    const data = response.data.response;
    
    if (data && data.length > 0) {
      cache.set(cacheKey, data);
      return data;
    }
    return null;
  } catch (error) {
    console.error('API-FOOTBALL fetch error:', error);
    return null;
  }
}
