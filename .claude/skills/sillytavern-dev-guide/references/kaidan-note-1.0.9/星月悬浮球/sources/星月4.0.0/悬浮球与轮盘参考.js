/* ===== control-center.js 行 6171-6524 · 桌宠悬浮球:状态持久化+点阵球渲染(canvas)+吸附+问候气泡+样式 ===== */
  let sidebarBall = null;
  let petOrbRenderer = null;
  let petBubbleTimer = null;
  let petBubbleHideTimer = null;
  let petBubbleBootTimer = null;
  let petOrbDragRafCancel = null;
  let ensureSidebarRetryTimer = null; // 启动 1.5s 重试 timer——destroy 必清,否则切卡窗口期球被重建（审查 minor）
  // 3.3.1 自由浮动模型（总监拍板）：初始=页面中心、全屏拖放、靠边(<24px)才吸附贴边；fx/fy=视口比例坐标
  const sidebarState = { side: 'right', top: 0.42, open: false, dockDepth: 'half', fx: 0.5, fy: 0.5, docked: false };
  function loadSidebarState() {
    try {
      const rawSaved = localStorage.getItem('xingyue-sidebar-v291');
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
    try { localStorage.setItem('xingyue-sidebar-v291', JSON.stringify({ side: sidebarState.side, top: sidebarState.top, dockDepth: sidebarState.dockDepth, fx: sidebarState.fx, fy: sidebarState.fy, docked: sidebarState.docked })); } catch (_) {}
  }
  function orbReducedMotion() {
    try { const w = hostWindow(); return !!(w.matchMedia && w.matchMedia('(prefers-reduced-motion: reduce)').matches); } catch (_) { return false; }
  }
  // ── 点阵球渲染器（pet_orb_renderer 定稿参数嵌入版·D2 密·数据网 · 单色淡蓝）────────────
  // 与原型差异：修「burst-in 完成后粒子不重散布」bug（原型把 _burstPhase 置 null 后再读它判 dir，恒 false）；加 renderOnce() 供 reduced-motion 静态帧。
  // 3.4.9：拖尾灵动感调优——tailRatio 0.58→0.70（更多粒子参与甩尾）、dragShear 1.28→1.72（甩尾幅度更明显）
  // 3.4.9：radius 0→56（固定粒子场半径=56 buffer=28 CSS，球视觉仍 56px）；canvas 缓冲放大到 200（下方 ensureSidebarBall），
  // 粒子场不再填满 canvas，四周留出空间让拖尾甩出球外不被裁。
  const XY_ORB_CFG = { n: 46, linkDist: 33, speed: 0.3, glowIntensity: 1.08, tailRatio: 0.35, dragShear: 0.9, colorTokens: { particle: '#6bc7f2', bright: '#4be4ff', highlight: '#cdf3ff' }, radius: 56 };
  const XY_ORB_STATES = {
    'idle': { speedMul: 1.0, linkDistMul: 1.0, glowMul: 1.0 },
    'hover': { speedMul: 1.8, linkDistMul: 1.4, glowMul: 1.6 },
    'drag': { speedMul: 2.35, linkDistMul: 1.62, glowMul: 1.95 },
    'edge-left': { speedMul: 0.5, linkDistMul: 0.8, glowMul: 0.6 },
    'edge-right': { speedMul: 0.5, linkDistMul: 0.8, glowMul: 0.6 },
  };
  function xyOrbHex(hex) { const m = /^#([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i.exec(hex); return m ? [parseInt(m[1], 16), parseInt(m[2], 16), parseInt(m[3], 16)] : [107, 199, 242]; }
  function xyOrbLerp(a, b, t) { return a + (b - a) * t; }
  class PetOrbRenderer {
    constructor(canvas, options) {
      this._cfg = Object.assign({}, XY_ORB_CFG, options || {});
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
    setState(state) { if (XY_ORB_STATES[state]) this._state = state; }
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
        this._dragDX = xyOrbLerp(this._dragDX || 0, nx, 0.42);
        this._dragDY = xyOrbLerp(this._dragDY || 0, ny, 0.42);
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
      const stateP = XY_ORB_STATES[this._state];
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
        const scale = xyOrbLerp(curSpeed, speed, 0.05) / (curSpeed || 1);
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
          for (const p of this._particles) { p.x = xyOrbLerp(p._burstStartX, cx, t); p.y = xyOrbLerp(p._burstStartY, cy, t); p._burstAlpha = t; }
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
      const stateP = XY_ORB_STATES[this._state];
      const glow = this._cfg.glowIntensity * stateP.glowMul;
      // 3.4.9：绘制缩放系数改按粒子场半径（drawScale=2*r/56，等于旧 canvas.width/56 的值），
      // 与 canvas 缓冲尺寸解耦——canvas 放大给拖尾留空间时点/线尺寸不变、球视觉不变。
      const drawScale = (2 * this._effectiveRadius()) / 56;
      const linkD = this._cfg.linkDist * stateP.linkDistMul * drawScale;
      const tk = this._cfg.colorTokens;
      const [pr, pg, pb] = xyOrbHex(tk.particle), [br2, bg2, bb2] = xyOrbHex(tk.bright), [hr, hg, hb] = xyOrbHex(tk.highlight);
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
  // ── 贴边深度（dock_depth_presets 嵌入·绝对像素偏移·绕 transform 劫持）────────────
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
  const BUBBLE_BUCKETS = { morning: [5, 10], noon: [11, 13], afternoon: [14, 17], evening: [18, 22], night: [23, 4] };
  const BUBBLE_TEXTS = {
    morning: '早安，今天也要元气满满哦。',
    noon: '中午了，记得好好吃饭呀。',
    afternoon: '下午的阳光正好，要不要歇口气？',
    evening: '天色暗下来了，今天过得还顺利吗？',
    night: '夜深了，别熬太晚，早点休息。',
  };
  const BUBBLE_STORAGE_KEY = 'xingyue-pet-bubble-v1';
  function getTimeBucket() {
    const h = new Date().getHours();
    for (const [bucket, [start, end]] of Object.entries(BUBBLE_BUCKETS)) {
      if (start <= end) { if (h >= start && h <= end) return bucket; }
      else if (h >= start || h <= end) return bucket;
    }
    return 'night';
  }
  function readBubbleRecord() {
    try { return Object.assign({ lastBucket: null, lastShownAt: null, muteUntil: null }, JSON.parse(localStorage.getItem(BUBBLE_STORAGE_KEY) || '{}')); } catch (_) { return { lastBucket: null, lastShownAt: null, muteUntil: null }; }
  }
  function shouldShowBubble(bucket) {
    if (orbReducedMotion()) return false;
    const rec = readBubbleRecord(), now = Date.now();
    if (rec.muteUntil && now < rec.muteUntil) return false;               // 显式静音中
    if (rec.lastBucket === bucket && rec.lastShownAt && (now - rec.lastShownAt) < 2 * 60 * 60 * 1000) return false; // 同桶 2h 窗口内只弹一次
    if (rec.lastShownAt && (now - rec.lastShownAt) < 30 * 60 * 1000) return false; // 最小间隔 30min
    return true;
  }
  function recordBubbleShown(bucket, extra) {
    try { localStorage.setItem(BUBBLE_STORAGE_KEY, JSON.stringify(Object.assign(readBubbleRecord(), { lastBucket: bucket, lastShownAt: Date.now() }, extra || {}))); } catch (_) {}
  }
  function showPetBubble() {
    const bucket = getTimeBucket();
    if (!shouldShowBubble(bucket) || !sidebarBall || !sidebarBall.isConnected) return;
    const doc = hostDocument();
    doc.getElementById('xingyue-pet-bubble')?.remove();
    const el = doc.createElement('div');
    el.id = 'xingyue-pet-bubble';
    el.className = sidebarState.docked ? ('dock-' + (sidebarState.side === 'left' ? 'left' : 'right')) : 'float';
    el.innerHTML = '<span class="xy-pb-text"></span><button type="button" class="xy-pb-mute" title="今天不再提示">✕</button>';
    el.querySelector('.xy-pb-text').textContent = BUBBLE_TEXTS[bucket] || '';
    doc.body.appendChild(el);
    const r = sidebarBall.getBoundingClientRect();
    const vw = hostWindow().innerWidth || 1200;
    const vh = hostWindow().innerHeight || 800;
    if (sidebarState.docked) {
      // 吸附版：从屏幕边缘横向弹出、尾巴指回球（蓝图 S4'）；全走 left/top 视口坐标——
      // fixed 的 right/bottom 会被 ST 顶层 transform 劫持到长页底端（K1 铁律，2026-07 真机实锤 reroll 气泡）。
      el.style.top = Math.max(8, Math.min(vh - 60, r.top - 6)) + 'px';
      const bw = el.getBoundingClientRect().width || 200; // 元素已挂载可量宽
      if (sidebarState.side === 'left') el.style.left = (ORB_SIZE + 10) + 'px';
      else el.style.left = Math.max(8, vw - (ORB_SIZE + 10) - bw) + 'px';
      el.style.right = 'auto';
    } else {
      // 浮空版：头顶冒、尾巴朝下（蓝图 S4；元素已挂载可量宽高）
      const br = el.getBoundingClientRect();
      el.style.left = Math.max(8, Math.min(vw - (br.width || 180) - 8, r.left + ORB_SIZE / 2 - (br.width || 180) / 2)) + 'px';
      el.style.top = Math.max(8, r.top - (br.height || 44) - 14) + 'px';
      el.style.right = 'auto';
    }
    (hostWindow().requestAnimationFrame || requestAnimationFrame)(() => { try { el.classList.add('show'); } catch (_) {} });
    if (petBubbleHideTimer) clearTimeout(petBubbleHideTimer);
    petBubbleHideTimer = setTimeout(() => { try { el.classList.remove('show'); setTimeout(() => el.remove(), 300); } catch (_) {} }, 7000);
    el.querySelector('.xy-pb-mute').addEventListener('click', (e) => {
      e.preventDefault(); e.stopPropagation();
      clearTimeout(petBubbleHideTimer);
      recordBubbleShown(bucket, { muteUntil: Date.now() + 24 * 60 * 60 * 1000 });
      el.remove();
    });
    recordBubbleShown(bucket);
  }
  // ── 样式 ────────────────────────────────────────────────────────────────
  function ensureSidebarStyle(doc) {
    if (doc.getElementById('xingyue-sidebar-style')) return;
    const css = [
      '#xingyue-sidebar-ball{position:fixed;z-index:2147483500;width:56px;height:56px;border-radius:50%;cursor:pointer;user-select:none;touch-action:none;background:transparent;transition:filter .2s;}',
      '#xingyue-sidebar-ball::before{content:"";position:absolute;inset:-22px;border-radius:50%;background:radial-gradient(circle,rgba(75,228,255,.16) 0%,rgba(75,228,255,.05) 45%,transparent 70%);pointer-events:none;opacity:.4;transition:opacity .25s;}',
      '#xingyue-sidebar-ball:hover{filter:brightness(1.15);}',
      '#xingyue-sidebar-ball:hover::before{opacity:.9;}',
      '#xingyue-sidebar-ball.dock-ease{transition:left .24s ease,top .24s ease,filter .2s;}',
      '#xingyue-sidebar-ball.dock-ease.dock-out{transition:left .32s cubic-bezier(.34,1.56,.64,1),top .32s cubic-bezier(.34,1.56,.64,1),filter .2s;}',
      '#xingyue-sidebar-ball canvas{position:absolute;left:50%;top:50%;transform:translate(-50%,-50%);width:240px;height:240px;pointer-events:none;}',
      '#xingyue-sidebar-menu{position:fixed;inset:0;z-index:2147483550;pointer-events:none;}',
      '.xy-orb-radial-btn{position:fixed;pointer-events:auto;display:flex;align-items:center;gap:6px;padding:7px 13px;background:linear-gradient(180deg,rgba(10,20,34,.96),rgba(5,9,18,.97));border:1px solid rgba(107,199,242,.42);border-radius:999px;color:#cfeaff;font:600 12px/1 -apple-system,"PingFang SC","Microsoft YaHei",sans-serif;letter-spacing:1px;box-shadow:0 6px 18px rgba(0,0,0,.5),0 0 10px rgba(75,228,255,.14);cursor:pointer;white-space:nowrap;transform:scale(.6);opacity:0;transition:transform .22s cubic-bezier(.34,1.56,.64,1),opacity .18s,border-color .15s,color .15s;z-index:2147483550;}',
      '.xy-orb-radial-btn.show{transform:scale(1);opacity:1;}',
      '.xy-orb-radial-btn:hover{border-color:rgba(75,228,255,.85);color:#eafaff;box-shadow:0 6px 20px rgba(0,0,0,.55),0 0 16px rgba(75,228,255,.35);}',
      '#xingyue-pet-bubble{position:fixed;z-index:2147483560;max-width:230px;padding:9px 12px;background:linear-gradient(180deg,rgba(10,20,34,.97),rgba(5,9,18,.97));border:1px solid rgba(107,199,242,.45);border-radius:11px;color:#dcf2ff;font:12px/1.6 -apple-system,"PingFang SC","Microsoft YaHei",sans-serif;box-shadow:0 8px 24px rgba(0,0,0,.5),0 0 12px rgba(75,228,255,.18);display:flex;align-items:flex-start;gap:8px;opacity:0;transition:opacity .3s,transform .3s;}',
      '#xingyue-pet-bubble.dock-right{transform:translateX(14px);}',
      '#xingyue-pet-bubble.dock-left{transform:translateX(-14px);}',
      '#xingyue-pet-bubble.show{opacity:1;transform:translateX(0);}',
      '#xingyue-pet-bubble.dock-right::after{content:"";position:absolute;right:-6px;top:18px;border:6px solid transparent;border-right:none;border-left-color:rgba(107,199,242,.45);}',
      '#xingyue-pet-bubble.dock-left::after{content:"";position:absolute;left:-6px;top:18px;border:6px solid transparent;border-left:none;border-right-color:rgba(107,199,242,.45);}',
      '#xingyue-pet-bubble.float{transform:translateY(8px);}',
      '#xingyue-pet-bubble.float.show{transform:translateY(0);}',
      '#xingyue-pet-bubble.float::after{content:"";position:absolute;left:50%;bottom:-6px;margin-left:-6px;border:6px solid transparent;border-bottom:none;border-top-color:rgba(107,199,242,.45);}',
      '#xingyue-pet-bubble .xy-pb-mute{flex:0 0 auto;background:transparent;border:none;color:#6f9daf;cursor:pointer;font-size:11px;padding:0 2px;line-height:1.4;}',
      '#xingyue-pet-bubble .xy-pb-mute:hover{color:#cfeaff;}',
      '@media (prefers-reduced-motion: reduce){#xingyue-sidebar-ball,.xy-orb-radial-btn,#xingyue-pet-bubble{transition:none !important;}}',
    ].join('');
    const style = doc.createElement('style');
    style.id = 'xingyue-sidebar-style';
    style.textContent = css;
    (doc.head || doc.body).appendChild(style);
  }

/* ===== control-center.js 行 6525-6578 · 半轮盘:键位定义+弧位数学+关闭 ===== */
  // ── 半轮盘（half_radial_menu 数学嵌入·⑧b 四向净空自适应·弧朝屏内·全键收在视口内）────────────
  const RADIAL_BUTTONS = [
    { id: 'hud', icon: '📊', label: '状态栏' },
    { id: 'npc', icon: '👁', label: 'TA的视角' },
    { id: 'control', icon: '⚙️', label: '控制中心' },
    { id: 'avatar', icon: '🖼️', label: '气泡头像' },
    { id: 'map', icon: '🗺️', label: '地图' },
  ];
  // 紧急回退开关：true=弃扇形，改「对角斜列」布局（自适应扇形若在某真机布局翻车，切这个保底）
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
    const m = hostDocument().getElementById('xingyue-sidebar-menu');
    if (m) m.remove();
    sidebarState.open = false;
    if (sidebarBall && !sidebarBall.matches(':hover')) {
      if (sidebarState.docked) { applyDockOffset(false); if (petOrbRenderer) petOrbRenderer.setState(sidebarState.side === 'left' ? 'edge-left' : 'edge-right'); }
      else if (petOrbRenderer) petOrbRenderer.setState('idle');
    }
  }

/* ===== control-center.js 行 6579-6734 · 聊天上下文气泡头像管理器(轮盘第5键) ===== */
  // ── 3.4.9：聊天上下文气泡头像管理器（轮盘第5键）──────────────────
  // 复用 collectDialogSpeakers/avatarManagerThumb（查顶层聊天 DOM，函数声明提升可跨段调用），
  // 在 host 文档建独立 modal，不依赖开局页 DOM；导入/换绑/清除/手动添加名字后 force 重渲气泡即时生效。
  function ensureHudAvatarMgrStyle(doc) {
    if (!doc || doc.getElementById('xingyue-hud-avatar-mgr-style')) return;
    const style = doc.createElement('style');
    style.id = 'xingyue-hud-avatar-mgr-style';
    style.textContent = [
      // 3.4.9：overlay 用 left/top:0 + JS 显式设视口宽高（inset:0 在 ST 顶层 transform 下会塌成 32px 高→panel 跑屏外）；panel 用 calc(100%-…) 相对 overlay 硬边界防溢出
      '#xingyue-hud-avatar-mgr{position:fixed;left:0;top:0;width:100vw;height:100dvh;z-index:2147483600;display:grid;place-items:center;background:rgba(4,8,12,.62);backdrop-filter:blur(3px);padding:16px;box-sizing:border-box;font-family:-apple-system,"PingFang SC","Microsoft YaHei",sans-serif}',
      '#xingyue-hud-avatar-mgr .xy-ham-panel{width:min(460px,calc(100% - 32px));max-width:calc(100% - 32px);max-height:calc(100% - 32px);overflow:auto;background:linear-gradient(180deg,#141d29,#0c1119);border:1px solid rgba(75,228,255,.28);border-radius:14px;box-shadow:0 24px 70px rgba(0,0,0,.55);color:#eafaff;padding:16px;box-sizing:border-box}',
      '#xingyue-hud-avatar-mgr .xy-ham-head{display:flex;align-items:center;justify-content:space-between;gap:10px;margin-bottom:6px}',
      '#xingyue-hud-avatar-mgr .xy-ham-head strong{font-size:15px;color:#9fe9ff}',
      '#xingyue-hud-avatar-mgr button{cursor:pointer}',
      '#xingyue-hud-avatar-mgr .xy-ham-close{min-height:34px;padding:6px 14px;border-radius:8px;border:1px solid rgba(75,228,255,.35);background:transparent;color:#cdeffb}',
      '#xingyue-hud-avatar-mgr .xy-ham-note{font-size:12px;line-height:1.7;color:rgba(190,225,240,.8);margin:0 0 10px}',
      '#xingyue-hud-avatar-mgr .xy-ham-add{display:flex;gap:8px;margin-bottom:10px}',
      '#xingyue-hud-avatar-mgr .xy-ham-add input{flex:1 1 auto;min-width:0;min-height:40px;padding:8px 10px;border-radius:8px;border:1px solid rgba(75,228,255,.3);background:rgba(7,14,20,.8);color:#eafaff;box-sizing:border-box}',
      '#xingyue-hud-avatar-mgr .xy-ham-addbtn{flex:0 0 auto;min-height:40px;padding:8px 14px;border-radius:8px;border:1px solid rgba(75,228,255,.45);background:rgba(75,228,255,.14);color:#eafaff}',
      '#xingyue-hud-avatar-mgr .xy-ham-row{display:flex;align-items:center;gap:10px;padding:8px 10px;border:1px solid rgba(75,228,255,.2);border-radius:10px;margin-top:8px;background:rgba(10,18,26,.6)}',
      '#xingyue-hud-avatar-mgr .xy-ham-thumb{width:44px;height:44px;flex:0 0 auto;border-radius:10px;object-fit:cover;background:rgba(75,228,255,.1);border:1px solid rgba(75,228,255,.3)}',
      '#xingyue-hud-avatar-mgr .xy-ham-rowname{flex:1 1 auto;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font-size:13px}',
      '#xingyue-hud-avatar-mgr .xy-ham-rowname small{display:block;color:rgba(150,200,220,.75);font-size:11px}',
      '#xingyue-hud-avatar-mgr .xy-ham-row button{min-height:34px;padding:6px 10px;border-radius:8px;border:1px solid rgba(75,228,255,.35);background:transparent;color:#cdeffb;flex:0 0 auto}',
      '#xingyue-hud-avatar-mgr .xy-ham-empty{font-size:12px;color:rgba(180,210,225,.7);padding:10px 2px}',
    ].join('');
    (doc.head || doc.documentElement).appendChild(style);
  }
  // 3.4.9：HUD 段自含采集/缩略图，不跨闭包依赖开局段的 collectDialogSpeakers/avatarManagerThumb（那些闭包 root，HUD 段不可达会 ReferenceError）。
  function hudCollectSpeakers() {
    const doc = hostDocument();
    const names = new Map();
    names.set('{{user}}', { kind: 'user' });
    const userAliases = new Set(['user', 'player', '{{user}}', '玩家', '主角']);
    try {
      doc.querySelectorAll('[data-xy-dialog-speaker]').forEach(node => {
        const raw = String(node.getAttribute('data-xy-dialog-speaker') || '').trim();
        if (raw && !userAliases.has(raw.toLowerCase()) && !userAliases.has(raw)) names.set(raw, { kind: 'npc' });
      });
      doc.querySelectorAll('.xy-dialog-speaker, .custom-xy-dialog-speaker').forEach(node => {
        const raw = String(node.textContent || '').trim();
        if (raw && raw !== '{{user}}' && !names.has(raw)) names.set(raw, { kind: 'npc' });
      });
    } catch (_) {}
    try {
      (mediaLibrary()?.listManagedAssets?.() || []).forEach(item => {
        if (item?.type === 'bond' && item?.slot === 'avatar' && item.name && item.name !== '{{user}}' && !names.has(item.name)) names.set(item.name, { kind: 'npc' });
      });
    } catch (_) {}
    return [...names.entries()].map(([name, info]) => ({ name, ...info }));
  }
  function hudAvatarThumb(name) {
    try {
      const lib = mediaLibrary();
      const exact = lib?.getExactAsset?.({ type: 'bond', slot: 'avatar', name, variant: 'normal' });
      if (exact) return exact.dataUrl || exact.url || exact.src || '';
      const loose = lib?.getAsset?.({ type: 'bond', slot: 'avatar', name, variant: 'normal' });
      return loose?.dataUrl || loose?.url || loose?.src || '';
    } catch (_) { return ''; }
  }
  // 3.4.9：HUD 段可达的 CC api getter——controlCenter() 在 bindOpeningPage 闭包内、HUD 段调它会 ReferenceError。
  function hudControlCenterApi() {
    try { return window.XingyueControlCenter || hostWindow().XingyueControlCenter || null; } catch (_) { return null; }
  }
  function renderHudAvatarManagerList() {
    const list = hostDocument().querySelector('#xingyue-hud-avatar-mgr .xy-ham-list');
    if (!list) return;
    let speakers = [];
    try { speakers = hudCollectSpeakers(); } catch (_) { speakers = [{ name: '{{user}}', kind: 'user' }]; }
    list.innerHTML = speakers.map(item => {
      const isUser = item.kind === 'user';
      const src = isUser ? (hudControlCenterApi()?.resolvePlayerAvatarSrc?.('') || hudAvatarThumb(item.name)) : hudAvatarThumb(item.name);
      const hint = isUser ? '玩家气泡兜底头像' : (src ? '已绑定' : '未绑定 · 气泡显示占位头像');
      return '<div class="xy-ham-row">'
        + (src ? '<img class="xy-ham-thumb" src="' + escapeHtml(src) + '" alt="">' : '<span class="xy-ham-thumb"></span>')
        + '<span class="xy-ham-rowname">' + escapeHtml(item.name) + '<small>' + escapeHtml(hint) + '</small></span>'
        + '<button type="button" data-xy-ham-import data-name="' + escapeHtml(item.name) + '">' + (src ? '换头像' : '导入头像') + '</button>'
        + (src && !isUser ? '<button type="button" data-xy-ham-clear data-name="' + escapeHtml(item.name) + '">清除</button>' : '')
        + '</div>';
    }).join('') || '<div class="xy-ham-empty">当前聊天还没有出现对话气泡；可以先在上方手动添加名字。</div>';
  }
  function hudRefreshDialogBubbles() {
    try { mediaLibrary()?.renderDialogBubbles?.({ force: true }); } catch (_) {}
  }
  // 3.4.9：显式把 overlay 尺寸钉到真实视口（绕 ST 顶层 transform 对 fixed inset:0 的高度塌缩劫持）
  let hudAvatarMgrResizeHandler = null;
  function sizeHudAvatarMgrOverlay() {
    const overlay = hostDocument().getElementById('xingyue-hud-avatar-mgr');
    if (!overlay) return;
    const win = hostWindow();
    const vv = win.visualViewport;
    const vw = Math.round(vv?.width || win.innerWidth || 360);
    const vh = Math.round(vv?.height || win.innerHeight || 640);
    overlay.style.width = vw + 'px';
    overlay.style.height = vh + 'px';
  }
  function closeHudAvatarManager() {
    try { hostDocument().getElementById('xingyue-hud-avatar-mgr')?.remove(); } catch (_) {}
    if (hudAvatarMgrResizeHandler) {
      try { const win = hostWindow(); win.removeEventListener('resize', hudAvatarMgrResizeHandler); win.visualViewport?.removeEventListener?.('resize', hudAvatarMgrResizeHandler); win.removeEventListener('orientationchange', hudAvatarMgrResizeHandler); } catch (_) {}
      hudAvatarMgrResizeHandler = null;
    }
  }
  async function hudAvatarManagerImport(name) {
    const lib = mediaLibrary();
    if (!lib?.requestLocalImport) { toast('error', '媒体库导入 API 未就绪'); return; }
    const clean = String(name || '').trim();
    if (!clean) { toast('error', '请先输入角色名（要与气泡显示名完全一致）'); return; }
    try {
      const item = await lib.requestLocalImport({ type: 'bond', name: clean, slot: 'avatar', variant: 'normal' });
      if (item && item.key) {
        hudRefreshDialogBubbles();
        renderHudAvatarManagerList();
        toast('success', '已给「' + clean + '」绑定气泡头像，聊天中立即生效');
      }
    } catch (error) { toast('error', error.message || String(error)); }
  }
  function openHudAvatarManager() {
    const doc = hostDocument();
    ensureHudAvatarMgrStyle(doc);
    closeHudAvatarManager();
    const overlay = doc.createElement('div');
    overlay.id = 'xingyue-hud-avatar-mgr';
    overlay.innerHTML = '<div class="xy-ham-panel" role="dialog" aria-modal="true" aria-label="气泡头像管理">'
      + '<div class="xy-ham-head"><strong>气泡头像管理</strong><button type="button" class="xy-ham-close">关闭</button></div>'
      + '<p class="xy-ham-note">对话气泡按「说话者名字」自动取头像。给名字绑定头像后，聊天里该角色的气泡立即换新头像；名字要与气泡显示名完全一致。</p>'
      + '<div class="xy-ham-add"><input type="text" class="xy-ham-name" placeholder="输入角色名（与气泡显示名一致）"><button type="button" class="xy-ham-addbtn">添加名字</button></div>'
      + '<div class="xy-ham-list"></div></div>';
    (doc.body || doc.documentElement).appendChild(overlay);
    sizeHudAvatarMgrOverlay(); // 3.4.9：钉视口尺寸→panel 正中且不超边界
    const win = hostWindow();
    hudAvatarMgrResizeHandler = () => sizeHudAvatarMgrOverlay();
    try { win.addEventListener('resize', hudAvatarMgrResizeHandler, { passive: true }); win.visualViewport?.addEventListener?.('resize', hudAvatarMgrResizeHandler, { passive: true }); win.addEventListener('orientationchange', hudAvatarMgrResizeHandler, { passive: true }); } catch (_) {}
    renderHudAvatarManagerList();
    overlay.addEventListener('click', event => {
      const t = event.target;
      if (t === overlay || t.closest?.('.xy-ham-close')) { closeHudAvatarManager(); return; }
      const importBtn = t.closest?.('[data-xy-ham-import]');
      if (importBtn) { void hudAvatarManagerImport(importBtn.dataset.name); return; }
      const clearBtn = t.closest?.('[data-xy-ham-clear]');
      if (clearBtn) {
        const name = String(clearBtn.dataset.name || '').trim();
        try { mediaLibrary()?.removeAsset?.({ type: 'bond', name, slot: 'avatar', variant: 'normal' }); } catch (_) {}
        hudRefreshDialogBubbles();
        renderHudAvatarManagerList();
        toast('success', '已清除「' + name + '」的气泡头像');
        return;
      }
      if (t.closest?.('.xy-ham-addbtn')) {
        const input = overlay.querySelector('.xy-ham-name');
        const name = String(input?.value || '').trim();
        if (!name) { toast('error', '请先输入角色名'); return; }
        void hudAvatarManagerImport(name).then(() => { if (input) input.value = ''; });
      }
    });
  }

/* ===== control-center.js 行 6735-6794 · 轮盘开合+act分发 ===== */
  function openSidebarMenu() {
    const doc = hostDocument();
    ensureSidebarStyle(doc);
    closeSidebarMenu();
    if (sidebarState.docked) applyDockOffset(true); // 吸附态展开时球探出，轮盘围球布局
    const menu = doc.createElement('div');
    menu.id = 'xingyue-sidebar-menu';
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
      btn.className = 'xy-orb-radial-btn';
      btn.setAttribute('data-xy-orb', pos.id);
      btn.innerHTML = '<span class="xy-orb-ic"></span><span class="xy-orb-lb"></span>';
      btn.querySelector('.xy-orb-ic').textContent = pos.icon;
      btn.querySelector('.xy-orb-lb').textContent = pos.label;
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
      const act = event.target?.closest?.('[data-xy-orb]')?.getAttribute?.('data-xy-orb');
      if (!act) return;
      event.preventDefault(); event.stopPropagation();
      closeSidebarMenu();
      try {
        if (petOrbRenderer && !orbReducedMotion()) { petOrbRenderer.playBurstOut(() => { try { petOrbRenderer.playBurstIn(); } catch (_) {} }); }
        if (act === 'hud') openStatusSurface();
        if (act === 'npc') openNpcPopover(); // 居中由 deworkshop patchNpcView 在派生层统一处理
        if (act === 'control') togglePanel(true);
        if (act === 'avatar') openHudAvatarManager(); // 3.4.9：轮盘第5键——聊天上下文气泡头像管理器
        if (act === 'map') toast('info', '地图系统建设中，敬请期待');
      } catch (error) { toast('error', error.message || String(error)); }
    });
    sidebarState.open = true;
  }
  // ── HUD 顶层单例状态栏（P-C-0 承重墙）────────────────────────────────
  // 真身 status-bar.html 从 git runtime 拉取(双源回退)，srcdoc iframe 挂进顶层居中面板(绝对像素·绕 transform 劫持)。
  // 桥：CC 先在顶层窗口放 __XY_HUD_BRIDGE 函数包(函数与文档无关可跨窗)，srcdoc 内同步引导脚本在**解析期**
  // 取包装桥(与 3.2.0 已证变量桥同模式、无 load 竞态)；getVariables 走 Mvu+最新楼强取(N4 数据源切 latest)。

/* ===== control-center.js 行 7937-8072 · 球定位+ensureSidebar(拖拽/长按/单击/收合) ===== */
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
    sidebarBall.id = 'xingyue-sidebar-ball';
    sidebarBall.title = '星月 · 桌宠球（点击展开功能轮盘 · 拖动吸附左右边 · 长按切换收纳深度）';
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
    const onDocClick = (event) => { if (sidebarState.open && !event.target?.closest?.('#xingyue-sidebar-ball,#xingyue-sidebar-menu')) closeSidebarMenu(); };
    doc.addEventListener('click', onDocClick);
    disposers.push(() => { try { doc.removeEventListener('click', onDocClick); } catch (_) {} });
    // 时段气泡：开机 8s 后首查，此后每 10 分钟巡检跨桶（节流规则在 shouldShowBubble 内）
    if (petBubbleTimer) { clearInterval(petBubbleTimer); petBubbleTimer = null; }
    if (petBubbleBootTimer) { clearTimeout(petBubbleBootTimer); petBubbleBootTimer = null; }
    petBubbleBootTimer = setTimeout(() => { try { showPetBubble(); } catch (_) {} }, 8000);
    petBubbleTimer = setInterval(() => { try { showPetBubble(); } catch (_) {} }, 10 * 60 * 1000);
    positionSidebarBall();
  }
  // NPC 视角浮窗（从控制中心挪出，复用 .xy-cc-pop 视觉）

