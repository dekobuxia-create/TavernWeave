// 悬浮球（通用小手机包体 · 酒馆助手脚本）
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
  function loadSidebarState() {
    try {
      const rawSaved = localStorage.getItem('ph-orb-state-v1');
      const s = JSON.parse(rawSaved || '{}');
      if (s.side === 'left' || s.side === 'right') sidebarState.side = s.side;
      if (typeof s.top === 'number') sidebarState.top = s.top;
      if (s.dockDepth === 'half' || s.dockDepth === 'hidden') sidebarState.dockDepth = s.dockDepth;
      if (typeof s.fx === 'number') sidebarState.fx = Math.min(1, Math.max(0, s.fx));
      if (typeof s.fy === 'number') sidebarState.fy = Math.min(1, Math.max(0, s.fy));
      if (typeof s.docked === 'boolean') sidebarState.docked = s.docked;
      else if (rawSaved) sidebarState.docked = true; // 3.3.0 旧档只有贴边模型 → 视为吸附态
    } catch (_) {}
  }
  function saveSidebarState() {
    try { localStorage.setItem('ph-orb-state-v1', JSON.stringify({ side: sidebarState.side, top: sidebarState.top, dockDepth: sidebarState.dockDepth, fx: sidebarState.fx, fy: sidebarState.fy, docked: sidebarState.docked })); } catch (_) {}
  }
  function orbReducedMotion() {
    try { const w = hostWindow(); return !!(w.matchMedia && w.matchMedia('(prefers-reduced-motion: reduce)').matches); } catch (_) { return false; }
  }
  const PH_ORB_CFG = { n: 46, linkDist: 33, speed: 0.3, glowIntensity: 1.08, tailRatio: 0.35, dragShear: 0.9, colorTokens: { particle: '#6bc7f2', bright: '#4be4ff', highlight: '#cdf3ff' }, radius: 56 };
  const PH_ORB_STATES = {
    'idle': { speedMul: 1.0, linkDistMul: 1.0, glowMul: 1.0 },
    'hover': { speedMul: 1.8, linkDistMul: 1.4, glowMul: 1.6 },
    'drag': { speedMul: 2.35, linkDistMul: 1.62, glowMul: 1.95 },
    'edge-left': { speedMul: 0.5, linkDistMul: 0.8, glowMul: 0.6 },
    'edge-right': { speedMul: 0.5, linkDistMul: 0.8, glowMul: 0.6 },
  };
  function phOrbHex(hex) { const m = /^#([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i.exec(hex); return m ? [parseInt(m[1], 16), parseInt(m[2], 16), parseInt(m[3], 16)] : [107, 199, 242]; }
  function phOrbLerp(a, b, t) { return a + (b - a) * t; }
  class PetOrbRenderer {
    constructor(canvas, options) {
      this._cfg = Object.assign({}, PH_ORB_CFG, options || {});
      this._canvas = canvas; this._ctx = canvas.getContext('2d');
      this._state = 'idle'; this._running = false; this._rafId = null;
      this._particles = []; this._lastTs = null; this._burstPhase = null;
      this._tailDrag = false; // ⑧c 数据史莱姆：拖动中=弹簧松（甩尾），松手=刚度加倍（加速追上归位）
      this._dragEnergy = 0; this._dragDX = 0; this._dragDY = 0;
      const w = hostWindow();
      this._raf = (w.requestAnimationFrame ? w.requestAnimationFrame.bind(w) : (cb => setTimeout(cb, 16)));
      this._caf = (w.cancelAnimationFrame ? w.cancelAnimationFrame.bind(w) : clearTimeout);
      this._initParticles();
    }
    start() { if (this._running) return; this._running = true; this._lastTs = null; this._tick = this._loop.bind(this); this._rafId = this._raf(this._tick); }
    stop() { this._running = false; if (this._rafId != null) { this._caf(this._rafId); this._rafId = null; } }
    renderOnce() { this._update(16); this._draw(); }
    setState(state) { if (PH_ORB_STATES[state]) this._state = state; }
    setTailDrag(on) {
      this._tailDrag = !!on;
      if (!on) this._dragEnergy = Math.max(this._dragEnergy, 0.32);
    }
    nudge(dx, dy) {
      // ⑧c：外壳直写跟手，滞后下沉到点阵——tail 粒子按各自 lag 反向甩出（CSS px→2x 物理 px），弹簧回中
      const mag = Math.sqrt(dx * dx + dy * dy);
      if (mag > 0.01) {
        const nx = dx / mag, ny = dy / mag;
        this._dragEnergy = Math.min(1, this._dragEnergy + mag / 30);
        this._dragDX = phOrbLerp(this._dragDX || 0, nx, 0.42);
        this._dragDY = phOrbLerp(this._dragDY || 0, ny, 0.42);
      }
      // 3.4.9-r37：拖动=部分点阵本身被惯性留在后方(靠点阵连线拉成拖影)，非给每个点加尾巴线。位移上限放到 2.4r 配合 240px 画布不裁；甩离幅度走 dragShear，速度踢随幅度缩放
      const cap = this._effectiveRadius() * 2.4;
      for (const p of this._particles) {
        const pull = p.tail ? p.lag : 0.10;
        const shear = p.tail ? this._cfg.dragShear : 0.22;
        p.sx = Math.max(-cap, Math.min(cap, p.sx - dx * 2 * pull * shear));
        p.sy = Math.max(-cap, Math.min(cap, p.sy - dy * 2 * pull * shear));
        if (p.tail) {
          const kick = 0.05 * (this._cfg.dragShear / 1.72);
          p.svx -= dx * kick * p.lag;
          p.svy -= dy * kick * p.lag;
        }
      }
    }
    playBurstOut(onDone) {
      this._burstPhase = { dir: 'out', progress: 0, onDone: onDone || null };
      const cx = this._canvas.width / 2, cy = this._canvas.height / 2;
      for (const p of this._particles) {
        const dx = (p.x - cx) || (Math.random() * 2 - 1), dy = (p.y - cy) || (Math.random() * 2 - 1);
        const len = Math.sqrt(dx * dx + dy * dy) || 1;
        p._burstVx = (dx / len) * 4; p._burstVy = (dy / len) * 4; p._burstAlpha = 1;
      }
    }
    playBurstIn(onDone) {
      this._burstPhase = { dir: 'in', progress: 0, onDone: onDone || null };
      const cx = this._canvas.width / 2, cy = this._canvas.height / 2, r = this._effectiveRadius();
      for (const p of this._particles) {
        const angle = Math.random() * Math.PI * 2;
        p._burstStartX = cx + Math.cos(angle) * r * 2.5; p._burstStartY = cy + Math.sin(angle) * r * 2.5; p._burstAlpha = 0;
      }
    }
    destroy() { this.stop(); this._particles = []; this._canvas = null; this._ctx = null; this._burstPhase = null; }
    _effectiveRadius() { return this._cfg.radius > 0 ? this._cfg.radius : Math.min(this._canvas.width, this._canvas.height) / 2; }
    _initParticles() {
      this._particles = [];
      const cx = this._canvas.width / 2, cy = this._canvas.height / 2, r = this._effectiveRadius();
      for (let i = 0; i < this._cfg.n; i++) {
        const angle = Math.random() * Math.PI * 2, dist = Math.sqrt(Math.random()) * r;
        // ⑧c：过半粒子参与拖尾（数据史莱姆），每粒随机刚度/阻尼/滞后系数（欠阻尼弹簧带个体抖动）
        this._particles.push({ x: cx + Math.cos(angle) * dist, y: cy + Math.sin(angle) * dist, vx: (Math.random() * 2 - 1) * this._cfg.speed, vy: (Math.random() * 2 - 1) * this._cfg.speed, blink: Math.random(), blinkSpeed: 0.3 + Math.random() * 0.5, isHighlight: Math.random() < 0.2, tail: Math.random() < this._cfg.tailRatio, sx: 0, sy: 0, svx: 0, svy: 0, springK: 0.045 + Math.random() * 0.04, springD: 0.87 + Math.random() * 0.08, lag: 0.32 + Math.random() * 0.58 });
      }
    }
    _loop(timestamp) {
      if (!this._running || !this._canvas || !this._ctx) return;
      const dt = this._lastTs == null ? 16 : Math.min(timestamp - this._lastTs, 50);
      this._lastTs = timestamp;
      this._update(dt); this._draw();
      this._rafId = this._raf(this._tick);
    }
    _update(dt) {
      const stateP = PH_ORB_STATES[this._state];
      const dtFrac = dt / 16;
      // 3.4.9：松手能量衰减 0.86→0.90，尾巴归位更绵长不戛然而止（更灵动）
      this._dragEnergy *= Math.pow(this._tailDrag ? 0.94 : 0.90, dtFrac);
      if (this._dragEnergy < 0.01) this._dragEnergy = 0;
      const speed = this._cfg.speed * stateP.speedMul * (1 + this._dragEnergy * 0.72);
      const cx = this._canvas.width / 2, cy = this._canvas.height / 2, r = this._effectiveRadius();
      for (const p of this._particles) {
        p.blink += p.blinkSpeed * dtFrac * 0.04; if (p.blink > 1) p.blink -= 1;
        if (p.tail && (p.sx || p.sy || p.svx || p.svy)) {
          // ⑧c 欠阻尼弹簧：拉回中心偏移。3.4.9-r37 再软化——松手刚度 x1.7→x1.5 回中更绵，
          // 松手阻尼略降(springD-0.03)让回中带轻微惯性过冲、更绵软丝滑；收敛后清零避免残余漂移。
          const k = p.springK * (this._tailDrag ? 0.62 : 1.5);
          const damp = Math.pow(this._tailDrag ? Math.min(0.985, p.springD + 0.045) : Math.max(0.82, p.springD - 0.03), dtFrac);
          p.svx = (p.svx - k * p.sx * dtFrac) * damp;
          p.svy = (p.svy - k * p.sy * dtFrac) * damp;
          p.sx += p.svx * dtFrac; p.sy += p.svy * dtFrac;
          if (Math.abs(p.sx) < 0.05 && Math.abs(p.svx) < 0.05) { p.sx = 0; p.svx = 0; }
          if (Math.abs(p.sy) < 0.05 && Math.abs(p.svy) < 0.05) { p.sy = 0; p.svy = 0; }
        }
        if (this._burstPhase) continue;
        const curSpeed = Math.sqrt(p.vx * p.vx + p.vy * p.vy) || speed;
        const scale = phOrbLerp(curSpeed, speed, 0.05) / (curSpeed || 1);
        p.vx *= scale; p.vy *= scale;
        p.x += p.vx * dtFrac; p.y += p.vy * dtFrac;
        const dx = p.x - cx, dy = p.y - cy, dist = Math.sqrt(dx * dx + dy * dy);
        if (dist > r - 1) {
          const nx = dx / dist, ny = dy / dist, dot = p.vx * nx + p.vy * ny;
          p.vx -= 2 * dot * nx; p.vy -= 2 * dot * ny;
          p.x = cx + nx * (r - 1.5); p.y = cy + ny * (r - 1.5);
        }
      }
      if (this._burstPhase) {
        this._burstPhase.progress += dtFrac * 0.04;
        const t = Math.min(this._burstPhase.progress, 1);
        if (this._burstPhase.dir === 'out') {
          for (const p of this._particles) { p.x += (p._burstVx || 0) * dtFrac; p.y += (p._burstVy || 0) * dtFrac; p._burstAlpha = Math.max(0, 1 - t * 1.4); }
        } else {
          for (const p of this._particles) { p.x = phOrbLerp(p._burstStartX, cx, t); p.y = phOrbLerp(p._burstStartY, cy, t); p._burstAlpha = t; }
        }
        if (t >= 1) {
          const done = this._burstPhase; this._burstPhase = null;
          if (done.dir === 'in') this._initParticles();
          if (done.onDone) try { done.onDone(); } catch (_) {}
        }
      }
    }
    _draw() {
      const canvas = this._canvas, ctx = this._ctx;
      const stateP = PH_ORB_STATES[this._state];
      const glow = this._cfg.glowIntensity * stateP.glowMul;
      // 3.4.9：绘制缩放系数改按粒子场半径（drawScale=2*r/56，等于旧 canvas.width/56 的值），
      // 与 canvas 缓冲尺寸解耦——canvas 放大给拖尾留空间时点/线尺寸不变、球视觉不变。
      const drawScale = (2 * this._effectiveRadius()) / 56;
      const linkD = this._cfg.linkDist * stateP.linkDistMul * drawScale;
      const tk = this._cfg.colorTokens;
      const [pr, pg, pb] = phOrbHex(tk.particle), [br2, bg2, bb2] = phOrbHex(tk.bright), [hr, hg, hb] = phOrbHex(tk.highlight);
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      const ps = this._particles, useBurst = this._burstPhase !== null;
      for (const p of ps) { p.rx = p.x + (p.sx || 0); p.ry = p.y + (p.sy || 0); } // ⑧c 渲染坐标=物理位置+弹簧偏移
      const breathPhase = (Date.now() % 3000) / 3000;
      const cx = canvas.width / 2, cy = canvas.height / 2, r = this._effectiveRadius();
      const dragE = Math.max(0, Math.min(1, this._dragEnergy || 0));
      ctx.save();
      ctx.globalAlpha = (0.06 + 0.04 * Math.sin(breathPhase * Math.PI * 2) + dragE * 0.1) * glow;
      if (dragE > 0.02 && (this._dragDX || this._dragDY)) {
        const angle = Math.atan2(this._dragDY || 0, this._dragDX || 1);
        ctx.translate(cx, cy);
        ctx.rotate(angle);
        ctx.scale(1 + dragE * 0.12, 1 - dragE * 0.05);
        ctx.translate(-cx, -cy);
      }
      const grad = ctx.createRadialGradient(cx, cy, r * 0.2, cx, cy, r);
      grad.addColorStop(0, 'rgba(' + br2 + ',' + bg2 + ',' + bb2 + ',0.3)'); grad.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.fillStyle = grad; ctx.beginPath(); ctx.arc(cx, cy, r, 0, Math.PI * 2); ctx.fill();
      ctx.restore();
      // 3.4.9-r37：删除错误的"拖尾线"绘制——数据史莱姆的甩尾=部分点阵本身被惯性留在后方(rx/ry 含 sx/sy 滞后偏移)+下方点阵连线自然拉成拖影，不再给每个点画尾巴线段。
      ctx.save();
      for (let i = 0; i < ps.length; i++) {
        for (let j = i + 1; j < ps.length; j++) {
          const dx = ps[i].rx - ps[j].rx, dy = ps[i].ry - ps[j].ry, dist = Math.sqrt(dx * dx + dy * dy);
          if (dist > linkD) continue;
          const alpha = (1 - dist / linkD) * 0.65;
          const lineAlpha = useBurst ? alpha * Math.min(ps[i]._burstAlpha ?? 1, ps[j]._burstAlpha ?? 1) : alpha;
          ctx.strokeStyle = 'rgba(' + pr + ',' + pg + ',' + pb + ',' + lineAlpha.toFixed(3) + ')';
          ctx.lineWidth = 0.8;
          ctx.beginPath(); ctx.moveTo(ps[i].rx, ps[i].ry); ctx.lineTo(ps[j].rx, ps[j].ry); ctx.stroke();
        }
      }
      ctx.restore();
      ctx.save();
      for (const p of ps) {
        const blinkVal = 0.55 + 0.45 * Math.sin(p.blink * Math.PI * 2);
        const isHl = p.isHighlight;
        const [r2, g2, b2] = isHl ? [hr, hg, hb] : [pr, pg, pb];
        const size = (isHl ? 2.4 : 1.6) * drawScale;
        let alpha = blinkVal * (isHl ? 1.0 : 0.75);
        if (useBurst) alpha *= (p._burstAlpha ?? 1);
        ctx.globalAlpha = Math.max(0, Math.min(1, alpha));
        if (isHl && glow > 0.3) {
          const gg = ctx.createRadialGradient(p.rx, p.ry, 0, p.rx, p.ry, size * 4);
          gg.addColorStop(0, 'rgba(' + br2 + ',' + bg2 + ',' + bb2 + ',' + (0.4 * glow).toFixed(3) + ')'); gg.addColorStop(1, 'rgba(0,0,0,0)');
          ctx.fillStyle = gg; ctx.beginPath(); ctx.arc(p.rx, p.ry, size * 4, 0, Math.PI * 2); ctx.fill();
        }
        ctx.fillStyle = 'rgb(' + r2 + ',' + g2 + ',' + b2 + ')';
        ctx.beginPath(); ctx.arc(p.rx, p.ry, size, 0, Math.PI * 2); ctx.fill();
      }
      ctx.restore();
    }
  }
  const ORB_SIZE = 56;
  // 过渡时长走 .dock-ease/.dock-out CSS 类（探出 320ms 轻回弹 / 缩回 240ms）；原 easeMs 配置从未接线，已删
  const DOCK_DEPTH_PRESETS = { half: { peek: 28 }, hidden: { peek: 10 } };
  const DOCK_SNAP_PX = 24; // 球缘距视口左右边小于此值才吸附
  // 统一 left/top 定位（K1：right/bottom 在 ST 顶层 transform 劫持下会落到长页底端，禁用）
  // ⑧a：写位置走 dock-ease 门控过渡（拖拽开始会摘掉这两个 class，直写 left 不再被过渡抢位）
  function applyDockOffset(peekOut) {
    if (!sidebarBall) return;
    const p = DOCK_DEPTH_PRESETS[sidebarState.dockDepth] || DOCK_DEPTH_PRESETS.half;
    const vw = hostWindow().innerWidth || 1200;
    const off = peekOut ? -4 : -(ORB_SIZE - p.peek);
    try { sidebarBall.classList.add('dock-ease'); sidebarBall.classList.toggle('dock-out', !!peekOut); } catch (_) {}
    sidebarBall.style.right = 'auto';
    sidebarBall.style.left = (sidebarState.side === 'left' ? off : vw - ORB_SIZE - off) + 'px';
  }
  // ── 时段气泡（time_bubble_logic 嵌入 + 已批 5 段文案·中性桌宠口吻）────────────
  function ensureSidebarStyle(doc) {
    if (doc.getElementById('ph-orb-style')) return;
    const css = [
      '#ph-orb-ball{position:fixed;z-index:2147483500;width:56px;height:56px;border-radius:50%;cursor:pointer;user-select:none;touch-action:none;background:transparent;transition:filter .2s;}',
      '#ph-orb-ball::before{content:"";position:absolute;inset:-22px;border-radius:50%;background:radial-gradient(circle,rgba(75,228,255,.16) 0%,rgba(75,228,255,.05) 45%,transparent 70%);pointer-events:none;opacity:.4;transition:opacity .25s;}',
      '#ph-orb-ball:hover{filter:brightness(1.15);}',
      '#ph-orb-ball:hover::before{opacity:.9;}',
      '#ph-orb-ball.dock-ease{transition:left .24s ease,top .24s ease,filter .2s;}',
      '#ph-orb-ball.dock-ease.dock-out{transition:left .32s cubic-bezier(.34,1.56,.64,1),top .32s cubic-bezier(.34,1.56,.64,1),filter .2s;}',
      '#ph-orb-ball canvas{position:absolute;left:50%;top:50%;transform:translate(-50%,-50%);width:240px;height:240px;pointer-events:none;}',
      '#ph-orb-menu{position:fixed;inset:0;z-index:2147483550;pointer-events:none;}',
      '.ph-orb-radial-btn{position:fixed;pointer-events:auto;display:flex;align-items:center;gap:6px;padding:7px 13px;background:linear-gradient(180deg,rgba(10,20,34,.96),rgba(5,9,18,.97));border:1px solid rgba(107,199,242,.42);border-radius:999px;color:#cfeaff;font:600 12px/1 -apple-system,"PingFang SC","Microsoft YaHei",sans-serif;letter-spacing:1px;box-shadow:0 6px 18px rgba(0,0,0,.5),0 0 10px rgba(75,228,255,.14);cursor:pointer;white-space:nowrap;transform:scale(.6);opacity:0;transition:transform .22s cubic-bezier(.34,1.56,.64,1),opacity .18s,border-color .15s,color .15s;z-index:2147483550;}',
      '.ph-orb-radial-btn.show{transform:scale(1);opacity:1;}',
      '.ph-orb-radial-btn:hover{border-color:rgba(75,228,255,.85);color:#eafaff;box-shadow:0 6px 20px rgba(0,0,0,.55),0 0 16px rgba(75,228,255,.35);}',
    ].join('');
    const style = doc.createElement('style');
    style.id = 'ph-orb-style';
    style.textContent = css;
    (doc.head || doc.body).appendChild(style);
  }

/* ===== control-center.js 行 6525-6578 · 半轮盘:键位定义+弧位数学+关闭 ===== */
  // ── 半轮盘（half_radial_menu 数学嵌入·⑧b 四向净空自适应·弧朝屏内·全键收在视口内）────────────
  const RADIAL_BUTTONS = [
    { id: 'phone', icon: '📱', label: '小手机' },
    { id: 'avatar', icon: '🖼️', label: '气泡头像' },
  ];
  const RADIAL_DIAGONAL_FALLBACK = false;
  function calcRadialPositions(center, vw, vh) {
    const mk = (btn, x, y) => ({ id: btn.id, icon: btn.icon, label: btn.label, x: Math.round(x), y: Math.round(y) });
    const hs = center.x < vw / 2 ? 1 : -1;  // 屏内水平方向（左半屏→向右展开）
    const vsn = center.y < vh / 2 ? 1 : -1; // 屏内垂直方向（上半屏→向下展开）
    if (RADIAL_DIAGONAL_FALLBACK) {
      return RADIAL_BUTTONS.map((btn, i) => mk(btn, center.x + hs * (64 + i * 12), center.y + vsn * (40 + i * 42)));
    }
    const rArc = 122;    // 3.4.9：5 键沿弧分布，半径从 108 加大到 122 避免相邻键堆叠（≥28/|cos75°| 仍满足不与球重叠）
    const rCorner = 168; // 角落 90° 扇形半径加大，5 键完整文字标签不堆叠
    const needH = rArc + 84, needV = rArc + 28; // 弧端点之外还要放下按钮标签（估 96 宽 / 30 高）
    const tightL = center.x < needH, tightR = vw - center.x < needH;
    const tightT = center.y < needV, tightB = vh - center.y < needV;
    const oh = (tightL && !tightR) ? 1 : ((tightR && !tightL) ? -1 : hs);  // 水平展开方向
    const ov = (tightT && !tightB) ? 1 : ((tightB && !tightT) ? -1 : vsn); // 垂直展开方向（1=向下）
    let startDeg, endDeg, rPx = rArc;
    if ((tightL || tightR) && (tightT || tightB)) {
      // 角落（两向净空都不足）→ 90° 扇形朝屏内对角展开 + 半径加大
      rPx = rCorner;
      if (oh === 1) { startDeg = 0; endDeg = ov === 1 ? -90 : 90; }
      else { startDeg = 180; endDeg = ov === 1 ? 270 : 90; }
    } else if (tightT || tightB) {
      // 靠顶→下半弧 / 靠底→上半弧（150°）
      if (ov === 1) { startDeg = -15; endDeg = -165; }
      else { startDeg = 15; endDeg = 165; }
    } else {
      // 默认：按球所在半屏出 150° 半弧（弧朝屏内，与 3.3.0 行为一致）
      if (oh === 1) { startDeg = 75; endDeg = -75; }
      else { startDeg = 105; endDeg = 255; }
    }
    return RADIAL_BUTTONS.map((btn, i) => {
      const t = RADIAL_BUTTONS.length > 1 ? i / (RADIAL_BUTTONS.length - 1) : 0;
      const angle = (startDeg + t * (endDeg - startDeg)) * (Math.PI / 180);
      return mk(btn, center.x + rPx * Math.cos(angle), center.y - rPx * Math.sin(angle));
    });
  }
  function closeSidebarMenu() {
    const m = hostDocument().getElementById('ph-orb-menu');
    if (m) m.remove();
    sidebarState.open = false;
    if (sidebarBall && !sidebarBall.matches(':hover')) {
      if (sidebarState.docked) { applyDockOffset(false); if (petOrbRenderer) petOrbRenderer.setState(sidebarState.side === 'left' ? 'edge-left' : 'edge-right'); }
      else if (petOrbRenderer) petOrbRenderer.setState('idle');
    }
  }

/* ===== control-center.js 行 6579-6734 · 聊天上下文气泡头像管理器(轮盘第5键) ===== */
  function openSidebarMenu() {
    const doc = hostDocument();
    ensureSidebarStyle(doc);
    closeSidebarMenu();
    if (sidebarState.docked) applyDockOffset(true); // 吸附态展开时球探出，轮盘围球布局
    const menu = doc.createElement('div');
    menu.id = 'ph-orb-menu';
    doc.body.appendChild(menu);
    const vw = hostWindow().innerWidth || 1200;
    const vh = hostWindow().innerHeight || 800;
    const r = sidebarBall.getBoundingClientRect();
    // 吸附态：圆心按探出后落点估算（探出动画进行中 rect 不准）；浮空态：球真实中心，四向净空自适应选弧
    const cx = sidebarState.docked
      ? (sidebarState.side === 'left' ? (ORB_SIZE / 2 - 4) : (vw - ORB_SIZE / 2 + 4))
      : (r.left + ORB_SIZE / 2);
    const cy = r.top + ORB_SIZE / 2;
    const positions = calcRadialPositions({ x: cx, y: cy }, vw, vh);
    positions.forEach((pos, i) => {
      const btn = doc.createElement('button');
      btn.type = 'button';
      btn.className = 'ph-orb-radial-btn';
      btn.setAttribute('data-ph-orb', pos.id);
      btn.innerHTML = '<span class="ph-orb-ic"></span><span class="ph-orb-lb"></span>';
      btn.querySelector('.ph-orb-ic').textContent = pos.icon;
      btn.querySelector('.ph-orb-lb').textContent = pos.label;
      menu.appendChild(btn);
      // 量宽一律 offsetWidth：出场 scale(.6) 动画期 getBoundingClientRect 会量小 40%（CDP 实锤坑）
      const bw = btn.offsetWidth || 96;
      const bh = btn.offsetHeight || 30;
      // K1 铁律：只用 left/top 视口坐标（right/bottom 会被 ST 顶层 transform 劫持到长页底端）
      const dxc = pos.x - cx;
      let bx;
      if (dxc > 12) bx = pos.x;            // 弧点在球右侧 → 左缘锚弧点，标签向右伸
      else if (dxc < -12) bx = pos.x - bw; // 弧点在球左侧 → 右缘锚弧点，标签向左伸
      else bx = pos.x - bw / 2;            // 近正上/正下 → 水平居中
      btn.style.left = Math.max(6, Math.min(vw - bw - 6, bx)) + 'px';
      btn.style.top = Math.max(8, Math.min(vh - bh - 8, pos.y - bh / 2)) + 'px';
      btn.style.transitionDelay = (i * 30) + 'ms';
      (hostWindow().requestAnimationFrame || requestAnimationFrame)(() => { try { btn.classList.add('show'); } catch (_) {} });
    });
    menu.addEventListener('click', (event) => {
      const act = event.target?.closest?.('[data-ph-orb]')?.getAttribute?.('data-ph-orb');
      if (!act) return;
      event.preventDefault(); event.stopPropagation();
      closeSidebarMenu();
      try {
        if (petOrbRenderer && !orbReducedMotion()) { petOrbRenderer.playBurstOut(() => { try { petOrbRenderer.playBurstIn(); } catch (_) {} }); }
        if (act === 'phone') actOpenPhone();
        if (act === 'avatar') actOpenBubbleManager();
      } catch (error) { toast('error', error.message || String(error)); }
    });
    sidebarState.open = true;
  }
  function positionSidebarBall() {
    if (!sidebarBall) return;
    const vw = hostWindow().innerWidth || 1200;
    const vh = hostWindow().innerHeight || 800;
    if (sidebarState.docked) {
      sidebarBall.style.top = Math.max(8, Math.min(vh - ORB_SIZE - 8, (sidebarState.top || 0.42) * vh)) + 'px';
      applyDockOffset(sidebarState.open);
      if (petOrbRenderer && !sidebarState.open) petOrbRenderer.setState(sidebarState.side === 'left' ? 'edge-left' : 'edge-right');
    } else {
      sidebarBall.style.right = 'auto';
      sidebarBall.style.left = Math.max(4, Math.min(vw - ORB_SIZE - 4, sidebarState.fx * vw - ORB_SIZE / 2)) + 'px';
      sidebarBall.style.top = Math.max(4, Math.min(vh - ORB_SIZE - 4, sidebarState.fy * vh - ORB_SIZE / 2)) + 'px';
      if (petOrbRenderer && !sidebarState.open) petOrbRenderer.setState('idle');
    }
  }
  function ensureSidebar() {
    const doc = hostDocument();
    ensureSidebarStyle(doc);
    if (sidebarBall && sidebarBall.isConnected) { positionSidebarBall(); return; }
    sidebarBall = doc.createElement('div');
    sidebarBall.id = 'ph-orb-ball';
    sidebarBall.title = '悬浮球（点击展开功能轮盘 · 拖动吸附左右边 · 长按切换收纳深度）';
    const canvas = doc.createElement('canvas');
    canvas.width = 480; canvas.height = 480; // 3.4.9-r37：2x 物理分辨率(240px CSS)，远大于 56px 球，四周留足空间让被甩离的点阵不被裁
    sidebarBall.appendChild(canvas);
    doc.body.appendChild(sidebarBall);
    try { petOrbRenderer?.destroy(); } catch (_) {}
    petOrbRenderer = new PetOrbRenderer(canvas);
    if (orbReducedMotion()) petOrbRenderer.renderOnce(); else petOrbRenderer.start();
    petOrbRenderer.setState(sidebarState.side === 'left' ? 'edge-left' : 'edge-right');
    // hover 通电 + 吸附态探头滑出（浮空态只通电）
    sidebarBall.addEventListener('mouseenter', () => { if (petOrbRenderer) petOrbRenderer.setState('hover'); if (sidebarState.docked) applyDockOffset(true); });
    sidebarBall.addEventListener('mouseleave', () => {
      if (sidebarState.open) return; // 轮盘开着保持现状
      if (petOrbRenderer) petOrbRenderer.setState(sidebarState.docked ? (sidebarState.side === 'left' ? 'edge-left' : 'edge-right') : 'idle');
      if (sidebarState.docked) applyDockOffset(false);
    });
    // 拖拽（⑧c 主体直写跟手·容器级 rAF lerp 已删·滞后甩尾下沉到点阵 tail 粒子=数据史莱姆）
    // + 单击开轮盘 + 吸附态长按切收纳深度
    let dragging = false, moved = false, startX = 0, startY = 0, holdTimer = null, holdFired = false;
    let dragBaseL = 0, dragBaseT = 0, dragLastL = 0, dragLastT = 0, dragCX = 0, dragCY = 0;
    const hw = () => hostWindow();
    function settleAfterDrag() {
      const vw = hw().innerWidth || 1200, vh = hw().innerHeight || 800;
      const edgeDist = Math.min(dragCX - ORB_SIZE / 2, vw - dragCX - ORB_SIZE / 2);
      // top 与 fy 有意保持同步 = 上次拖停的 Y（吸附态用 top、浮空态用 fy，模式切换不跳变）
      sidebarState.top = Math.min(1, Math.max(0, dragCY / vh));
      sidebarState.fy = sidebarState.top;
      if (edgeDist < DOCK_SNAP_PX) {
        sidebarState.docked = true; // 靠边才吸附（总监拍板）
        sidebarState.side = dragCX < vw / 2 ? 'left' : 'right';
      } else {
        sidebarState.docked = false;
        sidebarState.fx = Math.min(1, Math.max(0, dragCX / vw));
      }
      saveSidebarState();
      // ⑧a：松手挂回 dock-ease 门控（拖拽期已摘）→ 吸附/归位走 240ms 平滑过渡
      try { sidebarBall.classList.add('dock-ease'); sidebarBall.classList.remove('dock-out'); } catch (_) {}
      positionSidebarBall();
    }
    sidebarBall.addEventListener('pointerdown', (e) => {
      dragging = true; moved = false; holdFired = false;
      startX = e.clientX; startY = e.clientY;
      const r = sidebarBall.getBoundingClientRect();
      dragBaseL = r.left; dragBaseT = r.top;
      dragCX = r.left + ORB_SIZE / 2; dragCY = r.top + ORB_SIZE / 2;
      try { sidebarBall.setPointerCapture(e.pointerId); } catch (_) {}
      clearTimeout(holdTimer);
      if (sidebarState.docked) { // 长按切档只在吸附态有意义
        holdTimer = setTimeout(() => {
          if (moved) return;
          holdFired = true;
          const next = sidebarState.dockDepth === 'half' ? 'hidden' : 'half';
          sidebarState.dockDepth = next;
          saveSidebarState();
          applyDockOffset(true);
          toast('info', next === 'hidden' ? '桌宠球已切换为「收纳」（贴边只露一道边）' : '桌宠球已切换为「半隐」');
        }, 600);
      }
    });
    sidebarBall.addEventListener('pointermove', (e) => {
      if (!dragging) return;
      if (!moved && (Math.abs(e.clientX - startX) > 4 || Math.abs(e.clientY - startY) > 4)) {
        moved = true; clearTimeout(holdTimer);
        // ⑧a 拖拽开始：先把球冻结在当前动画位置，再摘 dock-ease/dock-out（根治过渡动画与直写 left 抢位竞态）
        const fr = sidebarBall.getBoundingClientRect();
        sidebarBall.style.right = 'auto';
        sidebarBall.style.left = fr.left + 'px';
        sidebarBall.style.top = fr.top + 'px';
        try { sidebarBall.classList.remove('dock-ease'); sidebarBall.classList.remove('dock-out'); } catch (_) {}
        dragBaseL = fr.left; dragBaseT = fr.top;
        dragLastL = fr.left; dragLastT = fr.top;
        startX = e.clientX; startY = e.clientY;
        if (petOrbRenderer) { petOrbRenderer.setState('drag'); if (!orbReducedMotion()) petOrbRenderer.setTailDrag(true); }
      }
      if (!moved) return;
      // ⑧c：主体直写跟手，位移增量喂给点阵 tail 粒子做甩尾（reduced-motion 下不喂）
      const nl = dragBaseL + (e.clientX - startX);
      const nt = dragBaseT + (e.clientY - startY);
      sidebarBall.style.left = nl + 'px';
      sidebarBall.style.top = nt + 'px';
      if (petOrbRenderer && !orbReducedMotion()) petOrbRenderer.nudge(nl - dragLastL, nt - dragLastT);
      dragLastL = nl; dragLastT = nt;
      dragCX = nl + ORB_SIZE / 2; dragCY = nt + ORB_SIZE / 2;
    });
    sidebarBall.addEventListener('pointerup', (e) => {
      if (!dragging) return;
      dragging = false;
      clearTimeout(holdTimer);
      try { sidebarBall.releasePointerCapture(e.pointerId); } catch (_) {}
      try { petOrbRenderer?.setTailDrag(false); } catch (_) {} // 松手弹簧刚度加倍，粒子加速追上归位
      if (!moved && !holdFired) { if (sidebarState.open) closeSidebarMenu(); else openSidebarMenu(); return; }
      if (moved) settleAfterDrag(); // 直写跟手无滞后 → 松手即结算吸附判定
    });
    // pointercancel（iOS 下拉刷新/系统手势中断触摸会发）：不清 holdTimer 会 600ms 后误切收纳档
    sidebarBall.addEventListener('pointercancel', (e) => {
      dragging = false; moved = false;
      clearTimeout(holdTimer);
      try { sidebarBall.releasePointerCapture(e.pointerId); } catch (_) {}
      try { petOrbRenderer?.setTailDrag(false); } catch (_) {}
      try { sidebarBall.classList.add('dock-ease'); sidebarBall.classList.remove('dock-out'); } catch (_) {}
      positionSidebarBall();
    });
    petOrbDragRafCancel = () => { dragging = false; moved = false; try { clearTimeout(holdTimer); } catch (_) {} try { petOrbRenderer?.setTailDrag(false); } catch (_) {} };
    // 点空白处收轮盘（挂宿主文档，destroy 经 disposers 解绑）
    const onDocClick = (event) => { if (sidebarState.open && !event.target?.closest?.('#ph-orb-ball,#ph-orb-menu')) closeSidebarMenu(); };
    doc.addEventListener('click', onDocClick);
    disposers.push(() => { try { doc.removeEventListener('click', onDocClick); } catch (_) {} });
    // 时段气泡：开机 8s 后首查，此后每 10 分钟巡检跨桶（节流规则在 shouldShowBubble 内）
    positionSidebarBall();
  }
  // NPC 视角浮窗（从控制中心挪出，复用 .xy-cc-pop 视觉）

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
