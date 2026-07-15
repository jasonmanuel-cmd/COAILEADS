// api/search.js — COAI Lead Engine Backend v2.1
// Adds findplace mode for exact business lookup from the desktop app.
//
// Required Vercel env vars:
//   GOOGLE_PLACES_API_KEY
//   APP_PASSWORD

module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Authorization');
  if (req.method === 'OPTIONS') return res.status(200).end();

  const MASTER_PASSWORD = process.env.APP_PASSWORD;
  if (!MASTER_PASSWORD) {
    return res.status(500).json({ error: 'Server misconfiguration: APP_PASSWORD not set.' });
  }
  if (req.headers['authorization'] !== MASTER_PASSWORD) {
    return res.status(401).json({ error: 'Unauthorized: Invalid Access Key.' });
  }

  const {
    mode, location, lat, lng, radius = '8000', type,
    pagetoken, place_id, input
  } = req.query;

  if (mode === 'ping') {
    return res.status(200).json({ status: 'authorized' });
  }

  const apiKey = process.env.GOOGLE_PLACES_API_KEY;
  if (!apiKey) {
    return res.status(500).json({ error: 'GOOGLE_PLACES_API_KEY not set in Vercel env vars.' });
  }

  try {
    if (mode === 'geocode') {
      if (!location) return res.status(400).json({ error: 'location param required.' });
      const url = `https://maps.googleapis.com/maps/api/geocode/json?address=${encodeURIComponent(location)}&key=${apiKey}`;
      return res.status(200).json(await (await fetch(url)).json());
    }

    if (mode === 'findplace') {
      if (!input) return res.status(400).json({ error: 'input param required.' });
      const fields = [
        'place_id', 'name', 'formatted_address', 'business_status',
        'rating', 'user_ratings_total', 'geometry', 'types'
      ].join(',');
      const url = `https://maps.googleapis.com/maps/api/place/findplacefromtext/json`
        + `?input=${encodeURIComponent(input)}`
        + `&inputtype=textquery`
        + `&fields=${encodeURIComponent(fields)}`
        + `&key=${apiKey}`;
      return res.status(200).json(await (await fetch(url)).json());
    }

    if (mode === 'placedetails') {
      if (!place_id) return res.status(400).json({ error: 'place_id param required.' });
      const fields = [
        'name', 'formatted_phone_number', 'international_phone_number',
        'website', 'formatted_address', 'opening_hours', 'business_status',
        'rating', 'user_ratings_total', 'url', 'types'
      ].join(',');
      const url = `https://maps.googleapis.com/maps/api/place/details/json`
        + `?place_id=${encodeURIComponent(place_id)}`
        + `&fields=${encodeURIComponent(fields)}`
        + `&key=${apiKey}`;
      return res.status(200).json(await (await fetch(url)).json());
    }

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

    return res.status(200).json(await (await fetch(placesUrl)).json());
  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
};