/* ===== control-center.js 行 12218-12248 · destroy 清理段 ===== */
    try { hostDocument().getElementById('xy-reroll-bubble')?.remove(); } catch (_) {}
    try { hostDocument().getElementById('xy-reroll-bubble-style')?.remove(); } catch (_) {}
    try { hostDocument().getElementById('xingyue-npc-pop')?.remove(); } catch (_) {}
    try { if (window.XingyueControlCenter === api) delete window.XingyueControlCenter; } catch (_) {}
    try { if (window.CrossedZoneControlCenter === api) delete window.CrossedZoneControlCenter; } catch (_) {}
    try { const host = hostWindow(); if (host && host !== window) { if (host.XingyueControlCenter === api) delete host.XingyueControlCenter; if (host.CrossedZoneControlCenter === api) delete host.CrossedZoneControlCenter; } } catch (_) {}
    // 桌宠悬浮球 N3 补全：球/轮盘/样式/气泡/渲染器 rAF/巡检 timer 全清理（防切卡重载残留与泄漏）
    try { hostDocument().getElementById('xingyue-sidebar-ball')?.remove(); } catch (_) {}
    sidebarBall = null;
    try { hostDocument().getElementById('xingyue-sidebar-menu')?.remove(); } catch (_) {}
    sidebarState.open = false;
    try { hostDocument().getElementById('xingyue-sidebar-style')?.remove(); } catch (_) {}
    try { hostDocument().getElementById('xingyue-pet-bubble')?.remove(); } catch (_) {}
    // 3.4.9：轮盘第5键气泡头像管理器 modal + 样式清理
    try { hostDocument().getElementById('xingyue-hud-avatar-mgr')?.remove(); } catch (_) {}
    try { hostDocument().getElementById('xingyue-hud-avatar-mgr-style')?.remove(); } catch (_) {}
    try { petOrbRenderer?.destroy(); } catch (_) {}
    petOrbRenderer = null;
    if (petBubbleTimer) { clearInterval(petBubbleTimer); petBubbleTimer = null; }
    if (petBubbleHideTimer) { clearTimeout(petBubbleHideTimer); petBubbleHideTimer = null; }
    if (petBubbleBootTimer) { clearTimeout(petBubbleBootTimer); petBubbleBootTimer = null; }
    if (ensureSidebarRetryTimer) { clearTimeout(ensureSidebarRetryTimer); ensureSidebarRetryTimer = null; }
    if (statusHudViewportTimer) { clearTimeout(statusHudViewportTimer); statusHudViewportTimer = null; }
    try { petOrbDragRafCancel?.(); } catch (_) {}
    petOrbDragRafCancel = null;
    // HUD 顶层单例面板 / 抽屉清理：面板/样式/Blob URL/顶层桥
    destroyStatusHudHost();
    // 小手机双模态清理
    destroyPhoneHudHost();
    const targets = [window];
    try { const host = hostWindow(); if (host && !targets.includes(host)) targets.push(host); } catch (_) {}
