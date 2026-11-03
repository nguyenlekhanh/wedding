const { spawn } = require('node:child_process');
const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');

const ARTIFACT_DIR = 'C:\\Users\\ducqu\\.gemini\\antigravity\\brain\\fe6d62ea-b2fa-49d6-a80c-cb09fb32567e';
const EDGE_PATH = 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';
const USER_DATA = path.join(require('node:os').tmpdir(), 'edge_v3_' + Date.now());

function sleep(ms) {
  return new Promise(r => setTimeout(r, ms));
}

function fetchJson(url) {
  return new Promise((resolve, reject) => {
    http.get(url, res => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try { resolve(JSON.parse(data)); } catch (e) { reject(e); }
      });
    }).on('error', reject);
  });
}

function postJson(urlStr, bodyObj) {
  return new Promise((resolve, reject) => {
    const url = new URL(urlStr);
    const data = JSON.stringify(bodyObj);
    const req = http.request({
      hostname: url.hostname,
      port: url.port,
      path: url.pathname,
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(data)
      }
    }, res => {
      let resData = '';
      res.on('data', c => resData += c);
      res.on('end', () => resolve(resData));
    });
    req.on('error', reject);
    req.write(data);
    req.end();
  });
}

// Simple WebSocket Client for CDP
const crypto = require('node:crypto');
class CDPClient {
  constructor(wsUrl) {
    this.wsUrl = wsUrl;
    this.id = 1;
    this.pending = new Map();
  }
  connect() {
    return new Promise((resolve, reject) => {
      const url = new URL(this.wsUrl);
      const key = crypto.randomBytes(16).toString('base64');
      const req = http.request({
        hostname: url.hostname,
        port: url.port,
        path: url.pathname,
        headers: {
          'Connection': 'Upgrade',
          'Upgrade': 'websocket',
          'Sec-WebSocket-Version': '13',
          'Sec-WebSocket-Key': key
        }
      });
      req.on('upgrade', (res, socket) => {
        this.socket = socket;
        this.buffer = Buffer.alloc(0);
        socket.on('data', chunk => this.onData(chunk));
        resolve();
      });
      req.on('error', reject);
      req.end();
    });
  }
  send(method, params = {}) {
    return new Promise((resolve, reject) => {
      const id = this.id++;
      this.pending.set(id, { resolve, reject });
      const payload = JSON.stringify({ id, method, params });
      this.sendFrame(payload);
    });
  }
  sendFrame(text) {
    const payload = Buffer.from(text, 'utf8');
    const len = payload.length;
    let header;
    if (len < 126) {
      header = Buffer.alloc(6);
      header[0] = 0x81;
      header[1] = 0x80 | len;
      header.fill(0, 2, 6);
    } else if (len < 65536) {
      header = Buffer.alloc(8);
      header[0] = 0x81;
      header[1] = 0x80 | 126;
      header.writeUInt16BE(len, 2);
      header.fill(0, 4, 8);
    } else {
      header = Buffer.alloc(14);
      header[0] = 0x81;
      header[1] = 0x80 | 127;
      header.writeBigUInt64BE(BigInt(len), 2);
      header.fill(0, 10, 14);
    }
    this.socket.write(Buffer.concat([header, payload]));
  }
  onData(chunk) {
    this.buffer = Buffer.concat([this.buffer, chunk]);
    while (this.buffer.length >= 2) {
      const secondByte = this.buffer[1];
      let length = secondByte & 0x7F;
      let offset = 2;
      if (length === 126) {
        if (this.buffer.length < 4) return;
        length = this.buffer.readUInt16BE(2);
        offset = 4;
      } else if (length === 127) {
        if (this.buffer.length < 10) return;
        length = Number(this.buffer.readBigUInt64BE(2));
        offset = 10;
      }
      if (this.buffer.length < offset + length) return;
      const payload = this.buffer.slice(offset, offset + length);
      this.buffer = this.buffer.slice(offset + length);
      try {
        const msg = JSON.parse(payload.toString('utf8'));
        if (msg.id && this.pending.has(msg.id)) {
          const { resolve, reject } = this.pending.get(msg.id);
          this.pending.delete(msg.id);
          if (msg.error) reject(new Error(msg.error.message));
          else resolve(msg.result);
        }
      } catch (e) {}
    }
  }
  close() {
    if (this.socket) this.socket.destroy();
  }
}

