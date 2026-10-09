// 头像气泡（通用小手机包体 · 酒馆助手脚本）
// 职责：对话气泡渲染器 + 四套可切换皮肤 + 「头像气泡管理」面板（头像绑定 / 皮肤切换）。
//   ① 渲染：把正则产出的占位 span（[data-ph-dialog-render] / [data-ph-cot-dialog-render]）画成带头像的对话气泡；
//   ② 皮肤：内置 PERSONA / 霜镜 / 鎏金档案 / 墨线分镜 四套（气泡校准台拨定），玩家本地切换（localStorage），
//      制卡者改 DEFAULT_SKIN 定默认；
//   ③ 管理：轮盘/桥呼出「头像气泡管理」——按说话者名绑定头像（存媒体库脚本名下的共享媒体仓）+ 皮肤切换。
// 依赖（都可缺席降级）：媒体库脚本（__phMedia 桥；不在则头像全用占位剪影）；配套正则两条 + 世界书 cot 条目见同目录。
// 渲染器与管理器改造自星月 4.0.0（media_library.js renderDialog 系 / control-center.js 气泡头像管理器），
// 已知坑保留：ST custom- 前缀兼容、textarea 首渲缓存、无常驻 MutationObserver（定时兜底+事件驱动）。
(function () {
  'use strict';

  var helperWindow = window;
  var hostWindow = resolveHostWindow();
  var RUNTIME_KEY = '__phAvatarBubbleRuntime';
  var previous = helperWindow[RUNTIME_KEY] || hostWindow[RUNTIME_KEY];
  if (previous && typeof previous.destroy === 'function') {
    try { previous.destroy('replace'); } catch (e) {}
  }
  var runtime = { build: '0.1.0-work', destroyed: false, disposers: [], timers: [], destroy: destroy };
  helperWindow[RUNTIME_KEY] = runtime;
  try { hostWindow[RUNTIME_KEY] = runtime; } catch (e) {}

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
  function hostDocument() { try { return hostWindow.document; } catch (e) { return document; } }
  function n(v) { var x = Number(v); return isFinite(x) ? x : 0; }
  function escapeHtml(text) {
    return String(text == null ? '' : text)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  }
  var decodeArea = null;
  function decodeAttr(raw, doc) {
    var value = String(raw == null ? '' : raw);
    if (value.indexOf('&') < 0) return value;
    try {
      if (!decodeArea) decodeArea = (doc || hostDocument()).createElement('textarea');
      decodeArea.innerHTML = value;
      return decodeArea.value;
    } catch (e) { return value; }
  }

  /* ―― 迷你 toast ―― */
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

  /* ================= 媒体仓（经媒体库脚本 __phMedia 桥；格式与小手机 HUD 完全同款） ================= */
  var MEDIA_MAX_DATA = 4 * 1024 * 1024, MEDIA_MAX_LOCAL = 2800 * 1024;
  function mediaBridge() {
    try {
      var w = window;
      for (var i = 0; i < 4; i++) {
        var api = w.__phMedia;
        if (api && typeof api.read === 'function' && typeof api.write === 'function') return api;
        if (w.parent === w) break;
        w = w.parent;
      }
    } catch (e) {}
    return null;
  }
  function normalizeMediaMeta(meta) {
    meta = meta && typeof meta === 'object' ? meta : {};
    var name = String(meta.name || '').trim(), slot = String(meta.slot || ''), variant = String(meta.variant || 'normal');
    if (!name || (slot !== 'avatar' && slot !== 'portrait')) return null;
    if (slot === 'avatar') variant = 'normal';
    if (['normal', 'nude', 'aftermath'].indexOf(variant) < 0) variant = 'normal';
    return { name: name.slice(0, 80), slot: slot, variant: variant };
  }
  function mediaAssetKey(meta) { var m = normalizeMediaMeta(meta); return m ? [encodeURIComponent(m.name), m.slot, m.variant].join('|') : ''; }
  function normalizeMediaAsset(raw, key) {
    if (!raw || typeof raw !== 'object') return null;
    var meta = normalizeMediaMeta(raw), dataUrl = String(raw.dataUrl || ''), url = String(raw.url || '');
    if (!meta || (!dataUrl && !url)) return null;
    return { key: mediaAssetKey(meta) || String(key || ''), name: meta.name, slot: meta.slot, variant: meta.variant, dataUrl: dataUrl, url: url, mime: String(raw.mime || ((dataUrl.match(/^data:([^;,]+)/) || [])[1]) || 'external/url').slice(0, 80), bytes: Math.max(0, n(raw.bytes)), updatedAt: Math.max(0, n(raw.updatedAt)) || Date.now() };
  }
  function normalizeMediaLibrary(value) {
    value = value && typeof value === 'object' ? value : {};
    var source = value.assets && typeof value.assets === 'object' ? value.assets : {}, assets = {};
    Object.keys(source).forEach(function (key) { var item = normalizeMediaAsset(source[key], key); if (item) assets[item.key] = item; });
    return { version: 1, type: 'ph-media-library', assets: assets };
  }
  function readMediaLibrary() {
    var api = mediaBridge();
    if (!api) return normalizeMediaLibrary({});
    try { return normalizeMediaLibrary(api.read()); } catch (e) { return normalizeMediaLibrary({}); }
  }
  function writeMediaLibrary(library) {
    var api = mediaBridge();
    if (!api) throw new Error('媒体库脚本未安装（头像存取需要它）');
    return normalizeMediaLibrary(api.write(normalizeMediaLibrary(library)));
  }
  function mediaExact(meta) {
    var key = mediaAssetKey(meta), item = key && readMediaLibrary().assets[key];
    return item ? { key: item.key, name: item.name, slot: item.slot, variant: item.variant, src: item.dataUrl || item.url || '' } : null;
  }
  function mediaUpsert(meta, source) {
    var m = normalizeMediaMeta(meta);
    if (!m) throw new Error('媒体目标无效');
    source = source && typeof source === 'object' ? source : {};
    var dataUrl = String(source.dataUrl || ''), url = String(source.url || '');
    if (!dataUrl && !url) throw new Error('媒体资源为空');
    if (dataUrl && (!/^data:image\/(?:png|jpe?g|webp|gif);base64,/i.test(dataUrl) || dataUrl.length > MEDIA_MAX_DATA)) throw new Error('图片数据无效或超过 4MB');
    if (url && !/^https?:\/\//i.test(url)) throw new Error('只接受 http(s) 图片 URL');
    var library = readMediaLibrary(), key = mediaAssetKey(m);
    library.assets[key] = { key: key, name: m.name, slot: m.slot, variant: m.variant, dataUrl: dataUrl, url: url, mime: String(source.mime || ((dataUrl.match(/^data:([^;,]+)/) || [])[1]) || 'external/url'), bytes: Math.max(0, n(source.bytes)), updatedAt: Date.now() };
    var verify = writeMediaLibrary(library).assets[key];
    if (!verify || String(verify.dataUrl || '') !== dataUrl || String(verify.url || '') !== url) throw new Error('媒体保存后校验失败，请减小图片或改用外链 URL');
    return mediaExact(m);
  }
  function mediaRemove(meta) {
    var key = mediaAssetKey(meta);
    if (!key) return;
    var library = readMediaLibrary();
    if (library.assets[key]) { delete library.assets[key]; writeMediaLibrary(library); }
  }
  function mediaImportLocal(meta) {
    return new Promise(function (resolve, reject) {
      var doc = hostDocument();
      var input = doc.createElement('input'), settled = false;
      function finish(fn, arg) { if (settled) return; settled = true; try { input.remove(); } catch (e) {} fn(arg); }
      input.type = 'file';
      input.accept = 'image/png,image/jpeg,image/webp,image/gif';
      input.style.display = 'none';
      (doc.body || doc.documentElement).appendChild(input);
      input.onchange = function () {
        var file = input.files && input.files[0];
        if (!file) { finish(resolve, null); return; }
        if (!/^image\/(?:png|jpe?g|webp|gif)$/i.test(file.type || '') || file.size > MEDIA_MAX_LOCAL) { finish(reject, new Error('请选择不超过 2.8MB 的 PNG/JPG/WebP/GIF')); return; }
        var reader = new hostWindow.FileReader();
        reader.onload = function () {
          try { finish(resolve, mediaUpsert(meta, { dataUrl: String(reader.result || ''), mime: file.type, bytes: file.size })); }
          catch (error) { finish(reject, error); }
        };
        reader.onerror = function () { finish(reject, new Error('图片读取失败')); };
        reader.readAsDataURL(file);
      };
      input.oncancel = function () { finish(resolve, null); };
      input.click();
    });
  }

  /* ================= 皮肤（气泡校准台拨定的四套；构建时注入） ================= */
  var SKINS = {"glass":{"label":"霜镜","css":"/* 气泡样式 · 霜镜 · 气泡校准台 v4（TW 生态动效混合） */\n@keyframes phGlIn{from{opacity:0;transform:translateY(9px) scale(.985)}to{opacity:1;transform:none}}\n.ph-dialog-bubble-wrap{animation:phGlIn .36s cubic-bezier(.16,1,.3,1) both}\n@keyframes phGlRing{0%,100%{transform:scale(1);opacity:.5}50%{transform:scale(1.12);opacity:.12}}\n@keyframes phGlPulse{0%,100%{opacity:1;transform:scale(1)}50%{opacity:.55;transform:scale(.8)}}\n.ph-dialog-avatar::after{content:\"\";position:absolute;inset:-4px;border-radius:50%;border:1.5px solid;animation:phGlRing 3s ease-in-out infinite}\n.ph-dialog-bubble-wrap{display:flex;gap:2px;align-items:flex-start;margin:11px 0;max-width:100%}\n.ph-dialog-bubble-wrap.ph-dialog-user{flex-direction:row-reverse}\n.ph-dialog-avatar{position:relative;z-index:1;width:46px;height:46px;flex:0 0 46px;border-radius:50%;background:rgba(10,16,24,.6);padding:3px;margin-top:2px}\n.ph-dialog-avatar img{width:100%;height:100%;object-fit:cover;display:block;border-radius:50%;border:1.5px solid}\n.ph-dialog-npc .ph-dialog-avatar{margin-right:-14px}\n.ph-dialog-user .ph-dialog-avatar{margin-left:-14px}\n.ph-dialog-body{min-width:0;max-width:min(84ch,calc(100% - 56px))}\n.ph-dialog-speaker{display:flex;align-items:center;gap:6px;margin:0 0 4px 28px;font-size:11px;font-weight:500;letter-spacing:1.5px;color:rgba(235,245,255,.92)}\n.ph-dialog-user .ph-dialog-speaker{flex-direction:row-reverse;margin-left:0;margin-right:28px}\n.ph-dialog-speaker::before{content:\"\";width:5px;height:5px;flex:0 0 5px;border-radius:50%}\n.ph-dialog-text{background:rgba(255,255,255,0.07);backdrop-filter:blur(14px) saturate(1.5);-webkit-backdrop-filter:blur(14px) saturate(1.5);border:1px solid rgba(255,255,255,.16);border-radius:29px 18px 18px 18px;padding:10px 15px 11px 29px;font-size:12px;color:rgba(240,248,255,.97);line-height:1.75;white-space:pre-wrap;word-break:break-word}\n.ph-dialog-user .ph-dialog-text{background:rgba(255,214,243,0.060000000000000005);border-radius:18px 29px 18px 18px;padding:10px 29px 11px 15px}\n.ph-dialog-npc .ph-dialog-avatar img{border-color:rgba(127,201,255,.65)}\n.ph-dialog-npc .ph-dialog-avatar{box-shadow:0 0 0 3px rgba(127,201,255,.14),0 6px 18px rgba(127,201,255,.22)}\n.ph-dialog-npc .ph-dialog-avatar::after{border-color:rgba(127,201,255,.55)}\n.ph-dialog-npc .ph-dialog-speaker::before{background:#7fc9ff;box-shadow:0 0 9px rgba(127,201,255,.9),0 0 2px rgba(127,201,255,1);animation:phGlPulse 2.6s ease-in-out infinite}\n.ph-dialog-npc .ph-dialog-text{box-shadow:inset 0 1px 0 rgba(255,255,255,.22),inset 0 0 0 1px rgba(127,201,255,.1),0 10px 30px rgba(0,0,0,.28)}\n.ph-dialog-user .ph-dialog-avatar img{border-color:rgba(255,161,224,.65)}\n.ph-dialog-user .ph-dialog-avatar{box-shadow:0 0 0 3px rgba(255,161,224,.14),0 6px 18px rgba(255,161,224,.22)}\n.ph-dialog-user .ph-dialog-avatar::after{border-color:rgba(255,161,224,.55)}\n.ph-dialog-user .ph-dialog-speaker::before{background:#ffa1e0;box-shadow:0 0 9px rgba(255,161,224,.9),0 0 2px rgba(255,161,224,1);animation:phGlPulse 2.6s ease-in-out infinite 1.1s}\n.ph-dialog-user .ph-dialog-text{box-shadow:inset 0 1px 0 rgba(255,255,255,.22),inset 0 0 0 1px rgba(255,161,224,.1),0 10px 30px rgba(0,0,0,.28)}\n.ph-dialog-narration{margin:9px 2px;color:rgba(226,240,248,.85);line-height:1.75;white-space:pre-wrap;word-break:break-word}\n@media(max-width:640px){.ph-dialog-avatar{width:40px;height:40px;flex-basis:40px}.ph-dialog-text{padding-top:9px;padding-bottom:10px}}\n@media(prefers-reduced-motion:reduce){.ph-dialog-bubble-wrap,.ph-dialog-bubble-wrap *,.ph-dialog-bubble-wrap *::before,.ph-dialog-bubble-wrap *::after{animation:none!important}}\n"},"gilt":{"label":"鎏金档案","css":"/* 气泡样式 · 鎏金档案 · 气泡校准台 v4（TW 生态动效混合） */\n@keyframes phGtIn{from{opacity:0;transform:translateY(8px)}to{opacity:1;transform:none}}\n@keyframes phGtLine{from{transform:scaleX(0)}to{transform:scaleX(1)}}\n@keyframes phGtDrop{from{transform:scaleY(0)}to{transform:scaleY(1)}}\n.ph-dialog-bubble-wrap{animation:phGtIn .4s ease-out both}\n.ph-dialog-speaker::after{transform-origin:left center;animation:phGtLine .55s .12s cubic-bezier(.22,1,.36,1) both}\n.ph-dialog-user .ph-dialog-speaker::after{transform-origin:right center}\n.ph-dialog-avatar::after{transform-origin:top center;animation:phGtDrop .4s .5s ease-out both}\n@keyframes phGtFlow{0%{background-position:0% 0}100%{background-position:240% 0}}\n@keyframes phGtBreath{0%,100%{opacity:1}50%{opacity:.55}}\n.ph-dialog-bubble-wrap{display:flex;gap:0;align-items:flex-start;margin:12px 0;max-width:100%}\n.ph-dialog-bubble-wrap.ph-dialog-user{flex-direction:row-reverse}\n.ph-dialog-avatar{position:relative;width:44px;height:44px;flex:0 0 44px;border-radius:6px;border:1px solid;padding:2px;background:rgba(8,8,10,.65)}\n.ph-dialog-avatar img{width:100%;height:100%;object-fit:cover;display:block;border-radius:4px;filter:saturate(.92) contrast(1.04)}\n.ph-dialog-avatar::after{content:\"\";position:absolute;top:10px;bottom:-4px;right:-9px;width:1px}\n.ph-dialog-user .ph-dialog-avatar::after{right:auto;left:-9px}\n.ph-dialog-body{min-width:0;max-width:min(84ch,calc(100% - 62px));padding-left:18px}\n.ph-dialog-user .ph-dialog-body{padding-left:0;padding-right:18px}\n.ph-dialog-speaker{display:flex;align-items:baseline;gap:10px;margin:0 0 6px;font-family:Georgia,\"Times New Roman\",\"STSong\",\"SimSun\",serif;font-size:13.5px;font-weight:700;letter-spacing:3px}\n.ph-dialog-user .ph-dialog-speaker{flex-direction:row-reverse}\n.ph-dialog-speaker::after{content:\"\";height:1px;flex:1;align-self:center;margin-top:2px}\n.ph-dialog-text{position:relative;background:rgba(19,16,21,.9);border:1px solid;border-radius:4px;padding:11px 16px 12px 18px;font-size:12px;color:rgba(243,238,230,.95);line-height:1.85;white-space:pre-wrap;word-break:break-word}\n.ph-dialog-text::before{content:\"\";position:absolute;left:-1px;top:6px;bottom:6px;width:2px}\n.ph-dialog-user .ph-dialog-text{background:rgba(23,16,22,.9)}\n.ph-dialog-user .ph-dialog-text::before{left:auto;right:-1px}\n.ph-dialog-npc .ph-dialog-avatar{border-color:rgba(212,175,110,.6);box-shadow:0 0 0 1px rgba(212,175,110,.18),0 4px 14px rgba(0,0,0,.4)}\n.ph-dialog-npc .ph-dialog-avatar::after{background:linear-gradient(to bottom,rgba(212,175,110,.7),rgba(212,175,110,.15))}\n.ph-dialog-npc .ph-dialog-speaker{background:linear-gradient(100deg,#d4af6e 20%,#ecd7b2 50%,#d4af6e 80%);-webkit-background-clip:text;background-clip:text;color:transparent;background-size:240% 100%;animation:phGtFlow 5s linear infinite}\n.ph-dialog-npc .ph-dialog-speaker::after{background:linear-gradient(to right,rgba(212,175,110,.55),rgba(212,175,110,.08))}\n.ph-dialog-npc .ph-dialog-text{border-color:rgba(212,175,110,.34);box-shadow:inset 0 0 0 1px rgba(212,175,110,.1),0 6px 22px rgba(0,0,0,.35)}\n.ph-dialog-npc .ph-dialog-text::before{background:linear-gradient(to bottom,rgba(212,175,110,.75),rgba(212,175,110,.1));animation:phGtBreath 4.2s ease-in-out infinite}\n.ph-dialog-user .ph-dialog-avatar{border-color:rgba(217,138,164,.6);box-shadow:0 0 0 1px rgba(217,138,164,.18),0 4px 14px rgba(0,0,0,.4)}\n.ph-dialog-user .ph-dialog-avatar::after{background:linear-gradient(to bottom,rgba(217,138,164,.7),rgba(217,138,164,.15))}\n.ph-dialog-user .ph-dialog-speaker{background:linear-gradient(100deg,#d98aa4 20%,#eec7cb 50%,#d98aa4 80%);-webkit-background-clip:text;background-clip:text;color:transparent;background-size:240% 100%;animation:phGtFlow 5s linear infinite 1.4s}\n.ph-dialog-user .ph-dialog-speaker::after{background:linear-gradient(to left,rgba(217,138,164,.55),rgba(217,138,164,.08))}\n.ph-dialog-user .ph-dialog-text{border-color:rgba(217,138,164,.34);box-shadow:inset 0 0 0 1px rgba(217,138,164,.1),0 6px 22px rgba(0,0,0,.35)}\n.ph-dialog-user .ph-dialog-text::before{background:linear-gradient(to bottom,rgba(217,138,164,.75),rgba(217,138,164,.1));animation:phGtBreath 4.2s ease-in-out infinite}\n.ph-dialog-narration{margin:10px 2px;color:rgba(232,226,216,.82);line-height:1.85;white-space:pre-wrap;word-break:break-word}\n@media(max-width:640px){.ph-dialog-avatar{width:38px;height:38px;flex-basis:38px}.ph-dialog-body{padding-left:14px}.ph-dialog-user .ph-dialog-body{padding-left:0;padding-right:14px}.ph-dialog-text{padding:10px 13px 11px 15px}}\n@media(prefers-reduced-motion:reduce){.ph-dialog-bubble-wrap,.ph-dialog-bubble-wrap *,.ph-dialog-bubble-wrap *::before,.ph-dialog-bubble-wrap *::after{animation:none!important}}\n"},"manga":{"label":"墨线分镜","css":"/* 气泡样式 · 墨线分镜 · 气泡校准台 v4（TW 生态动效混合） */\n@keyframes phMgIn{from{opacity:0;transform:translateY(10px)}to{opacity:1;transform:none}}\n@keyframes phMgPop{from{opacity:0;transform:rotate(var(--tilt,-2.5deg)) scale(.45)}60%{opacity:1;transform:rotate(var(--tilt,-2.5deg)) scale(1.12)}to{opacity:1;transform:rotate(var(--tilt,-2.5deg)) scale(1)}}\n.ph-dialog-bubble-wrap{animation:phMgIn .3s ease-out both}\n.ph-dialog-speaker{animation:phMgPop .42s .1s cubic-bezier(.34,1.4,.64,1) both}\n.ph-dialog-bubble-wrap{display:flex;gap:13px;align-items:flex-start;margin:13px 0;max-width:100%}\n.ph-dialog-bubble-wrap.ph-dialog-user{flex-direction:row-reverse}\n.ph-dialog-avatar{width:48px;height:48px;flex:0 0 48px;background:none}\n.ph-dialog-avatar img{width:100%;height:100%;object-fit:cover;display:block;border-radius:50%;border:2px solid}\n.ph-dialog-body{position:relative;min-width:0;max-width:min(82ch,calc(100% - 66px));padding-top:9px}\n.ph-dialog-speaker{position:absolute;top:-2px;left:-4px;z-index:2;margin:0;padding:2px 11px 3px;font-size:11.5px;font-weight:800;letter-spacing:1px;color:#fff;border:2px solid #e8ecf2;border-radius:3px;--tilt:-2.5deg;transform:rotate(var(--tilt));box-shadow:2.5px 2.5px 0 rgba(0,0,0,.5);max-width:60%;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}\n.ph-dialog-user .ph-dialog-speaker{left:auto;right:-4px;--tilt:2.5deg}\n.ph-dialog-text{position:relative;border:2px solid #e8ecf2;border-radius:13px;padding:14px 15px 11px;font-size:12px;color:rgba(240,244,250,.97);line-height:1.75;white-space:pre-wrap;word-break:break-word;box-shadow:4px 4px 0 rgba(0,0,0,.42)}\n.ph-dialog-npc .ph-dialog-avatar img{border-color:#e8ecf2;box-shadow:0 0 0 3px rgba(61,157,216,.35),3px 3px 0 rgba(0,0,0,.45)}\n.ph-dialog-npc .ph-dialog-speaker{background:#3d9dd8}\n.ph-dialog-npc .ph-dialog-text{background:#20242c}\n.ph-dialog-npc .ph-dialog-text::before{content:\"\";position:absolute;top:17px;left:-12px;border-style:solid;border-width:11px 12px 11px 0;border-color:transparent #e8ecf2 transparent transparent}\n.ph-dialog-npc .ph-dialog-text::after{content:\"\";position:absolute;top:19px;left:-8px;border-style:solid;border-width:9px 10px 9px 0;border-color:transparent #20242c transparent transparent}\n.ph-dialog-user .ph-dialog-avatar img{border-color:#e8ecf2;box-shadow:0 0 0 3px rgba(216,95,158,.35),3px 3px 0 rgba(0,0,0,.45)}\n.ph-dialog-user .ph-dialog-speaker{background:#d85f9e}\n.ph-dialog-user .ph-dialog-text{background:#2a2029}\n.ph-dialog-user .ph-dialog-text::before{content:\"\";position:absolute;top:17px;right:-12px;border-style:solid;border-width:11px 0 11px 12px;border-color:transparent transparent transparent #e8ecf2}\n.ph-dialog-user .ph-dialog-text::after{content:\"\";position:absolute;top:19px;right:-8px;border-style:solid;border-width:9px 0 9px 10px;border-color:transparent transparent transparent #2a2029}\n.ph-dialog-narration{margin:10px 2px;color:rgba(226,232,240,.85);line-height:1.75;white-space:pre-wrap;word-break:break-word}\n@media(max-width:640px){.ph-dialog-bubble-wrap{gap:10px}.ph-dialog-avatar{width:42px;height:42px;flex-basis:42px}.ph-dialog-text{padding:13px 12px 10px}}\n@media(prefers-reduced-motion:reduce){.ph-dialog-bubble-wrap,.ph-dialog-bubble-wrap *,.ph-dialog-bubble-wrap *::before,.ph-dialog-bubble-wrap *::after{animation:none!important}}\n"},"p5":{"label":"PERSONA","css":"/* 气泡样式 · PERSONA · 气泡校准台 v4（TW 生态动效混合） */\n@keyframes phP5In{from{opacity:0;transform:translateX(var(--fly,-20px)) skewX(var(--sk,-6deg)) rotate(var(--ro,-1deg))}62%{opacity:1;transform:translateX(calc(var(--fly,-20px) * -.14)) skewX(calc(var(--sk,-6deg) * -.3)) rotate(calc(var(--ro,-1deg) * -.4))}to{opacity:1;transform:none}}\n@keyframes phP5Tag{from{opacity:0;transform:rotate(calc(var(--tilt) * 3.2)) scale(.35)}62%{opacity:1;transform:rotate(var(--tilt)) scale(1.18)}to{opacity:1;transform:rotate(var(--tilt)) scale(1)}}\n.ph-dialog-bubble-wrap{--fly:-20px;--sk:-6deg;--ro:-1deg;animation:phP5In .32s cubic-bezier(.2,1.25,.4,1) both}\n.ph-dialog-bubble-wrap.ph-dialog-user{--fly:20px;--sk:6deg;--ro:1deg}\n.ph-dialog-speaker{animation:phP5Tag .38s .06s cubic-bezier(.3,1.6,.5,1) both,phP5Sway 2.9s .5s ease-in-out infinite}\n@keyframes phP5JitA{0%,49.9%{transform:rotate(0.35deg)}50%,100%{transform:rotate(-0.28deg)}}\n@keyframes phP5JitB{0%,49.9%{transform:rotate(-0.24deg)}50%,100%{transform:rotate(0.35deg)}}\n@keyframes phP5Sway{0%,100%{transform:rotate(calc(var(--tilt) - 0.56deg)) scale(1)}50%{transform:rotate(calc(var(--tilt) + 0.7deg)) scale(1)}}\n.ph-dialog-text{animation:phP5JitA 1.7s steps(1) infinite}\n.ph-dialog-avatar img{animation:phP5JitB 2.3s steps(1) infinite}\n.ph-dialog-bubble-wrap{display:flex;gap:15px;align-items:flex-start;margin:15px 0;max-width:100%}\n.ph-dialog-bubble-wrap.ph-dialog-user{flex-direction:row-reverse}\n.ph-dialog-avatar{position:relative;width:52px;height:52px;flex:0 0 52px;background:none}\n.ph-dialog-avatar img{width:100%;height:100%;object-fit:cover;display:block}\n.ph-dialog-body{position:relative;min-width:0;max-width:min(82ch,calc(100% - 74px));padding-top:12px}\n.ph-dialog-speaker{position:absolute;top:-4px;left:-7px;z-index:2;margin:0;padding:2px 13px 3px;font-size:12.5px;font-weight:900;font-style:italic;letter-spacing:2px;--tilt:-4.3deg;transform:rotate(var(--tilt));max-width:62%;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}\n.ph-dialog-user .ph-dialog-speaker{left:auto;right:-7px;--tilt:4.3deg}\n.ph-dialog-text{position:relative;padding:15px 17px 13px 18px;font-size:12px;font-weight:600;line-height:1.72;white-space:pre-wrap;word-break:break-word}\n.ph-dialog-user .ph-dialog-text{padding:15px 18px 13px 17px}\n.ph-dialog-text::after{content:\"\";position:absolute;top:17px;width:14px;height:13px}\n.ph-dialog-npc .ph-dialog-text{background:#141317;color:#f7f5f0;-webkit-mask:url(\"data:image/svg+xml;charset=utf8,%3Csvg%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%20viewBox%3D%220%200%20100%20100%22%20preserveAspectRatio%3D%22none%22%3E%3Cpolygon%20points%3D%220%2C4.3%2099.2%2C0%20100%2C10.4%20100%2C89.2%201.5%2C100%200%2C94%22%2F%3E%3C%2Fsvg%3E\") 0 0/100% 100% no-repeat;mask:url(\"data:image/svg+xml;charset=utf8,%3Csvg%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%20viewBox%3D%220%200%20100%20100%22%20preserveAspectRatio%3D%22none%22%3E%3Cpolygon%20points%3D%220%2C4.3%2099.2%2C0%20100%2C10.4%20100%2C89.2%201.5%2C100%200%2C94%22%2F%3E%3C%2Fsvg%3E\") 0 0/100% 100% no-repeat}\n.ph-dialog-npc .ph-dialog-body{filter:drop-shadow(2.5px 0 0 #f5f2ec) drop-shadow(-2.5px 0 0 #f5f2ec) drop-shadow(0 2.5px 0 #f5f2ec) drop-shadow(0 -2.5px 0 #f5f2ec) drop-shadow(5px 6.3px 0 #e60012)}\n.ph-dialog-npc .ph-dialog-avatar{filter:drop-shadow(2.5px 0 0 #f5f2ec) drop-shadow(-2.5px 0 0 #f5f2ec) drop-shadow(0 2.5px 0 #f5f2ec) drop-shadow(0 -2.5px 0 #f5f2ec) drop-shadow(5px 6.3px 0 #e60012)}\n.ph-dialog-npc .ph-dialog-speaker{background:#f5f2ec;color:#16141a;box-shadow:3px 3px 0 #e60012}\n.ph-dialog-npc .ph-dialog-text::after{background:#141317;left:-11px;-webkit-mask:url(\"data:image/svg+xml;charset=utf8,%3Csvg%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%20viewBox%3D%220%200%20100%20100%22%20preserveAspectRatio%3D%22none%22%3E%3Cpolygon%20points%3D%220%2C0%20100%2C45%2028%2C100%22%2F%3E%3C%2Fsvg%3E\") 0 0/100% 100% no-repeat;mask:url(\"data:image/svg+xml;charset=utf8,%3Csvg%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%20viewBox%3D%220%200%20100%20100%22%20preserveAspectRatio%3D%22none%22%3E%3Cpolygon%20points%3D%220%2C0%20100%2C45%2028%2C100%22%2F%3E%3C%2Fsvg%3E\") 0 0/100% 100% no-repeat}\n.ph-dialog-npc .ph-dialog-avatar img{-webkit-mask:url(\"data:image/svg+xml;charset=utf8,%3Csvg%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%20viewBox%3D%220%200%20100%20100%22%20preserveAspectRatio%3D%22none%22%3E%3Cpolygon%20points%3D%2210%2C0%20100%2C3%2088%2C100%200%2C97%22%2F%3E%3C%2Fsvg%3E\") 0 0/100% 100% no-repeat;mask:url(\"data:image/svg+xml;charset=utf8,%3Csvg%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%20viewBox%3D%220%200%20100%20100%22%20preserveAspectRatio%3D%22none%22%3E%3Cpolygon%20points%3D%2210%2C0%20100%2C3%2088%2C100%200%2C97%22%2F%3E%3C%2Fsvg%3E\") 0 0/100% 100% no-repeat}\n.ph-dialog-user .ph-dialog-text{background:#ad0912;color:#fff;-webkit-mask:url(\"data:image/svg+xml;charset=utf8,%3Csvg%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%20viewBox%3D%220%200%20100%20100%22%20preserveAspectRatio%3D%22none%22%3E%3Cpolygon%20points%3D%22100%2C4.3%200.8%2C0%200%2C10.4%200%2C89.2%2098.5%2C100%20100%2C94%22%2F%3E%3C%2Fsvg%3E\") 0 0/100% 100% no-repeat;mask:url(\"data:image/svg+xml;charset=utf8,%3Csvg%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%20viewBox%3D%220%200%20100%20100%22%20preserveAspectRatio%3D%22none%22%3E%3Cpolygon%20points%3D%22100%2C4.3%200.8%2C0%200%2C10.4%200%2C89.2%2098.5%2C100%20100%2C94%22%2F%3E%3C%2Fsvg%3E\") 0 0/100% 100% no-repeat}\n.ph-dialog-user .ph-dialog-body{filter:drop-shadow(2.5px 0 0 #f5f2ec) drop-shadow(-2.5px 0 0 #f5f2ec) drop-shadow(0 2.5px 0 #f5f2ec) drop-shadow(0 -2.5px 0 #f5f2ec) drop-shadow(5px 6.3px 0 #0c0b0e)}\n.ph-dialog-user .ph-dialog-avatar{filter:drop-shadow(2.5px 0 0 #f5f2ec) drop-shadow(-2.5px 0 0 #f5f2ec) drop-shadow(0 2.5px 0 #f5f2ec) drop-shadow(0 -2.5px 0 #f5f2ec) drop-shadow(5px 6.3px 0 #0c0b0e)}\n.ph-dialog-user .ph-dialog-speaker{background:#16141a;color:#f5f2ec;box-shadow:3px 3px 0 #e60012}\n.ph-dialog-user .ph-dialog-text::after{background:#ad0912;right:-11px;-webkit-mask:url(\"data:image/svg+xml;charset=utf8,%3Csvg%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%20viewBox%3D%220%200%20100%20100%22%20preserveAspectRatio%3D%22none%22%3E%3Cpolygon%20points%3D%22100%2C0%200%2C45%2072%2C100%22%2F%3E%3C%2Fsvg%3E\") 0 0/100% 100% no-repeat;mask:url(\"data:image/svg+xml;charset=utf8,%3Csvg%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%20viewBox%3D%220%200%20100%20100%22%20preserveAspectRatio%3D%22none%22%3E%3Cpolygon%20points%3D%22100%2C0%200%2C45%2072%2C100%22%2F%3E%3C%2Fsvg%3E\") 0 0/100% 100% no-repeat}\n.ph-dialog-user .ph-dialog-avatar img{-webkit-mask:url(\"data:image/svg+xml;charset=utf8,%3Csvg%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%20viewBox%3D%220%200%20100%20100%22%20preserveAspectRatio%3D%22none%22%3E%3Cpolygon%20points%3D%2290%2C0%200%2C3%2012%2C100%20100%2C97%22%2F%3E%3C%2Fsvg%3E\") 0 0/100% 100% no-repeat;mask:url(\"data:image/svg+xml;charset=utf8,%3Csvg%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%20viewBox%3D%220%200%20100%20100%22%20preserveAspectRatio%3D%22none%22%3E%3Cpolygon%20points%3D%2290%2C0%200%2C3%2012%2C100%20100%2C97%22%2F%3E%3C%2Fsvg%3E\") 0 0/100% 100% no-repeat}\n.ph-dialog-narration{margin:11px 2px;color:rgba(228,230,236,.85);line-height:1.75;white-space:pre-wrap;word-break:break-word}\n@media(max-width:640px){.ph-dialog-bubble-wrap{gap:11px}.ph-dialog-avatar{width:44px;height:44px;flex-basis:44px}.ph-dialog-text{padding:14px 14px 12px 15px}.ph-dialog-user .ph-dialog-text{padding:14px 15px 12px 14px}}\n@media(prefers-reduced-motion:reduce){.ph-dialog-bubble-wrap,.ph-dialog-bubble-wrap *,.ph-dialog-bubble-wrap *::before,.ph-dialog-bubble-wrap *::after{animation:none!important}}\n"}};
  var SKIN_ORDER = ['p5', 'glass', 'gilt', 'manga'];
  var DEFAULT_SKIN = 'p5'; // 制卡者改这里定默认皮肤
  var SKIN_LS_KEY = 'ph-bubble-skin-v1';
  function getSkin() {
    try { var v = hostWindow.localStorage.getItem(SKIN_LS_KEY); if (v && SKINS[v]) return v; } catch (e) {}
    return SKINS[DEFAULT_SKIN] ? DEFAULT_SKIN : SKIN_ORDER[0];
  }
  function setSkin(id) {
    if (!SKINS[id]) return false;
    try { hostWindow.localStorage.setItem(SKIN_LS_KEY, id); } catch (e) {}
    ensureBubbleCss(hostDocument(), true);
    try { ensureBubbleCss(document, true); } catch (e) {}
    return true;
  }
  function ensureBubbleCss(doc, force) {
    try {
      if (!doc) return;
      var style = doc.getElementById('ph-bubble-skin-style');
      if (style && !force) return;
      if (!style) {
        style = doc.createElement('style');
        style.id = 'ph-bubble-skin-style';
        (doc.head || doc.documentElement).appendChild(style);
      }
      style.textContent = SKINS[getSkin()].css;
    } catch (e) {}
  }

  /* ================= 渲染器（照星月 4.0.0 renderDialog 系改造，前缀 ph、查通用媒体仓） ================= */
  // 空头像：中性灰阶剪影（原星月抽象占位图已弃——2026-08-27 拍板）
  var DIALOG_PLACEHOLDER = 'data:image/svg+xml;utf8,' + encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" width="96" height="96" viewBox="0 0 96 96"><rect width="96" height="96" fill="#23262c"/><circle cx="48" cy="38" r="15" fill="#454b56"/><path d="M18 88c5-21 20-31 30-31s25 10 30 31" fill="#454b56"/></svg>');
  var DIALOG_LINE_RE = /^\s*(?:\*\*\s*)?([^：:\r\n*]+?)(?:\s*\*\*)?\s*[：:]\s*([\s\S]*)$/;
  function parseDialogCotLine(inner, unwrapped) {
    var text = String(inner || '').trim();
    if (!text) return null;
    var mm = DIALOG_LINE_RE.exec(text);
    var speaker, content;
    if (mm) { speaker = mm[1]; content = mm[2]; }
    else {
      var nl = text.search(/\r\n|\r|\n/);
      if (nl < 0) return null;
      speaker = text.slice(0, nl); content = text.slice(nl + 1);
    }
    speaker = String(speaker).replace(/\*\*/g, '');
    content = String(content);
    if (!unwrapped) {
      speaker = speaker.replace(/^[「『]+|[」』]+$/g, '');
      content = content.replace(/^[「『]+|[」』]+$/g, '');
    }
    speaker = speaker.trim();
    content = content.trim();
    return (speaker && content) ? { speaker: speaker, content: content } : null;
  }
  function parseDialogCot(rawBlock) {
    var items = [];
    if (rawBlock == null) return items;
    var block = String(rawBlock).replace(/<\/?(?:q|ph-cot-dialog|ph-dialog)\b[^>]*>/gi, '');
    // 「」与『』各自成块、不交叉（星月 3.7.5 #6 吞字根治，坑保留）
    var re = /「([\s\S]*?)」|『([\s\S]*?)』/g;
    var m;
    while ((m = re.exec(block)) !== null) {
      var item = parseDialogCotLine(m[1] !== undefined ? m[1] : m[2], true);
      if (item) items.push(item);
    }
    if (!items.length) {
      block.split(/\r\n|\r|\n/).forEach(function (rawLine) {
        var item = parseDialogCotLine(rawLine, false);
        if (item) items.push(item);
      });
    }
    return items;
  }
  function stripQuoteTags(text) { return String(text || '').replace(/<\/?q\b[^>]*>/gi, '').trim(); }
  function splitDialogSegments(content) {
    var raw = String(content || '');
    var parts = [];
    var re = /<q\b[^>]*>([\s\S]*?)<\/q\s*>/gi;
    var lastIndex = 0, m, hasQuote = false;
    while ((m = re.exec(raw)) !== null) {
      hasQuote = true;
      var before = stripQuoteTags(raw.slice(lastIndex, m.index));
      if (before) parts.push({ type: 'narration', text: before });
      var inner = String(m[1] || '').trim();
      if (inner) parts.push({ type: 'bubble', text: inner });
      lastIndex = re.lastIndex;
    }
    if (!hasQuote) {
      var whole = stripQuoteTags(raw);
      return whole ? [{ type: 'bubble', text: whole }] : [];
    }
    var tail = stripQuoteTags(raw.slice(lastIndex));
    if (tail) parts.push({ type: 'narration', text: tail });
    return parts;
  }
  var USER_ALIASES = ['user', 'player', '{{user}}', '玩家', '主角'];
  function normalizeDialogSpeaker(raw, doc) {
    var text = decodeAttr(raw, doc).trim();
    if (!text) return { name: '{{user}}', kind: 'user' };
    var lower = text.toLowerCase();
    if (USER_ALIASES.indexOf(lower) >= 0 || USER_ALIASES.indexOf(text) >= 0) return { name: text, kind: 'user' };
    return { name: text, kind: 'npc' };
  }
  function resolveDialogMedia(raw, speaker, doc) {
    var value = decodeAttr(raw, doc).trim();
    if (/^(?:https?:|data:image\/)/i.test(value)) return value;
    if (value) {
      var byValue = mediaExact({ name: value, slot: 'avatar', variant: 'normal' });
      return (byValue && byValue.src) || '';
    }
    if (speaker.kind === 'user') {
      var userAsset = mediaExact({ name: '{{user}}', slot: 'avatar', variant: 'normal' });
      if (userAsset && userAsset.src) return userAsset.src;
    }
    var exact = mediaExact({ name: speaker.name, slot: 'avatar', variant: 'normal' });
    return (exact && exact.src) || '';
  }
  function buildDialogBubbleEl(doc, speaker, avatar, text) {
    var wrap = doc.createElement('div');
    wrap.innerHTML = '<div class="ph-dialog-bubble-wrap ph-dialog-' + speaker.kind + '">'
      + '<div class="ph-dialog-avatar"><img src="' + escapeHtml(avatar) + '" alt=""></div>'
      + '<div class="ph-dialog-body"><div class="ph-dialog-speaker">' + escapeHtml(speaker.name) + '</div>'
      + '<div class="ph-dialog-text"></div></div></div>';
    var textDiv = wrap.querySelector('.ph-dialog-text');
    if (textDiv) textDiv.textContent = text;
    return wrap.firstChild;
  }
  function buildDialogNarrationEl(doc, text) {
    var div = doc.createElement('div');
    div.className = 'ph-dialog-narration';
    div.textContent = text;
    return div;
  }
  function renderDialogNode(node, doc, force) {
    if (!node || (!force && node.getAttribute('data-ph-dialog-ready') === '1')) return false;
    var speaker = normalizeDialogSpeaker(node.getAttribute('data-ph-dialog-speaker'), doc);
    var avatar = resolveDialogMedia(node.getAttribute('data-ph-dialog-avatar'), speaker, doc) || DIALOG_PLACEHOLDER;
    var source = node.querySelector('[data-ph-dialog-content-source], .ph-dialog-content-source, .custom-ph-dialog-content-source');
    // 源 textarea 首渲后被 innerHTML 重建吃掉，台词缓存到属性供 force 重渲（星月 3.5.0 坑保留）
    var content = (source ? String(source.value || source.textContent || '') : String(node.getAttribute('data-ph-dialog-content') || node.getAttribute('data-ph-dialog-content-cache') || '')).trim();
    if (!content) return false;
    node.setAttribute('data-ph-dialog-content-cache', content);
    node.setAttribute('data-ph-dialog-ready', '1');
    var segments = splitDialogSegments(content);
    if (!segments.length) { node.setAttribute('data-ph-dialog-ready', '0'); return false; }
    var frag = doc.createElement('div');
    frag.className = 'ph-dialog-list';
    for (var i = 0; i < segments.length; i++) {
      var seg = segments[i];
      frag.appendChild(seg.type === 'bubble' ? buildDialogBubbleEl(doc, speaker, avatar, seg.text) : buildDialogNarrationEl(doc, seg.text));
    }
    node.innerHTML = '';
    node.appendChild(frag);
    return true;
  }
  function renderCotDialogNode(node, doc, force) {
    if (!node || (!force && node.getAttribute('data-ph-cot-dialog-ready') === '1')) return false;
    var source = node.querySelector('[data-ph-cot-dialog-source], .ph-cot-dialog-source, .custom-ph-cot-dialog-source');
    var raw = source ? String(source.value || source.textContent || '') : String(node.getAttribute('data-ph-cot-dialog') || node.getAttribute('data-ph-cot-dialog-cache') || '');
    var items = parseDialogCot(raw);
    if (!items.length) return false; // 流式未成块时不锁，等下次
    node.setAttribute('data-ph-cot-dialog-cache', raw);
    node.setAttribute('data-ph-cot-dialog-ready', '1');
    var frag = doc.createElement('div');
    frag.className = 'ph-cot-dialog-list';
    items.forEach(function (it) {
      var speaker = normalizeDialogSpeaker(it.speaker, doc);
      var avatar = resolveDialogMedia('', speaker, doc) || DIALOG_PLACEHOLDER;
      splitDialogSegments(it.content).forEach(function (seg) {
        frag.appendChild(seg.type === 'bubble' ? buildDialogBubbleEl(doc, speaker, avatar, seg.text) : buildDialogNarrationEl(doc, seg.text));
      });
    });
    node.innerHTML = '';
    node.appendChild(frag);
    return true;
  }
  function renderDialogBubbles(options) {
    options = options || {};
    var docs = [];
    try { docs.push(document); } catch (e) {}
    try { var doc = hostDocument(); if (doc && docs.indexOf(doc) < 0) docs.push(doc); } catch (e) {}
    var rendered = 0;
    docs.forEach(function (doc) {
      try {
        ensureBubbleCss(doc, false);
        doc.querySelectorAll('[data-ph-dialog-render], .ph-dialog-render, .custom-ph-dialog-render').forEach(function (node) {
          if (renderDialogNode(node, doc, !!options.force)) rendered += 1;
        });
        doc.querySelectorAll('[data-ph-cot-dialog-render], .ph-cot-dialog-render, .custom-ph-cot-dialog-render').forEach(function (node) {
          if (renderCotDialogNode(node, doc, !!options.force)) rendered += 1;
        });
      } catch (e) {}
    });
    return rendered;
  }
  var dialogScanTimer = null;
  function scheduleDialogRender(delay) {
    if (dialogScanTimer) clearTimeout(dialogScanTimer);
    dialogScanTimer = setTimeout(function () { dialogScanTimer = null; renderDialogBubbles(); }, delay == null ? 80 : delay);
  }
  function ensureDialogBubbleBinding() {
    renderDialogBubbles();
    // 刻意无常驻 MutationObserver（星月 2.9.8 流式卡顿回归教训）：定时兜底 + ST 事件驱动
    [120, 350, 700, 1200, 2000, 3200, 5000, 8000].forEach(function (delay) {
      runtime.timers.push(setTimeout(renderDialogBubbles, delay));
    });
    try {
      var eventOnHost = (typeof eventOn === 'function' ? eventOn : null) || hostWindow.eventOn;
      var events = (typeof tavern_events !== 'undefined' ? tavern_events : null) || hostWindow.tavern_events || {};
      var eventNames = [events.CHAT_CHANGED, events.USER_MESSAGE_RENDERED, events.CHARACTER_MESSAGE_RENDERED, events.MESSAGE_UPDATED, events.MESSAGE_SWIPED].filter(Boolean);
      if (typeof eventOnHost === 'function') {
        eventNames.forEach(function (name) {
          try {
            var disposer = eventOnHost(name, function () { scheduleDialogRender(80); });
            if (typeof disposer === 'function') runtime.disposers.push(disposer);
            else if (disposer && disposer.stop) runtime.disposers.push(function () { disposer.stop(); });
          } catch (e) {}
        });
      }
    } catch (e) {}
  }

  /* ================= 头像气泡管理（改造自星月 3.4.9 管理器 + 新增皮肤切换段） ================= */
  function ensureMgrStyle(doc) {
    if (doc.getElementById('ph-bubble-mgr-style')) return;
    var style = doc.createElement('style');
    style.id = 'ph-bubble-mgr-style';
    style.textContent = [
      '#ph-bubble-mgr{position:fixed;left:0;top:0;z-index:2147483600;display:grid;place-items:center;background:rgba(8,10,14,.62)}',
      '#ph-bubble-mgr .ph-bm-panel{width:min(480px,92vw);max-height:min(600px,86vh);overflow:auto;background:#191c22;border:1px solid #333a46;border-radius:10px;padding:14px 16px;color:#dde2ea;font-size:13px;line-height:1.6}',
      '#ph-bubble-mgr .ph-bm-head{display:flex;align-items:center;justify-content:space-between;gap:10px;margin-bottom:6px}',
      '#ph-bubble-mgr .ph-bm-head strong{font-size:14px}',
      '#ph-bubble-mgr button{background:#242a34;border:1px solid #3a4250;color:#dde2ea;font-size:12px;padding:4px 12px;border-radius:5px;cursor:pointer}',
      '#ph-bubble-mgr button:hover{border-color:#8a93a5}',
      '#ph-bubble-mgr .ph-bm-note{color:#8b93a4;font-size:12px;margin:4px 0 10px}',
      '#ph-bubble-mgr .ph-bm-skins{display:flex;flex-wrap:wrap;gap:8px;margin:0 0 12px}',
      '#ph-bubble-mgr .ph-bm-skin{display:flex;align-items:center;gap:6px;padding:5px 12px;border:1px solid #3a4250;border-radius:6px;cursor:pointer;font-size:12px;user-select:none}',
      '#ph-bubble-mgr .ph-bm-skin input{accent-color:#d8a656;margin:0}',
      '#ph-bubble-mgr .ph-bm-skin.on{border-color:#d8a656;color:#d8a656}',
      '#ph-bubble-mgr .ph-bm-add{display:flex;gap:8px;margin-bottom:10px}',
      '#ph-bubble-mgr .ph-bm-add input{flex:1;background:#12151b;border:1px solid #3a4250;border-radius:5px;color:#dde2ea;font-size:12px;padding:5px 9px}',
      '#ph-bubble-mgr .ph-bm-row{display:flex;align-items:center;gap:10px;padding:8px 10px;border:1px solid #2c3340;border-radius:7px;margin-bottom:7px}',
      '#ph-bubble-mgr .ph-bm-thumb{width:38px;height:38px;border-radius:8px;object-fit:cover;background:#23262c;flex:0 0 38px;display:block}',
      '#ph-bubble-mgr span.ph-bm-thumb{display:grid}',
      '#ph-bubble-mgr .ph-bm-rowname{flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}',
      '#ph-bubble-mgr .ph-bm-rowname small{display:block;color:#8b93a4;font-size:11px}',
      '#ph-bubble-mgr .ph-bm-empty{color:#8b93a4;font-size:12px;padding:12px 4px;text-align:center}',
      '#ph-bubble-mgr .ph-bm-sec{font-size:12px;color:#8b93a4;letter-spacing:1px;margin:2px 0 6px}',
    ].join('\n');
    (doc.head || doc.documentElement).appendChild(style);
  }
  function collectSpeakers() {
    var doc = hostDocument();
    var names = new Map();
    names.set('{{user}}', { kind: 'user' });
    var aliasLower = USER_ALIASES;
    try {
      doc.querySelectorAll('[data-ph-dialog-speaker]').forEach(function (node) {
        var raw = String(node.getAttribute('data-ph-dialog-speaker') || '').trim();
        if (raw && aliasLower.indexOf(raw.toLowerCase()) < 0 && aliasLower.indexOf(raw) < 0) names.set(raw, { kind: 'npc' });
      });
      doc.querySelectorAll('.ph-dialog-speaker, .custom-ph-dialog-speaker').forEach(function (node) {
        var raw = String(node.textContent || '').trim();
        if (raw && raw !== '{{user}}' && !names.has(raw)) names.set(raw, { kind: 'npc' });
      });
    } catch (e) {}
    try {
      var assets = readMediaLibrary().assets;
      Object.keys(assets).forEach(function (key) {
        var item = assets[key];
        if (item.slot === 'avatar' && item.name && item.name !== '{{user}}' && !names.has(item.name)) names.set(item.name, { kind: 'npc' });
      });
    } catch (e) {}
    return Array.from(names.entries()).map(function (entry) { return { name: entry[0], kind: entry[1].kind }; });
  }
  function avatarThumb(name) {
    var item = mediaExact({ name: name, slot: 'avatar', variant: 'normal' });
    return (item && item.src) || '';
  }
  function renderMgrList() {
    var list = hostDocument().querySelector('#ph-bubble-mgr .ph-bm-list');
    if (!list) return;
    var speakers = [];
    try { speakers = collectSpeakers(); } catch (e) { speakers = [{ name: '{{user}}', kind: 'user' }]; }
    list.innerHTML = speakers.map(function (item) {
      var isUser = item.kind === 'user';
      var src = avatarThumb(item.name);
      var hint = isUser ? '玩家气泡头像' : (src ? '已绑定' : '未绑定 · 气泡显示占位头像');
      return '<div class="ph-bm-row">'
        + (src ? '<img class="ph-bm-thumb" src="' + escapeHtml(src) + '" alt="">' : '<span class="ph-bm-thumb"></span>')
        + '<span class="ph-bm-rowname">' + escapeHtml(item.name) + '<small>' + escapeHtml(hint) + '</small></span>'
        + '<button type="button" data-ph-bm-import data-name="' + escapeHtml(item.name) + '">' + (src ? '换头像' : '导入头像') + '</button>'
        + (src ? '<button type="button" data-ph-bm-clear data-name="' + escapeHtml(item.name) + '">清除</button>' : '')
        + '</div>';
    }).join('') || '<div class="ph-bm-empty">当前聊天还没有出现对话气泡；可以先在上方手动添加名字。</div>';
  }
  var mgrResizeHandler = null;
  function sizeMgrOverlay() {
    var overlay = hostDocument().getElementById('ph-bubble-mgr');
    if (!overlay) return;
    var vv = hostWindow.visualViewport;
    overlay.style.width = Math.round((vv && vv.width) || hostWindow.innerWidth || 360) + 'px';
    overlay.style.height = Math.round((vv && vv.height) || hostWindow.innerHeight || 640) + 'px';
  }
  function closeManager() {
    try { var el = hostDocument().getElementById('ph-bubble-mgr'); if (el) el.remove(); } catch (e) {}
    if (mgrResizeHandler) {
      try {
        hostWindow.removeEventListener('resize', mgrResizeHandler);
        if (hostWindow.visualViewport && hostWindow.visualViewport.removeEventListener) hostWindow.visualViewport.removeEventListener('resize', mgrResizeHandler);
      } catch (e) {}
      mgrResizeHandler = null;
    }
  }
  function importFor(name) {
    var clean = String(name || '').trim();
    if (!clean) { toast('error', '请先输入角色名（要与气泡显示名完全一致）'); return Promise.resolve(); }
    if (!mediaBridge()) { toast('error', '媒体库脚本未安装，无法保存头像'); return Promise.resolve(); }
    return mediaImportLocal({ name: clean, slot: 'avatar', variant: 'normal' }).then(function (item) {
      if (item && item.key) {
        renderDialogBubbles({ force: true });
        renderMgrList();
        toast('success', '已给「' + clean + '」绑定气泡头像，聊天中立即生效');
      }
    }).catch(function (error) { toast('error', (error && error.message) || String(error)); });
  }
  function openManager() {
    var doc = hostDocument();
    ensureMgrStyle(doc);
    closeManager();
    var skinRadios = SKIN_ORDER.filter(function (id) { return SKINS[id]; }).map(function (id) {
      var on = getSkin() === id;
      return '<label class="ph-bm-skin' + (on ? ' on' : '') + '"><input type="radio" name="ph-bm-skin" value="' + id + '"' + (on ? ' checked' : '') + '>' + escapeHtml(SKINS[id].label) + '</label>';
    }).join('');
    var overlay = doc.createElement('div');
    overlay.id = 'ph-bubble-mgr';
    overlay.innerHTML = '<div class="ph-bm-panel" role="dialog" aria-modal="true" aria-label="头像气泡管理">'
      + '<div class="ph-bm-head"><strong>头像气泡管理</strong><button type="button" class="ph-bm-close">关闭</button></div>'
      + '<div class="ph-bm-sec">气泡皮肤</div>'
      + '<div class="ph-bm-skins">' + skinRadios + '</div>'
      + '<div class="ph-bm-sec">头像绑定</div>'
      + '<p class="ph-bm-note">对话气泡按「说话者名字」自动取头像；名字要与气泡显示名完全一致，绑定后聊天里立即生效。</p>'
      + '<div class="ph-bm-add"><input type="text" class="ph-bm-name" placeholder="输入角色名（与气泡显示名一致）"><button type="button" class="ph-bm-addbtn">添加名字</button></div>'
      + '<div class="ph-bm-list"></div></div>';
    (doc.body || doc.documentElement).appendChild(overlay);
    sizeMgrOverlay(); // 钉真实视口，绕 ST 顶层 transform 对 fixed 的劫持（星月 3.4.9 坑保留）
    mgrResizeHandler = function () { sizeMgrOverlay(); };
    try {
      hostWindow.addEventListener('resize', mgrResizeHandler, { passive: true });
      if (hostWindow.visualViewport && hostWindow.visualViewport.addEventListener) hostWindow.visualViewport.addEventListener('resize', mgrResizeHandler, { passive: true });
    } catch (e) {}
    renderMgrList();
    overlay.addEventListener('change', function (event) {
      var input = event.target;
      if (input && input.name === 'ph-bm-skin' && SKINS[input.value]) {
        setSkin(input.value);
        overlay.querySelectorAll('.ph-bm-skin').forEach(function (el) {
          el.classList.toggle('on', el.querySelector('input').value === input.value);
        });
        toast('success', '已切换气泡皮肤：' + SKINS[input.value].label);
      }
    });
    overlay.addEventListener('click', function (event) {
      var t = event.target;
      if (t === overlay || (t.closest && t.closest('.ph-bm-close'))) { closeManager(); return; }
      var importBtn = t.closest && t.closest('[data-ph-bm-import]');
      if (importBtn) { void importFor(importBtn.dataset.name); return; }
      var clearBtn = t.closest && t.closest('[data-ph-bm-clear]');
      if (clearBtn) {
        var name = String(clearBtn.dataset.name || '').trim();
        try { mediaRemove({ name: name, slot: 'avatar', variant: 'normal' }); } catch (e) {}
        renderDialogBubbles({ force: true });
        renderMgrList();
        toast('success', '已清除「' + name + '」的气泡头像');
        return;
      }
      if (t.closest && t.closest('.ph-bm-addbtn')) {
        var input = overlay.querySelector('.ph-bm-name');
        var newName = String((input && input.value) || '').trim();
        if (!newName) { toast('error', '请先输入角色名'); return; }
        void importFor(newName).then(function () { if (input) input.value = ''; });
      }
    });
  }

  /* ================= 桥与生命周期 ================= */
  var BUBBLE_BRIDGE_VALUE = {
    version: '0.1.0',
    openManager: openManager,
    render: function (options) { return renderDialogBubbles(options); },
    setSkin: setSkin,
    getSkin: getSkin,
    listSkins: function () { return SKIN_ORDER.filter(function (id) { return SKINS[id]; }).map(function (id) { return { id: id, label: SKINS[id].label }; }); }
  };
  var BUBBLE_BRIDGE = typeof Object.freeze === 'function' ? Object.freeze(BUBBLE_BRIDGE_VALUE) : BUBBLE_BRIDGE_VALUE;
  function exposeBubbleBridge(target) {
    if (!target) return;
    try { target.__phBubble = BUBBLE_BRIDGE; } catch (e) {}
  }
  function clearBubbleBridge(target) {
    if (!target) return;
    try { if (target.__phBubble === BUBBLE_BRIDGE) delete target.__phBubble; } catch (e) {}
  }
  function destroy(reason) {
    if (runtime.destroyed) return;
    runtime.destroyed = true;
    closeManager();
    if (dialogScanTimer) { clearTimeout(dialogScanTimer); dialogScanTimer = null; }
    runtime.timers.forEach(function (t) { try { clearTimeout(t); } catch (e) {} });
    runtime.timers = [];
    runtime.disposers.forEach(function (d) { try { d(); } catch (e) {} });
    runtime.disposers = [];
    clearBubbleBridge(helperWindow);
    if (hostWindow !== helperWindow) clearBubbleBridge(hostWindow);
    try { if (helperWindow[RUNTIME_KEY] === runtime) delete helperWindow[RUNTIME_KEY]; } catch (e) {}
    try { if (hostWindow[RUNTIME_KEY] === runtime) delete hostWindow[RUNTIME_KEY]; } catch (e) {}
  }

  ensureDialogBubbleBinding();
  exposeBubbleBridge(helperWindow);
  if (hostWindow !== helperWindow) exposeBubbleBridge(hostWindow);
})();
