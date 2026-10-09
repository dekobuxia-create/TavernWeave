// 悬浮球组装：从星月 4.0.0 参考件机械提取核心段（点阵球/拖拽吸附/轮盘数学——已验收手感照抄），
// 裁掉星月耦合（问候气泡/npc/control/map 键/控制中心调用），对接通用桥（小手机事件 + __phBubble）。
import { promises as fs } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const REF = path.resolve(here, '../../星月悬浮球/sources/星月4.0.0/悬浮球与轮盘参考.js');
const OUT = path.resolve(here, '../悬浮球.js');
const ref = await fs.readFile(REF, 'utf8');

function cut(startAnchor, endAnchor, label) {
  const a = ref.indexOf(startAnchor);
  if (a < 0) throw new Error('段起点缺失: ' + label);
  const b = ref.indexOf(endAnchor, a + startAnchor.length);
  if (b < 0) throw new Error('段终点缺失: ' + label);
  return ref.slice(a, b);
}

/* ―― 提取段 ―― */
const segState = cut('  function loadSidebarState()', '  // ── 点阵球渲染器', '状态持久化+reducedMotion');
const segOrb = cut('  const XY_ORB_CFG', '  // ── 贴边深度', '点阵球渲染器');
const segDock = cut('  const ORB_SIZE = 56;', '  const BUBBLE_BUCKETS', '贴边深度/applyDockOffset');
const segStyleRaw = cut('  function ensureSidebarStyle(doc)', '\n  const RADIAL_BUTTONS', '悬浮球样式');
const segRadialMath = cut('  function calcRadialPositions', '  // ── 3.4.9：聊天上下文气泡头像管理器', '轮盘数学+closeSidebarMenu');
const segMenuRaw = cut('  function openSidebarMenu()', '/* ===== control-center.js 行 7937', '轮盘开合');
const segBall = cut('  function positionSidebarBall()', '\n/* ===== control-center.js 行 12218', '球定位+ensureSidebar');

/* ―― 样式段：删问候气泡样式行 ―― */
const segStyle = segStyleRaw
  .split('\n')
  .filter(l => !l.includes('xingyue-pet-bubble'))
  .join('\n');

/* ―― 轮盘开合：截到 act 分发结束（丢星月 HUD 承重墙注释后的内容），换 act 段 ―― */
const menuEnd = segMenuRaw.indexOf('  // ── HUD 顶层单例状态栏');
let segMenu = menuEnd > 0 ? segMenuRaw.slice(0, menuEnd) : segMenuRaw;
const actStart = segMenu.indexOf("        if (act === 'hud')");
const actEnd = segMenu.indexOf("        if (act === 'map')");
if (actStart < 0 || actEnd < 0) throw new Error('act 分发锚点缺失');
const actEndLine = segMenu.indexOf('\n', actEnd);
segMenu = segMenu.slice(0, actStart)
  + "        if (act === 'phone') actOpenPhone();\n"
  + "        if (act === 'avatar') actOpenBubbleManager();"
  + segMenu.slice(actEndLine);

/* ―― 球段：剥问候气泡引用行（showPetBubble/petBubbleBootTimer 调用），保守逐行滤 ―― */
const segBallClean = segBall
  .split('\n')
  .filter(l => !/showPetBubble|petBubbleBootTimer|petBubbleTimer|petBubbleHideTimer/.test(l))
  .join('\n');

