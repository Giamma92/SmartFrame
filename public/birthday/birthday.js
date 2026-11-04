/**
 * 🎂 Sorpresa di compleanno – /birthday
 *
 * Flusso: countdown (fino al giorno X) → intro → quiz → memory → gratta e vinci
 *         → biglietto animato con musica → indizio per il regalo vero.
 *
 * Funziona sia con il telecomando della TV (frecce + OK) sia col touch del telefono.
 * Scritto in ES5 per compatibilità con i browser delle TV (come app.js).
 *
 * Parametri URL utili per provarlo prima del giorno:
 *   ?preview=1        salta il countdown
 *   ?step=memory      salta a una tappa (intro|quiz|memory|scratch|card|clue)
 *   ?reset=1          azzera i progressi salvati
 */
(function () {
  'use strict';

  var STEPS = ['intro', 'quiz', 'memory', 'scratch', 'card', 'clue'];
  var STEP_ICONS = { intro: '🎂', quiz: '❓', memory: '🧩', scratch: '🎟️', card: '💌', clue: '🎁' };
  var STORE_KEY = 'bday-progress-v1';

  var cfg = null;
  var params = parseQuery();
  var currentStep = null;

  // ------------------------------------------------------------ Utility ---
  function $(id) { return document.getElementById(id); }

  function parseQuery() {
    var out = {};
    var q = window.location.search.replace(/^\?/, '').split('&');
    for (var i = 0; i < q.length; i++) {
      if (!q[i]) continue;
      var kv = q[i].split('=');
      out[decodeURIComponent(kv[0])] = kv.length > 1 ? decodeURIComponent(kv[1]) : '1';
    }
    return out;
  }

  function fill(str) {
    if (str === undefined || str === null) return '';
    return String(str)
      .replace(/\{name\}/g, cfg.name || 'Pucla')
      .replace(/\{nickname\}/g, cfg.nickname || cfg.name || 'Pucla')
      .replace(/\{fullName\}/g, cfg.fullName || 'Francesca')
      .replace(/\{from\}/g, cfg.from || '')
      .replace(/\{age\}/g, cfg.age || '');
  }

  function media(file) {
    if (!file) return '';
    if (/^(https?:)?\/\//.test(file) || file.charAt(0) === '/') return file;
    return '/birthday/media/' + file.split('/').map(encodeURIComponent).join('/');
  }

  /** Imposta una foto come sfondo; se non esiste mostra l'emoji di riserva. */
  function setPhoto(el, file, emoji, pos, zoom) {
    el.style.backgroundImage = '';
    var bgPos = 'center center';
    if (typeof pos === 'string' && pos.indexOf('%') !== -1) {
      bgPos = pos;
    } else if (pos === 'top') {
      bgPos = 'center top';
    } else if (pos === 'bottom') {
      bgPos = 'center bottom';
    }
    el.style.backgroundPosition = bgPos;
    var bgSize = 'cover';
    if (zoom === 'contain' || zoom === 'fit') {
      bgSize = 'contain';
    } else if (typeof zoom === 'number' || (typeof zoom === 'string' && zoom.indexOf('%') !== -1)) {
      bgSize = zoom.toString().indexOf('%') !== -1 ? zoom : zoom + '%';
    }
    el.style.backgroundSize = bgSize;
    el.classList.remove('portrait');
    el.textContent = emoji || '💖';
    if (!file) return;
    var src = media(file);
    var img = new Image();
    img.onload = function () {
      el.style.backgroundImage = 'url("' + src + '")';
      if (img.naturalHeight > img.naturalWidth * 1.15) {
        el.classList.add('portrait');
      }
      el.textContent = '';
    };
    img.src = src;
  }

  function shuffle(arr) {
    var a = arr.slice();
    for (var i = a.length - 1; i > 0; i--) {
      var j = Math.floor(Math.random() * (i + 1));
      var t = a[i]; a[i] = a[j]; a[j] = t;
    }
    return a;
  }

  function pick(arr) { return arr[Math.floor(Math.random() * arr.length)]; }

  function loadProgress() {
    try { return JSON.parse(localStorage.getItem(STORE_KEY)) || {}; } catch (e) { return {}; }
  }
  function saveProgress(p) {
    try { localStorage.setItem(STORE_KEY, JSON.stringify(p)); } catch (e) { /* ignore */ }
  }

  function getJSON(url, cb) {
    var xhr = new XMLHttpRequest();
    xhr.open('GET', url + (url.indexOf('?') < 0 ? '?' : '&') + 't=' + Date.now(), true);
    xhr.onreadystatechange = function () {
      if (xhr.readyState !== 4) return;
      if (xhr.status >= 200 && xhr.status < 300) {
        try { cb(null, JSON.parse(xhr.responseText)); } catch (e) { cb(e); }
      } else cb(new Error('HTTP ' + xhr.status));
    };
    xhr.send();
  }

  /** "2026-11-21T00:00:00" interpretato sempre come ora locale. */
  function parseLocalDate(s) {
    var m = /^(\d{4})-(\d{2})-(\d{2})(?:[T ](\d{2}):(\d{2})(?::(\d{2}))?)?/.exec(s || '');
    if (!m) return null;
    return new Date(+m[1], +m[2] - 1, +m[3], +(m[4] || 0), +(m[5] || 0), +(m[6] || 0));
  }

  // -------------------------------------------------------------- Audio ---
  var AC = null;
  var master = null;
  var muted = false;
  var songAudio = null;

  function audioCtx() {
    if (!AC) {
      var C = window.AudioContext || window.webkitAudioContext;
      if (!C) return null;
      AC = new C();
      master = AC.createGain();
      master.gain.value = 0.5;
      master.connect(AC.destination);
    }
    if (AC.state === 'suspended' && AC.resume) AC.resume();
    return AC;
  }

  function tone(freq, start, dur, type, vol) {
    var ac = audioCtx();
    if (!ac || muted) return;
    var t0 = ac.currentTime + start;
    var osc = ac.createOscillator();
    var g = ac.createGain();
    osc.type = type || 'triangle';
    osc.frequency.value = freq;
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.exponentialRampToValueAtTime(vol || 0.3, t0 + 0.02);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    osc.connect(g);
    g.connect(master);
    osc.start(t0);
    osc.stop(t0 + dur + 0.05);
  }

  var SFX = {
    right: function () { [523, 659, 784, 1047].forEach(function (f, i) { tone(f, i * 0.08, 0.35, 'triangle', 0.25); }); },
    wrong: function () { tone(220, 0, 0.18, 'square', 0.12); tone(165, 0.16, 0.3, 'square', 0.12); },
    flip: function () { tone(880, 0, 0.08, 'sine', 0.15); },
    pop: function () { tone(600, 0, 0.1, 'sine', 0.25); tone(900, 0.05, 0.12, 'sine', 0.2); },
    win: function () {
      var n = [523, 523, 523, 659, 784, 659, 784, 1047];
      var t = [0, 0.12, 0.24, 0.36, 0.5, 0.66, 0.78, 0.95];
      n.forEach(function (f, i) { tone(f, t[i], i === n.length - 1 ? 0.8 : 0.2, 'triangle', 0.25); });
    },
    scratch: function () { tone(1200 + Math.random() * 600, 0, 0.04, 'sawtooth', 0.03); }
  };
  function sfx(name) { try { SFX[name](); } catch (e) { /* audio non disponibile */ } }

  var songTimer = null;

  /** "Tanti auguri a te" sintetizzata (effetto carillon + accordi allegri, in loop), oppure mp3 da config. */
  function playSong() {
    if (muted) return;
    stopSong();
    if (cfg.card && cfg.card.music) {
      if (!songAudio) {
        songAudio = new Audio(media(cfg.card.music));
        songAudio.loop = true;
      }
      songAudio.currentTime = 0;
      var p = songAudio.play();
      if (p && p.catch) p.catch(function () { /* autoplay bloccato */ });
      return;
    }
    var G3 = 196, C4 = 261.63, D4 = 293.66, E4 = 329.63, F4 = 349.23, G4 = 392, A4 = 440, B4 = 493.88;
    var C5 = 523.25, D5 = 587.33, E5 = 659.25, F5 = 698.46, G5 = 783.99;
    var melody = [
      [G4, .75], [G4, .25], [A4, 1, [C4, E4]], [G4, 1], [C5, 1], [B4, 2, [G3, D4]],
      [G4, .75], [G4, .25], [A4, 1, [G3, D4]], [G4, 1], [D5, 1], [C5, 2, [C4, E4]],
      [G4, .75], [G4, .25], [G5, 1, [C4, E4]], [E5, 1], [C5, 1], [B4, 1], [A4, 2, [F4, A4]],
      [F5, .75], [F5, .25], [E5, 1, [C4, G4]], [C5, 1], [D5, 1, [G3, B4]], [C5, 3, [C4, E4, G4]]
    ];
    function scheduleOnce() {
      if (muted) return;
      var beat = 0.40;
      var t = 0.08;
      for (var i = 0; i < melody.length; i++) {
        var f = melody[i][0];
        var d = melody[i][1] * beat;
        var chord = melody[i][2];
        tone(f, t, Math.max(d * 1.5, 0.45), 'triangle', 0.22);
        tone(f * 2, t, Math.max(d * 0.9, 0.28), 'sine', 0.07);
        if (chord) {
          for (var c = 0; c < chord.length; c++) {
            tone(chord[c], t, Math.max(d * 2.2, 0.8), 'sine', 0.06);
          }
        }
        t += d;
      }
      songTimer = setTimeout(scheduleOnce, Math.round((t + 1.2) * 1000));
    }
    scheduleOnce();
  }

  function stopSong() {
    if (songTimer) { clearTimeout(songTimer); songTimer = null; }
    if (songAudio) { try { songAudio.pause(); } catch (e) {} }
  }

  function toggleMute() {
    muted = !muted;
    $('mute-btn').textContent = muted ? '🔇' : '🔊';
    if (master) master.gain.value = muted ? 0 : 0.5;
    if (songAudio) songAudio.muted = muted;
    if (muted && songTimer) { clearTimeout(songTimer); songTimer = null; }
  }

  // ----------------------------------------------------------- Coriandoli ---
  var cv = $('confetti');
  var cx = cv.getContext('2d');
  var parts = [];
  var confettiRunning = false;
  var COLORS = ['#ff5fa2', '#8b5cf6', '#ffd23f', '#3ddc97', '#4cc9f0', '#ff8c42', '#ffffff'];

  function resizeCanvas() {
    cv.width = window.innerWidth;
    cv.height = window.innerHeight;
  }
  window.addEventListener('resize', resizeCanvas);
  resizeCanvas();

  /** Esplosione di coriandoli. x/y in pixel (default: pioggia dall'alto). */
  function confetti(count, x, y) {
    count = Math.min(count || 120, 220 - parts.length);
    for (var i = 0; i < count; i++) {
      var rain = x === undefined;
      var ang = Math.random() * Math.PI * 2;
      var sp = 4 + Math.random() * 8;
      parts.push({
        x: rain ? Math.random() * cv.width : x,
        y: rain ? -20 - Math.random() * cv.height * 0.5 : y,
        vx: rain ? (Math.random() - 0.5) * 2 : Math.cos(ang) * sp,
        vy: rain ? 2 + Math.random() * 3 : Math.sin(ang) * sp - 4,
        w: 8 + Math.random() * 8,
        h: 5 + Math.random() * 6,
        r: Math.random() * Math.PI,
        vr: (Math.random() - 0.5) * 0.3,
        c: pick(COLORS)
      });
    }
    if (!confettiRunning) {
      confettiRunning = true;
      requestAnimationFrame(confettiFrame);
    }
  }

  function confettiFrame() {
    cx.clearRect(0, 0, cv.width, cv.height);
    for (var i = parts.length - 1; i >= 0; i--) {
      var p = parts[i];
      p.vy += 0.12;
      p.vx *= 0.99;
      p.x += p.vx;
      p.y += p.vy;
      p.r += p.vr;
      if (p.y > cv.height + 30) { parts.splice(i, 1); continue; }
      cx.save();
      cx.translate(p.x, p.y);
      cx.rotate(p.r);
      cx.fillStyle = p.c;
      cx.fillRect(-p.w / 2, -p.h / 2, p.w, Math.abs(Math.cos(p.r * 2)) * p.h + 1);
      cx.restore();
    }
    if (parts.length) requestAnimationFrame(confettiFrame);
    else { confettiRunning = false; cx.clearRect(0, 0, cv.width, cv.height); }
  }

  function confettiAt(el, n) {
    var r = el.getBoundingClientRect();
    confetti(n || 40, r.left + r.width / 2, r.top + r.height / 2);
  }

  // ------------------------------------------------------------ Palloncini ---
  (function balloons() {
    var box = $('balloons');
    var em = ['🎈', '🎈', '🎈', '🎉', '💖', '⭐', '🎈', '🧁'];
    for (var i = 0; i < em.length; i++) {
      var b = document.createElement('span');
      b.className = 'balloon';
      b.textContent = em[i];
      b.style.left = (5 + (i / em.length) * 90 + Math.random() * 5) + '%';
      var dur = 16 + Math.random() * 12;
      b.style.animationDuration = dur + 's';
      b.style.animationDelay = -(Math.random() * dur) + 's';
      box.appendChild(b);
    }
  })();

  // ------------------------------------------- Navigazione telecomando ---
  var focused = null;

  function isVisible(el) {
    if (el.disabled) return false;
    if (el.offsetParent === null && el.id !== 'mute-btn') return false;
    var r = el.getBoundingClientRect();
    return r.width > 0 && r.height > 0;
  }

  function navEls() {
    var scr = document.querySelector('.screen.active');
    var list = [];
    if (scr) {
      var n = scr.querySelectorAll('[data-nav]');
      for (var i = 0; i < n.length; i++) if (isVisible(n[i])) list.push(n[i]);
    }
    if (!$('topbar').hidden) list.push($('mute-btn'));
    return list;
  }

  function setFocus(el) {
    if (focused) focused.classList.remove('focused');
    focused = el || null;
    if (focused) {
      focused.classList.add('focused');
      if (focused.scrollIntoView && document.body.classList.contains('kb')) {
        try { focused.scrollIntoView({ block: 'nearest', inline: 'nearest' }); } catch (e) { /* vecchi browser */ }
      }
    }
  }

  /** Mette il focus sul primo elemento utile (o su quello indicato). */
  function focusFirst(el) {
    setTimeout(function () {
      if (el && isVisible(el)) return setFocus(el);
      var list = navEls().filter(function (x) { return x.id !== 'mute-btn'; });
      setFocus(list[0] || null);
    }, 60);
  }

  function center(el) {
    var r = el.getBoundingClientRect();
    return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
  }

  function moveFocus(dir) {
    var list = navEls();
    if (!list.length) return;
    if (!focused || list.indexOf(focused) < 0) return setFocus(list[0]);
    var a = center(focused);
    var best = null;
    var bestScore = Infinity;
    for (var i = 0; i < list.length; i++) {
      var el = list[i];
      if (el === focused) continue;
      var b = center(el);
      var dx = b.x - a.x;
      var dy = b.y - a.y;
      var main, cross;
      if (dir === 'left')       { if (dx > -5) continue; main = -dx; cross = Math.abs(dy); }
      else if (dir === 'right') { if (dx < 5) continue;  main = dx;  cross = Math.abs(dy); }
      else if (dir === 'up')    { if (dy > -5) continue; main = -dy; cross = Math.abs(dx); }
      else                      { if (dy < 5) continue;  main = dy;  cross = Math.abs(dx); }
      var score = main + cross * 2.5;
      if (score < bestScore) { bestScore = score; best = el; }
    }
    if (best) setFocus(best);
  }

  var KEYS = {
    left: { k: ['ArrowLeft', 'Left'], c: [37] },
    right: { k: ['ArrowRight', 'Right'], c: [39] },
    up: { k: ['ArrowUp', 'Up'], c: [38] },
    down: { k: ['ArrowDown', 'Down'], c: [40] },
    ok: { k: ['Enter', 'OK', 'Accept', ' '], c: [13, 32] },
    mute: { k: ['VolumeMute', 'AudioVolumeMute', 'm', 'M'], c: [449, 173, 77] }
  };
  function is(e, name) { return KEYS[name].k.indexOf(e.key) !== -1 || KEYS[name].c.indexOf(e.keyCode) !== -1; }

  document.addEventListener('keydown', function (e) {
    document.body.classList.add('kb');
    var dir = is(e, 'left') ? 'left' : is(e, 'right') ? 'right' : is(e, 'up') ? 'up' : is(e, 'down') ? 'down' : null;
    if (dir) {
      e.preventDefault();
      moveFocus(dir);
    } else if (is(e, 'ok')) {
      e.preventDefault();
      if (e.repeat) return;
      if (typing) return finishTyping();
      if (focused && isVisible(focused)) focused.click();
      else focusFirst();
    } else if (is(e, 'mute')) {
      if (!e.repeat) toggleMute();
    }
  });

  function pointerUsed() { document.body.classList.remove('kb'); }
  document.addEventListener('mousedown', pointerUsed);
  document.addEventListener('touchstart', pointerUsed, { passive: true });

  // ----------------------------------------------------------- Schermi ---
  function show(screenId, focusEl) {
    var all = document.querySelectorAll('.screen');
    for (var i = 0; i < all.length; i++) all[i].classList.remove('active');
    $(screenId).classList.add('active');
    var box = $(screenId).querySelector('.card-box');
    if (box) { box.style.animation = 'none'; void box.offsetWidth; box.style.animation = ''; }
    focusFirst(focusEl);
  }

  function renderProgress() {
    var box = $('progress');
    box.innerHTML = '';
    var idx = STEPS.indexOf(currentStep);
    for (var i = 0; i < STEPS.length; i++) {
      var d = document.createElement('div');
      d.className = 'dot' + (i < idx ? ' done' : '') + (i === idx ? ' current' : '');
      d.textContent = i < idx ? '⭐' : STEP_ICONS[STEPS[i]];
      box.appendChild(d);
    }
  }

  var STEP_INIT = {
    intro: initIntro, quiz: initQuiz, memory: initMemory,
    scratch: initScratch, card: initCard, clue: initClue
  };

  function goStep(step) {
    if (STEPS.indexOf(step) < 0) step = 'intro';
    currentStep = step;
    var p = loadProgress();
    p.step = step;
    saveProgress(p);
    $('topbar').hidden = false;
    renderProgress();
    STEP_INIT[step]();
  }

  function nextStep() {
    var i = STEPS.indexOf(currentStep);
    goStep(STEPS[Math.min(i + 1, STEPS.length - 1)]);
  }

  // ---------------------------------------------------------- Countdown ---
  function initCountdown(target) {
    var c = cfg.countdown || {};
    $('cd-title').textContent = fill(c.title || 'Qualcosa sta arrivando...');
    $('cd-text').textContent = fill(c.text || '');
    show('s-countdown');

    function pad(n) { return n < 10 ? '0' + n : String(n); }
    function tick() {
      var diff = target.getTime() - Date.now();
      if (diff <= 0) {
        clearInterval(timer);
        $('cd-timer').hidden = true;
        $('cd-title').textContent = fill(c.readyText || 'È arrivato il grande giorno! 🎉');
        $('cd-text').textContent = '';
        $('cd-start').hidden = false;
        focusFirst($('cd-start'));
        confetti(160);
        return;
      }
      var s = Math.floor(diff / 1000);
      $('cd-d').textContent = Math.floor(s / 86400);
      $('cd-h').textContent = pad(Math.floor(s % 86400 / 3600));
      $('cd-m').textContent = pad(Math.floor(s % 3600 / 60));
      $('cd-s').textContent = pad(s % 60);
    }
    var timer = setInterval(tick, 1000);
    tick();
  }

  $('cd-start').onclick = function () { audioCtx(); sfx('win'); goStep('intro'); };

  // -------------------------------------------------------------- Intro ---
  function initIntro() {
    var c = cfg.intro || {};
    $('intro-title').textContent = fill(c.title || 'Tanti auguri, {name}!');
    $('intro-text').textContent = fill(c.text || '');
    $('intro-btn').textContent = fill(c.button || 'Iniziamo!');
    show('s-intro');
    setTimeout(function () { confetti(140); }, 400);
  }
  $('intro-btn').onclick = function () { audioCtx(); sfx('pop'); nextStep(); };

  // --------------------------------------------------------------- Quiz ---
  var qi = 0;
  var quizLocked = false;

  function initQuiz() {
    var c = cfg.quiz || {};
    if (!c.questions || !c.questions.length) return nextStep();
    $('quiz-title').textContent = fill(c.title || 'Quiz');
    qi = loadProgress().quizIndex || 0;
    if (qi >= c.questions.length) qi = 0;
    show('s-quiz');
    renderQuestion();
  }

  function renderQuestion() {
    var c = cfg.quiz;
    var q = c.questions[qi];
    quizLocked = false;
    $('quiz-counter').textContent = 'Domanda ' + (qi + 1) + ' di ' + c.questions.length;
    $('quiz-question').textContent = fill(q.question);
    $('quiz-feedback').textContent = '';
    $('quiz-question-wrap').hidden = false;
    $('quiz-reveal').hidden = true;

    var box = $('quiz-options');
    box.innerHTML = '';
    for (var i = 0; i < q.options.length; i++) {
      var b = document.createElement('button');
      b.className = 'option';
      b.setAttribute('data-nav', '');
      b.textContent = fill(q.options[i]);
      b.onclick = (function (idx, btn) { return function () { answer(idx, btn); }; })(i, b);
      box.appendChild(b);
    }
    focusFirst();
  }

  function answer(idx, btn) {
    if (quizLocked) return;
    var c = cfg.quiz;
    var q = c.questions[qi];
    if (idx === q.answer) {
      quizLocked = true;
      btn.classList.add('right');
      sfx('right');
      confettiAt(btn, 60);
      setTimeout(function () {
        $('quiz-question-wrap').hidden = true;
        $('quiz-reveal').hidden = false;
        var pos = q.crop || 'center center';
        var zoom = q.zoom || 'cover';
        setPhoto($('quiz-photo'), q.photo, q.emoji || '💖', pos, zoom);
        $('quiz-caption').textContent = fill(q.caption || '');
        // ri-avvia l'animazione della polaroid
        var pol = $('quiz-reveal').querySelector('.polaroid');
        pol.classList.remove('pop-in'); void pol.offsetWidth; pol.classList.add('pop-in');
        focusFirst($('quiz-next'));
      }, 900);
    } else {
      btn.classList.add('wrong');
      btn.disabled = true;
      sfx('wrong');
      $('quiz-feedback').textContent = fill(pick(c.wrong || ['Ritenta! 😜']));
      if (focused === btn) focusFirst();
    }
  }

  $('quiz-next').onclick = function () {
    sfx('pop');
    qi++;
    var p = loadProgress();
    if (qi < cfg.quiz.questions.length) {
      p.quizIndex = qi;
      saveProgress(p);
      renderQuestion();
    } else {
      p.quizIndex = 0;
      saveProgress(p);
      nextStep();
    }
  };

  // ------------------------------------------------------------- Memory ---
  var memFirst = null;
  var memBusy = false;
  var memMatched = 0;
  var memPairs = 0;

  function initMemory() {
    var c = cfg.memory || {};
    $('mem-title').textContent = fill(c.title || 'Memory');
    $('mem-text').textContent = fill(c.text || '');
    $('mem-done').hidden = true;
    var photos = c.photos || [];
    var emoji = c.emoji || ['🎂', '💖', '🌹', '🍰', '🎁', '🥂'];
    memPairs = Math.max(2, Math.min(6, Math.max(photos.length, emoji.length)));
    var deck = [];
    for (var i = 0; i < memPairs; i++) {
      deck.push({ key: i, photo: photos[i], emoji: emoji[i % emoji.length] });
      deck.push({ key: i, photo: photos[i], emoji: emoji[i % emoji.length] });
    }
    deck = shuffle(deck);
    memFirst = null; memBusy = false; memMatched = 0;

    var grid = $('mem-grid');
    grid.innerHTML = '';
    deck.forEach(function (d) {
      var card = document.createElement('button');
      card.className = 'mem-card';
      card.setAttribute('data-nav', '');
      card.setAttribute('data-key', d.key);
      card.innerHTML = '<div class="mem-inner"><div class="mem-face mem-back">🎁</div><div class="mem-face mem-front"></div></div>';
      setPhoto(card.querySelector('.mem-front'), d.photo, d.emoji);
      card.onclick = function () { flipCard(card); };
      grid.appendChild(card);
    });
    show('s-memory');
  }

  function flipCard(card) {
    if (memBusy || card.classList.contains('flipped') || card.classList.contains('matched')) return;
    card.classList.add('flipped');
    sfx('flip');
    if (!memFirst) { memFirst = card; return; }
    var a = memFirst;
    memFirst = null;
    if (a.getAttribute('data-key') === card.getAttribute('data-key')) {
      a.classList.add('matched'); card.classList.add('matched');
      a.classList.remove('flipped'); card.classList.remove('flipped');
      memMatched++;
      sfx('right');
      confettiAt(card, 30);
      if (memMatched === memPairs) {
        setTimeout(function () {
          sfx('win');
          confetti(180);
          $('mem-win').textContent = fill((cfg.memory && cfg.memory.winText) || 'Bravissima!');
          $('mem-done').hidden = false;
          focusFirst($('mem-next'));
        }, 700);
      }
    } else {
      memBusy = true;
      setTimeout(function () {
        a.classList.remove('flipped');
        card.classList.remove('flipped');
        memBusy = false;
      }, 1000);
    }
  }
  $('mem-next').onclick = function () { sfx('pop'); nextStep(); };

  // ----------------------------------------------------- Gratta e vinci ---
  var scRevealed = 0;
  var scTotal = 0;

  function initScratch() {
    var c = cfg.scratch || {};
    var cards = c.cards || [];
    if (!cards.length) return nextStep();
    $('sc-title').textContent = fill(c.title || 'Gratta e vinci');
    $('sc-text').textContent = fill(c.text || '');
    $('sc-next').hidden = true;
    scRevealed = 0;
    scTotal = cards.length;

    var grid = $('sc-grid');
    grid.innerHTML = '';
    show('s-scratch');
    cards.forEach(function (card) {
      var el = document.createElement('div');
      el.className = 'scratch';
      el.setAttribute('data-nav', '');
      el.innerHTML = '<div class="prize"><div class="p-icon"></div><div class="p-title"></div><div class="p-text"></div></div><canvas></canvas>';
      el.querySelector('.p-icon').textContent = card.icon || '🎁';
      el.querySelector('.p-title').textContent = fill(card.title || '');
      el.querySelector('.p-text').textContent = fill(card.text || '');
      grid.appendChild(el);
      setupScratch(el);
    });
  }

  function setupScratch(el) {
    var canvas = el.querySelector('canvas');
    var ctx = canvas.getContext('2d');
    var w = canvas.width = el.offsetWidth || 300;
    var h = canvas.height = el.offsetHeight || 300;
    var done = false;
    var dragged = false;
    var drawing = false;
    var moves = 0;
    var brush = Math.max(18, Math.min(w, h) * 0.12);

    // Strato argentato
    var g = ctx.createLinearGradient(0, 0, w, h);
    g.addColorStop(0, '#c9c9d6'); g.addColorStop(0.5, '#f1f1f7'); g.addColorStop(1, '#a9a9bb');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, w, h);
    ctx.fillStyle = 'rgba(255,255,255,.35)';
    for (var i = 0; i < 40; i++) ctx.fillText('✦', Math.random() * w, Math.random() * h);
    ctx.fillStyle = '#6b5a7a';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.font = 'bold ' + Math.round(h * 0.09) + 'px Fredoka, sans-serif';
    ctx.fillText('GRATTA QUI', w / 2, h / 2 - h * 0.07);
    ctx.font = Math.round(h * 0.14) + 'px sans-serif';
    ctx.fillText('✨🪙✨', w / 2, h / 2 + h * 0.1);
    ctx.globalCompositeOperation = 'destination-out';

    function scratchAt(x, y) {
      ctx.beginPath();
      ctx.arc(x, y, brush, 0, Math.PI * 2);
      ctx.fill();
      if (++moves % 8 === 0) { sfx('scratch'); checkCleared(); }
    }

    function checkCleared() {
      if (done) return;
      try {
        var data = ctx.getImageData(0, 0, w, h).data;
        var clear = 0, total = 0;
        for (var i = 3; i < data.length; i += 4 * 40) { total++; if (data[i] < 10) clear++; }
        if (clear / total > 0.45) reveal();
      } catch (e) { /* ignore */ }
    }

    function reveal() {
      if (done) return;
      done = true;
      el.classList.add('revealed');
      sfx('right');
      confettiAt(el, 50);
      scRevealed++;
      if (scRevealed === scTotal) {
        setTimeout(function () {
          sfx('win');
          confetti(180);
          $('sc-next').hidden = false;
          focusFirst($('sc-next'));
        }, 900);
      }
    }

    /** Grattata automatica (OK del telecomando o tap senza trascinare). */
    function autoScratch() {
      if (done) return;
      var steps = 0;
      var iv = setInterval(function () {
        for (var k = 0; k < 6; k++) scratchAt(Math.random() * w, Math.random() * h);
        if (++steps > 14) { clearInterval(iv); reveal(); }
      }, 50);
    }

    function pos(e) {
      var r = canvas.getBoundingClientRect();
      var t = e.touches ? e.touches[0] : e;
      return { x: (t.clientX - r.left) * (w / r.width), y: (t.clientY - r.top) * (h / r.height) };
    }
    var start = null;
    function down(e) { drawing = true; dragged = false; start = pos(e); }
    function move(e) {
      if (!drawing || done) return;
      if (e.cancelable) e.preventDefault();
      var p = pos(e);
      if (Math.abs(p.x - start.x) + Math.abs(p.y - start.y) > 10) dragged = true;
      scratchAt(p.x, p.y);
    }
    function up() { if (drawing) { drawing = false; checkCleared(); } }

    if (window.PointerEvent) {
      canvas.addEventListener('pointerdown', down);
      canvas.addEventListener('pointermove', move);
      window.addEventListener('pointerup', up);
    } else {
      canvas.addEventListener('touchstart', down, { passive: true });
      canvas.addEventListener('touchmove', move, { passive: false });
      canvas.addEventListener('touchend', up);
      canvas.addEventListener('mousedown', down);
      canvas.addEventListener('mousemove', move);
      window.addEventListener('mouseup', up);
    }
    el.onclick = function () { if (!dragged) autoScratch(); dragged = false; };
  }
  $('sc-next').onclick = function () { sfx('pop'); nextStep(); };

  // ----------------------------------------------------------- Biglietto ---
  var typing = null;

  function initCard() {
    var c = cfg.card || {};
    $('envelope').classList.remove('open');
    $('env-wrap').hidden = false;
    $('letter-full').hidden = true;
    $('card-next').hidden = true;
    $('env-hint').textContent = document.body.classList.contains('kb') ? 'Premi OK per aprire la busta 💌' : 'Tocca la busta per aprirla 💌';
    $('card-title').textContent = fill(c.title || 'Buon compleanno!');
    $('card-message').textContent = '';
    $('card-signature').textContent = '';
    show('s-card', $('envelope'));
  }

  $('envelope').onclick = function () {
    var env = $('envelope');
    if (env.classList.contains('open')) return;
    env.classList.add('open');
    sfx('pop');
    playSong();
    setTimeout(function () {
      $('env-wrap').hidden = true;
      $('letter-full').hidden = false;
      setFocus(null);
      confetti(200);
      typeText($('card-message'), fill((cfg.card && cfg.card.message) || ''), function () {
        $('card-signature').textContent = fill((cfg.card && cfg.card.signature) || '');
        $('card-signature').className = 'hand pre signature pop-in';
        $('card-next').hidden = false;
        focusFirst($('card-next'));
      });
    }, 1900);
  };

  function typeText(el, text, cb) {
    var chars = text.match(/[\uD800-\uDBFF][\uDC00-\uDFFF]|[\s\S]/g) || [];
    var i = 0;
    el.textContent = '';
    el.classList.add('caret');
    typing = { el: el, text: text, cb: cb, timer: null };
    function step() {
      if (!typing) return;
      el.textContent += chars[i++] || '';
      if (i >= chars.length) return finishTyping();
      var ch = chars[i - 1];
      typing.timer = setTimeout(step, ch === '\n' ? 450 : (ch === '.' || ch === ',' ? 220 : 45));
    }
    step();
  }

  function finishTyping() {
    if (!typing) return;
    var t = typing;
    typing = null;
    clearTimeout(t.timer);
    t.el.textContent = t.text;
    t.el.classList.remove('caret');
    if (t.cb) t.cb();
  }
  $('letter-full').addEventListener('click', function () { if (typing) finishTyping(); });
  $('card-next').onclick = function (e) { if (e && e.stopPropagation) e.stopPropagation(); sfx('pop'); nextStep(); };

  // ------------------------------------------------------------- Indizio ---
  function initClue() {
    var c = cfg.clue || {};
    $('clue-title').textContent = fill(c.title || 'Manca ancora una cosa...');
    $('clue-riddle').textContent = fill(c.riddle || '');
    $('clue-hint').textContent = fill(c.hint || '');
    $('clue-hint').hidden = true;
    $('clue-hint-btn').hidden = !c.hint;
    $('clue-btn').textContent = fill(c.button || 'Vado a cercarlo!');
    $('clue-btn').hidden = false;
    $('clue-final').hidden = true;
    $('replay-btn').hidden = true;
    show('s-clue', $('clue-btn'));
  }
  $('clue-hint-btn').onclick = function () {
    sfx('pop');
    $('clue-hint').hidden = false;
    $('clue-hint-btn').hidden = true;
    focusFirst($('clue-btn'));
  };
  $('clue-btn').onclick = function () {
    sfx('win');
    confetti(220);
    setTimeout(function () { confetti(160); }, 900);
    $('clue-final').textContent = fill((cfg.clue && cfg.clue.finalText) || 'Tanti auguri! 💝');
    $('clue-final').hidden = false;
    $('clue-btn').hidden = true;
    $('clue-hint-btn').hidden = true;
    $('replay-btn').hidden = false;
    focusFirst($('replay-btn'));
  };
  $('replay-btn').onclick = function () { stopSong(); saveProgress({}); goStep('intro'); };
  $('mute-btn').onclick = toggleMute;

  // -------------------------------------------------------------- Avvio ---
  if (params.reset) saveProgress({});

  var apiQuery = params.refresh ? '?refresh=1' : '';
  getJSON('/api/birthday' + apiQuery, function (err, data) {
    if (err) {
      $('s-loading').innerHTML = '<div class="card-box"><h2>Ops! 😅</h2><p>Non riesco a caricare la sorpresa.</p></div>';
      return;
    }
    cfg = data;
    if (cfg.name) document.title = '🎂 Per ' + cfg.name;

    var target = parseLocalDate(cfg.birthday);
    var locked = target && Date.now() < target.getTime() && !params.preview && !params.step;
    if (locked) return initCountdown(target);

    var start = params.step || loadProgress().step || 'intro';
    goStep(start);
  });
})();
