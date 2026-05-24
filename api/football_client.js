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

function mapToFrontendFormat(event) {
  const isFinished = event.strStatus === 'Match Finished' || event.intHomeScore !== null;
  const statusShort = isFinished ? 'FT' : 'NS';
  return {
    fixture: {
      id: event.idEvent,
      date: `${event.dateEvent}T${event.strTime}`,
      status: {
        short: statusShort,
        elapsed: isFinished ? 90 : 0
      }
    },
    league: {
      id: event.idLeague,
      name: event.strLeague,
      country: event.strCountry || 'World'
    },
    teams: {
      home: { name: event.strHomeTeam, logo: event.strHomeTeamBadge || '' },
      away: { name: event.strAwayTeam, logo: event.strAwayTeamBadge || '' }
    },
    goals: {
      home: event.intHomeScore !== null ? parseInt(event.intHomeScore) : null,
      away: event.intAwayScore !== null ? parseInt(event.intAwayScore) : null
    }
  };
}

export async function fetchFootballData(intent, entity) {
  const cacheKey = `${intent}:${entity || 'all'}`;
  const cachedData = cache.get(cacheKey);
  if (cachedData) return cachedData;

  try {
    let response;
    switch (intent) {
      case 'live_match':
        const today = new Date().toISOString().split('T')[0];
        response = await apiClient.get('/eventsday.php', { params: { d: today, s: 'Soccer' } });
        if (response.data.events) {
          const mapped = response.data.events.map(mapToFrontendFormat);
          cache.set(cacheKey, mapped);
          return mapped;
        }
        break;
      case 'last_match':
        if (!entity) return null;
        const lastId = await getTeamId(entity);
        if (!lastId) return null;
        response = await apiClient.get('/eventslast.php', { params: { id: lastId } });
        if (response.data.results) {
          const mapped = response.data.results.map(mapToFrontendFormat);
          cache.set(cacheKey, mapped);
          return mapped;
        }
        break;
      case 'next_match':
        if (!entity) return null;
        const nextId = await getTeamId(entity);
        if (!nextId) return null;
        response = await apiClient.get('/eventsnext.php', { params: { id: nextId } });
        if (response.data.events) {
          const mapped = response.data.events.map(mapToFrontendFormat);
          cache.set(cacheKey, mapped);
          return mapped;
        }
        break;
      case 'standings':
        // Standings format is different, but let's keep it as is for now or map if needed
        response = await apiClient.get('/lookuptable.php', { params: { l: 4328, s: '2023-2024' } });
        if (response.data.table) {
          cache.set(cacheKey, response.data.table);
          return response.data.table;
        }
        break;
    }
    return null;
  } catch (error) {
    console.error('TheSportsDB fetch error:', error);
    return null;
  }
}
