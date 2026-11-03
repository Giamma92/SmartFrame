#!/usr/bin/env bash
# ---------------------------------------------------------------------
#  OPZIONALE: modalità kiosk se la TV è collegata via HDMI al Raspberry
#  (non serve se apri la pagina dal browser VIDAA della TV).
#  Autostart: copia deploy/smart-frame-kiosk.desktop in ~/.config/autostart/
# ---------------------------------------------------------------------
URL="${FRAME_URL:-http://localhost:3000}"

# Attende che il backend risponda (max ~2 minuti)
for _ in $(seq 1 60); do
  curl -fs "$URL/api/health" > /dev/null && break
  sleep 2
done

# Disattiva screensaver/blanking su X11 (su Wayland usa raspi-config)
if [[ -n "${DISPLAY:-}" ]] && command -v xset > /dev/null; then
  xset s off; xset -dpms; xset s noblank
fi

# Evita il popup "Ripristina pagine" dopo uno spegnimento brusco
PREFS="$HOME/.config/chromium/Default/Preferences"
[[ -f "$PREFS" ]] && sed -i 's/"exited_cleanly":false/"exited_cleanly":true/; s/"exit_type":"[^"]*"/"exit_type":"Normal"/' "$PREFS"

BROWSER="$(command -v chromium-browser || command -v chromium)"
exec "$BROWSER" --kiosk --noerrdialogs --disable-infobars --disable-session-crashed-bubble \
  --no-first-run --check-for-update-interval=31536000 --disable-features=Translate \
  --ignore-gpu-blocklist --enable-gpu-rasterization --password-store=basic "$URL"
