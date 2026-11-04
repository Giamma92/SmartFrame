const { spawn } = require('child_process');

const edgePath = 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';
const proc = spawn(edgePath, [
  '--headless=new',
  '--remote-debugging-port=9225',
  '--disable-gpu',
  '--no-sandbox',
  'http://192.168.178.36:3000/?frame=1'
]);

async function run() {
  await new Promise(r => setTimeout(r, 2000));
  const listRes = await fetch('http://127.0.0.1:9225/json');
  const tabs = await listRes.json();
  const pageTab = tabs.find(t => t.type === 'page');
  const ws = new WebSocket(pageTab.webSocketDebuggerUrl);

  let id = 1;
  const send = (method, params = {}) => new Promise((resolve) => {
    const curId = id++;
    const handler = (msg) => {
      const data = JSON.parse(msg.data);
      if (data.id === curId) {
        ws.removeEventListener('message', handler);
        resolve(data.result);
      }
    };
    ws.addEventListener('message', handler);
    ws.send(JSON.stringify({ id: curId, method, params }));
  });

  await new Promise(r => { ws.onopen = r; });
  await send('Page.enable');
  await send('Runtime.enable');

  await new Promise(r => setTimeout(r, 2500));

  const evalCode = async (expr) => {
    const res = await send('Runtime.evaluate', { expression: expr, returnByValue: true });
    return res.result ? res.result.value : null;
  };

  const status = await evalCode(`({
    nowPlaying: {
      hidden: document.getElementById('now-playing-pill').hidden,
      title: document.getElementById('now-playing-title').textContent,
      artist: document.getElementById('now-playing-artist').textContent
    },
    weather: {
      sunrise: document.getElementById('sun-rise-val').textContent,
      sunset: document.getElementById('sun-set-val').textContent,
      hourlyChips: document.querySelectorAll('#weather-hourly .weather-chip').length
    },
    wifiModal: {
      hiddenBefore: document.getElementById('wifi-modal').hidden
    }
  })`);

  console.log('Status before key:', JSON.stringify(status, null, 2));

  // Press 'w' to toggle Wi-Fi modal
  await send('Input.dispatchKeyEvent', { type: 'rawKeyDown', key: 'w', code: 'KeyW', windowsVirtualKeyCode: 87 });
  await send('Input.dispatchKeyEvent', { type: 'keyUp', key: 'w', code: 'KeyW', windowsVirtualKeyCode: 87 });
  await new Promise(r => setTimeout(r, 500));

  const wifiStatus = await evalCode(`({
    hiddenAfterW: document.getElementById('wifi-modal').hidden,
    ssid: document.getElementById('wifi-ssid-val').textContent,
    hasQrSvg: !!document.querySelector('#wifi-qr-box svg')
  })`);

  console.log('Wi-Fi Modal status:', JSON.stringify(wifiStatus, null, 2));

  // Press Escape to close
  await send('Input.dispatchKeyEvent', { type: 'rawKeyDown', key: 'Escape', code: 'Escape', windowsVirtualKeyCode: 27 });
  await send('Input.dispatchKeyEvent', { type: 'keyUp', key: 'Escape', code: 'Escape', windowsVirtualKeyCode: 27 });
  await new Promise(r => setTimeout(r, 400));

  const closedStatus = await evalCode(`document.getElementById('wifi-modal').hidden`);
  console.log('Modal closed after Escape?', closedStatus);

  ws.close();
  proc.kill();
}

run().catch(err => {
  console.error('Test error:', err);
  proc.kill();
});