async function main() {
  console.log('Starting Edge in headless mode...');
  const edge = spawn(EDGE_PATH, [
    '--headless=new',
    '--remote-debugging-port=9222',
    '--remote-debugging-address=127.0.0.1',
    '--disable-gpu',
    '--no-first-run',
    '--no-default-browser-check',
    `--user-data-dir=${USER_DATA}`,
    'about:blank'
  ]);

  let list = null;
  for (let i = 0; i < 20; i++) {
    await sleep(500);
    try {
      list = await fetchJson('http://127.0.0.1:9222/json/list');
      if (list && list.length) break;
    } catch (e) {}
  }
  if (!list || !list.length) throw new Error('Could not connect to Edge DevTools');

  try {
    const page = list.find(p => p.type === 'page') || list[0];
    const client = new CDPClient(page.webSocketDebuggerUrl);
    await client.connect();

    console.log('Connected to CDP. Navigating to overlay...');
    await client.send('Page.enable');

    // 1. OVERLAY SCREENSHOT (9:16 - 1080x1920)
    await client.send('Emulation.setDeviceMetricsOverride', {
      width: 1080,
      height: 1920,
      deviceScaleFactor: 1,
      mobile: false
    });

    await client.send('Page.navigate', { url: 'http://localhost:3003/overlay.html' });
    await sleep(5000);

    console.log('Capturing wedding_v3_live_bgm.jpg...');
    const shot1 = await client.send('Page.captureScreenshot', { format: 'jpeg', quality: 90 });
    fs.writeFileSync(path.join(ARTIFACT_DIR, 'wedding_v3_live_bgm.jpg'), Buffer.from(shot1.data, 'base64'));

    // 2. TRIGGER PETAL STORM RITUAL
    console.log('Triggering petal ritual...');
    await postJson('http://localhost:3003/api/action', { action: 'petal' });
    await sleep(1500);

    console.log('Capturing wedding_v3_petal_storm.jpg...');
    const shot2 = await client.send('Page.captureScreenshot', { format: 'jpeg', quality: 90 });
    fs.writeFileSync(path.join(ARTIFACT_DIR, 'wedding_v3_petal_storm.jpg'), Buffer.from(shot2.data, 'base64'));

    // 3. TRIGGER CAKE CUTTING RITUAL
    console.log('Triggering cake ritual...');
    await postJson('http://localhost:3003/api/action', { action: 'cake' });
    await sleep(1500);

    console.log('Capturing wedding_v3_cake_ceremony.jpg...');
    const shot3 = await client.send('Page.captureScreenshot', { format: 'jpeg', quality: 90 });
    fs.writeFileSync(path.join(ARTIFACT_DIR, 'wedding_v3_cake_ceremony.jpg'), Buffer.from(shot3.data, 'base64'));

    // 4. ADMIN PANEL SCREENSHOT - TAB BGM (1440x900)
    await client.send('Emulation.setDeviceMetricsOverride', {
      width: 1440,
      height: 900,
      deviceScaleFactor: 1,
      mobile: false
    });

    await client.send('Page.navigate', { url: 'http://localhost:3003/' });
    await sleep(2500);

    // Switch to tab-bgm
    await client.send('Runtime.evaluate', {
      expression: `
        document.querySelectorAll('.nav-item').forEach(b => b.classList.remove('active'));
        document.querySelectorAll('.tab-pane').forEach(p => p.classList.remove('active'));
        document.querySelector('[data-tab="tab-bgm"]')?.classList.add('active');
        document.querySelector('#tab-bgm')?.classList.add('active');
      `
    });
    await sleep(800);

    console.log('Capturing wedding_v3_admin_bgm.jpg...');
    const shot4 = await client.send('Page.captureScreenshot', { format: 'jpeg', quality: 90 });
    fs.writeFileSync(path.join(ARTIFACT_DIR, 'wedding_v3_admin_bgm.jpg'), Buffer.from(shot4.data, 'base64'));

    client.close();
    console.log('All V3 verification screenshots captured successfully!');
  } finally {
    edge.kill();
    try { fs.rmSync(USER_DATA, { recursive: true, force: true }); } catch (e) {}
  }
}

main().catch(err => {
  console.error('Error:', err);
  process.exit(1);
});
