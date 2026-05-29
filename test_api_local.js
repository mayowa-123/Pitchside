import handler from './api/league-standings.js';

// Mock request and response
const req = {
  query: { league: '39' },
  method: 'GET'
};

const res = {
  status: (code) => {
    console.log('Status Code:', code);
    return res;
  },
  json: (data) => {
    console.log('Response Data:', JSON.stringify(data, null, 2));
    return res;
  },
  setHeader: (name, value) => {
    // console.log(`Header ${name}: ${value}`);
    return res;
  },
  end: () => {
    console.log('Response Ended');
    return res;
  }
};

console.log('Testing API handler for league 39 (Premier League)...');
handler(req, res).catch(err => console.error('Handler Error:', err));
