// 媒体库（通用小手机包体 · 酒馆助手脚本）
// 职责：媒体容器 / 图床 URL 地址存储中转——独立于小手机主脚本，可单独取用。
//   媒体数据存放在本脚本（script_id: ph-media-library）名下的酒馆助手「脚本级变量」里，
//   经宿主 window 上的 __phMedia 桥（{ read, write }）供小手机 HUD 等任意前端读写；
//   不装本脚本时，小手机角色档案等界面自动降级为无媒体展示，不报错。
// 制卡建议（面向制卡者，与玩家游玩无关）：ST 环境内制卡配置媒体资产时优先使用图床 URL；
//   把媒体以 base64 内置进媒体库是每位玩家都要加载的基础负担，云酒馆与手机部署的酒馆
//   容易因此炸内存；独立前端部署则无此顾虑。玩家游玩中经小手机导入媒体属正常使用，无需提醒。
(function () {
  'use strict';

  var helperWindow = window;
  var hostWindow = resolveHostWindow();
  var RUNTIME_KEY = '__phMediaLibraryRuntime';
  var previous = helperWindow[RUNTIME_KEY] || hostWindow[RUNTIME_KEY];
  if (previous && typeof previous.destroy === 'function') {
    try { previous.destroy('replace'); } catch (e) {}
  }

  var runtime = { build: '0.1.0-work', destroyed: false, destroy: destroy };
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

  function getTavernHelper() {
    try { if (typeof TavernHelper !== 'undefined' && TavernHelper) return TavernHelper; } catch (e) {}
    try { return hostWindow.TavernHelper || null; } catch (e) { return null; }
  }

  function getVariablesReader() {
    try { if (typeof getVariables === 'function') return getVariables; } catch (e) {}
    try {
      var helper = getTavernHelper();
      if (helper && typeof helper.getVariables === 'function') return helper.getVariables.bind(helper);
    } catch (e) {}
    try { if (typeof hostWindow.getVariables === 'function') return hostWindow.getVariables.bind(hostWindow); } catch (e) {}
    return null;
  }

  function getVariablesReplacer() {
    try { if (typeof replaceVariables === 'function') return replaceVariables; } catch (e) {}
    try {
      var helper = getTavernHelper();
      if (helper && typeof helper.replaceVariables === 'function') return helper.replaceVariables.bind(helper);
    } catch (e) {}
    try { if (typeof hostWindow.replaceVariables === 'function') return hostWindow.replaceVariables.bind(hostWindow); } catch (e) {}
    return null;
  }

  var MEDIA_SCRIPT_ID = 'ph-media-library';
  var mediaVariableCache = null;
  function mediaVariableOption() { return { type: 'script', script_id: MEDIA_SCRIPT_ID }; }
  function readBridgeMediaVariables(force) {
    if (!force && mediaVariableCache && typeof mediaVariableCache === 'object') return mediaVariableCache;
    var reader = getVariablesReader();
    if (!reader) throw new Error('酒馆助手脚本变量读取接口尚未就绪');
    var value = reader(mediaVariableOption());
    if (!value || typeof value !== 'object' || Array.isArray(value)) value = {};
    mediaVariableCache = value;
    return mediaVariableCache;
  }
  function writeBridgeMediaVariables(value) {
    if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('媒体库数据无效');
    var replace = getVariablesReplacer(), reader = getVariablesReader();
    if (!replace || !reader) throw new Error('酒馆助手脚本变量写入接口尚未就绪');
    var expected = JSON.stringify(value);
    replace(value, mediaVariableOption());
    var verified = reader(mediaVariableOption());
    if (!verified || typeof verified !== 'object' || Array.isArray(verified) || JSON.stringify(verified) !== expected) throw new Error('媒体库写入后校验失败');
    mediaVariableCache = verified;
    return mediaVariableCache;
  }
  var MEDIA_BRIDGE_VALUE = {
    version: '1.0.0',
    scriptId: MEDIA_SCRIPT_ID,
    read: function () { return readBridgeMediaVariables(false); },
    write: writeBridgeMediaVariables
  };
  var MEDIA_BRIDGE = typeof Object.freeze === 'function' ? Object.freeze(MEDIA_BRIDGE_VALUE) : MEDIA_BRIDGE_VALUE;

  function exposeMediaBridge(target) {
    if (!target) return;
    try { target.__phMedia = MEDIA_BRIDGE; } catch (e) {}
  }

  function clearMediaBridge(target) {
    if (!target) return;
    try { if (target.__phMedia === MEDIA_BRIDGE) delete target.__phMedia; } catch (e) {}
  }

  function destroy(reason) {
    if (runtime.destroyed) return;
    runtime.destroyed = true;
    clearMediaBridge(helperWindow);
    if (hostWindow !== helperWindow) clearMediaBridge(hostWindow);
    try { if (helperWindow[RUNTIME_KEY] === runtime) delete helperWindow[RUNTIME_KEY]; } catch (e) {}
    try { if (hostWindow[RUNTIME_KEY] === runtime) delete hostWindow[RUNTIME_KEY]; } catch (e) {}
  }

  exposeMediaBridge(helperWindow);
  if (hostWindow !== helperWindow) exposeMediaBridge(hostWindow);
})();