/* ―― 骨架 + 拼装 ―― */
let body = `// 悬浮球（通用小手机包体 · 酒馆助手脚本）
// 职责：桌宠悬浮球（canvas 自由点阵球 · 拖拽吸附左右边 · 长按切收纳深度）+ 半轮盘菜单。
//   轮盘默认 2 键：「小手机」——向宿主与 #ph-statusbar-root 派发 ph-orb:open-phone 事件（小手机脚本接收）；
//               「气泡头像」——呼出头像气泡脚本的管理面板（__phBubble.openManager）。
//   两个目标脚本都可缺席：缺席时点击给出提示，球本身照常工作。
// 点阵球渲染 / 拖拽吸附 / 半轮盘数学照抄星月 4.0.0（3.4.6 沙盘拨定手感 + 3.4.9 灵动化，已验收资产），
// 已裁：星月问候气泡、TA的视角 / 控制中心 / 地图键。K1 铁律保留：一律 left/top 视口坐标（right/bottom 会被 ST 顶层 transform 劫持）。
(function () {
  'use strict';

  var helperWindow = window;
  var RUNTIME_KEY = '__phOrbRuntime';
  function resolveHostWindow() {
    var current = window;
    try {
      for (var i = 0; i < 4; i++) {
        if (!current.parent || current.parent === current) break;
        void current.parent.document.body;
        current = current.parent;
      }
    } catch (e) {}
    return current;
  }
  var _hostWindow = resolveHostWindow();
  function hostWindow() { return _hostWindow; }
  function hostDocument() { try { return _hostWindow.document; } catch (e) { return document; } }
  var previous = helperWindow[RUNTIME_KEY] || _hostWindow[RUNTIME_KEY];
  if (previous && typeof previous.destroy === 'function') {
    try { previous.destroy('replace'); } catch (e) {}
  }
  var runtime = { build: '0.1.0-work', destroyed: false, destroy: destroy };
  helperWindow[RUNTIME_KEY] = runtime;
  try { _hostWindow[RUNTIME_KEY] = runtime; } catch (e) {}

  function toast(kind, message) {
    try {
      var doc = hostDocument();
      var el = doc.createElement('div');
      el.textContent = String(message || '');
      el.style.cssText = 'position:fixed;left:50%;bottom:56px;transform:translateX(-50%);z-index:2147483610;'
        + 'padding:8px 16px;border-radius:6px;font-size:13px;color:#fff;max-width:78vw;'
        + 'background:' + (kind === 'error' ? 'rgba(160,40,50,.94)' : 'rgba(30,36,46,.94)') + ';'
        + 'border:1px solid rgba(255,255,255,.18);box-shadow:0 6px 20px rgba(0,0,0,.35)';
      (doc.body || doc.documentElement).appendChild(el);
      setTimeout(function () { try { el.remove(); } catch (e) {} }, 2200);
    } catch (e) {}
  }

  /* ―― 轮盘键行为（通用对接，两个目标脚本都可缺席降级） ―― */
  function actOpenPhone() {
    var doc = hostDocument();
    var root = doc.getElementById('ph-statusbar-root');
    try { hostWindow().dispatchEvent(new CustomEvent('ph-orb:open-phone')); } catch (e) {}
    if (root) {
      try { root.dispatchEvent(new CustomEvent('ph-orb:open-phone')); } catch (e) {}
      try { if (typeof root.__phRender === 'function') root.__phRender(); } catch (e) {}
      try {
        root.classList.add('ph-orb-ping');
        setTimeout(function () { try { root.classList.remove('ph-orb-ping'); } catch (e) {} }, 1400);
      } catch (e) {}
    } else {
      toast('error', '未检测到小手机（脚本未安装或尚未加载）');
    }
  }
  function actOpenBubbleManager() {
    var api = null;
    try { api = hostWindow().__phBubble || window.__phBubble || null; } catch (e) {}
    if (api && typeof api.openManager === 'function') api.openManager();
    else toast('error', '未检测到头像气泡脚本（未安装或尚未加载）');
  }

  /* ―― 以下核心段照抄星月 4.0.0（构建期机械提取，改 ph 前缀）―― */
  let sidebarBall = null;
  let petOrbRenderer = null;
  let petOrbDragRafCancel = null;
  let ensureSidebarRetryTimer = null;
  const disposers = []; // 事件解绑清单，destroy 时逐个调用（上游控制中心同名机制的本地版）
  const sidebarState = { side: 'right', top: 0.42, open: false, dockDepth: 'half', fx: 0.5, fy: 0.5, docked: false };
__SEG_STATE__
__SEG_ORB__
__SEG_DOCK__
__SEG_STYLE__
  const RADIAL_BUTTONS = [
    { id: 'phone', icon: '📱', label: '小手机' },
    { id: 'avatar', icon: '🖼️', label: '气泡头像' },
  ];
  const RADIAL_DIAGONAL_FALLBACK = false;
__SEG_RADIAL_MATH__
__SEG_MENU__
__SEG_BALL__

  function destroy(reason) {
    if (runtime.destroyed) return;
    runtime.destroyed = true;
    try { disposers.forEach(function (d) { try { d(); } catch (e) {} }); disposers.length = 0; } catch (e) {}
    try { closeSidebarMenu(); } catch (e) {}
    try { if (petOrbRenderer) { petOrbRenderer.destroy(); petOrbRenderer = null; } } catch (e) {}
    try { if (petOrbDragRafCancel) { petOrbDragRafCancel(); petOrbDragRafCancel = null; } } catch (e) {}
    try { if (ensureSidebarRetryTimer) { clearTimeout(ensureSidebarRetryTimer); ensureSidebarRetryTimer = null; } } catch (e) {}
    try { if (sidebarBall) { sidebarBall.remove(); sidebarBall = null; } } catch (e) {}
    try { var m = hostDocument().getElementById('ph-orb-menu'); if (m) m.remove(); } catch (e) {}
    try { var st = hostDocument().getElementById('ph-orb-style'); if (st) st.remove(); } catch (e) {}
    try { if (helperWindow[RUNTIME_KEY] === runtime) delete helperWindow[RUNTIME_KEY]; } catch (e) {}
    try { if (_hostWindow[RUNTIME_KEY] === runtime) delete _hostWindow[RUNTIME_KEY]; } catch (e) {}
  }

  ensureSidebar();
})();
`;

