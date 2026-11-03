const fs = require('node:fs');
const path = require('node:path');
const { spawn } = require('node:child_process');

const root = __dirname;
const port = Number(process.env.TIECCUOI_PORT) || 3003;
const url = 'http://localhost:' + port;

function openBrowser() {
  spawn(path.join(process.env.SystemRoot || 'C:\\Windows', 'System32', 'rundll32.exe'), ['url.dll,FileProtocolHandler', url], {
    windowsHide: true,
    stdio: 'ignore'
  }).unref();
}

async function check() {
  try {
    const r = await fetch('http://127.0.0.1:' + port + '/api/license/status', { signal: AbortSignal.timeout(700) });
    return { reachable: true, data: await r.json().catch(() => null) };
  } catch {
    return null;
  }
}

(async () => {
  const existing = await check();
  if (existing?.data?.product === 'TiecCuoiLive') {
    openBrowser();
    console.log('Tiệc Cưới Online đang chạy tại: ' + url);
    return;
  }
  if (existing) {
    console.error('Cổng ' + port + ' đang được ứng dụng khác sử dụng.');
    process.exitCode = 1;
    return;
  }

  console.log('Đang mở Tiệc Cưới Online...');
  const child = spawn(
    path.join(root, 'runtime', 'node.exe'),
    [path.join(root, 'app', 'server.cjs')],
    {
      cwd: path.join(root, 'app'),
      env: { ...process.env, PORT: String(port) },
      stdio: 'inherit',
      windowsHide: true
    }
  );

  child.on('error', () => {
    console.error('Không mở được bộ chạy. Kiểm tra thư mục runtime và app.');
    process.exitCode = 1;
  });
  child.on('exit', code => process.exit(code || 0));
  process.on('SIGINT', () => { child.kill(); });

  for (let i = 0; i < 80; i++) {
    const status = await check();
    if (status?.data?.product === 'TiecCuoiLive') {
      openBrowser();
      console.log('========================================================');
      console.log('  TIỆC CƯỚI ONLINE PRO - ĐỨC QUÂN (Zalo 0329024876)');
      console.log('  Bảng điều khiển: ' + url);
      console.log('  Màn hình LIVE:   ' + url + '/overlay.html');
      console.log('  Giữ cửa sổ này mở khi LIVE. Bấm Ctrl+C để dừng.');
      console.log('========================================================');
      return;
    }
    await new Promise(r => setTimeout(r, 250));
  }
  console.error('Chưa mở được trang. Kiểm tra thông báo trong cửa sổ này.');
})();
