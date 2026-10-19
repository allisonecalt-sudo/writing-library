// One-off: render icon.svg to the PNG sizes the manifest names. Run: node scripts/render-icons.js
const { chromium } = require('@playwright/test');
const fs = require('node:fs');
const path = require('node:path');

const root = path.join(__dirname, '..');
const svg = fs.readFileSync(path.join(root, 'icon.svg'), 'utf8');
const targets = [
  ['icon-192.png', 192],
  ['icon-512.png', 512],
  ['icon-maskable-512.png', 512],
];

(async () => {
  const browser = await chromium.launch();
  for (const [name, size] of targets) {
    const page = await browser.newPage({ viewport: { width: size, height: size } });
    await page.setContent(
      `<body style="margin:0"><img style="width:${size}px;height:${size}px;display:block" src="data:image/svg+xml;utf8,${encodeURIComponent(svg)}"></body>`,
    );
    await page.screenshot({ path: path.join(root, name) });
    await page.close();
  }
  await browser.close();
})();
