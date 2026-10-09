import { promises as fs } from 'node:fs';
import path from 'node:path';

const src = path.resolve(import.meta.dirname, '../../sources/1.0.9-内置图标/kdn_phone.js');
const outDir = path.resolve(import.meta.dirname, '..', 'extracted');
await fs.mkdir(outDir, { recursive: true });

const text = await fs.readFile(src, 'utf8');
const hudMatch = text.match(/var HUD_SOURCE = "((?:\\.|[^"\\])*)";/);
if (!hudMatch) throw new Error('HUD_SOURCE not found');
const hud = JSON.parse(`"${hudMatch[1]}"`);
await fs.writeFile(path.join(outDir, 'hud.html'), hud, 'utf8');

const scriptMatch = hud.match(/<script>([\s\S]*?)<\/script>/);
const hudScript = scriptMatch ? scriptMatch[1] : '';
const hudMarkup = hud.replace(/<script>[\s\S]*?<\/script>/, '<!-- HUD_SCRIPT_EXTRACTED -->');
await fs.writeFile(path.join(outDir, 'hud.markup.html'), hudMarkup, 'utf8');
await fs.writeFile(path.join(outDir, 'hud.script.js'), hudScript, 'utf8');

const hostJs = text.replace(/var HUD_SOURCE = "[\s\S]*?";/, 'var HUD_SOURCE = "/*EXTRACTED*/";');
await fs.writeFile(path.join(outDir, 'host.bridge.js'), hostJs, 'utf8');

function uniq(list) {
  return [...new Set(list)].sort();
}

function grab(re, body) {
  return uniq([...body.matchAll(re)].map((m) => m[1] || m[0]));
}

const both = `${hostJs}\n${hudScript}\n${hudMarkup}`;

const report = {
  sizes: {
    hostJsChars: hostJs.length,
    hudHtmlChars: hud.length,
    hudScriptChars: hudScript.length,
    hudMarkupChars: hudMarkup.length,
  },
  hostFunctions: grab(/function ([A-Za-z0-9_]+)\s*\(/g, hostJs),
  hudFunctions: grab(/function ([A-Za-z0-9_]+)\s*\(/g, hudScript),
  dataAttrs: grab(/data-kdn[a-z0-9_-]*/gi, both),
  ids: grab(/\bid=["']([^"']+)["']/g, hudMarkup),
  appHints: uniq([
    ...grab(/data-kdn-app=["']([^"']+)["']/g, hud),
    ...grab(/data-app=["']([^"']+)["']/g, hud),
    ...grab(/openApp\(['"]([^'"]+)['"]/g, hudScript),
    ...grab(/appId:\s*['"]([^'"]+)['"]/g, hudScript),
    ...grab(/id:\s*['"]([^'"]+)['"]/g, hudScript),
  ]),
  chineseLabels: uniq([...hudMarkup.matchAll(/>([^<>{}\n]{2,24})</g)]
    .map((m) => m[1].trim())
    .filter((s) => /[\u4e00-\u9fff]/.test(s) && s.length <= 16)),
  mvuRoots: uniq([
    ...grab(/stat_data\?\.([A-Za-z_\u4e00-\u9fff]+)/g, both),
    ...grab(/S\.([A-Za-z_\u4e00-\u9fff]+)/g, both),
    ...grab(/\[['"]([\u4e00-\u9fffA-Za-z_]+)['"]\]/g, both),
  ]),
  pathWrites: grab(/['"]([A-Za-z_\u4e00-\u9fff]+(?:\/[A-Za-z_\u4e00-\u9fff]+){1,6})['"]/g, both),
  kaidanHits: uniq([
    ...grab(/[^\n]{0,40}(?:怪谈|Kaidan|kaidan|kdn|幽讯|业力|调查组|琉夜|绮昼|KaidanNote|杀戮|世界调制|授予者|子宫)[^\n]{0,40}/gi, both),
  ]).slice(0, 200),
  storageKeys: grab(/['"]((?:kdn|kaidan)[^'"]+)['"]/g, both),
  globalKeys: grab(/(__kdn[A-Za-z0-9_]+|__kaidan[A-Za-z0-9_]+)/g, both),
};

await fs.writeFile(path.join(outDir, 'inventory.json'), `${JSON.stringify(report, null, 2)}\n`, 'utf8');
console.log(JSON.stringify({
  sizes: report.sizes,
  hostFn: report.hostFunctions.length,
  hudFn: report.hudFunctions.length,
  dataAttrs: report.dataAttrs.length,
  appHints: report.appHints,
  storageKeys: report.storageKeys,
  globalKeys: report.globalKeys,
  chineseLabels: report.chineseLabels.slice(0, 80),
}, null, 2));
