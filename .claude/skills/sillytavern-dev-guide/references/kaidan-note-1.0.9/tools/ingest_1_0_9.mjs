import { createHash } from 'node:crypto';
import { promises as fs } from 'node:fs';
import path from 'node:path';

const here = import.meta.dirname;
const destRoot = path.resolve(here, '..');
const repoRoot = path.resolve(destRoot, '../..');
const kaidanRoot = path.resolve(destRoot, '..');

const CARD_JSON = path.join(kaidanRoot, 'v1.0.9', '怪谈笔记·绮罗世界 MVU 1.0.9.json');
const R2_JSON = path.join(kaidanRoot, 'v1.0.9', 'r2', '[怪谈笔记] 小手机·平板r2.json');
const COMP = path.join(kaidanRoot, 'components');

const PHONE_LIB = path.join(destRoot, '小手机', 'sources', '1.0.9-拉取图标库');
const PHONE_EMBED = path.join(destRoot, '小手机', 'sources', '1.0.9-内置图标');
const PHONE_WORK = path.join(destRoot, '小手机', 'work');
const MVU = path.join(destRoot, 'mvu-zod', 'sources', '1.0.9');
const REGEX = path.join(destRoot, '正则', 'sources', '1.0.9');

function sha256(buf) {
  return createHash('sha256').update(buf).digest('hex');
}

async function hashFile(filePath) {
  return sha256(await fs.readFile(filePath));
}

async function writeUtf8(filePath, text) {
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  await fs.writeFile(filePath, text, 'utf8');
}

async function writeJson(filePath, value) {
  await writeUtf8(filePath, `${JSON.stringify(value, null, 2)}\n`);
}

async function copyFile(src, dest) {
  await fs.mkdir(path.dirname(dest), { recursive: true });
  await fs.copyFile(src, dest);
}

function stripScript(script) {
  if (!script || typeof script !== 'object') return null;
  const { content, ...meta } = script;
  return {
    ...meta,
    contentBytes: Buffer.byteLength(content || '', 'utf8'),
    contentSha256: sha256(Buffer.from(content || '', 'utf8')),
  };
}

function phoneFingerprint(src) {
  return {
    build: (src.match(/build:\s*'([^']+)'/) || [])[1] || '',
    hudBuild: (src.match(/data-kdn-build=\\"([^"]+)\\"/) || src.match(/data-kdn-build="([^"]+)"/) || [])[1] || '',
    embeddedTablerSubset: src.includes('embedded 51-icon subset'),
    mentionsIconLibrary: /图标库|icon.?library|tablericons|unpkg.*tabler|cdn\.jsdelivr.*tabler/i.test(src),
  };
}

function pickEntryMeta(entry) {
  if (!entry) return null;
  return {
    id: entry.id,
    comment: entry.comment,
    keys: entry.keys,
    secondary_keys: entry.secondary_keys,
    constant: entry.constant,
    selective: entry.selective,
    insertion_order: entry.insertion_order,
    enabled: entry.enabled,
    position: entry.position,
    use_regex: entry.use_regex,
    extensions: entry.extensions,
    contentBytes: Buffer.byteLength(entry.content || '', 'utf8'),
    contentSha256: sha256(Buffer.from(entry.content || '', 'utf8')),
  };
}

const cardRaw = await fs.readFile(CARD_JSON);
const card = JSON.parse(cardRaw.toString('utf8'));
const scripts = card.data?.extensions?.tavern_helper?.scripts || [];
const entries = card.data?.character_book?.entries || [];
const byScriptId = Object.fromEntries(scripts.map((item) => [item.id, item]));
const byComment = Object.fromEntries(entries.map((item) => [item.comment, item]));

const phoneCard = byScriptId['kaidan-note-bridge'];
if (!phoneCard?.content) throw new Error('card phone script kaidan-note-bridge missing');

const r2Raw = await fs.readFile(R2_JSON);
const r2Parsed = JSON.parse(r2Raw.toString('utf8'));
const r2Script = Array.isArray(r2Parsed) ? r2Parsed[0] : r2Parsed;
if (!r2Script?.content) throw new Error('r2 phone script content missing');

await fs.mkdir(PHONE_LIB, { recursive: true });
await fs.mkdir(PHONE_EMBED, { recursive: true });
await fs.mkdir(PHONE_WORK, { recursive: true });
await fs.mkdir(path.join(MVU, 'worldbook'), { recursive: true });
await fs.mkdir(REGEX, { recursive: true });

await writeUtf8(path.join(PHONE_LIB, 'kdn_phone.js'), phoneCard.content);
await writeJson(path.join(PHONE_LIB, 'script.meta.json'), stripScript(phoneCard));

