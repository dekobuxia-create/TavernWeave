import { promises as fs } from 'node:fs';
import path from 'node:path';

const workDir = path.resolve(import.meta.dirname, '..');
const genericDir = path.join(workDir, 'generic');
const srcDir = path.resolve(workDir, '../sources/1.0.9/worldbook');

const ROOTS = ['环境', 'user', '世界演化', '舆论新闻', '角色档案', '资产库', '居所', '载具', '雷达系统'];
const REMOVED = ['怪谈笔记', '权限', '影响倾向', '暴露调查组', '处刑档案', '世界调制'];
const SCHEMA_FILE = 'generic_mvu_schema.js';
const banned = /怪谈笔记|世界调制|处刑档案|暴露调查组|影响倾向|授予者|后宫|业力|杀戮值|当期修正|琉夜|绮昼|Kaidan Note|民间怪谈名|无痕|窃议/g;

const files = [
  {
    txt: 'mvu_update_full.txt',
    entry: '[mvu_update]变量更新规则.entry.json',
  },
  {
    txt: 'mvu_update_output_format.txt',
    entry: '[mvu_update]变量输出格式.entry.json',
  },
];

await fs.mkdir(path.join(genericDir, 'worldbook'), { recursive: true });

const report = [];
for (const file of files) {
  const body = (await fs.readFile(path.join(genericDir, file.txt), 'utf8')).replace(/\r\n/g, '\n');
  if (!body.endsWith('\n')) throw new Error(`${file.txt}: missing trailing newline`);
  const hits = [...body.matchAll(banned)].map((m) => m[0]);
  if (hits.length) throw new Error(`${file.txt} leftover: ${[...new Set(hits)].join(', ')}`);

  const entry = JSON.parse(await fs.readFile(path.join(srcDir, file.entry), 'utf8'));
  entry.content = body.replace(/\n$/, '');
  const outEntry = path.join(genericDir, 'worldbook', file.entry);
  await fs.writeFile(outEntry, `${JSON.stringify(entry, null, 2)}\n`, 'utf8');
  report.push({
    txt: file.txt,
    bytes: Buffer.byteLength(body),
    roots: [...body.matchAll(/顶层容器限定为 ([^\n]+)|顶层根只能是 ([^\n]+)/g)].map((m) => m[1] || m[2]),
  });
}

const init = JSON.parse(await fs.readFile(path.join(genericDir, 'InitialVariables.json'), 'utf8'));
const initKeys = Object.keys(init);
if (initKeys.join(',') !== ROOTS.join(',')) {
  throw new Error(`InitialVariables roots: ${initKeys.join(', ')}`);
}
for (const key of REMOVED) {
  if (Object.prototype.hasOwnProperty.call(init, key)) throw new Error(`InitialVariables leftover root: ${key}`);
}
if (init.角色档案 && Object.keys(init.角色档案).length) {
  throw new Error('InitialVariables.角色档案 must start empty');
}
const initHits = [...JSON.stringify(init).matchAll(banned)].map((m) => m[0]);
if (initHits.length) throw new Error(`InitialVariables leftover: ${[...new Set(initHits)].join(', ')}`);

const schemaText = (await fs.readFile(path.join(genericDir, SCHEMA_FILE), 'utf8')).replace(/\r\n/g, '\n');
const schemaHits = [...schemaText.matchAll(banned)].map((m) => m[0]);
if (schemaHits.length) throw new Error(`${SCHEMA_FILE} leftover: ${[...new Set(schemaHits)].join(', ')}`);
const schemaBlock = schemaText.match(/const Schema = z\.object\(\{([\s\S]*?)\n\}\);/);
if (!schemaBlock) throw new Error(`${SCHEMA_FILE}: Schema object missing`);
const schemaKeys = [...schemaBlock[1].matchAll(/^\s{2}([A-Za-z\u4e00-\u9fff]+):/gm)].map((m) => m[1]);
if (schemaKeys.join(',') !== ROOTS.join(',')) {
  throw new Error(`${SCHEMA_FILE} roots: ${schemaKeys.join(', ')}`);
}
for (const key of REMOVED) {
  if (new RegExp(`^\\s{2}${key}:`, 'm').test(schemaBlock[1])) throw new Error(`${SCHEMA_FILE} leftover root: ${key}`);
}
if (schemaText.includes('授予者:') || schemaText.includes('__kaidanMvuSchema')) {
  throw new Error(`${SCHEMA_FILE} leftover grantor or kaidan schema name`);
}
if (!schemaText.includes('window.__phMvuSchema')) throw new Error(`${SCHEMA_FILE} missing __phMvuSchema`);
if (schemaText.includes('民间怪谈名') || !schemaText.includes('民间传闻名')) {
  throw new Error(`${SCHEMA_FILE} rumor field not renamed`);
}
if (!schemaText.includes("LooseString('日常')")) {
  throw new Error(`${SCHEMA_FILE} awareness default must be 日常`);
}

const initEntry = JSON.parse(await fs.readFile(path.join(srcDir, '[InitialVariables]变量初始化.entry.json'), 'utf8'));
initEntry.content = `${JSON.stringify(init, null, 2)}\n`;
await fs.writeFile(
  path.join(genericDir, 'worldbook', '[InitialVariables]变量初始化.entry.json'),
  `${JSON.stringify(initEntry, null, 2)}\n`,
  'utf8',
);

if (init.世界演化?.社会认知度 !== '日常') throw new Error('InitialVariables.社会认知度 must be 日常');
if (!Object.prototype.hasOwnProperty.call(init.舆论新闻 || {}, '民间传闻名')) {
  throw new Error('InitialVariables missing 民间传闻名');
}
if (Object.prototype.hasOwnProperty.call(init.舆论新闻 || {}, '民间怪谈名')) {
  throw new Error('InitialVariables leftover 民间怪谈名');
}

report.push({
  txt: SCHEMA_FILE,
  bytes: Buffer.byteLength(schemaText),
  roots: schemaKeys,
});
report.push({
  txt: 'InitialVariables.json',
  bytes: Buffer.byteLength(JSON.stringify(init)),
  roots: initKeys,
  characters: Object.keys(init.角色档案 || {}),
});

console.log(JSON.stringify({ out: '怪谈笔记/通用化改造/mvu-zod/work/generic', report }, null, 2));
