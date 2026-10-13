import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { BRAND_COLORS, BRAND_PATHS, BRAND_VIEWBOX } from '../../packages/browser-extension/src/common/brand-geometry';

const folder = path.dirname(fileURLToPath(import.meta.url));
const repo = path.resolve(folder, '../..');
const require = createRequire(path.join(repo, 'packages/browser-extension/package.json'));
const { chromium } = require('@playwright/test');
const paths = BRAND_PATHS.map((d, i) => `<path fill="${BRAND_COLORS[i]}" d="${d}"/>`).join('\n  ');
const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="512" height="512" viewBox="${BRAND_VIEWBOX.join(' ')}">\n  ${paths}\n</svg>\n`;
const outputs: { file: string; size?: number }[] = [];
function save(file: string, content: string | Buffer, size?: number) {
  const absolute = path.join(repo, file);
  mkdirSync(path.dirname(absolute), { recursive: true });
  writeFileSync(absolute, content);
  outputs.push({ file, ...(size ? { size } : {}) });
}

save('marketing/brand/wireflip-mark.svg', svg);
save('packages/website/public/brand-mark.svg', svg);

// Embed paths so the social image works without fetching another image.
const socialFile = 'packages/website/public/og-v2.svg';
const social = readFileSync(path.join(repo, socialFile), 'utf8').replace(
  /  (?:<image href="\/brand-mark\.(?:png|svg)"[^>]*\/>|<svg data-brand-mark="true"[\s\S]*?<\/svg>)/,
  `  <svg data-brand-mark="true" x="64" y="56" width="56" height="56" viewBox="${BRAND_VIEWBOX.join(' ')}">\n    ${paths}\n  </svg>`,
);
assert(social.includes('data-brand-mark="true"'), 'Social image includes the brand mark');
save(socialFile, social);

const browser = await chromium.launch({
  headless: true,
  executablePath: process.env.CHROMIUM_PATH || (existsSync('/usr/bin/chromium') ? '/usr/bin/chromium' : undefined),
});
try {
  const page = await browser.newPage({ viewport: { width: 512, height: 512 } });
  for (const size of [16, 32, 48, 128, 256, 512]) {
    await page.setContent(`<style>html,body{margin:0}svg{display:block;width:${size}px;height:${size}px}</style>${svg}`);
    const png = await page.screenshot({ omitBackground: true, clip: { x: 0, y: 0, width: size, height: size } });
    assert.equal(png.readUInt32BE(16), size);
    assert.equal(png.readUInt32BE(20), size);
    assert.equal(png[25], 6, 'Icon exports preserve alpha');
    save(`marketing/brand/icons/${size}.png`, png, size);
    if (size <= 128) save(`packages/browser-extension/public/icon/${size}.png`, png, size);
    if (size === 512) save('packages/website/public/brand-mark.png', png, size);
  }
  await page.setViewportSize({ width: 1200, height: 630 });
  await page.setContent(`<style>html,body{margin:0}svg{display:block}</style>${social}`);
  save('packages/website/public/og-v2.png', await page.screenshot());
} finally {
  await browser.close();
}
save('marketing/brand/manifest.json', JSON.stringify({
  brand: 'Wireflip',
  colors: BRAND_COLORS,
  geometry: 'packages/browser-extension/src/common/brand-geometry.ts',
  approvedConcept: 'marketing/brand/source/approved-concept.png',
  cutout: 'marketing/brand/source/mark-cutout.png',
  outputs,
}, null, 2) + '\n');
console.log(`Exported ${outputs.length} Wireflip brand assets`);