await copyFile(path.join(COMP, 'scripts', 'kdn_phone.js'), path.join(PHONE_EMBED, 'kdn_phone.js'));
await writeJson(path.join(PHONE_EMBED, 'script.meta.json'), {
  ...stripScript(r2Script),
  sourceWrapper: '怪谈笔记/v1.0.9/r2/[怪谈笔记] 小手机·平板r2.json',
  workingTreeFile: '怪谈笔记/components/scripts/kdn_phone.js',
});

await writeUtf8(path.join(PHONE_WORK, '.gitkeep'), '');
await writeUtf8(
  path.join(PHONE_WORK, 'PLACEHOLDER.md'),
  '# 通用化工作区\n\n这里留给后续小手机通用化改写。入库快照在 `../sources/`，不要改 sources。\n',
);

const mvuCopies = [
  ['zod_schema.js', 'zod_schema.js'],
  ['scripts/mvu_zod_cn.js', 'mvu_zod_cn.js'],
  ['scripts/mvu_zod_global.js', 'mvu_zod_global.js'],
  ['InitialVariables.json', 'InitialVariables.json'],
  ['mvu_update_full.txt', 'mvu_update_full.txt'],
  ['mvu_update_output_format.txt', 'mvu_update_output_format.txt'],
];
for (const [fromRel, toRel] of mvuCopies) {
  await copyFile(path.join(COMP, fromRel), path.join(MVU, toRel));
}

const variableComments = [
  ['[InitialVariables]变量初始化', '[InitialVariables]变量初始化.entry.json'],
  ['[mvu_update]变量更新规则', '[mvu_update]变量更新规则.entry.json'],
  ['[mvu_update]变量输出格式', '[mvu_update]变量输出格式.entry.json'],
];
const worldbookMeta = [];
for (const [comment, fileName] of variableComments) {
  const entry = byComment[comment];
  if (!entry) throw new Error(`missing worldbook entry: ${comment}`);
  await writeJson(path.join(MVU, 'worldbook', fileName), entry);
  worldbookMeta.push(pickEntryMeta(entry));
}
await writeJson(path.join(MVU, 'worldbook.meta.json'), worldbookMeta);
await writeJson(path.join(MVU, 'scripts.meta.json'), [
  stripScript(byScriptId['kaidan-note-zod-schema']),
  stripScript(byScriptId['kaidan-note-mvu-zod-global']),
  stripScript(byScriptId['kaidan-note-mvu-zod-cn']),
]);

const ACTION = path.join(destRoot, '行动选项', 'sources', '1.0.9');
const ACTION_WB = path.join(ACTION, 'worldbook');
const actionCopies = [
  ['17_cot_行动选项_一档.entry.json', '[cot]行动选项·一档(4项·默认开启)'],
  ['19_cot_行动选项_二档.entry.json', '[cot]行动选项·二档(6项·默认关闭)'],
  ['20_cot_行动选项_三档.entry.json', '[cot]行动选项·三档(8项·默认关闭)'],
  ['21_cot_行动选项_四档.entry.json', '[cot]行动选项·四档(10项·默认关闭)'],
];
await fs.mkdir(ACTION_WB, { recursive: true });
for (const [fileName, comment] of actionCopies) {
  const src = path.join(COMP, 'worldbook_entries', 'build', fileName);
  const cardEntry = byComment[comment];
  if (!cardEntry) throw new Error(`missing worldbook entry: ${comment}`);
  const compEntry = JSON.parse(await fs.readFile(src, 'utf8'));
  if (compEntry.content !== cardEntry.content) {
    throw new Error(`action option content mismatch: ${comment}`);
  }
  const dest = path.join(ACTION_WB, fileName);
  try {
    const existing = JSON.parse(await fs.readFile(dest, 'utf8'));
    if (existing.content !== cardEntry.content) {
      continue;
    }
  } catch (error) {
    if (error && error.code !== 'ENOENT') throw error;
  }
  await copyFile(src, dest);
}
await writeJson(
  path.join(ACTION, 'worldbook.meta.json'),
  actionCopies.map(([fileName, comment]) => pickEntryMeta(byComment[comment])),
);

await fs.cp(path.join(COMP, 'regex'), REGEX, { recursive: true });
await copyFile(
  path.join(kaidanRoot, 'v1.0.9', 'r1', '[显示]怪谈·变量结算卡(完成).json'),
  path.join(REGEX, 'import-patches', '[显示]怪谈·变量结算卡(完成).json'),
);

const files = [];
async function record(rel, srcLabel, expectedSha = '') {
  const abs = path.join(destRoot, rel);
  const hash = await hashFile(abs);
  files.push({
    dest: rel.replaceAll('\\', '/'),
    source: srcLabel,
    sha256: hash,
    bytes: (await fs.stat(abs)).size,
    matchSource: expectedSha ? hash === expectedSha : null,
  });
  if (expectedSha && hash !== expectedSha) {
    throw new Error(`hash mismatch: ${rel}`);
  }
}

