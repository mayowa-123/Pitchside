
export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  if (req.method === "OPTIONS") return res.status(200).end();

  const API_KEY = process.env.SPORTMONKS_API_KEY || "YOUR_SPORTMONKS_API_KEY"; // Replace with actual API key
  const BASE_URL = "https://api.sportmonks.com/v3/football";

  try {
    const { endpoint, ...params } = req.query;
    if (!endpoint) {
      return res.status(400).json({ error: "Missing endpoint parameter" });
    }

    const queryParams = new URLSearchParams({
      api_token: API_KEY,
      ...params,
    }).toString();

    const url = `${BASE_URL}/${endpoint}?${queryParams}`;

    const response = await fetch(url);

    if (!response.ok) {
      const errorText = await response.text();
      console.error(`Sportmonks API error: ${response.status} - ${errorText}`);
      return res.status(response.status).json({ error: "Failed to fetch data from Sportmonks", details: errorText });
    }

    const data = await response.json();
    return res.status(200).json(data);
  } catch (error) {
    console.error("Serverless function error:", error);
    return res.status(500).json({ error: "Internal server error", details: error.message });
  }
}
