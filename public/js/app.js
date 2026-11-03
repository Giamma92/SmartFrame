/* =====================================================================
   Smart Frame - logica frontend
   - slideshow con dissolvenza + effetto Ken Burns
   - orologio, data e meteo in tempo reale
   - eventi Google Calendar dal backend (/api/data)
   - controllo da telecomando TV (D-Pad): ◀ ▶ cambia foto, OK pausa

   Scritto in JavaScript "conservativo" (niente ?. / ?? / async-await /
   object spread) per funzionare anche sui browser integrati delle TV
   (VIDAA, webOS, Tizen) oltre che su Chromium del Raspberry Pi.
   ===================================================================== */
(function () {
  'use strict';

  // ------------------------------------------------------------ Stato ---

  var DEFAULTS = {
    locale: 'it-IT',
    slideIntervalSec: 60,
    fadeSec: 3,
    shuffle: true,
    kenBurns: true,
    panelBlur: true,
    showSeconds: false,
    refreshSec: 60,
    maxEvents: 10,
    pixelShift: true,
    nightDim: { enabled: true, start: '23:00', end: '07:00', level: 0.7 }
  };

  var MANUAL_FADE_SEC = 0.8;   // dissolvenza rapida quando si usa il telecomando
  var HISTORY_MAX = 100;       // quante foto ricordare per il tasto "indietro"

  var state = {
    cfg: Object.assign({}, DEFAULTS),
    photos: [],          // URL disponibili (dal server)
    known: null,         // Set degli URL già visti, per individuare le nuove foto
    queue: [],           // prossime foto da mostrare
    history: [],         // foto mostrate (per navigare indietro)
    histIndex: -1,       // posizione corrente nella history
    activeSlide: 0,
    slideTimer: null,
    loadToken: 0,        // scarta caricamenti superati da pressioni successive
    paused: false,
    started: false,
    serverStartedAt: null,
    events: [],
    calendarStatus: null,
    lastMinute: -1,
    pageLoadedAt: Date.now()
  };

  var $ = function (id) { return document.getElementById(id); };
  var els = {
    slides: Array.prototype.slice.call(document.querySelectorAll('.slide')),
    overlay: $('overlay'),
    clockTime: $('clock-time'),
    clockSeconds: $('clock-seconds'),
    clockDate: $('clock-date'),
    weatherIcon: $('weather-icon'),
    weatherTemp: $('weather-temp'),
    weatherDesc: $('weather-desc'),
    weatherMeta: $('weather-meta'),
    forecast: $('forecast'),
    eventsPanel: $('events-panel'),
    events: $('events'),
    eventsStatus: $('events-status'),
    emptyHint: $('empty-hint'),
    offline: $('offline'),
    pauseBadge: $('pause-badge'),
    toast: $('toast'),
    dimmer: $('dimmer'),
    haPanel: $('ha-panel'),
    haGreeting: $('ha-greeting'),
    haPresence: $('ha-presence'),
    haTempVal: $('ha-temp-val'),
    haHumVal: $('ha-hum-val'),
    haCo2Val: $('ha-co2-val'),
    haPm25Val: $('ha-pm25-val'),
    haLightsVal: $('ha-lights-val'),
    haNetVal: $('ha-net-val'),
    haAcVal: $('ha-ac-val'),
    haAppliancesVal: $('ha-appliances-val'),
    topLeftContainer: $('top-left-container'),
    topLeftAlerts: $('top-left-alerts'),
    reolinkPip: $('reolink-pip'),
    reolinkImg: $('reolink-img'),
    reolinkModal: $('reolink-modal'),
    reolinkModalImg: $('reolink-modal-img'),
    reolinkExpandBtn: $('reolink-expand-btn'),
    reolinkCloseModal: $('reolink-close-modal'),
    photoCaption: $('photo-caption'),
    photoCaptionText: $('photo-caption-text'),
    photoMemoryBadge: $('photo-memory-badge'),
    photoCommentPopup: $('photo-comment-popup'),
    photoCommentText: $('photo-comment-text'),
    photoCommentAuthor: $('photo-comment-author'),
    bgAudio: $('bg-audio'),
    musicIndicator: $('music-indicator')
  };

  // ---------------------------------------------------------- Utility ---

  function el(tag, cls, text) {
    var node = document.createElement(tag);
    if (cls) node.className = cls;
    if (text !== undefined && text !== null) node.textContent = text;
    return node;
  }

  function clear(node) {
    while (node.firstChild) node.removeChild(node.firstChild);
  }

  function capitalize(s) {
    return s ? s.charAt(0).toUpperCase() + s.slice(1) : s;
  }

  function rand(min, max) { return min + Math.random() * (max - min); }

  function shuffle(arr) {
    for (var i = arr.length - 1; i > 0; i--) {
      var j = Math.floor(Math.random() * (i + 1));
      var t = arr[i]; arr[i] = arr[j]; arr[j] = t;
    }
    return arr;
  }

  /** "YYYY-MM-DD" -> Date a mezzanotte locale; altrimenti parsing ISO. */
  function parseEventDate(s, allDay) {
    if (allDay || /^\d{4}-\d{2}-\d{2}$/.test(s)) {
      var p = s.split('-');
      return new Date(+p[0], +p[1] - 1, +p[2]);
    }
    return new Date(s);
  }

  function startOfDay(d) {
    var x = new Date(d.getTime());
    x.setHours(0, 0, 0, 0);
    return x;
  }

  function dayDiff(a, b) {
    return Math.round((startOfDay(a) - startOfDay(b)) / 86400000);
  }

  function fmtTime(d) {
    return d.toLocaleTimeString(state.cfg.locale, { hour: '2-digit', minute: '2-digit' });
  }

  function toMinutes(hhmm) {
    var p = String(hhmm || '0:0').split(':');
    return (+p[0] || 0) * 60 + (+p[1] || 0);
  }

  var toastTimer = null;
  function showToast(text) {
    els.toast.textContent = text;
    els.toast.hidden = false;
    clearTimeout(toastTimer);
    toastTimer = setTimeout(function () { els.toast.hidden = true; }, 1500);
  }

  // ---------------------------------------------------------- Orologio ---

  function tickClock() {
    var now = new Date();
    var cfg = state.cfg;

    els.clockTime.textContent = fmtTime(now);
    els.clockSeconds.textContent = cfg.showSeconds ? ('0' + now.getSeconds()).slice(-2) : '';

    var date = capitalize(now.toLocaleDateString(cfg.locale, {
      weekday: 'long', day: 'numeric', month: 'long'
    }));
    if (els.clockDate.textContent !== date) els.clockDate.textContent = date;

    if (now.getMinutes() !== state.lastMinute) {
      state.lastMinute = now.getMinutes();
      onMinute(now);
    }

    // Riallinea al secondo successivo (evita la deriva di setInterval)
    setTimeout(tickClock, 1000 - now.getMilliseconds() + 10);
  }

  function onMinute(now) {
    updateDimmer(now);
    renderEvents(); // aggiorna "In corso" e rimuove eventi terminati

    // Ricarica la pagina ogni notte alle 04:00 (libera memoria sui browser TV)
    if (now.getHours() === 4 && now.getMinutes() === 0 &&
        Date.now() - state.pageLoadedAt > 3600000) {
      location.reload();
    }
  }

  function updateDimmer(now) {
    if (!els.dimmer) return;
    // Disattivato l'oscuramento automatico legato ai sensori lux/luci (causava oscuramenti improvvisi dello schermo)
    var nd = state.cfg && state.cfg.nightDim;
    var active = false;
    // Solo se esplicitamente richiesto da config (di default no dimmer casuale)
    if (nd && nd.enabled && nd.activeAtNight) {
      var m = now.getHours() * 60 + now.getMinutes();
      var s = toMinutes(nd.start);
      var e = toMinutes(nd.end);
      active = s < e ? (m >= s && m < e) : (m >= s || m < e);
    }
    els.dimmer.style.opacity = active ? String(nd.level || 0.7) : '0';
  }



  // ------------------------------------------------ Musica / Web Radio Player ---
  var userWantsAudio = true; // Flag dell'utente (attiva/disattiva)
  var audioPlaying = false;  // Effettivo stato di riproduzione audio dal browser
  var audioConnecting = false; // Buffer o connessione in corso
  var audioVolume = 0.35;
  var currentRadioUrl = 'https://lofi.stream.laut.fm/lofi';
  var currentRadioName = 'Lofi Chill';
  var reconnectTimer = null;
  var reconnectAttempts = 0;
  var MAX_RECONNECT_ATTEMPTS = 5;

  function setupAudio() {
    var a = els.bgAudio;
    if (!a) return;
    a.volume = audioVolume;

    // Monitora gli eventi reali dell'elemento Audio HTML5
    a.addEventListener('playing', function () {
      audioPlaying = true;
      audioConnecting = false;
      reconnectAttempts = 0;
      if (reconnectTimer) {
        clearTimeout(reconnectTimer);
        reconnectTimer = null;
      }
      updateMusicUI();
    });

    a.addEventListener('pause', function () {
      audioPlaying = false;
      audioConnecting = false;
      updateMusicUI();
      if (userWantsAudio && reconnectAttempts < MAX_RECONNECT_ATTEMPTS) {
        scheduleAudioReconnect('Stream interrotto o in pausa');
      }
    });

    a.addEventListener('waiting', function () {
      if (userWantsAudio) {
        audioConnecting = true;
        updateMusicUI('buffering');
      }
    });

    a.addEventListener('error', function () {
      var err = a.error;
      var msg = err ? ('Codice ' + err.code + ': ' + err.message) : 'Errore rete';
      console.warn('[Audio] Errore flusso radio:', msg);
      audioPlaying = false;
      audioConnecting = false;
      if (userWantsAudio) {
        scheduleAudioReconnect('Errore di connessione');
      } else {
        updateMusicUI();
      }
    });

    // Sblocco audio al tocco/click dell'utente
    function onFirstUserGesture() {
      if (!audioPlaying && userWantsAudio && !audioConnecting) {
        console.log('[Audio] Gesto utente rilevato, avvio streaming');
        startAudioStream(true);
      }
    }
    document.addEventListener('click', onFirstUserGesture);
    document.addEventListener('touchstart', onFirstUserGesture);

    if (els.musicIndicator) {
      els.musicIndicator.addEventListener('click', function (e) {
        e.stopPropagation();
        toggleAudio();
      });
    }

    // Tenta autoplay all'avvio
    if (userWantsAudio) {
      startAudioStream(false);
    }
  }

  function scheduleAudioReconnect(reason) {
    if (!userWantsAudio || reconnectTimer) return;
    if (reconnectAttempts >= MAX_RECONNECT_ATTEMPTS) {
      console.warn('[Audio] Riconnessione radio terminata. In attesa di interazione.');
      audioPlaying = false;
      audioConnecting = false;
      updateMusicUI();
      return;
    }

    reconnectAttempts++;
    audioConnecting = true;
    updateMusicUI('reconnecting');
    var delay = Math.min(3000 * reconnectAttempts, 12000);

    reconnectTimer = setTimeout(function () {
      reconnectTimer = null;
      if (userWantsAudio) {
        startAudioStream(false);
      }
    }, delay);
  }

  function startAudioStream(userTriggered) {
    var a = els.bgAudio;
    if (!a) return;
    if (!currentRadioUrl) {
      currentRadioUrl = 'https://lofi.stream.laut.fm/lofi';
    }

    if (audioPlaying) return;

    if (reconnectTimer) {
      clearTimeout(reconnectTimer);
      reconnectTimer = null;
    }

    userWantsAudio = true;
    audioConnecting = true;
    updateMusicUI('buffering');

    // Imposta la sorgente solo se non è già presente
    if (!a.src || a.src.indexOf('laut.fm') === -1) {
      a.src = currentRadioUrl;
    }
    a.volume = audioVolume;

    var p = a.play();
    if (p && p.then) {
      p.then(function () {
        audioPlaying = true;
        audioConnecting = false;
        reconnectAttempts = 0;
        updateMusicUI();
        if (userTriggered) {
          showToast('🎵 ' + currentRadioName + ' attiva');
        }
      }).catch(function (err) {
        audioPlaying = false;
        audioConnecting = false;
        updateMusicUI('unplayed');
        if (err && err.name === 'NotAllowedError') {
          console.log('[Audio] Autoplay bloccato dalla policy browser (necessaria interazione utente)');
          if (userTriggered) {
            showToast('🔇 Clicca su Lofi per ascoltare');
          }
        } else {
          console.warn('[Audio] a.play() fallito:', err);
          if (userTriggered) {
            showToast('⚠️ Errore connessione radio');
          }
          scheduleAudioReconnect('Tentativo avvio fallito');
        }
      });
    }
  }

  function toggleAudio() {
    var a = els.bgAudio;
    if (!a) return;

    if (reconnectTimer) {
      clearTimeout(reconnectTimer);
      reconnectTimer = null;
    }

    if (audioPlaying || audioConnecting) {
      // Spegnimento pulito: pausa senza cancellare src con stringa vuota
      userWantsAudio = false;
      audioPlaying = false;
      audioConnecting = false;
      reconnectAttempts = 0;
      try {
        a.pause();
      } catch (e) {}
      updateMusicUI();
      showToast('🔇 Musica disattivata');
    } else {
      // Accensione manuale
      userWantsAudio = true;
      showToast('⏳ Connessione ' + currentRadioName + '...');
      startAudioStream(true);
    }
  }

  function updateMusicUI(status) {
    if (!els.musicIndicator) return;
    var iconEl = els.musicIndicator.querySelector('.music-icon');
    var labelEl = els.musicIndicator.querySelector('.music-label');
    var displayName = currentRadioName || 'Musica';

    if (status === 'reconnecting' || status === 'buffering' || audioConnecting) {
      if (iconEl) iconEl.innerHTML = window.SmartIcons ? window.SmartIcons.get('clock') : '⏳';
      if (labelEl) labelEl.textContent = displayName;
      els.musicIndicator.classList.remove('is-muted');
      els.musicIndicator.classList.add('is-loading');
      els.musicIndicator.title = displayName + ' (connessione in corso...)';
    } else if (audioPlaying) {
      if (iconEl) iconEl.innerHTML = window.SmartIcons ? window.SmartIcons.get('music') : '🎵';
      if (labelEl) labelEl.textContent = displayName;
      els.musicIndicator.classList.remove('is-muted');
      els.musicIndicator.classList.remove('is-loading');
      els.musicIndicator.title = displayName + ' attiva (clicca o premi rosso per disattivare)';
    } else {
      if (iconEl) iconEl.innerHTML = window.SmartIcons ? window.SmartIcons.get('musicOff') : '🔇';
      if (labelEl) labelEl.textContent = displayName;
      els.musicIndicator.classList.add('is-muted');
      els.musicIndicator.classList.remove('is-loading');
      els.musicIndicator.title = displayName + ' mutata (clicca o premi rosso per attivare)';
    }
  }

  // ------------------------------------------------ Home Assistant ---
  function renderHomeAssistant(ha) {
    if (!ha || !ha.connected || !els.haPanel) {
      if (els.haPanel) els.haPanel.hidden = true;
      return;
    }

    els.haPanel.hidden = false;
    els.haPanel.style.opacity = uiState.visible ? '1' : '0';
    els.haPanel.style.pointerEvents = uiState.visible ? '' : 'none';

    if (els.haGreeting) {
      var g = (ha.greeting || '').replace(/\bCasa\b/gi, '').trim();
      var homeIcon = window.SmartIcons ? window.SmartIcons.get('home') + ' ' : '🏡 ';
      els.haGreeting.innerHTML = homeIcon + (g || 'Casa');
    }
    if (els.haPresence) {
      els.haPresence.textContent = ha.presence || '';
      els.haPresence.style.display = ha.presence ? '' : 'none';
    }

    // 1. Temperatura
    if (els.haTempVal) {
      els.haTempVal.textContent = ha.temperature !== null ? ha.temperature + ' °C' : '--';
    }

    // 2. Umidità
    if (els.haHumVal) {
      els.haHumVal.textContent = ha.humidity !== null ? ha.humidity + ' %' : '--';
    }

    // 3. Qualità aria CO2
    if (els.haCo2Val) {
      if (ha.co2 !== null) {
        els.haCo2Val.textContent = ha.co2 + ' ppm';
        els.haCo2Val.style.color = ha.co2 > 1000 ? '#fde047' : '#86efac';
      } else {
        els.haCo2Val.textContent = '-- ppm';
        els.haCo2Val.style.color = '';
      }
    }

    // 4. Polveri sottili PM2.5
    if (els.haPm25Val) {
      if (ha.pm25 !== null) {
        els.haPm25Val.textContent = ha.pm25 + ' μg/m³';
        els.haPm25Val.style.color = ha.pm25 > 25 ? '#f87171' : ha.pm25 > 15 ? '#fde047' : '#86efac';
      } else {
        els.haPm25Val.textContent = '-- μg/m³';
        els.haPm25Val.style.color = '';
      }
    }

    // 4. Luci
    if (els.haLightsVal) {
      if (ha.lightsOn > 0) {
        els.haLightsVal.textContent = ha.lightsOn + ' accese';
        els.haLightsVal.style.color = '#fde047';
      } else {
        els.haLightsVal.textContent = 'Tutte spente';
        els.haLightsVal.style.color = 'var(--text-dim)';
      }
    }

    // 5. Connessione Internet FRITZ!Box
    if (els.haNetVal) {
      els.haNetVal.textContent = ha.netOk ? '🟢 Online' : '🔴 Offline';
    }

    // 6. Condizionatori
    if (els.haAcVal) {
      if (ha.acActive && ha.acList && ha.acList.length) {
        els.haAcVal.textContent = ha.acList.join(' · ');
        els.haAcVal.style.color = '#93c5fd';
      } else {
        els.haAcVal.textContent = 'Spenti';
        els.haAcVal.style.color = 'var(--text-dim)';
      }
    }

    // 7. Elettrodomestici
    if (els.haAppliancesVal) {
      var appList = [];
      if (ha.lavState && ha.lavState !== 'Spenta') appList.push('Lavatrice: ' + ha.lavState);
      if (ha.ascState && ha.ascState !== 'Spenta') appList.push('Asciugatrice: ' + ha.ascState);
      if (appList.length) {
        els.haAppliancesVal.textContent = appList.join(' · ');
        els.haAppliancesVal.style.color = '#67e8f9';
      } else {
        els.haAppliancesVal.textContent = 'Spente';
        els.haAppliancesVal.style.color = 'var(--text-dim)';
      }
    }

    // 8. Avvisi posizionati in ALTO A SINISTRA (con badge colorati e icone SVG)
    if (els.topLeftAlerts) {
      clear(els.topLeftAlerts);
      var alertsEnabled = !currentTheme || currentTheme.showAlerts !== false;
      if (alertsEnabled && ha.alerts && ha.alerts.length) {
        ha.alerts.forEach(function (a) {
          var alertEl = document.createElement('div');
          var text = a.text || '';
          var iconType = 'warning';
          var category = 'warn';

          if (/aria|finestr|ricambio/i.test(text)) {
            iconType = 'wind';
            category = 'air';
          } else if (/pm2\.5|polveri/i.test(text)) {
            iconType = 'pm25';
            category = 'air';
          } else if (/batteri/i.test(text)) {
            iconType = 'warning';
            category = 'danger';
          } else if (/album|foto/i.test(text)) {
            iconType = 'camera';
            category = 'info';
          } else if (/lavatrice|asciugatrice/i.test(text)) {
            iconType = 'plug';
            category = 'success';
          }

          alertEl.className = 'ha-alert-item ha-alert-item--' + category;
          var iconHtml = window.SmartIcons ? window.SmartIcons.get(iconType) : '⚠️';
          alertEl.innerHTML =
            '<div class="ha-alert-badge ha-alert-badge--' + category + '">' + iconHtml + '</div>' +
            '<div class="ha-alert-text">' + text + '</div>';
          els.topLeftAlerts.appendChild(alertEl);
        });
      }
    }

    // 9. Notifiche Pop-up per Lavatrice / Luci
    checkApplianceNotifications(ha);

    // 10. Telecamera Reolink Soggiorno (PiP)
    state.haData = ha;
    var t = currentTheme || {};
    var reolinkEnabled = t.reolinkEnabled !== false;
    var cameraActive = ha.camera && ha.camera.active;

    if (els.reolinkPip) {
      if (reolinkEnabled && cameraActive) {
        els.reolinkPip.hidden = false;
        startReolinkStream();
      } else {
        els.reolinkPip.hidden = true;
        stopReolinkStream();
        if (reolinkModalOpen) closeReolinkModal();
      }
    }
  }

  // ------------------------------------------------ Telecamera Reolink Live ---
  var reolinkTimer = null;
  var reolinkModalOpen = false;

  function refreshReolinkSnapshot() {
    if (!els.reolinkImg) return;
    var url = '/api/camera/snapshot?t=' + Date.now();
    var img = new Image();
    img.onload = function () {
      if (els.reolinkImg) els.reolinkImg.src = url;
      if (reolinkModalOpen && els.reolinkModalImg) els.reolinkModalImg.src = url;
    };
    img.src = url;
  }

  function startReolinkStream() {
    if (reolinkTimer) return;
    refreshReolinkSnapshot();
    reolinkTimer = setInterval(refreshReolinkSnapshot, reolinkModalOpen ? 1500 : 2800);
  }

  function stopReolinkStream() {
    if (reolinkTimer) {
      clearInterval(reolinkTimer);
      reolinkTimer = null;
    }
  }

  function openReolinkModal() {
    reolinkModalOpen = true;
    if (els.reolinkModal) els.reolinkModal.hidden = false;
    refreshReolinkSnapshot();
  }

  function closeReolinkModal() {
    reolinkModalOpen = false;
    if (els.reolinkModal) els.reolinkModal.hidden = true;
  }

  // ------------------------------------------------ Notifiche Pop-up Elettrodomestici & Luci ---
  var prevLavState = null;
  var prevAscState = null;
  var prevLightsOn = null;

  function checkApplianceNotifications(ha) {
    if (!ha) return;

    if (currentTheme && currentTheme.showPopups === false) {
      prevLavState = ha.lavRawState;
      prevAscState = ha.ascRawState;
      prevLightsOn = ha.lightsOn;
      return;
    }

    if (ha.lavRawState) {
      if (prevLavState === 'run' && ['stop', 'none', 'off', 'complete', 'finished'].indexOf(ha.lavRawState) !== -1) {
        showToast('🫧 Lavatrice terminata! Puoi stendere i panni.');
      }
      prevLavState = ha.lavRawState;
    }

    if (ha.ascRawState) {
      if (prevAscState === 'run' && ['stop', 'none', 'off', 'complete', 'finished'].indexOf(ha.ascRawState) !== -1) {
        showToast('🧺 Asciugatrice completata!');
      }
      prevAscState = ha.ascRawState;
    }

    if (ha.lightsOn !== undefined && ha.lightsOn !== null) {
      if (prevLightsOn !== null && prevLightsOn === 0 && ha.lightsOn > 0) {
        showToast('💡 ' + ha.lightsOn + (ha.lightsOn === 1 ? ' luce accesa in casa' : ' luci accese in casa'));
      }
      prevLightsOn = ha.lightsOn;
    }
  }

  // ------------------------------------------------ Gestione Visibilità UI (Sempre / Nascosta / Timer) ---
  var uiState = {
    mode: 'always',
    timeoutSec: 15,
    timer: null,
    visible: true
  };

  function setUIVisibility(visible) {
    uiState.visible = visible;
    var op = visible ? '1' : '0';
    var pe = visible ? '' : 'none';
    if (els.overlay) {
      els.overlay.style.opacity = op;
      els.overlay.style.pointerEvents = pe;
    }
    if (els.haPanel) {
      els.haPanel.style.opacity = op;
      els.haPanel.style.pointerEvents = pe;
    }
    if (els.topLeftContainer) {
      els.topLeftContainer.style.opacity = op;
      els.topLeftContainer.style.pointerEvents = pe;
    } else if (els.topLeftAlerts) {
      els.topLeftAlerts.style.opacity = op;
      els.topLeftAlerts.style.pointerEvents = pe;
    }
    if (els.photoCaption) {
      els.photoCaption.style.opacity = op;
    }
    if (els.photoCommentPopup) {
      els.photoCommentPopup.style.opacity = op;
    }
  }

  function resetUiTimer() {
    if (uiState.timer) {
      clearTimeout(uiState.timer);
      uiState.timer = null;
    }
    if (uiState.mode !== 'autohide') return;

    if (!uiState.visible) {
      setUIVisibility(true);
    }
    uiState.timer = setTimeout(function () {
      if (uiState.mode === 'autohide') {
        setUIVisibility(false);
      }
    }, (uiState.timeoutSec || 15) * 1000);
  }

  function applyUIMode(mode, timeoutSec) {
    var m = mode || 'always';
    var t = Number(timeoutSec) || 15;
    var changed = (uiState.mode !== m) || (uiState.timeoutSec !== t);
    uiState.mode = m;
    uiState.timeoutSec = t;

    if (uiState.mode === 'hidden') {
      if (uiState.timer) clearTimeout(uiState.timer);
      setUIVisibility(false);
    } else if (uiState.mode === 'autohide') {
      if (changed || !uiState.visible) {
        setUIVisibility(true);
      }
      resetUiTimer();
    } else { // 'always'
      if (uiState.timer) clearTimeout(uiState.timer);
      setUIVisibility(true);
    }
  }

  function handleUserActivity() {
    if (uiState.mode === 'autohide') {
      resetUiTimer();
    }
  }

  // ------------------------------------------------ Gestione Temi Dinamici ---
  var currentTheme = null;
  var currentThemeId = null;
  var currentSettingsVersion = null;

  function applyTheme(t) {
    if (!t) return;
    currentTheme = t;
    if (currentSettingsVersion !== null && t.settingsVersion && t.settingsVersion !== currentSettingsVersion) {
      console.log('[frame] Nuove impostazioni rilevate! Ricarica forzata...');
      currentSettingsVersion = t.settingsVersion;
      location.reload();
      return;
    }
    currentSettingsVersion = t.settingsVersion || null;

    applyUIMode(t.uiMode || 'always', t.uiTimeoutSec || 15);

    if (els.eventsPanel) {
      els.eventsPanel.hidden = (t.showCalendar === false);
    }
    if (els.topLeftAlerts) {
      els.topLeftAlerts.hidden = (t.showAlerts === false);
    }
    if (els.photoCommentPopup && t.showPhotoComments === false) {
      els.photoCommentPopup.classList.remove('is-visible');
      els.photoCommentPopup.hidden = true;
    }

    if (t.slideIntervalSec) {
      state.cfg.slideIntervalSec = Number(t.slideIntervalSec);
    }
    if (t.motionEffect !== undefined) {
      state.cfg.motionEffect = t.motionEffect;
    }
    if (t.audioVolume !== undefined && els.bgAudio) {
      audioVolume = Number(t.audioVolume);
      els.bgAudio.volume = audioVolume;
    }

    var newRadioUrl = t.radioUrl || '';
    var newRadioName = t.radioName || currentRadioName || 'Lofi Chill';
    if (newRadioName) currentRadioName = newRadioName;

    var radioUrlChanged = Boolean(newRadioUrl && newRadioUrl !== currentRadioUrl);
    if (radioUrlChanged) {
      currentRadioUrl = newRadioUrl;
      if (els.bgAudio) {
        els.bgAudio.src = currentRadioUrl;
        if (userWantsAudio && audioPlaying) {
          startAudioStream(false);
        }
      }
    }
    updateMusicUI();

    if (currentThemeId !== t.id) {
      currentThemeId = t.id;
      showToast((t.icon || '✨') + ' ' + (t.name || 'Tema'));
    }
  }

  // ---------------------------------------------------- Dati dal server ---

  function refreshData() {
    var ok = false;
    fetch('/api/data', { cache: 'no-store' })
      .then(function (res) {
        if (!res.ok) throw new Error('HTTP ' + res.status);
        return res.json();
      })
      .then(function (data) {
        // Server riavviato (es. aggiornamento) -> ricarica il frontend
        if (state.serverStartedAt && data.serverStartedAt !== state.serverStartedAt) {
          location.reload();
          return;
        }
        state.serverStartedAt = data.serverStartedAt;
        var status = data.status || {};

        applyConfig(data.display || {});
        renderWeather(data.weather, status.weather);
        renderHomeAssistant(data.homeAssistant);
        applyTheme(data.theme);

        var ev = data.events || {};
        state.events = (ev.today || []).concat(ev.upcoming || []);
        state.calendarStatus = status.calendar || null;
        renderEvents();

        updatePhotos(data.photos || []);
        els.offline.hidden = true;
        ok = true;
      })
      .catch(function (err) {
        console.warn('[frame] aggiornamento dati fallito:', err);
        els.offline.hidden = false;
      })
      .then(function () {
        // Se offline, riprova più spesso
        setTimeout(refreshData, (ok ? state.cfg.refreshSec : 15) * 1000);
      });
  }

  var pixelShiftTimer = null;
  function applyConfig(display) {
    var cfg = Object.assign({}, DEFAULTS, display);
    cfg.nightDim = Object.assign({}, DEFAULTS.nightDim, display.nightDim || {});
    state.cfg = cfg;

    document.documentElement.style.setProperty('--fade', cfg.fadeSec + 's');
    var supportsBlur = typeof CSS !== 'undefined' && CSS.supports && (CSS.supports('backdrop-filter', 'blur(10px)') || CSS.supports('-webkit-backdrop-filter', 'blur(10px)'));
    document.body.classList.toggle('no-blur', !cfg.panelBlur || !supportsBlur);
    updateDimmer(new Date());

    // Pixel shift: piccoli spostamenti dei pannelli contro il burn-in
    if (cfg.pixelShift && !pixelShiftTimer) {
      pixelShiftTimer = setInterval(function () {
        els.overlay.style.transform =
          'translate(' + rand(-0.6, 0.6).toFixed(2) + 'rem,' + rand(-0.6, 0.6).toFixed(2) + 'rem)';
      }, 3 * 60 * 1000);
    } else if (!cfg.pixelShift && pixelShiftTimer) {
      clearInterval(pixelShiftTimer);
      pixelShiftTimer = null;
      els.overlay.style.transform = '';
    }
  }

  // ------------------------------------------------------------- Meteo ---

  function renderWeather(w, status) {
    if (!w) {
      if (window.SmartIcons) {
        els.weatherIcon.innerHTML = window.SmartIcons.get('thermometer', 'svg-icon--weather');
      } else {
        els.weatherIcon.textContent = '🌡️';
      }
      els.weatherTemp.textContent = '--°';
      els.weatherDesc.textContent = 'Meteo non disponibile';
      els.weatherMeta.textContent = status && status.message ? status.message : '';
      clear(els.forecast);
      return;
    }
    var r = Math.round;
    if (window.SmartIcons) {
      els.weatherIcon.innerHTML = window.SmartIcons.getWeather(w.code, w.isDay);
    } else {
      els.weatherIcon.textContent = w.icon;
    }
    els.weatherTemp.textContent = r(w.temperature) + '°';
    els.weatherDesc.textContent = (w.location ? w.location + ' · ' : '') + w.description;

    var meta = [];
    if (w.today) meta.push('↑ ' + r(w.today.max) + '°  ↓ ' + r(w.today.min) + '°');
    meta.push('Percepita ' + r(w.apparentTemperature) + '°');
    var dropIcon = window.SmartIcons ? window.SmartIcons.get('droplet') + ' ' : '💧 ';
    meta.push(dropIcon + r(w.humidity) + '%');
    if (w.today && w.today.precipProb !== null && w.today.precipProb !== undefined) {
      var rainIcon = window.SmartIcons ? window.SmartIcons.get('cloudRain') + ' ' : '☔ ';
      meta.push(rainIcon + w.today.precipProb + '%');
    }
    els.weatherMeta.innerHTML = meta.join('   ·   ');

    // Previsioni dei prossimi 3 giorni
    clear(els.forecast);
    (w.daily || []).slice(1, 4).forEach(function (d) {
      var li = el('li');
      var day = parseEventDate(d.date, true)
        .toLocaleDateString(state.cfg.locale, { weekday: 'short' }).replace('.', '');
      li.appendChild(el('div', 'f-day', day));
      var fIcon = el('div', 'f-icon');
      if (window.SmartIcons) {
        fIcon.innerHTML = window.SmartIcons.getWeather(d.code, true);
      } else {
        fIcon.textContent = d.icon;
      }
      li.appendChild(fIcon);
      var t = el('div', 'f-temp', r(d.max) + '° ');
      t.appendChild(el('span', 'f-min', r(d.min) + '°'));
      li.appendChild(t);
      els.forecast.appendChild(li);
    });
  }

  // ----------------------------------------------------------- Eventi ---

  function dayLabel(date, now) {
    var diff = dayDiff(date, now);
    if (diff <= 0) return 'Oggi';
    if (diff === 1) return 'Domani';
    return capitalize(date.toLocaleDateString(state.cfg.locale, {
      weekday: 'long', day: 'numeric', month: 'long'
    }));
  }

  function renderEvents() {
    var list = els.events;
    var now = new Date();
    var st = state.calendarStatus;
    clear(list);
    list.classList.remove('is-overflowing');

    els.eventsStatus.textContent =
      st && st.state === 'stale' ? 'dati non aggiornati' :
      st && st.state === 'error' ? 'errore sincronizzazione' : '';

    if (st && (st.state === 'not_configured' || st.state === 'not_authorized')) {
      list.appendChild(el('li', 'events__empty', st.message || 'Calendario non collegato'));
      return;
    }

    var events = state.events
      .map(function (e) {
        var startD = parseEventDate(e.start, e.allDay);
        var endD = parseEventDate(e.end, e.allDay);
        if (e.allDay && endD <= startD) {
          endD = new Date(startD.getTime() + 86400000);
        }
        return Object.assign({}, e, {
          startD: startD,
          endD: endD
        });
      })
      .filter(function (e) { return e.endD > now; })
      .slice(0, state.cfg.maxEvents);

    if (!events.length) {
      list.appendChild(el('li', 'events__empty', 'Nessun impegno in programma ✨'));
      return;
    }

    var lastLabel = null;
    events.forEach(function (e) {
      // Gli eventi iniziati nei giorni precedenti finiscono sotto "Oggi"
      var label = dayLabel(e.startD < now ? now : e.startD, now);
      if (label !== lastLabel) {
        list.appendChild(el('li', 'events__day', label));
        lastLabel = label;
      }

      var ongoing = !e.allDay && e.startD <= now && e.endD > now;
      var li = el('li', 'event' + (ongoing ? ' is-now' : '') + (e.isHoliday ? ' is-holiday' : ''));
      li.style.setProperty('--event-color', e.color);

      var time = el('div', 'event__time');
      if (e.allDay) {
        time.textContent = e.isHoliday ? '🎉 Festa' : 'Tutto il giorno';
        time.style.fontSize = e.isHoliday ? '1.1rem' : '1.05rem';
        time.style.whiteSpace = 'nowrap';
      } else if (e.startD < startOfDay(now)) {
        time.textContent = 'fino';
        time.appendChild(el('small', null, fmtTime(e.endD)));
      } else {
        time.textContent = fmtTime(e.startD);
        time.appendChild(el('small', null, fmtTime(e.endD)));
      }

      var body = el('div', 'event__body');
      body.appendChild(el('div', 'event__title', e.title));
      var meta = [];
      if (e.location) meta.push('📍 ' + e.location);
      if (e.calendar) meta.push(e.calendar);
      if (meta.length) body.appendChild(el('div', 'event__meta', meta.join('  ·  ')));

      li.appendChild(time);
      li.appendChild(el('div', 'event__bar'));
      li.appendChild(body);
      list.appendChild(li);
    });

    if (list.scrollHeight > list.clientHeight + 2) list.classList.add('is-overflowing');
  }

  // --------------------------------------------------------- Slideshow ---

  function updatePhotos(list) {
    var urls = list.map(function (p) { return p.url; });
    var current = {};
    urls.forEach(function (u) { current[u] = true; });

    state.photoMeta = {};
    list.forEach(function (p) {
      if (p && p.url) state.photoMeta[p.url] = p;
    });

    // Rimuove dalla coda le foto cancellate
    state.queue = state.queue.filter(function (u) { return current[u]; });

    // Le foto appena aggiunte vengono mostrate per prime
    if (state.known) {
      var added = urls.filter(function (u) { return !state.known[u]; });
      if (added.length) state.queue = shuffle(added).concat(state.queue);
    }
    state.known = current;
    state.photos = urls;
    if (urls.length === 0) {
      els.emptyHint.hidden = false;
      var t = currentTheme || {};
      var iconEl = $('empty-hint-icon');
      var titleEl = $('empty-hint-title');
      var descEl = $('empty-hint-desc');
      if (iconEl) iconEl.textContent = t.icon || '📸';
      if (titleEl) titleEl.textContent = (t.name || 'Tema') + ' - Nessuna sorgente foto';
      if (descEl) descEl.innerHTML = 'Nessun album Google Photos o raccolta Pinterest impostata per questa modalità.<br>Vai su <b>/settings</b> dallo smartphone per inserire i link desiderati.';

      els.slides.forEach(function (s) {
        s.style.backgroundImage = '';
        s.className = 'slide';
      });
      state.activeSlide = 0;
      state.started = false;
    } else {
      els.emptyHint.hidden = true;
      if (!state.started) {
        state.started = true;
        goNext(false);
      }
    }
  }

  /** Estrae la prossima foto "nuova" (non dalla history). */
  function takeFromQueue() {
    if (!state.queue.length) {
      state.queue = shuffle(state.photos.slice());
      var last = state.history[state.histIndex];
      if (state.queue.length > 1 && state.queue[0] === last) {
        state.queue.push(state.queue.shift());
      }
    }
    // Estrazione sempre casuale per massimo mix
    var randIdx = Math.floor(Math.random() * state.queue.length);
    return state.queue.splice(randIdx, 1)[0];
  }

  /** Avanti: ripercorre la history se si era tornati indietro, altrimenti foto nuova. */
  function goNext(manual) {
    var url;
    if (state.histIndex < state.history.length - 1) {
      state.histIndex++;
      url = state.history[state.histIndex];
    } else {
      url = takeFromQueue();
      if (!url) { state.started = false; return; }
      state.history.push(url);
      if (state.history.length > HISTORY_MAX) state.history.shift();
      state.histIndex = state.history.length - 1;
    }
    showPhoto(url, manual, 0);
  }

  /** Indietro: torna alla foto precedente nella history. */
  function goPrev() {
    if (state.histIndex <= 0) {
      showToast('Prima foto');
      return;
    }
    state.histIndex--;
    showPhoto(state.history[state.histIndex], true, 0);
  }

  function loadImage(url) {
    return new Promise(function (resolve, reject) {
      var img = new Image();
      img.onload = function () {
        // decode() evita scatti decodificando fuori dal thread di rendering
        if (img.decode) img.decode().then(function () { resolve(img); }, function () { resolve(img); });
        else resolve(img);
      };
      img.onerror = function () { reject(new Error('Impossibile caricare ' + url)); };
      img.src = url;
    });
  }

  function scheduleNext() {
    clearTimeout(state.slideTimer);
    if (state.paused) return;
    state.slideTimer = setTimeout(function () { goNext(false); }, state.cfg.slideIntervalSec * 1000);
  }

  function showPhoto(url, manual, attempt) {
    clearTimeout(state.slideTimer);
    var token = ++state.loadToken;

    loadImage(url).then(function (img1) {
      if (token !== state.loadToken) return;

      // Se la prima foto è verticale, cerchiamo un'altra foto per il mosaico
      var companionPromise = Promise.resolve(null);
      if (isPortrait(img1) && state.photos.length > 1) {
        var nextUrl = takeFromQueue();
        if (nextUrl) {
          companionPromise = loadImage(nextUrl).catch(function () { return null; });
        }
      }

      companionPromise.then(function (img2) {
        if (token !== state.loadToken) return;

        var incoming = els.slides[1 - state.activeSlide];
        var outgoing = els.slides[state.activeSlide];
        var fade = manual ? MANUAL_FADE_SEC : state.cfg.fadeSec;
        incoming.style.transitionDuration = fade + 's';
        outgoing.style.transitionDuration = fade + 's';

        buildSlide(incoming, img1, img2);
        void incoming.offsetWidth;
        incoming.classList.add('is-visible');
        outgoing.classList.remove('is-visible');
        state.activeSlide = 1 - state.activeSlide;
        updatePhotoCaption(url);
        updatePhotoCommentPopup(url);

        setTimeout(function () {
          if (!outgoing.classList.contains('is-visible')) clearSlide(outgoing);
        }, fade * 1000 + 300);

        scheduleNext();
      });
    }, function (err) {
      if (token !== state.loadToken) return;
      console.warn('[frame]', err.message);
      if (attempt < 5) {
        state.history.splice(state.histIndex, 1);
        state.histIndex--;
        goNext(manual);
      } else {
        state.slideTimer = setTimeout(function () { goNext(false); }, 10000);
      }
    });
  }

  function isPortrait(img) {
    return img && (img.naturalHeight / img.naturalWidth) > 1.15;
  }

  function updatePhotoCaption(url) {
    if (!els.photoCaption || !els.photoCaptionText) return;
    var idx = state.photos.indexOf(url);
    var total = state.photos.length;
    var numText = total > 0 ? (idx !== -1 ? (idx + 1) : 1) + ' / ' + total : '';

    var meta = state.photoMeta && state.photoMeta[url] ? state.photoMeta[url] : null;
    var isPinterest = meta && meta.source === 'pinterest';

    if (isPinterest) {
      if (els.photoMemoryBadge) {
        els.photoMemoryBadge.hidden = false;
        els.photoMemoryBadge.textContent = '📌 Pinterest';
        els.photoMemoryBadge.style.background = '#e60023';
        els.photoMemoryBadge.style.boxShadow = '0 0.2rem 0.8rem rgba(230, 0, 35, 0.4)';
      }
      var pTitle = (meta.title || '').replace(/\s*#\S+/g, '').trim();
      if (pTitle.length > 70) pTitle = pTitle.slice(0, 68) + '…';
      els.photoCaptionText.textContent = pTitle ? (numText ? numText + ' • ' + pTitle : pTitle) : (numText ? 'Pinterest ' + numText : '');
      els.photoCaption.hidden = (uiState.mode === 'hidden') || (!uiState.visible);
      return;
    }

    if (els.photoMemoryBadge) {
      els.photoMemoryBadge.style.background = '';
      els.photoMemoryBadge.style.boxShadow = '';
    }

    var now = new Date();
    var curYear = now.getFullYear();
    var curMonth = now.getMonth() + 1;
    var curDay = now.getDate();

    var year = meta && meta.year ? meta.year : null;
    var month = meta && meta.month ? meta.month : null;
    var day = meta && meta.day ? meta.day : null;
    var location = meta && meta.location ? meta.location : '';

    if (!year) {
      var dateMatch = url ? url.match(/(\d{4})[-_](\d{2})[-_](\d{2})/) : null;
      if (dateMatch) {
        year = Number(dateMatch[1]);
        month = Number(dateMatch[2]);
        day = Number(dateMatch[3]);
      }
    }

    var isMemory = false;
    var badgeText = '';
    var dateStr = '';

    if (year && month && day) {
      var yearsAgo = curYear - year;
      var padDay = String(day).padStart(2, '0');
      var padMonth = String(month).padStart(2, '0');
      var formattedDate = padDay + '/' + padMonth + '/' + year;

      if (yearsAgo > 0 && month === curMonth && Math.abs(day - curDay) <= 1) {
        isMemory = true;
        badgeText = '✨ Accadde Oggi nel ' + year + ' (' + yearsAgo + ' ' + (yearsAgo === 1 ? 'anno fa' : 'anni fa') + ')';
      } else if (yearsAgo > 0 && month === curMonth && Math.abs(day - curDay) <= 7) {
        isMemory = true;
        badgeText = '🗓️ Ricordo di questi giorni nel ' + year + ' (' + yearsAgo + ' ' + (yearsAgo === 1 ? 'anno fa' : 'anni fa') + ')';
      } else if (yearsAgo > 0 && month === curMonth) {
        isMemory = true;
        badgeText = '🗓️ Ricordo di questo mese nel ' + year;
      } else if (yearsAgo > 0) {
        isMemory = true;
        badgeText = '✨ Ricordo del ' + year;
      }

      dateStr = location ? '📍 ' + location + ' • ' + formattedDate : formattedDate;
    }

    if (els.photoMemoryBadge) {
      els.photoMemoryBadge.hidden = !isMemory;
      if (isMemory) els.photoMemoryBadge.textContent = badgeText;
    }

    els.photoCaptionText.textContent = dateStr ? (numText ? numText + ' • ' + dateStr : dateStr) : (numText ? 'Foto ' + numText : '');
    els.photoCaption.hidden = (uiState.mode === 'hidden') || (!uiState.visible);
  }

  var commentPopupTimer = null;
  var commentPopupFadeTimer = null;

  function updatePhotoCommentPopup(url) {
    if (!els.photoCommentPopup || !els.photoCommentText) return;

    if (commentPopupTimer) { clearTimeout(commentPopupTimer); commentPopupTimer = null; }
    if (commentPopupFadeTimer) { clearTimeout(commentPopupFadeTimer); commentPopupFadeTimer = null; }

    els.photoCommentPopup.classList.remove('is-visible');
    els.photoCommentPopup.hidden = true;

    if (currentTheme && currentTheme.showPhotoComments === false) return;
    if (uiState.mode === 'hidden' || (!uiState.visible && uiState.mode === 'autohide')) return;

    var meta = state.photoMeta && state.photoMeta[url] ? state.photoMeta[url] : null;
    if (!meta) return;

    var commentText = (meta.comment || meta.caption || '').trim();
    if (!commentText) return;

    // Evita di ripetere se il commento è solo il nome generico del file o già visibile altrove
    if (meta.source === 'pinterest' && commentText === meta.title && (!meta.description || meta.description === meta.title)) {
      return;
    }
    if (/^gphoto_\d+\.jpg$/i.test(commentText) || /^img_\d+/i.test(commentText) || /^vd[a-z0-9]{4,12}$/i.test(commentText)) {
      return;
    }

    commentText = commentText.replace(/<[^>]+>/g, '').trim();
    if (!commentText || commentText.length < 2) return;
    if (commentText.length > 220) commentText = commentText.slice(0, 218) + '…';

    var author = meta.commentAuthor || '';

    // Mostra il fumetto dopo 900ms per attendere il completamento della dissolvenza immagine
    commentPopupTimer = setTimeout(function () {
      if (!els.photoCommentPopup) return;
      if (els.photoCommentAuthor) {
        els.photoCommentAuthor.hidden = !author;
        els.photoCommentAuthor.textContent = author ? author + ' scrive:' : '';
      }
      els.photoCommentText.textContent = '“' + commentText + '”';
      els.photoCommentPopup.hidden = false;
      void els.photoCommentPopup.offsetWidth;
      els.photoCommentPopup.classList.add('is-visible');

      // Rimane visibile per 14 secondi poi sfuma dolcemente
      commentPopupFadeTimer = setTimeout(function () {
        if (els.photoCommentPopup) {
          els.photoCommentPopup.classList.remove('is-visible');
          setTimeout(function () {
            if (els.photoCommentPopup && !els.photoCommentPopup.classList.contains('is-visible')) {
              els.photoCommentPopup.hidden = true;
            }
          }, 700);
        }
      }, 14000);
    }, 900);
  }

  function buildSlide(slide, primaryImg, secondaryImg) {
    clearSlide(slide);

    if (isPortrait(primaryImg) && secondaryImg && isPortrait(secondaryImg)) {
      // Mosaico a 2 foto verticali affiancate
      var mosaic = el('div', 'slide__mosaic');
      
      var item1 = el('div', 'slide__mosaic-item');
      primaryImg.className = '';
      item1.appendChild(primaryImg);
      mosaic.appendChild(item1);

      var item2 = el('div', 'slide__mosaic-item');
      secondaryImg.className = '';
      item2.appendChild(secondaryImg);
      mosaic.appendChild(item2);

      slide.appendChild(mosaic);

      if (state.cfg.kenBurns) {
        if (primaryImg.animate) kenBurns(primaryImg, false);
        if (secondaryImg.animate) kenBurns(secondaryImg, false);
      }
    } else {
      // Singola foto (Landscape o singola Portrait riempita)
      primaryImg.className = 'slide__single';
      primaryImg.alt = '';
      slide.appendChild(primaryImg);

      if (state.cfg.kenBurns && primaryImg.animate) kenBurns(primaryImg, false);
    }
  }

  function clearSlide(slide) {
    var imgs = slide.querySelectorAll('img');
    for (var i = 0; i < imgs.length; i++) {
      if (imgs[i].getAnimations) imgs[i].getAnimations().forEach(function (a) { a.cancel(); });
      imgs[i].src = ''; // Dealloca esplicitamente la memoria bitmap su WebKit/Chromium TV
    }
    clear(slide);
  }

  /**
   * Ken Burns & Motion Effects: 6 movimenti camera fluidi e cinematici
   * con supporto a varie intensità e fallback per TV.
   */
  function kenBurns(img, contain) {
    var mode = (state.cfg && state.cfg.motionEffect) || (currentTheme && currentTheme.motionEffect) || 'cinematic';
    if (mode === 'none') {
      img.style.transform = 'none';
      return;
    }

    var minScale = 1.10, maxScale = 1.22;
    if (mode === 'vibrant') {
      minScale = 1.16; maxScale = 1.30;
    } else if (mode === 'gentle') {
      minScale = 1.05; maxScale = 1.12;
    }

    var S = contain ? (minScale + 0.02) : rand(minScale, maxScale);
    // Limite massimo di traslazione in percentuale dell'immagine per non mostrare mai bande nere
    var maxShift = ((S - 1) / (2 * S)) * 100 * 0.88;
    var p = function () { return rand(-maxShift * 0.7, maxShift * 0.7).toFixed(2); };
    var tf = function (s, x, y) {
      return 'scale(' + (+s).toFixed(3) + ') translate3d(' + (+x).toFixed(2) + '%,' + (+y).toFixed(2) + '%,0)';
    };

    var from, to;
    var v = Math.floor(Math.random() * 6);
    if (v === 0) {
      // 1. Zoom In cinematico verso un punto focale
      from = tf(1.02, 0, 0);
      to = tf(S, p(), p());
    } else if (v === 1) {
      // 2. Zoom Out panoramico che apre l'inquadratura
      from = tf(S, p(), p());
      to = tf(1.02, p() * 0.2, p() * 0.2);
    } else if (v === 2) {
      // 3. Pan orizzontale da sinistra a destra o viceversa
      var dirX = Math.random() < 0.5 ? 1 : -1;
      from = tf(S, -maxShift * 0.85 * dirX, p() * 0.4);
      to = tf(S, maxShift * 0.85 * dirX, p() * 0.4);
    } else if (v === 3) {
      // 4. Pan diagonale fluido con zoom progressivo
      var dx = Math.random() < 0.5 ? 1 : -1;
      var dy = Math.random() < 0.5 ? 1 : -1;
      from = tf(1.03, -maxShift * 0.7 * dx, -maxShift * 0.7 * dy);
      to = tf(S, maxShift * 0.7 * dx, maxShift * 0.7 * dy);
    } else if (v === 4) {
      // 5. Pan verticale (scivolamento dall'alto al basso o viceversa)
      var dirY = Math.random() < 0.5 ? 1 : -1;
      from = tf(S, p() * 0.4, -maxShift * 0.8 * dirY);
      to = tf(S * 1.03, p() * 0.4, maxShift * 0.8 * dirY);
    } else {
      // 6. Camera Float: movimento lento curvilineo di respiro
      var rx = rand(-maxShift * 0.6, maxShift * 0.6);
      var ry = rand(-maxShift * 0.6, maxShift * 0.6);
      from = tf(1.04, -rx, -ry);
      to = tf(S, rx, ry);
    }

    var duration = (state.cfg.slideIntervalSec + state.cfg.fadeSec * 2) * 1000;

    // Cancella animazioni precedenti
    if (img.getAnimations) {
      img.getAnimations().forEach(function (a) { a.cancel(); });
    }

    try {
      var anim = img.animate([
        { transform: from },
        { transform: to }
      ], {
        duration: duration,
        easing: 'cubic-bezier(0.25, 0.1, 0.25, 1)',
        fill: 'forwards'
      });
      if (state.paused) anim.pause();
    } catch (e) {
      img.style.transition = 'transform ' + (duration / 1000) + 's cubic-bezier(0.25, 0.1, 0.25, 1)';
      img.style.transform = from;
      requestAnimationFrame(function () {
        requestAnimationFrame(function () {
          img.style.transform = to;
        });
      });
    }
  }

  function setKenBurnsPaused(paused) {
    var img = els.slides[state.activeSlide].querySelector('.slide__photo');
    if (!img || !img.getAnimations) return;
    img.getAnimations().forEach(function (a) { paused ? a.pause() : a.play(); });
  }

  function togglePause() {
    state.paused = !state.paused;
    els.pauseBadge.hidden = !state.paused;
    setKenBurnsPaused(state.paused);
    if (state.paused) {
      clearTimeout(state.slideTimer);
    } else {
      showToast('▶ Riprendi');
      scheduleNext();
    }
  }

  // ------------------------------------------------ Telecomando (D-Pad) ---

  /*
   * I browser delle TV non sempre valorizzano event.key: si usa anche
   * event.keyCode. Codici comuni (VIDAA / webOS / Tizen / HbbTV):
   *   37 ◀  38 ▲  39 ▶  40 ▼  13 OK/Enter
   *   415 Play, 19 Pause, 179 / 10252 Play-Pause, 413 Stop
   *   Back: 8 (VIDAA), 461 (webOS), 10009 (Tizen) -> annulla pausa, poi esce
   */
  var KEY = {
    LEFT: [37], RIGHT: [39], UP: [38], DOWN: [40],
    OK: [13, 32], // Enter, Space
    PLAY_PAUSE: [415, 19, 179, 10252],
    BACK: [8, 27, 461, 10009],
    MUTE: [449, 173, 77], // Mute telecomando, tasto M
    RED: [403, 82], // VK_RED o 'r'
    GREEN: [404, 71], // VK_GREEN o 'g'
    YELLOW: [405, 89], // VK_YELLOW o 'y'
    BLUE: [406, 66] // VK_BLUE o 'b'
  };

  var legendTimer = null;
  var legendEl = $('remote-legend');
  function showRemoteLegend() {
    if (!legendEl) return;
    legendEl.classList.add('is-visible');
    clearTimeout(legendTimer);
    legendTimer = setTimeout(function () {
      legendEl.classList.remove('is-visible');
    }, 4500);
  }

  function matches(e, names, codes) {
    return names.indexOf(e.key) !== -1 || codes.indexOf(e.keyCode) !== -1;
  }

  var lastKeyAt = 0;
  document.addEventListener('keydown', function (e) {
    // Se il modal della telecamera è aperto, Back o OK lo chiudono
    if (reolinkModalOpen) {
      if (matches(e, ['GoBack', 'BrowserBack', 'Back', 'Escape', 'Backspace'], KEY.BACK) ||
          matches(e, ['Enter', 'OK', 'Accept'], KEY.OK)) {
        closeReolinkModal();
        e.preventDefault();
        return;
      }
    }

    // Risveglia l'interfaccia su qualsiasi tasto se autohide attivo e mostra brevemente la legenda
    handleUserActivity();
    showRemoteLegend();

    // Limita la ripetizione se il tasto resta premuto
    var now = Date.now();
    var handled = true;

    if (matches(e, ['ArrowLeft', 'Left'], KEY.LEFT)) {
      if (now - lastKeyAt > 250 && state.photos.length) goPrev();
    } else if (matches(e, ['ArrowRight', 'Right'], KEY.RIGHT) ||
               matches(e, ['Enter', 'OK', 'Accept'], KEY.OK)) {
      if (now - lastKeyAt > 250 && state.photos.length) {
        // Se l'audio era in attesa di sblocco utente per policy autoplay, OK avvia l'audio
        if (userWantsAudio && !audioPlaying && !audioConnecting) {
          startAudioStream(true);
        }
        if (state.paused) togglePause();
        goNext(true);
      }
    } else if (matches(e, ['MediaPlayPause', 'MediaPlay', 'MediaPause', 'Pause', 'Play', 'p', 'P'], KEY.PLAY_PAUSE)) {
      if (!e.repeat) togglePause();
    } else if (matches(e, ['VolumeMute', 'AudioVolumeMute', 'm', 'M'], KEY.MUTE)) {
      if (!e.repeat) toggleAudio();
    } else if (matches(e, ['ColorF0Red', 'Red', 'r', 'R'], KEY.RED)) {
      // 🔴 Tasto Rosso: Musica / Radio Chill (toggleAudio gestisce già i toast di avvio/spegnimento)
      if (!e.repeat) {
        toggleAudio();
      }
    } else if (matches(e, ['ColorF1Green', 'Green', 'g', 'G'], KEY.GREEN)) {
      // 🟢 Tasto Verde: Mostra / Nascondi tutti i pannelli
      if (!e.repeat) {
        setUIVisibility(!uiState.visible);
        if (uiState.mode === 'autohide' && uiState.visible) resetUiTimer();
        showToast(uiState.visible ? '📺 Pannelli visibili' : '🖼️ Modalità solo foto');
      }
    } else if (matches(e, ['ColorF2Yellow', 'Yellow', 'y', 'Y'], KEY.YELLOW)) {
      // 🟡 Tasto Giallo: Toggle Didascalia e info foto
      if (!e.repeat) {
        if (els.photoCaption) {
          els.photoCaption.hidden = !els.photoCaption.hidden;
          showToast(els.photoCaption.hidden ? 'Didascalia nascosta' : 'Didascalia visibile');
        }
      }
    } else if (matches(e, ['ColorF3Blue', 'Blue', 'b', 'B'], KEY.BLUE)) {
      // 🔵 Tasto Blu: Foto successiva immediata
      if (!e.repeat && state.photos.length) {
        goNext(true);
      }
    } else if (matches(e, ['ArrowUp', 'Up', 'ArrowDown', 'Down'], KEY.UP.concat(KEY.DOWN))) {
      // ▲ / ▼: mostra/nasconde i pannelli (modalità "solo foto")
      if (!e.repeat) {
        setUIVisibility(!uiState.visible);
        if (uiState.mode === 'autohide' && uiState.visible) {
          resetUiTimer();
        }
      }
    } else if (matches(e, ['GoBack', 'BrowserBack', 'Back', 'Escape', 'Backspace'], KEY.BACK)) {
      // Back: prima annulla pausa / modalità solo foto, poi esce dall'app.
      if (state.paused) {
        togglePause();
      } else if (!uiState.visible) {
        setUIVisibility(true);
        if (uiState.mode === 'autohide') resetUiTimer();
      } else {
        try { window.close(); } catch (err) { /* ignorato */ }
        handled = false;
      }
    } else {
      handled = false;
    }

    if (handled) {
      lastKeyAt = now;
      e.preventDefault(); // evita scroll/azioni di default del browser TV
    }
  });

  // ------------------------------------------------ Sincronizzazione Realtime (SSE + Polling rapido) ---
  function setupLiveSync() {
    if (!window.EventSource) return;
    try {
      var es = new EventSource('/api/live');
      es.addEventListener('settings', function (e) {
        console.log('[live] Nuove impostazioni ricevute via SSE! Ricarico subito...', e.data);
        location.reload();
      });
      es.onerror = function () {
        // EventSource tenta la riconnessione automaticamente
      };
    } catch (err) {
      console.warn('[live] EventSource errore:', err);
    }
  }

  var lastKnownVersion = null;
  function pollSettingsVersion() {
    fetch('/api/settings', { cache: 'no-store' })
      .then(function (r) {
        if (!r.ok) throw new Error('HTTP ' + r.status);
        return r.json();
      })
      .then(function (s) {
        if (!s || !s.version) return;
        if (lastKnownVersion !== null && s.version !== lastKnownVersion) {
          console.log('[frame] Nuova versione impostazioni (' + s.version + ')! Ricarico...');
          lastKnownVersion = s.version;
          location.reload();
          return;
        }
        lastKnownVersion = s.version;
      })
      .catch(function () {})
      .then(function () {
        setTimeout(pollSettingsVersion, 4000);
      });
  }

  // ------------------------------------------------------------- Avvio ---

  // Click su telecamera Reolink per aprire/chiudere modal fullscreen
  if (els.reolinkPip) {
    els.reolinkPip.addEventListener('click', function (e) {
      e.stopPropagation();
      openReolinkModal();
    });
  }
  if (els.reolinkExpandBtn) {
    els.reolinkExpandBtn.addEventListener('click', function (e) {
      e.stopPropagation();
      openReolinkModal();
    });
  }
  if (els.reolinkCloseModal) {
    els.reolinkCloseModal.addEventListener('click', function (e) {
      e.stopPropagation();
      closeReolinkModal();
    });
  }
  if (els.reolinkModal) {
    els.reolinkModal.addEventListener('click', function (e) {
      e.stopPropagation();
      closeReolinkModal();
    });
  }

  // Click del telecomando VIDAA o touch
  document.addEventListener('click', function () {
    handleUserActivity();
    if (state.photos.length) {
      if (state.paused) togglePause();
      goNext(true);
    }
  });

  document.addEventListener('mousemove', handleUserActivity);
  document.addEventListener('touchstart', handleUserActivity);

  // Idratazione icone SVG vettoriali
  function hydrateIconSlots() {
    if (!window.SmartIcons) return;
    var slots = document.querySelectorAll('.icon-slot[data-icon]');
    for (var i = 0; i < slots.length; i++) {
      var iconName = slots[i].getAttribute('data-icon');
      if (iconName) slots[i].innerHTML = window.SmartIcons.get(iconName);
    }
  }
  hydrateIconSlots();

  // Telemetria client TV silenciosa per diagnostica
  (function sendClientTelemetry() {
    try {
      var ua = navigator.userAgent || '';
      var isHisense = /Hisense|VIDAA|Odin/i.test(ua);
      var tvName = isHisense ? 'Hisense Smart TV (VIDAA)' : (/Tizen/i.test(ua) ? 'Samsung (Tizen)' : (/webOS/i.test(ua) ? 'LG (webOS)' : 'Browser Desktop/Mobile'));
      var supportsBlur = typeof CSS !== 'undefined' && CSS.supports && (CSS.supports('backdrop-filter', 'blur(10px)') || CSS.supports('-webkit-backdrop-filter', 'blur(10px)'));
      fetch('/api/diagnostics', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          browserName: tvName,
          userAgent: ua,
          viewport: { width: window.innerWidth, height: window.innerHeight },
          screen: { width: screen.width, height: screen.height, dpr: window.devicePixelRatio || 1 },
          features: { backdropFilter: supportsBlur }
        })
      }).catch(function () {});
    } catch (e) {}
  })();

  // Auto-refresh notturno di sicurezza alle 04:00 per azzerare la RAM del browser TV
  var lastPurgeDay = -1;
  setInterval(function checkDailyMemoryPurge() {
    var now = new Date();
    var hour = now.getHours();
    var day = now.getDate();
    if (hour === 4 && lastPurgeDay !== day) {
      lastPurgeDay = day;
      console.log('[frame] Auto-refresh notturno di manutenzione per reset RAM TV...');
      window.location.reload(true);
    }
  }, 60 * 1000);

  setupLiveSync();
  pollSettingsVersion();
  setupAudio();
  els.overlay.style.transition = 'transform 3s ease-in-out, opacity 0.6s ease';
  tickClock();
  refreshData();
})();