const cardSha = sha256(cardRaw);
const r2Sha = sha256(r2Raw);
const phoneCardSha = sha256(Buffer.from(phoneCard.content, 'utf8'));
const phoneEmbedSha = await hashFile(path.join(COMP, 'scripts', 'kdn_phone.js'));
const r2ContentSha = sha256(Buffer.from(r2Script.content, 'utf8'));
if (phoneEmbedSha !== r2ContentSha) {
  throw new Error('components kdn_phone.js is not identical to r2 content');
}

await record('小手机/sources/1.0.9-拉取图标库/kdn_phone.js', 'v1.0.9 card tavern_helper kaidan-note-bridge.content', phoneCardSha);
await record('小手机/sources/1.0.9-内置图标/kdn_phone.js', 'components/scripts/kdn_phone.js == v1.0.9/r2', phoneEmbedSha);

for (const [fromRel, toRel] of mvuCopies) {
  await record(`mvu-zod/sources/1.0.9/${toRel}`, `components/${fromRel}`, await hashFile(path.join(COMP, fromRel)));
}

const regexFiles = [
  '01_开局页占位展开.json',
  '02_开局占位提示词剥离.json',
  '03_变量结算卡_完成.json',
  '04_变量结算卡_流式.json',
  '05_历史变量块提示词瘦身.json',
  '06_行动选项渲染.json',
  '06b_旧楼选项隐藏.json',
  '07_历史选项提示词剥离.json',
  '08_事件推演块隐藏.json',
  '10_正文引号染色.json',
  'assets/opening_page.html',
  'assets/options_block.html',
  'assets/var_card.html',
  'build/regex_scripts.json',
  'import-patches/[显示]怪谈·变量结算卡(完成).json',
];
for (const rel of regexFiles) {
  const src = rel.startsWith('import-patches/')
    ? path.join(kaidanRoot, 'v1.0.9', 'r1', path.basename(rel))
    : path.join(COMP, 'regex', rel);
  await record(`正则/sources/1.0.9/${rel}`, path.relative(repoRoot, src).replaceAll('\\', '/'), await hashFile(src));
}

for (const [fileName] of actionCopies) {
  const src = path.join(COMP, 'worldbook_entries', 'build', fileName);
  const destRel = `行动选项/sources/1.0.9/worldbook/${fileName}`;
  const destAbs = path.join(destRoot, destRel);
  const destEntry = JSON.parse(await fs.readFile(destAbs, 'utf8'));
  const srcEntry = JSON.parse(await fs.readFile(src, 'utf8'));
  const expected = destEntry.content === srcEntry.content ? await hashFile(src) : '';
  await record(destRel, path.relative(repoRoot, src).replaceAll('\\', '/'), expected);
}

const provenance = {
  ingestedAt: '2026-08-23',
  cardVersion: '1.0.9',
  scope: [
    '小手机两版',
    'MVU Zod 套件',
    '世界书三条变量条目',
    '正则套件',
    '行动选项四条世界书',
  ],
  excluded: [
    '世界观/角色/规则/其余 cot 世界书',
    '开场白与消息',
    'statusbar.html',
    '回封 JSON/PNG',
    '模块化组件 registry 回落',
    '通用化改写',
  ],
  snapshots: {
    cardJson: {
      path: '怪谈笔记/v1.0.9/怪谈笔记·绮罗世界 MVU 1.0.9.json',
      bytes: cardRaw.length,
      sha256: cardSha,
    },
    r2PhoneWrapper: {
      path: '怪谈笔记/v1.0.9/r2/[怪谈笔记] 小手机·平板r2.json',
      bytes: r2Raw.length,
      sha256: r2Sha,
    },
  },
  phone: {
    iconLibrary: {
      dest: '小手机/sources/1.0.9-拉取图标库/kdn_phone.js',
      sha256: phoneCardSha,
      bytes: Buffer.byteLength(phoneCard.content, 'utf8'),
      fingerprint: phoneFingerprint(phoneCard.content),
    },
    embeddedIcons: {
      dest: '小手机/sources/1.0.9-内置图标/kdn_phone.js',
      sha256: phoneEmbedSha,
      bytes: (await fs.stat(path.join(PHONE_EMBED, 'kdn_phone.js'))).size,
      fingerprint: phoneFingerprint(r2Script.content),
    },
  },
  files,
};

await writeJson(path.join(destRoot, 'provenance.json'), provenance);

const mismatches = files.filter((item) => item.matchSource === false);
if (mismatches.length) {
  throw new Error(`ingest hash mismatches: ${mismatches.map((item) => item.dest).join(', ')}`);
}

console.log(JSON.stringify({
  destRoot: path.relative(repoRoot, destRoot).replaceAll('\\', '/'),
  fileCount: files.length,
  phoneIconLibrary: provenance.phone.iconLibrary.fingerprint,
  phoneEmbedded: provenance.phone.embeddedIcons.fingerprint,
  allMatched: files.every((item) => item.matchSource !== false),
}, null, 2));
