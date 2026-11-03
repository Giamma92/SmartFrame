/**
 * homeassistant.js
 * Raccoglie sensori dettagliati, stato elettrodomestici, clima, CO2, PM2.5 e internet
 */
import { cached } from '../utils/cache.js';
import { getCurrentTheme } from './themes.js';

const HA_URL = process.env.HA_URL || 'http://localhost:8123';
const HA_TOKEN = process.env.HA_TOKEN || '';

async function fetchHA() {
  if (!HA_TOKEN) return null;
  try {
    const res = await fetch(`${HA_URL}/api/states`, {
      headers: {
        'Authorization': `Bearer ${HA_TOKEN}`,
        'Content-Type': 'application/json'
      },
      signal: AbortSignal.timeout(6000)
    });
    if (!res.ok) throw new Error(`HA HTTP ${res.status}`);
    const states = await res.json();
    const get = (id) => states.find(s => s.entity_id === id);

    // Clima & Aria interna
    const tempSens = get('sensor.alpstuga_air_quality_moni_temperature_2') || get('sensor.temperatura_media_soggiorno_7_giorni');
    const humSens = get('sensor.alpstuga_air_quality_moni_humidity_2');
    const co2Sens = get('sensor.alpstuga_air_quality_moni_co2_2');
    const pm25Sens = get('sensor.alpstuga_air_quality_moni_current_pm2_5_2');
    const lightsSens = get('sensor.luci_accese_count');
    const greetingSens = get('sensor.saluto_personalizzato');

    // Connessione Internet (Fritz!Box)
    const wanSens = get('binary_sensor.fritz_box_5690_pro_stato_della_wan') || get('binary_sensor.fritz_box_5690_pro_connessione');
    const netOk = wanSens ? wanSens.state === 'on' : true;

    // Condizionatori
    const acSalotto = get('climate.climatizzatore_salotto_climatizzatore_salotto');
    const acStudio = get('climate.climatizzatore_studio_climatizzatore_studio');
    const acList = [];
    if (acSalotto && acSalotto.state !== 'off' && acSalotto.state !== 'unavailable') {
      const mode = acSalotto.state === 'cool' ? 'Raffr.' : acSalotto.state === 'heat' ? 'Risc.' : acSalotto.state;
      acList.push(`Salotto: ${mode} ${acSalotto.attributes.temperature || ''}°`);
    }
    if (acStudio && acStudio.state !== 'off' && acStudio.state !== 'unavailable') {
      const mode = acStudio.state === 'cool' ? 'Raffr.' : acStudio.state === 'heat' ? 'Risc.' : acStudio.state;
      acList.push(`Studio: ${mode} ${acStudio.attributes.temperature || ''}°`);
    }

    // Lavatrice & Asciugatrice
    const lav = get('sensor.lavatrice_machine_state');
    const asc = get('sensor.asciugatrice_machine_state');
    let lavState = 'Spenta';
    if (lav && !['stop', 'none', 'off', 'unavailable'].includes(lav.state)) {
      lavState = lav.state === 'run' ? 'In funzione' : lav.state;
    }
    let ascState = 'Spenta';
    if (asc && !['stop', 'none', 'off', 'unavailable'].includes(asc.state)) {
      ascState = asc.state === 'run' ? 'In funzione' : asc.state;
    }

    // Avvisi Casa
    const alerts = [];
    const activeTheme = getCurrentTheme();
    if (activeTheme && !activeTheme.albumConfigured) {
      alerts.push({ text: `Manca album foto (${activeTheme.name})`, icon: '📸' });
    }
    const co2Val = co2Sens && !isNaN(parseInt(co2Sens.state)) ? parseInt(co2Sens.state) : null;
    const pm25Val = pm25Sens && !isNaN(parseInt(pm25Sens.state)) ? parseInt(pm25Sens.state) : null;

    if (co2Val && co2Val > 1100) {
      alerts.push({ text: 'Aria viziata: apri finestre', icon: '🪟' });
    }
    if (pm25Val && pm25Val > 35) {
      alerts.push({ text: `PM2.5 elevato (${pm25Val} μg/m³)`, icon: '🌫️' });
    }
    const batAlert = get('binary_sensor.batterie_basse_presenti');
    if (batAlert && batAlert.state === 'on') {
      alerts.push({ text: 'Batterie sensori basse', icon: '🪫' });
    }

    // Saluto (rimuoviamo "Casa")
    const rawGreeting = greetingSens?.state || '';
    let greeting = rawGreeting.replace(/\bCasa\b/gi, '').trim();
    if (!greeting) {
      const hr = new Date().getHours();
      greeting = hr >= 5 && hr < 12 ? 'Buongiorno' : hr < 18 ? 'Buon pomeriggio' : 'Buonasera';
    }

    // Persone (se sono entrambi a casa, omettiamo la scritta)
    const puclo = get('person.puclo')?.state === 'home';
    const pucla = get('person.pucla')?.state === 'home';
    let presence = '';
    if (!puclo && !pucla) presence = 'Nessuno a casa';
    else if (puclo && !pucla) presence = 'Gianmarco a casa';
    else if (!puclo && pucla) presence = 'Francesca a casa';

    // Telecamera Reolink Soggiorno
    const cameraSens = get('camera.webcam_soggiorno_scorrevole');
    const privacySens = get('switch.webcam_soggiorno_privacy_mode');
    const motionSens = get('binary_sensor.webcam_soggiorno_movimento');
    const personSens = get('binary_sensor.webcam_soggiorno_persona');
    // Attiva solo se la modalità privacy è spenta
    const cameraActive = privacySens ? (privacySens.state === 'off') : (cameraSens && !['unavailable', 'off'].includes(cameraSens.state));
    const motionDetected = (motionSens && motionSens.state === 'on') || (personSens && personSens.state === 'on');

    // Sensore luminosità ambientale
    const luxSens = get('sensor.myggspray_wrlss_mtn_senso_illuminance_2') || get('sensor.myggspray_wrlss_mtn_senso_illuminance');
    const illuminance = luxSens && !isNaN(parseFloat(luxSens.state)) ? parseFloat(luxSens.state) : null;

    // Now Playing / Media Player attivo (Spotify, Echo, TV Soggiorno, ecc.)
    let nowPlaying = null;
    const mediaPlayers = states.filter(s => s.entity_id && s.entity_id.startsWith('media_player.'));
    const activeMedia = mediaPlayers.find(s => s.state === 'playing' && (s.attributes?.media_title || s.attributes?.entity_picture))
      || mediaPlayers.find(s => s.state === 'playing');

    if (activeMedia) {
      const attrs = activeMedia.attributes || {};
      let pic = attrs.entity_picture || null;
      if (pic && pic.startsWith('/')) {
        pic = `/api/ha-proxy-image?path=${encodeURIComponent(pic)}`;
      }
      nowPlaying = {
        entityId: activeMedia.entity_id,
        title: attrs.media_title || attrs.friendly_name || 'In riproduzione',
        artist: attrs.media_artist || attrs.media_album_name || '',
        album: attrs.media_album_name || '',
        source: attrs.app_name || attrs.source || attrs.friendly_name || 'Media',
        picture: pic,
        state: activeMedia.state,
        volume: attrs.volume_level !== undefined ? Math.round(attrs.volume_level * 100) : null
      };
    }

    const temp = tempSens && !isNaN(parseFloat(tempSens.state)) ? Math.round(parseFloat(tempSens.state) * 10) / 10 : null;
    const humidity = humSens && !isNaN(parseInt(humSens.state)) ? parseInt(humSens.state) : null;
    const lightsOn = lightsSens && !isNaN(parseInt(lightsSens.state)) ? parseInt(lightsSens.state) : 0;

    return {
      connected: true,
      greeting,
      presence,
      nowPlaying,
      temperature: temp,
      humidity,
      co2: co2Val,
      pm25: pm25Val,
      lightsOn,
      netOk,
      acList,
      acActive: acList.length > 0,
      lavState,
      ascState,
      lavRawState: lav?.state || 'stop',
      ascRawState: asc?.state || 'stop',
      camera: {
        active: Boolean(cameraActive),
        motion: Boolean(motionDetected),
        name: 'Webcam Soggiorno'
      },
      illuminance,
      alerts,
      updatedAt: new Date().toISOString()
    };
  } catch (err) {
    console.warn('[ha] Errore lettura Home Assistant:', err.message);
    return null;
  }
}

export const getHomeAssistant = cached(fetchHA, 15_000);
