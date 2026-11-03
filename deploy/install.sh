#!/usr/bin/env bash
# ---------------------------------------------------------------------
#  Installazione Smart Frame su Raspberry Pi
#  - installa le dipendenze npm
#  - crea .env se manca
#  - registra e avvia il servizio systemd (avvio al boot + restart su crash)
#
#  Uso:  cd ~/smart-frame && chmod +x deploy/*.sh && ./deploy/install.sh
# ---------------------------------------------------------------------
set -euo pipefail

APP_DIR="$(cd "$(dirname "$0")/.." && pwd)"
USER_NAME="$(id -un)"
NODE_BIN="$(command -v node || true)"

if [[ -z "$NODE_BIN" ]]; then
  echo "❌ Node.js non trovato. Installalo prima (vedi README)." >&2
  exit 1
fi

echo "📁 Cartella:  $APP_DIR"
echo "👤 Utente:    $USER_NAME"
echo "🟢 Node:      $NODE_BIN ($("$NODE_BIN" --version))"

cd "$APP_DIR"
npm install --omit=dev

[[ -f .env ]] || { cp .env.example .env; echo "📝 Creato .env: ricordati di modificarlo"; }
mkdir -p photos data

# Genera il file di servizio con utente e percorsi reali
sed -e "s|^User=.*|User=$USER_NAME|" \
    -e "s|^WorkingDirectory=.*|WorkingDirectory=$APP_DIR|" \
    -e "s|^ExecStart=.*|ExecStart=$NODE_BIN server/server.js|" \
    deploy/smart-frame.service | sudo tee /etc/systemd/system/smart-frame.service > /dev/null

sudo systemctl daemon-reload
sudo systemctl enable --now smart-frame
sleep 2
sudo systemctl --no-pager status smart-frame | head -n 12

IP="$(hostname -I | awk '{print $1}')"
echo
echo "✅ Fatto! Apri sulla TV:  http://$IP:3000"
echo "   Log:                    journalctl -u smart-frame -f"
