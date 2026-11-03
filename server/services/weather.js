/**
 * weather.js
 * Meteo attuale + previsioni da Open-Meteo (gratuito, nessuna API key).
 * Docs: https://open-meteo.com/en/docs
 */
import { config } from '../config.js';
import { cached } from '../utils/cache.js';

/** Codici meteo WMO -> [descrizione, icona giorno, icona notte]. */
const WMO = {
  0: ['Sereno', '☀️', '🌙'],
  1: ['Prevalentemente sereno', '🌤️', '🌙'],
  2: ['Parzialmente nuvoloso', '⛅', '☁️'],
  3: ['Coperto', '☁️', '☁️'],
  45: ['Nebbia', '🌫️'],
  48: ['Nebbia con brina', '🌫️'],
  51: ['Pioviggine leggera', '🌦️', '🌧️'],
  53: ['Pioviggine', '🌦️', '🌧️'],
  55: ['Pioviggine intensa', '🌧️'],
  56: ['Pioviggine gelata', '🌧️'],
  57: ['Pioviggine gelata intensa', '🌧️'],
  61: ['Pioggia leggera', '🌦️', '🌧️'],
  63: ['Pioggia', '🌧️'],
  65: ['Pioggia forte', '🌧️'],
  66: ['Pioggia gelata', '🌧️'],
  67: ['Pioggia gelata forte', '🌧️'],
  71: ['Neve leggera', '🌨️'],
  73: ['Neve', '🌨️'],
  75: ['Neve intensa', '❄️'],
  77: ['Nevischio', '🌨️'],
  80: ['Rovesci leggeri', '🌦️', '🌧️'],
  81: ['Rovesci', '🌧️'],
  82: ['Rovesci violenti', '⛈️'],
  85: ['Rovesci di neve', '🌨️'],
  86: ['Forti rovesci di neve', '❄️'],
  95: ['Temporale', '⛈️'],
  96: ['Temporale con grandine', '⛈️'],
  99: ['Temporale con forte grandine', '⛈️'],
};

function describe(code, isDay = true) {
  const [description, day, night] = WMO[code] ?? ['N/D', '🌡️'];
  return { description, icon: isDay ? day : (night ?? day) };
}

async function fetchWeather() {
  const { lat, lon, locationName } = config.weather;
  const url = new URL('https://api.open-meteo.com/v1/forecast');
  url.search = new URLSearchParams({
    latitude: String(lat),
    longitude: String(lon),
    current: 'temperature_2m,apparent_temperature,relative_humidity_2m,weather_code,is_day,wind_speed_10m',
    daily: 'weather_code,temperature_2m_max,temperature_2m_min,precipitation_probability_max,sunrise,sunset',
    hourly: 'temperature_2m,weather_code,is_day,precipitation_probability',
    timezone: 'auto',
    forecast_days: '4',
  }).toString();

  const res = await fetch(url, { signal: AbortSignal.timeout(10_000) });
  if (!res.ok) throw new Error(`Open-Meteo HTTP ${res.status}`);
  const data = await res.json();

  const c = data.current;
  const d = data.daily;
  const h = data.hourly;

  const sunrise = d.sunrise?.[0] ? d.sunrise[0].split('T')[1]?.slice(0, 5) : null;
  const sunset = d.sunset?.[0] ? d.sunset[0].split('T')[1]?.slice(0, 5) : null;

  // Previsioni per i prossimi 4 step orari (step di 1h a partire da ora)
  const hourly = [];
  if (h && Array.isArray(h.time)) {
    const nowTime = Date.now();
    for (let i = 0; i < h.time.length; i++) {
      const stepDate = new Date(h.time[i]);
      if (stepDate.getTime() >= nowTime - 15 * 60_000 && hourly.length < 4) {
        const timeStr = h.time[i].includes('T') ? h.time[i].split('T')[1].slice(0, 5) : h.time[i];
        const isDayStep = h.is_day ? h.is_day[i] === 1 : true;
        const code = h.weather_code[i];
        hourly.push({
          time: timeStr,
          temp: Math.round(h.temperature_2m[i]),
          code,
          isDay: isDayStep,
          precipProb: h.precipitation_probability?.[i] ?? null,
          ...describe(code, isDayStep),
        });
      }
    }
  }

  const daily = d.time.map((date, i) => ({
    date,
    code: d.weather_code[i],
    ...describe(d.weather_code[i], true),
    max: d.temperature_2m_max[i],
    min: d.temperature_2m_min[i],
    precipProb: d.precipitation_probability_max?.[i] ?? null,
    sunrise: d.sunrise?.[i] ?? null,
    sunset: d.sunset?.[i] ?? null,
  }));

  return {
    location: locationName,
    temperature: c.temperature_2m,
    apparentTemperature: c.apparent_temperature,
    humidity: c.relative_humidity_2m,
    windSpeed: c.wind_speed_10m,
    code: c.weather_code,
    isDay: c.is_day === 1,
    ...describe(c.weather_code, c.is_day === 1),
    today: daily[0],
    daily,
    sun: {
      sunrise,
      sunset,
    },
    hourly,
    updatedAt: new Date().toISOString(),
  };
}

export const getWeather = cached(fetchWeather, config.weather.refreshMin * 60_000);