body = body
  .replace('__SEG_STATE__', segState.trimEnd())
  .replace('__SEG_ORB__', segOrb.trimEnd())
  .replace('__SEG_DOCK__', segDock.trimEnd())
  .replace('__SEG_STYLE__', segStyle.trimEnd())
  .replace('__SEG_RADIAL_MATH__', segRadialMath.trimEnd())
  .replace('__SEG_MENU__', segMenu.trimEnd())
  .replace('__SEG_BALL__', segBallClean.trimEnd());

/* ―― 全局前缀/文案替换 ―― */
const REPLACES = [
  [/xingyue-sidebar-ball/g, 'ph-orb-ball'],
  [/xingyue-sidebar-menu/g, 'ph-orb-menu'],
  [/xingyue-sidebar-style/g, 'ph-orb-style'],
  [/xingyue-sidebar-v291/g, 'ph-orb-state-v1'],
  [/data-xy-orb/g, 'data-ph-orb'],
  [/xy-orb-/g, 'ph-orb-'],
  [/XY_ORB_/g, 'PH_ORB_'],
  [/xyOrbHex/g, 'phOrbHex'],
  [/xyOrbLerp/g, 'phOrbLerp'],
  [/星月 · 桌宠球/g, '悬浮球'],
  [/『星月』/g, '悬浮球'],
];
for (const [re, to] of REPLACES) body = body.replace(re, to);

/* ―― 残留检查 ―― */
const codeOnly = body.split('\n').filter(l => !l.trim().startsWith('//') && !l.trim().startsWith('/*') && !l.trim().startsWith('*')).join('\n');
const leftovers = { xingyue: (codeOnly.match(/xingyue/gi) || []).length, 星月: (codeOnly.match(/星月/g) || []).length, xyOrb: (codeOnly.match(/xy[-_]?orb/gi) || []).length, petBubble: (codeOnly.match(/petBubble|showPetBubble/g) || []).length, oldActs: (codeOnly.match(/openStatusSurface|openNpcPopover|togglePanel/g) || []).length };
await fs.writeFile(OUT, body, 'utf8');
console.log(JSON.stringify({ out: '悬浮球/悬浮球.js', bytes: Buffer.byteLength(body), leftovers }, null, 2));
if (Object.values(leftovers).some(Boolean)) { console.error('leftovers remain'); process.exitCode = 1; }
