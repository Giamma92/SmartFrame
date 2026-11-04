/**
 * Sorpresa di compleanno – /birthday
 *
 * Flusso: countdown (fino al giorno X) -> intro -> quiz (con fumetto Sanrio)
 *         -> memory (carte Sanrio) -> gratta e vinci (+ QR coupon)
 *         -> torta 31 anni (soffia candeline) -> biglietto animato con musica
 *         -> indizio per il regalo vero + Bacheca dei Ricordi.
 *
 * Scritto in ES5 per compatibilità con browser Smart TV (Hisense VIDAA).
 * Tutte le frecce e icone UI sono in SVG vettoriale per evitare quadrati (tofu) su TV.
 */
(function () {
  'use strict';

  var STEPS = ['intro', 'quiz', 'memory', 'scratch', 'cake', 'card', 'clue'];
  var STORE_KEY = 'bday-progress-v1';

  var cfg = null;
  var params = parseQuery();
  var currentStep = null;

  // ------------------------------------------------ Icone SVG Vettoriali ---
  var ICONS = {
    arrowRight: '<svg class="btn-svg" viewBox="0 0 24 24" aria-hidden="true"><path d="M5 12h11.17l-4.58-4.59L13 6l7 7-7 7-1.41-1.41L16.17 14H5v-2z"/></svg>',
    arrowLeft: '<svg class="btn-svg left" viewBox="0 0 24 24" aria-hidden="true"><path d="M19 11H7.83l4.59-4.59L11 5l-7 7 7 7 1.41-1.41L7.83 13H19v-2z"/></svg>',
    replay: '<svg class="btn-svg" viewBox="0 0 24 24" aria-hidden="true"><path d="M12 5V1L7 6l5 5V7c3.31 0 6 2.69 6 6s-2.69 6-6 6-6-2.69-6-6H4c0 4.42 3.58 8 8 8s8-3.58 8-8-3.58-8-8-8z"/></svg>',
    bulb: '<svg class="btn-svg left" viewBox="0 0 24 24" aria-hidden="true"><path d="M9 21c0 .55.45 1 1 1h4c.55 0 1-.45 1-1v-1H9v1zm3-19C8.14 2 5 5.14 5 9c0 2.38 1.19 4.47 3 5.74V17c0 .55.45 1 1 1h6c.55 0 1-.45 1-1v-2.26c1.81-1.27 3-3.36 3-5.74 0-3.86-3.14-7-7-7z"/></svg>',
    camera: '<svg class="btn-svg left" viewBox="0 0 24 24" aria-hidden="true"><path d="M9 3L7.17 5H4c-1.1 0-2 .9-2 2v12c0 1.1.9 2 2 2h16c1.1 0 2-.9 2-2V7c0-1.1-.9-2-2-2h-3.17L15 3H9zm3 15c-2.76 0-5-2.24-5-5s2.24-5 5-5 5 2.24 5 5-2.24 5-5 5zm0-8c-1.65 0-3 1.35-3 3s1.35 3 3 3 3-1.35 3-3-1.35-3-3-3z"/></svg>',
    ticket: '<svg class="btn-svg left" viewBox="0 0 24 24" aria-hidden="true"><path d="M22 10V6c0-1.1-.9-2-2-2H4c-1.1 0-1.99.9-1.99 2v4c1.1 0 1.99.9 1.99 2s-.89 2-2 2v4c0 1.1.9 2 2 2h16c1.1 0 2-.9 2-2v-4c-1.1 0-2-.9-2-2s.9-2 2-2zm-9 7.5h-2v-2h2v2zm0-4.5h-2v-2h2v2zm0-4.5h-2v-2h2v2z"/></svg>',
    wind: '<svg class="btn-svg left" viewBox="0 0 24 24" aria-hidden="true"><path d="M14.5 17c0 1.65-1.35 3-3 3s-3-1.35-3-3h2c0 .55.45 1 1 1s1-.45 1-1-.45-1-1-1H2v-2h9.5c1.65 0 3 1.35 3 3zM19 6.5C19 4.57 17.43 3 15.5 3S12 4.57 12 6.5h2c0-.83.67-1.5 1.5-1.5s1.5.67 1.5 1.5S16.33 8 15.5 8H2v2h13.5c1.93 0 3.5-1.57 3.5-3.5zm-.5 4.5H2v2h16.5c.83 0 1.5.67 1.5 1.5s-.67 1.5-1.5 1.5v2c1.93 0 3.5-1.57 3.5-3.5S20.43 11 18.5 11z"/></svg>',
    soundOn: '<svg viewBox="0 0 24 24" aria-hidden="true"><path fill="#3b1f4a" d="M3 9v6h4l5 5V4L7 9H3zm13.5 3c0-1.77-1.02-3.29-2.5-4.03v8.05c1.48-.73 2.5-2.25 2.5-4.02zM14 3.23v2.06c2.89.86 5 3.54 5 6.71s-2.11 5.85-5 6.71v2.06c4.01-.91 7-4.49 7-8.77s-2.99-7.86-7-8.77z"/></svg>',
    soundOff: '<svg viewBox="0 0 24 24" aria-hidden="true"><path fill="#ef4444" d="M16.5 12c0-1.77-1.02-3.29-2.5-4.03v2.21l2.45 2.45c.03-.2.05-.41.05-.63zm2.5 0c0 .94-.2 1.82-.54 2.64l1.51 1.51C20.63 14.91 21 13.5 21 12c0-4.28-2.99-7.86-7-8.77v2.06c2.89.86 5 3.54 5 6.71zM4.27 3L3 4.27 7.73 9H3v6h4l5 5v-6.73l4.25 4.25c-.67.52-1.42.93-2.25 1.18v2.06c1.38-.31 2.63-.95 3.69-1.81L19.73 21 21 19.73l-9-9L4.27 3zM12 4L9.91 6.09 12 8.18V4z"/></svg>',
    bow: '<svg viewBox="0 0 60 44" aria-hidden="true"><g transform="translate(30,22)"><ellipse cx="-14" cy="0" rx="13" ry="10" fill="#ff3366" stroke="#222" stroke-width="3" transform="rotate(-12 -14 0)"/><circle cx="-13" cy="0" r="3.5" fill="#cc1144"/><ellipse cx="14" cy="0" rx="13" ry="10" fill="#ff3366" stroke="#222" stroke-width="3" transform="rotate(12 14 0)"/><circle cx="13" cy="0" r="3.5" fill="#cc1144"/><circle cx="0" cy="0" r="7.5" fill="#ff3366" stroke="#222" stroke-width="3"/></g></svg>',
    hearts: '<svg viewBox="0 0 24 24"><path fill="#ffd23f" d="M12 2l2.4 7.2H22l-6 4.8 2.4 7.2-6.4-4.8-6.4 4.8 2.4-7.2-6-4.8h7.6z"/></svg><svg viewBox="0 0 24 24"><path fill="#ff5fa2" d="M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z"/></svg><svg viewBox="0 0 24 24"><path fill="#ffd23f" d="M12 2l2.4 7.2H22l-6 4.8 2.4 7.2-6.4-4.8-6.4 4.8 2.4-7.2-6-4.8h7.6z"/></svg>',
    heartSmall: '<svg class="inline-svg" style="margin-right:4px" viewBox="0 0 24 24"><path fill="currentColor" d="M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z"/></svg>',
    heroGift: '<svg viewBox="0 0 100 100"><rect x="18" y="42" width="64" height="46" rx="8" fill="#ff5fa2" stroke="#3b1f4a" stroke-width="4"/><rect x="12" y="30" width="76" height="16" rx="6" fill="#ff85b3" stroke="#3b1f4a" stroke-width="4"/><rect x="43" y="30" width="14" height="58" fill="#ffd23f" stroke="#3b1f4a" stroke-width="3"/><path d="M50 30 C35 10, 18 18, 32 30 C40 30, 50 30, 50 30 Z" fill="#ffd23f" stroke="#3b1f4a" stroke-width="4"/><path d="M50 30 C65 10, 82 18, 68 30 C60 30, 50 30, 50 30 Z" fill="#ffd23f" stroke="#3b1f4a" stroke-width="4"/></svg>',
    heroCake: '<svg viewBox="0 0 100 100"><rect x="16" y="56" width="68" height="30" rx="8" fill="#fff0f6" stroke="#3b1f4a" stroke-width="4"/><path d="M16 64 Q26 74 36 64 T56 64 T76 64 T84 64 L84 56 L16 56 Z" fill="#ff5fa2"/><rect x="26" y="36" width="48" height="22" rx="6" fill="#ffe3ef" stroke="#3b1f4a" stroke-width="4"/><rect x="46" y="18" width="8" height="18" rx="3" fill="#4cc9f0" stroke="#3b1f4a" stroke-width="3"/><path d="M50 6 C56 12, 55 18, 50 18 C45 18, 44 12, 50 6 Z" fill="#ffd23f"/></svg>',
    heroKey: '<svg viewBox="0 0 100 100"><circle cx="34" cy="50" r="20" fill="#ffd23f" stroke="#3b1f4a" stroke-width="5"/><circle cx="34" cy="50" r="8" fill="#fff" stroke="#3b1f4a" stroke-width="4"/><rect x="52" y="45" width="36" height="10" rx="4" fill="#ffd23f" stroke="#3b1f4a" stroke-width="4"/><rect x="66" y="55" width="8" height="12" rx="2" fill="#ffd23f" stroke="#3b1f4a" stroke-width="3"/><rect x="78" y="55" width="8" height="15" rx="2" fill="#ffd23f" stroke="#3b1f4a" stroke-width="3"/></svg>',
    sealHeart: '<svg viewBox="0 0 80 80"><circle cx="40" cy="40" r="34" fill="#ffd23f" stroke="#fff" stroke-width="4"/><path fill="#ff3366" d="M40 60 L22 42 C15 35 20 22 30 22 C35 22 38 25 40 28 C42 25 45 22 50 22 C60 22 65 35 58 42 Z"/></svg>'
  };

  var STEP_SVGS = {
    done: '<svg viewBox="0 0 24 24"><path fill="#3b1f4a" d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z"/></svg>',
    intro: '<svg viewBox="0 0 24 24"><path fill="#ff5fa2" d="M12 6c1.11 0 2-.9 2-2 0-.38-.1-.73-.29-1.03L12 0l-1.71 2.97c-.19.3-.29.65-.29 1.03 0 1.1.9 2 2 2zm4.6 9.99l-1.07-1.07-1.08 1.07c-1.3 1.3-3.58 1.31-4.89 0l-1.07-1.07-1.09 1.07C6.75 16.64 5.88 17 4.96 17c-.73 0-1.4-.23-1.96-.61V21c0 .55.45 1 1 1h16c.55 0 1-.45 1-1v-4.61c-.56.38-1.23.61-1.96.61-.92 0-1.79-.36-2.44-1.01zM18 9h-5V7h-2v2H6c-1.66 0-3 1.34-3 3v1.54c0 1.08.88 1.96 1.96 1.96.52 0 1.02-.2 1.38-.57l2.14-2.13 2.13 2.13c.74.74 2.03.74 2.77 0l2.14-2.13 2.13 2.13c.37.37.86.57 1.38.57 1.08 0 1.96-.88 1.96-1.96V12C21 10.34 19.66 9 18 9z"/></svg>',
    quiz: '<svg viewBox="0 0 24 24"><path fill="#8b5cf6" d="M11 18h2v-2h-2v2zm1-16C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm0 18c-4.41 0-8-3.59-8-8s3.59-8 8-8 8 3.59 8 8-3.59 8-8 8zm0-14c-2.21 0-4 1.79-4 4h2c0-1.1.9-2 2-2s2 .9 2 2c0 2-3 1.75-3 5h2c0-2.25 3-2.5 3-5 0-2.21-1.79-4-4-4z"/></svg>',
    memory: '<svg viewBox="0 0 24 24"><path fill="#ff5fa2" d="M4 6H2v14c0 1.1.9 2 2 2h14v-2H4V6zm16-4H8c-1.1 0-2 .9-2 2v12c0 1.1.9 2 2 2h12c1.1 0 2-.9 2-2V4c0-1.1-.9-2-2-2zm-6 12.5l-1-.9C9.4 10.36 7 8.28 7 5.95 7 4.2 8.42 2.8 10.15 2.8c1 0 1.96.46 2.85 1.2.89-.74 1.85-1.2 2.85-1.2C17.58 2.8 19 4.2 19 5.95c0 2.33-2.4 4.41-6 7.65l-1 .9z"/></svg>',
    scratch: '<svg viewBox="0 0 24 24"><path fill="#ff8c42" d="M22 10V6c0-1.1-.9-2-2-2H4c-1.1 0-1.99.9-1.99 2v4c1.1 0 1.99.9 1.99 2s-.89 2-2 2v4c0 1.1.9 2 2 2h16c1.1 0 2-.9 2-2v-4c-1.1 0-2-.9-2-2s.9-2 2-2zm-9 7.5h-2v-2h2v2zm0-4.5h-2v-2h2v2zm0-4.5h-2v-2h2v2z"/></svg>',
    cake: '<svg viewBox="0 0 24 24"><path fill="#ef4444" d="M13.5.67s.74 2.65.74 4.8c0 2.06-1.35 3.73-3.41 3.73-2.07 0-3.63-1.67-3.63-3.73l.03-.36C5.21 7.51 4 10.62 4 14c0 4.42 3.58 8 8 8s8-3.58 8-8C20 8.61 17.41 3.8 13.5.67zM11.71 19c-1.78 0-3.22-1.4-3.22-3.14 0-1.62 1.05-2.76 2.81-3.12 1.77-.36 3.6-1.21 4.62-2.58.39 1.29.59 2.65.59 4.04 0 2.65-2.15 4.8-4.8 4.8z"/></svg>',
    card: '<svg viewBox="0 0 24 24"><path fill="#ff5fa2" d="M20 4H4c-1.1 0-1.99.9-1.99 2L2 18c0 1.1.9 2 2 2h16c1.1 0 2-.9 2-2V6c0-1.1-.9-2-2-2zm0 4l-8 5-8-5V6l8 5 8-5v2z"/></svg>',
    clue: '<svg viewBox="0 0 24 24"><path fill="#8b5cf6" d="M20 6h-2.18c.11-.31.18-.65.18-1 0-1.66-1.34-3-3-3-1.05 0-1.96.54-2.5 1.35l-.5.67-.5-.68C10.96 2.54 10.05 2 9 2 7.34 2 6 3.34 6 5c0 .35.07.69.18 1H4c-1.11 0-1.99.89-1.99 2L2 19c0 1.11.89 2 2 2h16c1.11 0 2-.89 2-2V8c0-1.11-.89-2-2-2zm-5-2c.55 0 1 .45 1 1s-.45 1-1 1-1-.45-1-1 .45-1 1-1zM9 4c.55 0 1 .45 1 1s-.45 1-1 1-1-.45-1-1 .45-1 1-1zm11 15H4v-2h16v2zm0-5H4V8h5.08L7 10.83 8.62 12 11 8.76l1-1.36 1 1.36L15.38 12 17 10.83 14.92 8H20v6z"/></svg>'
  };

  var PRIZE_SVGS = [
    // 0: Cena romantica
    '<svg viewBox="0 0 64 64"><circle cx="32" cy="32" r="28" fill="#ffe3ef" stroke="#ff5fa2" stroke-width="3"/><circle cx="32" cy="34" r="16" fill="#fff" stroke="#3b1f4a" stroke-width="2.5"/><path d="M24 34 Q32 24 40 34 Q32 42 24 34 Z" fill="#ff8c42"/><path fill="#ff3366" d="M32 22 L28 18 C25 15 27 11 30 11 C31 11 32 12 32 13 C32 12 33 11 34 11 C37 11 39 15 36 18 Z"/></svg>',
    // 1: Massaggio relax
    '<svg viewBox="0 0 64 64"><circle cx="32" cy="32" r="28" fill="#f3e8ff" stroke="#8b5cf6" stroke-width="3"/><path d="M32 14 C36 24 46 28 46 38 C46 46 39 50 32 50 C25 50 18 46 18 38 C18 28 28 24 32 14 Z" fill="#ff85b3" stroke="#3b1f4a" stroke-width="2.5"/><circle cx="32" cy="36" r="6" fill="#ffd23f"/></svg>',
    // 2: Serata film
    '<svg viewBox="0 0 64 64"><circle cx="32" cy="32" r="28" fill="#e0f7fa" stroke="#4cc9f0" stroke-width="3"/><rect x="16" y="24" width="32" height="24" rx="4" fill="#3b1f4a"/><rect x="16" y="16" width="32" height="8" rx="2" fill="#ff5fa2" stroke="#3b1f4a" stroke-width="2"/><polygon points="28,31 28,43 39,37" fill="#ffd23f"/></svg>',
    // 3: Colazione a letto
    '<svg viewBox="0 0 64 64"><circle cx="32" cy="32" r="28" fill="#fef3c7" stroke="#ffd23f" stroke-width="3"/><path d="M18 30 H42 V40 C42 46 36 50 30 50 C24 50 18 46 18 40 Z" fill="#fff" stroke="#3b1f4a" stroke-width="2.5"/><path d="M42 32 H47 C50 32 50 38 47 38 H42" fill="none" stroke="#3b1f4a" stroke-width="2.5"/><path d="M26 24 Q28 18 26 14 M34 24 Q36 18 34 14" fill="none" stroke="#ff5fa2" stroke-width="2.5" stroke-linecap="round"/></svg>'
  ];

  function buildCake31Svg(age) {
    var numStr = String(age || 31);
    var d1 = numStr.charAt(0) || '3';
    var d2 = numStr.charAt(1) || '1';
    return (
      '<svg viewBox="0 0 260 220" aria-hidden="true">' +
        '<!-- Piatto alzata -->' +
        '<ellipse cx="130" cy="202" rx="108" ry="12" fill="#e9d5ff" stroke="#3b1f4a" stroke-width="4"/>' +
        '<rect x="28" y="192" width="204" height="10" rx="5" fill="#ffffff" stroke="#3b1f4a" stroke-width="3.5"/>' +
        '<!-- Piano inferiore -->' +
        '<rect x="44" y="136" width="172" height="58" rx="14" fill="#fff0f6" stroke="#3b1f4a" stroke-width="4"/>' +
        '<path d="M44 152 Q62 170 80 152 T116 152 T152 152 T188 152 T216 152 L216 144 C216 138 210 136 202 136 H58 C50 136 44 138 44 144 Z" fill="#ff5fa2" stroke="#3b1f4a" stroke-width="3.5"/>' +
        '<!-- Perline piano inferiore -->' +
        '<circle cx="70" cy="176" r="5" fill="#ffd23f"/><circle cx="100" cy="176" r="5" fill="#4cc9f0"/><circle cx="130" cy="176" r="5" fill="#ffd23f"/><circle cx="160" cy="176" r="5" fill="#4cc9f0"/><circle cx="190" cy="176" r="5" fill="#ffd23f"/>' +
        '<!-- Piano superiore -->' +
        '<rect x="68" y="86" width="124" height="52" rx="12" fill="#ffffff" stroke="#3b1f4a" stroke-width="4"/>' +
        '<path d="M68 102 Q84 118 100 102 T132 102 T164 102 T192 102 L192 94 C192 88 186 86 178 86 H82 C74 86 68 88 68 94 Z" fill="#ff85b3" stroke="#3b1f4a" stroke-width="3.5"/>' +
        '<!-- Fiocchetto Hello Kitty centrale sulla torta -->' +
        '<g transform="translate(130, 134)">' +
          '<ellipse cx="-12" cy="0" rx="11" ry="8" fill="#ff2a6d" stroke="#3b1f4a" stroke-width="3"/>' +
          '<ellipse cx="12" cy="0" rx="11" ry="8" fill="#ff2a6d" stroke="#3b1f4a" stroke-width="3"/>' +
          '<circle cx="0" cy="0" r="6" fill="#ff2a6d" stroke="#3b1f4a" stroke-width="3"/>' +
        '</g>' +
        '<!-- Fragoline decorative -->' +
        '<circle cx="84" cy="82" r="7" fill="#ff2a6d" stroke="#3b1f4a" stroke-width="2.5"/>' +
        '<circle cx="176" cy="82" r="7" fill="#ff2a6d" stroke="#3b1f4a" stroke-width="2.5"/>' +
        '<!-- Candeline 31 -->' +
        '<rect x="100" y="38" width="24" height="48" rx="6" fill="#ffd23f" stroke="#3b1f4a" stroke-width="3.5"/>' +
        '<text x="112" y="72" text-anchor="middle" font-family="Fredoka, sans-serif" font-weight="700" font-size="28" fill="#3b1f4a">' + d1 + '</text>' +
        '<rect x="136" y="38" width="24" height="48" rx="6" fill="#ff85b3" stroke="#3b1f4a" stroke-width="3.5"/>' +
        '<text x="148" y="72" text-anchor="middle" font-family="Fredoka, sans-serif" font-weight="700" font-size="28" fill="#ffffff">' + d2 + '</text>' +
        '<!-- Stoppini -->' +
        '<line x1="112" y1="32" x2="112" y2="38" stroke="#3b1f4a" stroke-width="3"/>' +
        '<line x1="148" y1="32" x2="148" y2="38" stroke="#3b1f4a" stroke-width="3"/>' +
        '<!-- Fiammelle animate -->' +
        '<g id="flame-3" class="candle-flame" style="transform-origin: 112px 32px">' +
          '<circle cx="112" cy="20" r="16" fill="rgba(255, 210, 63, 0.35)"/>' +
          '<path d="M112 4 C120 14, 121 26, 112 32 C103 26, 104 14, 112 4 Z" fill="#ff8c42" stroke="#3b1f4a" stroke-width="2"/>' +
          '<path d="M112 11 C116 17, 116 24, 112 29 C108 24, 108 17, 112 11 Z" fill="#ffd23f"/>' +
        '</g>' +
        '<g id="flame-1" class="candle-flame" style="transform-origin: 148px 32px">' +
          '<circle cx="148" cy="20" r="16" fill="rgba(255, 210, 63, 0.35)"/>' +
          '<path d="M148 4 C156 14, 157 26, 148 32 C139 26, 140 14, 148 4 Z" fill="#ff8c42" stroke="#3b1f4a" stroke-width="2"/>' +
          '<path d="M148 11 C152 17, 152 24, 148 29 C144 24, 144 17, 148 11 Z" fill="#ffd23f"/>' +
        '</g>' +
      '</svg>'
    );
  }

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

  /** Sostituisce variabili e rimuove caratteri Unicode a rischio quadrato (tofu) su VIDAA TV. */
  function fill(str) {
    if (str === undefined || str === null) return '';
    return String(str)
      .replace(/\{name\}/g, (cfg && cfg.name) || 'Pucla')
      .replace(/\{nickname\}/g, (cfg && (cfg.nickname || cfg.name)) || 'Pucla')
      .replace(/\{fullName\}/g, (cfg && cfg.fullName) || 'Francesca')
      .replace(/\{from\}/g, (cfg && cfg.from) || 'Il tuo Gianmarco')
      .replace(/\{age\}/g, (cfg && cfg.age) || '31')
      // Sostituisce Dingbats e frecce che mancano sui font TV Linux/VIDAA
      .replace(/[\u2794\u279C\u279E\u27A1\u2192]/g, '')
      .replace(/[\u21BA\u21BB]/g, '')
      // Sostituisce sequenze ZWJ e emoji Unicode >= 10 a rischio quadrato su vecchi Noto Emoji
      .replace(/👩‍🍳/g, '👑')
      .replace(/🦸‍♀️/g, '💖')
      .replace(/💆‍♀️/g, '💖')
      .replace(/🏃‍♀️/g, '')
      .replace(/🤫/g, '🎁')
      .replace(/🧩/g, '💖')
      .replace(/🎟️/g, '🎁')
      .replace(/🛏️/g, '☕')
      .replace(/🌪️/g, '⚡')
      .replace(/🥂/g, '🎈')
      .replace(/🪙/g, '✨')
      .replace(/🗝️/g, '🎁');
  }

  function setBtn(el, label, iconRight, iconLeft) {
    if (!el) return;
    var clean = fill(label).replace(/\s+$/, '');
    el.innerHTML = (iconLeft || '') + '<span>' + clean + '</span>' + (iconRight || '');
  }

  function media(file) {
    if (!file) return '';
    if (/^(https?:)?\/\//.test(file) || file.charAt(0) === '/') return file;
    return '/birthday/media/' + file.split('/').map(encodeURIComponent).join('/');
  }

  /** Imposta una foto come sfondo; se non esiste mostra l'icona di riserva. */
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
    if (el.parentNode && el.parentNode.classList) el.parentNode.classList.remove('is-portrait');
    el.textContent = fill(emoji || '💖');
    if (!file) return;
    var src = media(file);
    var img = new Image();
    img.onload = function () {
      el.style.backgroundImage = 'url("' + src + '")';
      var ratio = img.naturalHeight / img.naturalWidth;
      if (ratio > 1.15) {
        el.classList.add('portrait');
        if (el.parentNode && el.parentNode.classList) el.parentNode.classList.add('is-portrait');
        if (ratio > 1.35) {
          var targetH = 39;
          var targetW = Math.max(25, Math.min(35, targetH / ratio));
          el.style.width = 'calc(var(--u) * ' + targetW.toFixed(1) + ')';
          el.style.height = 'calc(var(--u) * ' + targetH + ')';
        }
      } else {
        el.style.width = '';
        el.style.height = '';
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
    blow: function () {
      // Effetto soffio + arpeggio magico dei desideri
      var notes = [523.25, 659.25, 783.99, 1046.5, 1318.5, 1567.98];
      for (var i = 0; i < notes.length; i++) {
        tone(notes[i], 0.15 + i * 0.09, 0.55, 'sine', 0.22);
        tone(notes[i] * 1.5, 0.18 + i * 0.09, 0.4, 'triangle', 0.08);
      }
    },
    win: function () {
      var n = [523, 523, 523, 659, 784, 659, 784, 1047];
      var t = [0, 0.12, 0.24, 0.36, 0.5, 0.66, 0.78, 0.95];
      n.forEach(function (f, i) { tone(f, t[i], i === n.length - 1 ? 0.8 : 0.2, 'triangle', 0.25); });
    },
    scratch: function () { tone(1200 + Math.random() * 600, 0, 0.04, 'sawtooth', 0.03); }
  };
  function sfx(name) { try { SFX[name](); } catch (e) { /* audio non disponibile */ } }

  var songTimer = null;

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
      if (p && p.catch) p.catch(function () {});
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

  var bgMusicTimer = null;
  var bgMusicStarted = false;

  function startBgm() {
    if (bgMusicStarted || muted) return;
    bgMusicStarted = true;
    var ac = audioCtx();
    if (!ac) return;

    var A4 = 440.00, C5 = 523.25, D5 = 587.33, E5 = 659.25, G5 = 783.99, A5 = 880.00;
    var bgNotes = [
      [C5, 0.4], [E5, 0.4], [G5, 0.6], [A5, 0.4], [G5, 0.8],
      [E5, 0.4], [D5, 0.4], [C5, 0.6], [D5, 0.4], [E5, 0.8],
      [A4, 0.4], [C5, 0.4], [E5, 0.6], [D5, 0.4], [C5, 0.8],
      [D5, 0.4], [E5, 0.4], [G5, 0.4], [E5, 0.4], [D5, 0.8],
      [E5, 0.4], [G5, 0.4], [A5, 0.6], [G5, 0.4], [E5, 0.8],
      [C5, 0.4], [D5, 0.4], [E5, 0.4], [G5, 0.4], [A5, 1.0],
      [G5, 0.4], [E5, 0.4], [D5, 0.6], [C5, 0.6], [C5, 1.2]
    ];

    function playLoop() {
      if (muted || !bgMusicStarted || currentStep === 'card') return;
      var t = 0.1;
      for (var i = 0; i < bgNotes.length; i++) {
        var freq = bgNotes[i][0];
        var dur = bgNotes[i][1];
        tone(freq, t, dur * 1.5, 'sine', 0.045);
        tone(freq * 2, t, dur * 0.8, 'triangle', 0.015);
        t += dur;
      }
      bgMusicTimer = setTimeout(playLoop, Math.round((t + 2.0) * 1000));
    }
    playLoop();
  }

  function stopBgm() {
    bgMusicStarted = false;
    if (bgMusicTimer) { clearTimeout(bgMusicTimer); bgMusicTimer = null; }
  }

  function updateMuteIcon() {
    $('mute-btn').innerHTML = muted ? ICONS.soundOff : ICONS.soundOn;
  }

  function toggleMute() {
    muted = !muted;
    updateMuteIcon();
    if (master) master.gain.value = muted ? 0 : 0.5;
    if (songAudio) songAudio.muted = muted;
    if (muted) {
      if (songTimer) { clearTimeout(songTimer); songTimer = null; }
      stopBgm();
    } else {
      if (currentStep !== 'card') startBgm();
    }
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

  // ------------------------------------------------ Palloncini & Icone base ---
  (function initStaticIcons() {
    $('loading-icon').innerHTML = ICONS.heroGift;
    $('cd-hero-icon').innerHTML = ICONS.heroGift;
    $('intro-hero-icon').innerHTML = ICONS.heroCake;
    $('clue-hero-icon').innerHTML = ICONS.heroKey;
    $('quiz-polaroid-bow').innerHTML = ICONS.bow;
    $('quiz-polaroid-hearts').innerHTML = ICONS.hearts;
    $('gal-zoom-bow').innerHTML = ICONS.bow;
    $('gal-zoom-hearts').innerHTML = ICONS.hearts;
    $('env-seal-ico').innerHTML = ICONS.sealHeart;
    $('env-letter-ico').innerHTML = ICONS.hearts;
    updateMuteIcon();

    setBtn($('cd-start'), 'Apri la sorpresa', ICONS.arrowRight);
    setBtn($('quiz-next'), 'Avanti', ICONS.arrowRight);
    setBtn($('mem-next'), 'Avanti', ICONS.arrowRight);
    setBtn($('sc-wallet-btn'), 'Salva i Coupon sul Telefono (QR)', '', ICONS.ticket);
    setBtn($('sc-next'), 'Avanti: La Torta!', ICONS.arrowRight);
    setBtn($('cake-blow-btn'), 'Soffia sulle candeline! (Premi OK)', '', ICONS.wind);
    setBtn($('cake-next'), 'Apri il biglietto d\'auguri', ICONS.arrowRight);
    setBtn($('card-next'), 'C\'è ancora una sorpresa...', ICONS.arrowRight);
    setBtn($('clue-hint-btn'), 'Aiutino', '', ICONS.bulb);
    setBtn($('open-gallery-btn'), 'Bacheca dei Ricordi (Tutte le foto)', '', ICONS.camera);
    setBtn($('open-coupons-btn'), 'I tuoi Coupon Regalo (QR)', '', ICONS.ticket);
    setBtn($('replay-btn'), 'Rigioca dall\'inizio', ICONS.replay);
    setBtn($('gal-back-btn'), 'Torna all\'indizio del regalo', '', ICONS.arrowLeft);
    setBtn($('gal-prev-btn'), 'Precedente', '', ICONS.arrowLeft);
    setBtn($('gal-close-btn'), 'Chiudi foto');
    setBtn($('gal-next-btn'), 'Successiva', ICONS.arrowRight);
    setBtn($('coupons-close-btn'), 'Chiudi e continua', ICONS.arrowRight);

    var box = $('balloons');
    var items = [
      '/birthday/assets/hello-kitty.svg',
      '/birthday/assets/kuromi.svg',
      '/birthday/assets/mymelody.svg',
      '/birthday/assets/cinnamoroll.svg',
      '/birthday/assets/pompompurin.svg',
      '/birthday/assets/hello-kitty.svg',
      '/birthday/assets/kuromi.svg',
      '/birthday/assets/mymelody.svg'
    ];
    for (var i = 0; i < items.length; i++) {
      var b = document.createElement('span');
      b.className = 'balloon';
      var img = document.createElement('img');
      img.src = items[i];
      img.alt = 'Sanrio';
      b.appendChild(img);
      b.style.left = (4 + (i / items.length) * 92 + Math.random() * 4) + '%';
      var dur = 16 + Math.random() * 12;
      b.style.animationDuration = dur + 's';
      b.style.animationDelay = -(Math.random() * dur) + 's';
      box.appendChild(b);
    }
  })();

  // ------------------------------------------- Navigazione telecomando ---
  var focused = null;

  function isVisible(el) {
    if (!el || el.disabled) return false;
    if (el.offsetParent === null && el.id !== 'mute-btn') return false;
    var r = el.getBoundingClientRect();
    return r.width > 0 && r.height > 0;
  }

  function navEls() {
    // Se c'è una modale aperta, naviga solo dentro la modale
    var couponsModal = $('coupons-modal');
    if (couponsModal && !couponsModal.hidden) {
      var cm = couponsModal.querySelectorAll('[data-nav]');
      var outC = [];
      for (var c = 0; c < cm.length; c++) if (isVisible(cm[c])) outC.push(cm[c]);
      return outC;
    }
    var zoomModal = $('gal-zoom-modal');
    if (zoomModal && !zoomModal.hidden) {
      var zm = zoomModal.querySelectorAll('[data-nav]');
      var outZ = [];
      for (var z = 0; z < zm.length; z++) if (isVisible(zm[z])) outZ.push(zm[z]);
      return outZ;
    }

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
        try { focused.scrollIntoView({ block: 'nearest', inline: 'nearest' }); } catch (e) {}
      }
    }
  }

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
  document.addEventListener('touchstart', pointerUsed);

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
      d.innerHTML = i < idx ? STEP_SVGS.done : (STEP_SVGS[STEPS[i]] || STEP_SVGS.done);
      box.appendChild(d);
    }
  }

  var STEP_INIT = {
    intro: initIntro, quiz: initQuiz, memory: initMemory,
    scratch: initScratch, cake: initCake, card: initCard, clue: initClue
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
        $('cd-title').textContent = fill(c.readyText || 'È arrivato il grande giorno!');
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

  $('cd-start').onclick = function () { audioCtx(); startBgm(); sfx('win'); goStep('intro'); };

  // -------------------------------------------------------------- Intro ---
  function initIntro() {
    var c = cfg.intro || {};
    $('intro-title').textContent = fill(c.title || 'Tanti auguri per i tuoi {age} anni, {name}!');
    $('intro-text').textContent = fill(c.text || '');
    setBtn($('intro-btn'), c.button || 'Iniziamo!', ICONS.arrowRight);
    show('s-intro');
    setTimeout(function () { confetti(140); }, 400);
  }
  $('intro-btn').onclick = function () { audioCtx(); startBgm(); sfx('pop'); nextStep(); };

  // --------------------------------------------------------------- Quiz ---
  var qi = 0;
  var quizLocked = false;
  var MASCOTS = [
    { img: '/birthday/assets/kuromi.svg', name: 'Kuromi' },
    { img: '/birthday/assets/hello-kitty.svg', name: 'Hello Kitty' },
    { img: '/birthday/assets/mymelody.svg', name: 'My Melody' },
    { img: '/birthday/assets/cinnamoroll.svg', name: 'Cinnamoroll' },
    { img: '/birthday/assets/pompompurin.svg', name: 'Pompompurin' }
  ];
  var MASCOT_PROMPTS = [
    'Kuromi ti osserva... vediamo se indovini!',
    'Hello Kitty fa il tifo per te, Pucla!',
    'My Melody dice: questa la sai sicuro!',
    'Cinnamoroll è curioso... quale sarà?',
    'Pompompurin scommette che la indovini al primo colpo!',
    'Ultima domanda per la regina dei 31 anni!'
  ];
  var MASCOT_RIGHT = [
    'Sììì! Esatto! Guarda che bel ricordo!',
    'Bravissima Pucla! Colpito e affondato!',
    'Perfetto! Ecco una Polaroid tutta per te!',
    'Imbattibile! Sbloccato un nuovo ricordo!'
  ];
  var MASCOT_WRONG = [
    'Ahia! Kuromi ride sotto i baffi... riprova!',
    'Nooo Pucla! Sicura sicura?! Ritenta!',
    'Acqua acqua! Prova un\'altra risposta!',
    'Quasi! Dai che la sai benissimo!'
  ];

  function setMascotBubble(text, mood) {
    var b = $('quiz-mascot-bubble');
    if (!b) return;
    b.textContent = fill(text);
    b.className = 'mascot-bubble' + (mood ? ' mood-' + mood : '');
  }

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

    // Aggiorna mascotte Sanrio e fumetto parlante
    var m = MASCOTS[qi % MASCOTS.length];
    if ($('quiz-mascot-img')) {
      $('quiz-mascot-img').src = m.img;
      $('quiz-mascot-img').alt = m.name;
    }
    setMascotBubble(MASCOT_PROMPTS[qi % MASCOT_PROMPTS.length], '');

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
      setMascotBubble(pick(MASCOT_RIGHT), 'right');
      setTimeout(function () {
        $('quiz-question-wrap').hidden = true;
        $('quiz-reveal').hidden = false;
        var pos = q.crop || 'center center';
        var zoom = q.zoom || 'cover';
        setPhoto($('quiz-photo'), q.photo, q.emoji || '💖', pos, zoom);
        $('quiz-caption').textContent = fill(q.caption || '');
        if ($('quiz-polaroid-tag')) {
          $('quiz-polaroid-tag').innerHTML = ICONS.heartSmall + 'Ricordo #' + (qi + 1) + ' di ' + c.questions.length;
        }
        var pol = $('quiz-reveal').querySelector('.polaroid');
        var themes = ['', 'theme-lilac', 'theme-sky'];
        pol.className = 'polaroid ' + themes[qi % themes.length] + (qi % 2 === 1 ? ' tilt-right' : '');
        void pol.offsetWidth;
        pol.classList.add('pop-in');
        focusFirst($('quiz-next'));
      }, 900);
    } else {
      btn.classList.add('wrong');
      btn.disabled = true;
      sfx('wrong');
      $('quiz-feedback').textContent = fill(pick(c.wrong || ['Ritenta!']));
      setMascotBubble(pick(MASCOT_WRONG), 'wrong');
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
  var SANRIO_CARDS = [
    '/birthday/assets/hello-kitty.svg',
    '/birthday/assets/kuromi.svg',
    '/birthday/assets/mymelody.svg',
    '/birthday/assets/cinnamoroll.svg',
    '/birthday/assets/pompompurin.svg'
  ];

  function initMemory() {
    var c = cfg.memory || {};
    $('mem-title').textContent = fill(c.title || 'Memory');
    $('mem-text').textContent = fill(c.text || '');
    $('mem-done').hidden = true;
    var photos = c.photos || [];
    var emoji = c.emoji || ['🎂', '💖', '🌹', '🍰', '🎁', '🎈'];
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
    deck.forEach(function (d, idx) {
      var card = document.createElement('button');
      card.className = 'mem-card';
      card.setAttribute('data-nav', '');
      card.setAttribute('data-key', d.key);
      var backChar = SANRIO_CARDS[idx % SANRIO_CARDS.length];
      card.innerHTML =
        '<div class="mem-inner">' +
          '<div class="mem-face mem-back"><img src="' + backChar + '" alt="Sanrio"></div>' +
          '<div class="mem-face mem-front"></div>' +
        '</div>';
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
    $('sc-actions').hidden = true;
    scRevealed = 0;
    scTotal = cards.length;

    var grid = $('sc-grid');
    grid.innerHTML = '';
    show('s-scratch');
    cards.forEach(function (card, idx) {
      var el = document.createElement('div');
      el.className = 'scratch';
      el.setAttribute('data-nav', '');
      el.innerHTML = '<div class="prize"><div class="p-icon"></div><div class="p-title"></div><div class="p-text"></div></div><canvas></canvas>';
      el.querySelector('.p-icon').innerHTML = PRIZE_SVGS[idx % PRIZE_SVGS.length];
      el.querySelector('.p-title').textContent = fill(card.title || '');
      el.querySelector('.p-text').textContent = fill(card.text || '');
      grid.appendChild(el);
      setupScratch(el);
    });
  }

  function drawSparkle(ctx, cx, cy, r) {
    ctx.beginPath();
    ctx.moveTo(cx, cy - r);
    ctx.quadraticCurveTo(cx, cy, cx + r, cy);
    ctx.quadraticCurveTo(cx, cy, cx, cy + r);
    ctx.quadraticCurveTo(cx, cy, cx - r, cy);
    ctx.quadraticCurveTo(cx, cy, cx, cy - r);
    ctx.closePath();
    ctx.fill();
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

    // Strato argentato/perlato con stelline disegnate in vettoriale (zero caratteri mancanti su TV)
    var g = ctx.createLinearGradient(0, 0, w, h);
    g.addColorStop(0, '#f3d1e4'); g.addColorStop(0.5, '#ffffff'); g.addColorStop(1, '#d8c2ef');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, w, h);
    ctx.fillStyle = 'rgba(255, 95, 162, 0.32)';
    for (var i = 0; i < 24; i++) {
      drawSparkle(ctx, Math.random() * w, Math.random() * h, 4 + Math.random() * 5);
    }
    ctx.fillStyle = '#582866';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.font = 'bold ' + Math.round(h * 0.1) + 'px Fredoka, sans-serif';
    ctx.fillText('GRATTA QUI', w / 2, h / 2 - h * 0.05);
    ctx.font = 'bold ' + Math.round(h * 0.065) + 'px Fredoka, sans-serif';
    ctx.fillStyle = '#d64584';
    ctx.fillText('PREMI OK', w / 2, h / 2 + h * 0.11);
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
      } catch (e) {}
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
          $('sc-actions').hidden = false;
          focusFirst($('sc-next'));
        }, 800);
      }
    }

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
      canvas.addEventListener('touchstart', down);
      canvas.addEventListener('touchmove', move);
      canvas.addEventListener('touchend', up);
      canvas.addEventListener('mousedown', down);
      canvas.addEventListener('mousemove', move);
      window.addEventListener('mouseup', up);
    }
    el.onclick = function () { if (!dragged) autoScratch(); dragged = false; };
  }

  $('sc-next').onclick = function () { sfx('pop'); nextStep(); };
  $('sc-wallet-btn').onclick = function () { sfx('pop'); openCouponsModal(); };

  // ----------------------------------------- Modale Portafoglio Coupon ---
  var lastFocusedBeforeModal = null;

  function openCouponsModal() {
    lastFocusedBeforeModal = focused;
    var cards = (cfg.scratch && cfg.scratch.cards) || [];
    var list = $('coupons-mini-list');
    list.innerHTML = '';
    for (var i = 0; i < cards.length; i++) {
      var item = document.createElement('div');
      item.className = 'coupon-mini';
      item.innerHTML =
        '<div class="coupon-mini-ico">' + PRIZE_SVGS[i % PRIZE_SVGS.length] + '</div>' +
        '<div>' +
          '<div class="coupon-mini-title">' + fill(cards[i].title || '') + '</div>' +
          '<div class="coupon-mini-text">' + fill(cards[i].text || '') + '</div>' +
        '</div>';
      list.appendChild(item);
    }
    if (cfg.couponsQrSvg) {
      $('coupons-qr-svg').innerHTML = cfg.couponsQrSvg;
    }
    $('coupons-qr-url').textContent = cfg.couponsUrl || (window.location.origin + '/birthday/coupons');
    $('coupons-modal').hidden = false;
    focusFirst($('coupons-close-btn'));
  }

  $('coupons-close-btn').onclick = function () {
    sfx('pop');
    $('coupons-modal').hidden = true;
    focusFirst(lastFocusedBeforeModal);
  };

  // ----------------------------------------- Torta dei 31 Anni (Candeline) ---
  var candlesBlown = false;

  function initCake() {
    var c = cfg.cake || {};
    candlesBlown = false;
    $('cake-title').textContent = fill(c.title || 'Buon {age}° Compleanno, {name}!');
    $('cake-text').textContent = fill(c.text || 'Chiudi gli occhi, esprimi un desiderio e soffia sulle candeline dei tuoi {age} anni!');
    $('cake-svg-holder').innerHTML = buildCake31Svg(cfg.age || 31);
    $('cake-smoke').hidden = true;
    $('cake-smoke').innerHTML = '';
    $('cake-wish').hidden = true;
    $('cake-blow-btn').hidden = false;
    $('cake-next').hidden = true;
    show('s-cake', $('cake-blow-btn'));
  }

  function blowCandles() {
    if (candlesBlown) return;
    candlesBlown = true;
    var f3 = $('flame-3');
    var f1 = $('flame-1');
    if (f3) f3.classList.add('out');
    if (f1) f1.classList.add('out');

    // Nuvolette di fumo magico
    var smoke = $('cake-smoke');
    smoke.innerHTML = '';
    smoke.hidden = false;
    for (var i = 0; i < 6; i++) {
      var p = document.createElement('span');
      p.className = 'smoke-puff';
      p.style.left = (20 + i * 12) + '%';
      p.style.animationDelay = (i * 0.1) + 's';
      smoke.appendChild(p);
    }

    sfx('blow');
    confetti(200);
    setTimeout(function () { confetti(140); }, 700);

    var c = cfg.cake || {};
    $('cake-wish').textContent = fill(c.wishText || 'Desiderio espresso! Buon {age}° compleanno, dolce {name}!');
    $('cake-wish').hidden = false;
    $('cake-blow-btn').hidden = true;
    $('cake-next').hidden = false;
    focusFirst($('cake-next'));
  }

  $('cake-blow-btn').onclick = blowCandles;
  $('cake-stage').onclick = function () {
    if (!candlesBlown) blowCandles();
  };
  $('cake-next').onclick = function () { sfx('pop'); nextStep(); };

  // ----------------------------------------------------------- Biglietto ---
  var typing = null;

  function initCard() {
    var c = cfg.card || {};
    $('envelope').classList.remove('open');
    $('env-wrap').hidden = false;
    $('letter-full').hidden = true;
    $('card-next').hidden = true;
    $('env-hint').textContent = document.body.classList.contains('kb') ? 'Premi OK per aprire la busta' : 'Tocca la busta per aprirla';
    $('card-title').textContent = fill(c.title || 'Buon compleanno!');
    $('card-message').textContent = '';
    $('card-signature').textContent = '';
    show('s-card', $('envelope'));
  }

  $('envelope').onclick = function () {
    var env = $('envelope');
    if (env.classList.contains('open')) return;
    stopBgm();
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
    setBtn($('clue-btn'), c.button || 'Vado a cercarlo!', ICONS.arrowRight);
    $('clue-btn').hidden = false;
    $('clue-main-row').hidden = false;
    $('clue-final').hidden = true;
    $('clue-extras-row').hidden = true;
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
    $('clue-final').textContent = fill((cfg.clue && cfg.clue.finalText) || 'Tanti auguri!');
    $('clue-final').hidden = false;
    $('clue-main-row').hidden = true;
    $('clue-extras-row').hidden = false;
    focusFirst($('open-gallery-btn'));
  };

  $('open-gallery-btn').onclick = function () { sfx('pop'); initGallery(); };
  $('open-coupons-btn').onclick = function () { sfx('pop'); openCouponsModal(); };
  $('replay-btn').onclick = function () { stopSong(); saveProgress({}); goStep('intro'); };
  $('mute-btn').onclick = toggleMute;

  // -------------------------------------- Bacheca dei Ricordi (Galleria) ---
  var galItems = [];
  var galIndex = 0;

  function buildGalleryItems() {
    var out = [];
    var questions = (cfg.quiz && cfg.quiz.questions) || [];
    for (var i = 0; i < questions.length; i++) {
      var q = questions[i];
      if (q.photo) {
        out.push({
          photo: q.photo,
          caption: fill(q.caption || ('Ricordo #' + (i + 1))),
          crop: q.crop || 'center center',
          zoom: q.zoom || 'cover',
          label: 'Ricordo #' + (i + 1)
        });
      }
    }
    var memPhotos = (cfg.memory && cfg.memory.photos) || [];
    for (var m = 0; m < memPhotos.length; m++) {
      if (memPhotos[m]) {
        out.push({
          photo: memPhotos[m],
          caption: 'I nostri momenti speciali insieme 💖',
          crop: 'center center',
          zoom: 'cover',
          label: 'Momento #' + (out.length + 1)
        });
      }
    }
    return out;
  }

  function initGallery() {
    galItems = buildGalleryItems();
    var wall = $('gal-wall');
    wall.innerHTML = '';
    var maxWall = Math.min(galItems.length, 6);
    for (var i = 0; i < maxWall; i++) {
      (function (idx, it) {
        var btn = document.createElement('button');
        btn.className = 'gal-item';
        btn.setAttribute('data-nav', '');
        btn.innerHTML = '<div class="gal-thumb"></div><div class="gal-label"></div>';
        var th = btn.querySelector('.gal-thumb');
        th.style.backgroundImage = 'url("' + media(it.photo) + '")';
        th.style.backgroundPosition = it.crop || 'center center';
        btn.querySelector('.gal-label').textContent = it.label;
        btn.onclick = function () { openGalleryZoom(idx); };
        wall.appendChild(btn);
      })(i, galItems[i]);
    }
    $('gal-zoom-modal').hidden = true;
    show('s-gallery');
  }

  function openGalleryZoom(idx) {
    if (!galItems.length) return;
    galIndex = (idx + galItems.length) % galItems.length;
    var it = galItems[galIndex];
    sfx('pop');
    setPhoto($('gal-zoom-photo'), it.photo, '💖', it.crop, it.zoom);
    $('gal-zoom-caption').textContent = it.caption;
    $('gal-zoom-tag').innerHTML = ICONS.heartSmall + 'Foto ' + (galIndex + 1) + ' di ' + galItems.length;
    var pol = $('gal-zoom-polaroid');
    var themes = ['', 'theme-lilac', 'theme-sky'];
    pol.className = 'polaroid ' + themes[galIndex % themes.length];
    $('gal-zoom-modal').hidden = false;
    focusFirst($('gal-next-btn'));
  }

  $('gal-prev-btn').onclick = function () { openGalleryZoom(galIndex - 1); };
  $('gal-next-btn').onclick = function () { openGalleryZoom(galIndex + 1); };
  $('gal-close-btn').onclick = function () {
    sfx('pop');
    $('gal-zoom-modal').hidden = true;
    focusFirst($('gal-back-btn'));
  };
  $('gal-back-btn').onclick = function () {
    sfx('pop');
    show('s-clue', $('open-gallery-btn'));
  };

  // -------------------------------------------------------------- Avvio ---
  if (params.reset) saveProgress({});

  var apiQuery = params.refresh ? '?refresh=1' : '';
  getJSON('/api/birthday' + apiQuery, function (err, data) {
    if (err) {
      $('s-loading').innerHTML = '<div class="card-box"><h2>Ops!</h2><p>Non riesco a caricare la sorpresa.</p></div>';
      return;
    }
    cfg = data;
    if (!cfg.age) cfg.age = 31;
    if (cfg.name) document.title = 'Per ' + cfg.name;

    var target = parseLocalDate(cfg.birthday);
    var locked = target && Date.now() < target.getTime() && !params.preview && !params.step;
    if (locked) return initCountdown(target);

    var start = params.step || loadProgress().step || 'intro';
    goStep(start);
    function onFirstInteraction() {
      startBgm();
      document.removeEventListener('click', onFirstInteraction);
      document.removeEventListener('keydown', onFirstInteraction);
    }
    document.addEventListener('click', onFirstInteraction);
    document.addEventListener('keydown', onFirstInteraction);
  });
})();
