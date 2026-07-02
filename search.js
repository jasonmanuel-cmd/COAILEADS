// api/search.js — COAI Lead Engine Backend
// Vercel Serverless Function
//
// Environment variables required in Vercel dashboard:
//   GOOGLE_PLACES_API_KEY  — your Google API key
//   APP_PASSWORD           — your access token (e.g. COAI-GOD-MODE-2026)
//
// Modes via ?mode= param:
//   geocode  — city string → lat/lng
//   ping     — auth check only, no Google call
//   default  — NearbySearch with keyword + pagination

module.exports = async function handler(req, res) {
  // CORS
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Authorization');
  if (req.method === 'OPTIONS') return res.status(200).end();

  // AUTH CHECK — fail closed. No env var = no access, no fallback.
  const MASTER_PASSWORD = process.env.APP_PASSWORD;
  if (!MASTER_PASSWORD) {
    return res.status(503).json({ error: 'Engine locked: APP_PASSWORD not configured in Vercel env vars.' });
  }

  const userAuth = req.headers['authorization'];
  if (!userAuth || userAuth !== MASTER_PASSWORD) {
    return res.status(401).json({ error: 'Unauthorized: Invalid Access Key.' });
  }

  const { mode, location, lat, lng, radius = '8000', type, pagetoken } = req.query;

  // PING — auth check only
  if (mode === 'ping') {
    return res.status(200).json({ status: 'authorized' });
  }

  const apiKey = process.env.GOOGLE_PLACES_API_KEY;
  if (!apiKey) {
    return res.status(500).json({ error: 'GOOGLE_PLACES_API_KEY not set in Vercel env vars.' });
  }

  try {
    // GEOCODE MODE
    if (mode === 'geocode') {
      if (!location) return res.status(400).json({ error: 'location param required.' });
      const url = `https://maps.googleapis.com/maps/api/geocode/json?address=${encodeURIComponent(location)}&key=${apiKey}`;
      const data = await (await fetch(url)).json();
      return res.status(200).json(data);
    }

    // DETAILS MODE — phone + website for one place_id
    if (mode === 'details') {
      const { place_id } = req.query;
      if (!place_id) return res.status(400).json({ error: 'place_id param required.' });
      const url = `https://maps.googleapis.com/maps/api/place/details/json`
        + `?place_id=${encodeURIComponent(place_id)}`
        + `&fields=formatted_phone_number,website`
        + `&key=${apiKey}`;
      const data = await (await fetch(url)).json();
      return res.status(200).json(data);
    }

    // EMAIL MODE — fetch a business website server-side, extract emails
    if (mode === 'email') {
      const { url: siteUrl } = req.query;
      if (!siteUrl) return res.status(400).json({ error: 'url param required.' });
      let target;
      try { target = new URL(siteUrl); } catch { return res.status(400).json({ error: 'Invalid URL.' }); }
      // Guard: public http(s) hosts only
      const host = target.hostname.toLowerCase();
      if (!/^https?:$/.test(target.protocol) ||
          host === 'localhost' || /^(\d+\.){3}\d+$/.test(host) || host.endsWith('.local') || host.endsWith('.internal')) {
        return res.status(400).json({ error: 'URL not allowed.' });
      }
      try {
        const ctrl = new AbortController();
        const timer = setTimeout(() => ctrl.abort(), 8000);
        const resp = await fetch(target.href, {
          signal: ctrl.signal,
          headers: { 'User-Agent': 'Mozilla/5.0 (compatible; COAILeadEngine/2.1)' }
        });
        clearTimeout(timer);
        const html = (await resp.text()).slice(0, 400000);
        const found = new Set();
        // mailto links first (highest confidence)
        for (const m of html.matchAll(/mailto:([a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,})/gi)) found.add(m[1].toLowerCase());
        // then raw emails in text
        for (const m of html.matchAll(/\b[a-zA-Z0-9._%+-]+@[a-zA-Z0-9-]+(?:\.[a-zA-Z0-9-]+)*\.[a-zA-Z]{2,}\b/g)) found.add(m[0].toLowerCase());
        const JUNK = /\.(png|jpe?g|gif|svg|webp|css|js)$|@(example|sentry|wixpress|godaddy|domain|email|schema|placeholder|yourdomain|test)\.|^(noreply|no-reply|donotreply)@|@\dx\./;
        const emails = [...found].filter(e => !JUNK.test(e)).slice(0, 3);
        return res.status(200).json({ status: 'OK', emails });
      } catch (e) {
        return res.status(200).json({ status: 'FAILED', emails: [], error: e.name === 'AbortError' ? 'timeout' : e.message });
      }
    }

    // NEARBYSEARCH (default)
    if (!type) return res.status(400).json({ error: 'type param required.' });

    let resolvedLat = lat;
    let resolvedLng = lng;

    if (!resolvedLat || !resolvedLng) {
      if (!location) return res.status(400).json({ error: 'Provide lat+lng or location.' });
      const geoUrl = `https://maps.googleapis.com/maps/api/geocode/json?address=${encodeURIComponent(location)}&key=${apiKey}`;
      const geoData = await (await fetch(geoUrl)).json();
      if (geoData.status !== 'OK' || !geoData.results.length) {
        return res.status(400).json({ error: 'Geocode failed: ' + geoData.status });
      }
      resolvedLat = geoData.results[0].geometry.location.lat;
      resolvedLng = geoData.results[0].geometry.location.lng;
    }

    let placesUrl = `https://maps.googleapis.com/maps/api/place/nearbysearch/json`
      + `?location=${resolvedLat},${resolvedLng}`
      + `&radius=${radius}`
      + `&keyword=${encodeURIComponent(type)}`
      + `&key=${apiKey}`;

    if (pagetoken) placesUrl += `&pagetoken=${encodeURIComponent(pagetoken)}`;

    const placesData = await (await fetch(placesUrl)).json();
    return res.status(200).json(placesData);

  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
}
