import { createHash } from 'node:crypto';
import { promises as fs } from 'node:fs';
import path from 'node:path';

const destRoot = path.resolve(import.meta.dirname, '..');
const kaidanRoot = path.resolve(destRoot, '..');
const CARD_JSON = path.join(kaidanRoot, 'v1.0.9', '怪谈笔记·绮罗世界 MVU 1.0.9.json');
const COMP_BUILD = path.join(kaidanRoot, 'components', 'worldbook_entries', 'build');
const OUT = path.join(destRoot, '行动选项', 'sources', '1.0.9', 'worldbook');

const ITEMS = [
  { comment: '[cot]行动选项·一档(4项·默认开启)', file: '17_cot_行动选项_一档.entry.json', comp: '17_cot_行动选项_一档.entry.json' },
  { comment: '[cot]行动选项·二档(6项·默认关闭)', file: '19_cot_行动选项_二档.entry.json', comp: '19_cot_行动选项_二档.entry.json' },
  { comment: '[cot]行动选项·三档(8项·默认关闭)', file: '20_cot_行动选项_三档.entry.json', comp: '20_cot_行动选项_三档.entry.json' },
  { comment: '[cot]行动选项·四档(10项·默认关闭)', file: '21_cot_行动选项_四档.entry.json', comp: '21_cot_行动选项_四档.entry.json' },
];

function sha256(buf) {
  return createHash('sha256').update(buf).digest('hex');
}

const card = JSON.parse(await fs.readFile(CARD_JSON, 'utf8'));
const entries = card.data?.character_book?.entries || [];
const byComment = Object.fromEntries(entries.map((item) => [item.comment, item]));

await fs.mkdir(OUT, { recursive: true });

const meta = [];
const files = [];
for (const item of ITEMS) {
  const entry = byComment[item.comment];
  if (!entry) throw new Error(`card missing: ${item.comment}`);
  const comp = JSON.parse(await fs.readFile(path.join(COMP_BUILD, item.comp), 'utf8'));
  if (entry.content !== comp.content) {
    throw new Error(`content mismatch vs components: ${item.comment}`);
  }
  const dest = path.join(OUT, item.file);
  try {
    const existing = JSON.parse(await fs.readFile(dest, 'utf8'));
    if (existing.content !== entry.content) {
      throw new Error(`refuse overwrite genericized ${item.file}; delete it first if you really want the 1.0.9 snapshot back`);
    }
  } catch (error) {
    if (error && error.code !== 'ENOENT') throw error;
  }
  await fs.copyFile(path.join(COMP_BUILD, item.comp), dest);
  const buf = await fs.readFile(dest);
  const copied = JSON.parse(buf.toString('utf8'));
  if (copied.content !== entry.content) throw new Error(`copy mutated content: ${item.comment}`);
  files.push({
    dest: `行动选项/sources/1.0.9/worldbook/${item.file}`,
    source: `怪谈笔记/components/worldbook_entries/build/${item.comp}`,
    sha256: sha256(buf),
    bytes: buf.length,
    matchSource: true,
    cardContentSha256: sha256(Buffer.from(entry.content, 'utf8')),
  });
  meta.push({
    id: copied.id,
    comment: copied.comment,
    enabled: copied.enabled,
    insertion_order: copied.insertion_order,
    contentBytes: Buffer.byteLength(copied.content || '', 'utf8'),
    contentSha256: sha256(Buffer.from(copied.content || '', 'utf8')),
  });
}

await fs.writeFile(
  path.join(destRoot, '行动选项', 'sources', '1.0.9', 'worldbook.meta.json'),
  `${JSON.stringify(meta, null, 2)}\n`,
  'utf8',
);

const provenancePath = path.join(destRoot, 'provenance.json');
const provenance = JSON.parse(await fs.readFile(provenancePath, 'utf8'));
if (!provenance.scope.includes('行动选项四条世界书')) provenance.scope.push('行动选项四条世界书');
provenance.excluded = (provenance.excluded || []).map((item) => (
  item === '世界观/角色/规则/cot 世界书' ? '世界观/角色/规则/其余 cot 世界书' : item
));
const existing = new Set((provenance.files || []).map((item) => item.dest));
for (const file of files) {
  if (!existing.has(file.dest)) provenance.files.push(file);
}
await fs.writeFile(provenancePath, `${JSON.stringify(provenance, null, 2)}\n`, 'utf8');

console.log(JSON.stringify({ out: '怪谈笔记/小手机通用化改造/行动选项/sources/1.0.9', files, meta }, null, 2));
