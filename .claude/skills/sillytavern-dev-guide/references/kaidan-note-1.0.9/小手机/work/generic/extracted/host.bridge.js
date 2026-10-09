// 通用小手机 / 平板（酒馆助手脚本，前端内嵌自包含）
// 职责：
//   ① 前端（小手机/平板 HUD）源码内嵌于本脚本，不再依赖角色卡 data.extensions.phone_hud.hud_html；
//   ② 将抽屉作为单例挂载到 SillyTavern 宿主 document.body，不依赖消息楼层或 <UpdateVariable>；
//   ③ 提供 MVU 快照、宿主事件委托、发送与填入桥，并在变量/消息变化后刷新。
(function () {
  'use strict';

  var helperWindow = window;
  var hostWindow = resolveHostWindow();
  var hostDocument = hostWindow.document;
  var RUNTIME_KEY = '__phHudRuntime';
  var previous = helperWindow.__phBridgeRuntime || hostWindow[RUNTIME_KEY];
  if (previous && typeof previous.destroy === 'function') {
    try { previous.destroy('replace'); } catch (e) {}
  }

  var runtime = {
    build: '0.1.0-work',
    destroyed: false,
    root: null,
    timers: Object.create(null),
    stops: [],
    tavernEventsBound: false,
    mvuEventsBound: false,
    mvu: null,
    hudSourceKey: '',
    committedStat: null,
    committedStatJson: '',
    statRevision: 0,
    phase: 'cold',
    chatEpoch: 0,
    isGenerating: false,
    awaitingPersist: false,
    activeUpdateChatEpoch: null,
    bondWritePending: false,
    destroy: destroy
  };
  helperWindow.__phBridgeRuntime = runtime;
  hostWindow[RUNTIME_KEY] = runtime;

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

  function getMvu() {
    if (runtime.mvu) return runtime.mvu;
    var value = null;
    try { if (typeof Mvu !== 'undefined' && Mvu) value = Mvu; } catch (e) {}
    try { if (!value && hostWindow.Mvu) value = hostWindow.Mvu; } catch (e) {}
    if (value) runtime.mvu = value;
    return value;
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

  function getEventOn() {
    try { if (typeof eventOn === 'function') return eventOn; } catch (e) {}
    try { if (typeof hostWindow.eventOn === 'function') return hostWindow.eventOn; } catch (e) {}
    return null;
  }

  function getTavernEvents() {
    try { if (typeof tavern_events !== 'undefined' && tavern_events) return tavern_events; } catch (e) {}
    try { return hostWindow.tavern_events || {}; } catch (e) { return {}; }
  }

  function getTavernHelper() {
    try { if (typeof TavernHelper !== 'undefined' && TavernHelper) return TavernHelper; } catch (e) {}
    try { return hostWindow.TavernHelper || null; } catch (e) { return null; }
  }

  var AI_CONFIG_KEY = 'ph_ai_config_v1';
  var AI_KEY_STORE = 'ph_ai_key_v1'; // localStorage 持久保存，免每次重输
  var AI_LEGACY_SESSION_KEY = 'ph_ai_key_v1'; // 旧版 sessionStorage 存储位，仅用于一次性迁移
  var aiBusy = false;
  var aiGenerations = Object.create(null);
  var AI_SYSTEM_CHAR_LIMIT = 24000;
  var AI_MESSAGE_CHAR_LIMIT = 32768;
  var AI_MESSAGES_TOTAL_CHAR_LIMIT = 96000;
  var AI_RESPONSE_CHAR_LIMIT = 16000;

  function aiStorage(name) {
    try {
      var storage = hostWindow[name];
      return storage && typeof storage.getItem === 'function' ? storage : null;
    } catch (e) { return null; }
  }

  function aiRead(name, key) {
    var storage = aiStorage(name);
    if (!storage) return '';
    try { return String(storage.getItem(key) || ''); } catch (e) { return ''; }
  }

  function aiWrite(name, key, value) {
    var storage = aiStorage(name);
    if (!storage) return false;
    try { storage.setItem(key, String(value)); return true; } catch (e) { return false; }
  }

  function aiRemove(name, key) {
    var storage = aiStorage(name);
    if (!storage) return false;
    try { storage.removeItem(key); return true; } catch (e) { return false; }
  }

  function aiText(value, limit) {
    return String(value == null ? '' : value).trim().slice(0, limit);
  }

  function aiPromptText(value, limit, label) {
    var text = String(value == null ? '' : value).trim();
    if (text.length > limit) throw aiError(label + '超过处理上限，请缩短上下文后重试');
    return text;
  }

  function normalizeAiConfig(value) {
    value = value && typeof value === 'object' ? value : {};
    return { apiurl: aiText(value.apiurl, 2048), model: aiText(value.model, 256) };
  }

  function readAiConfig() {
    var raw = aiRead('localStorage', AI_CONFIG_KEY);
    if (!raw) return normalizeAiConfig({});
    try { return normalizeAiConfig(JSON.parse(raw)); } catch (e) { return normalizeAiConfig({}); }
  }

  function readAiKeyStore() {
    var raw = aiRead('localStorage', AI_KEY_STORE);
    if (!raw) {
      var legacy = aiRead('sessionStorage', AI_LEGACY_SESSION_KEY);
      if (legacy) {
        aiWrite('localStorage', AI_KEY_STORE, legacy);
        aiRemove('sessionStorage', AI_LEGACY_SESSION_KEY);
        raw = legacy;
      }
    }
    if (!raw) return { apiurl: '', key: '' };
    try {
      var value = JSON.parse(raw);
      return { apiurl: aiText(value && value.apiurl, 2048), key: aiText(value && value.key, 4096) };
    } catch (e) { return { apiurl: '', key: '' }; }
  }

  var aiConfig = readAiConfig();

  function aiKeyReady(config) {
    var session = readAiKeyStore();
    config = config || aiConfig;
    return !!session.key && session.apiurl === config.apiurl;
  }

  function aiState() {
    aiConfig = readAiConfig();
    return { apiurl: aiConfig.apiurl, model: aiConfig.model, hasKey: aiKeyReady(aiConfig), enabled: !!(aiConfig.apiurl && aiConfig.model), busy: aiBusy };
  }

  function getAiConfig() {
    var config = readAiConfig();
    if (!config.apiurl || !config.model) return null;
    var session = readAiKeyStore();
    var out = { apiurl: config.apiurl, model: config.model, source: 'openai' };
    if (session.apiurl === config.apiurl && session.key) out.key = session.key;
    return out;
  }

  function aiError(message) {
    return new Error(message);
  }

  function requireAiUrl(value) {
    var apiurl = aiText(value, 2048);
    if (!apiurl) throw aiError('请先填写 OpenAI 格式 API URL');
    if (!/^https?:\/\//i.test(apiurl)) throw aiError('API URL 必须以 http:// 或 https:// 开头');
    if (/^[a-z]+:\/\/[^/]*@/i.test(apiurl)) throw aiError('API URL 不能包含用户名或密码');
    if (/[?&](?:api[_-]?key|key|token|secret)=/i.test(apiurl)) throw aiError('API URL 不能携带 Key、Token 或 Secret 参数');
    return apiurl;
  }

  function aiPublicError(error, action) {
    var status = Number(error && (error.status || error.statusCode || (error.response && error.response.status))) || 0;
    var message = String(error && error.message || '');
    if (status === 401 || /(?:^|\D)401(?:\D|$)|unauthori[sz]ed|invalid[ _-]*(?:api[ _-]*)?key/i.test(message)) return aiError('API Key 无效或无权限（401）');
    if (status === 403 || /(?:^|\D)403(?:\D|$)|forbidden/i.test(message)) return aiError('API 拒绝访问（403），请检查 Key 权限');
    if (status === 404 || /(?:^|\D)404(?:\D|$)|not found/i.test(message)) return aiError('API 地址不存在（404），请检查 Base URL');
    if (status === 429 || /(?:^|\D)429(?:\D|$)|rate limit/i.test(message)) return aiError('API 请求过于频繁（429），请稍后重试');
    if (/failed to fetch|network|cors|load failed|connection|timeout|abort/i.test(message)) return aiError('无法连接 API，请检查地址、网络或 CORS 设置');
    return aiError(action === 'generate' ? 'AI 回复生成失败，请检查 API 设置' : '模型列表拉取失败，请检查 API 设置');
  }

  function modelListRunner() {
    var helper = getTavernHelper();
    if (helper && typeof helper.getModelList === 'function') return { fn: helper.getModelList, owner: helper };
    try { if (typeof getModelList === 'function') return { fn: getModelList, owner: helperWindow }; } catch (e) {}
    try { if (typeof hostWindow.getModelList === 'function') return { fn: hostWindow.getModelList, owner: hostWindow }; } catch (e) {}
    return null;
  }

  function normalizeAiModels(value) {
    var out = [], seen = Object.create(null);
    (Array.isArray(value) ? value.slice(0, 500) : []).forEach(function (item) {
      if (typeof item !== 'string') return;
      var model = aiText(item, 256);
      if (!model || seen[model]) return;
      seen[model] = true;
      out.push(model);
    });
    return out;
  }

  function fetchAiModels(input) {
    if (runtime.destroyed) return Promise.reject(aiError('AI 桥已销毁'));
    if (aiBusy) return Promise.reject(aiError('模型列表正在拉取，请稍候'));
    input = input && typeof input === 'object' ? input : {};
    var apiurl, key;
    try {
      apiurl = requireAiUrl(aiText(input.apiurl, 2048) || aiConfig.apiurl);
      var session = readAiKeyStore();
      key = aiText(input.key, 4096) || (session.apiurl === apiurl ? session.key : '');
      if (!key) throw aiError('请填写当前 API URL 对应的 API Key');
    } catch (error) { return Promise.reject(error); }
    var runner = modelListRunner();
    if (!runner) return Promise.reject(aiError('酒馆助手 getModelList 接口尚未就绪'));
    aiBusy = true;
    var settled = false, timer = 0, request;
    try { request = Promise.resolve(runner.fn.call(runner.owner, { apiurl: apiurl, key: key })); }
    catch (error) { aiBusy = false; return Promise.reject(aiPublicError(error, 'models')); }
    return new Promise(function (resolve, reject) {
      timer = hostWindow.setTimeout(function () {
        if (settled) return;
        settled = true;
        aiBusy = false;
        reject(aiError('模型列表拉取超时，请检查网络或 API 地址'));
      }, 30000);
      request.then(function (value) {
        if (settled) return null;
        try { hostWindow.clearTimeout(timer); } catch (e) {}
        var models = normalizeAiModels(value);
        if (!models.length) throw aiError('API 未返回可用模型');
        settled = true;
        aiBusy = false;
        resolve(models);
        return null;
      }, function (error) {
        if (settled) return null;
        settled = true;
        try { hostWindow.clearTimeout(timer); } catch (e) {}
        aiBusy = false;
        reject(aiPublicError(error, 'models'));
        return null;
      }).catch(function (error) {
        if (settled) return;
        settled = true;
        try { hostWindow.clearTimeout(timer); } catch (e) {}
        aiBusy = false;
        reject(error);
      });
    });
  }

  function generationRunner() {
    var helper = getTavernHelper();
    return helper && typeof helper.generateRaw === 'function' ? { fn: helper.generateRaw, owner: helper } : null;
  }

  function normalizeAiMessages(value) {
    var out = [], total = 0, source = Array.isArray(value) ? value : [];
    source.forEach(function (item, index) {
      if (!item || typeof item !== 'object') return;
      var role = item.role === 'assistant' ? 'assistant' : (item.role === 'user' ? 'user' : '');
      if (!role) return;
      var content = aiPromptText(item.content, AI_MESSAGE_CHAR_LIMIT, '第 ' + (index + 1) + ' 条 AI 消息');
      if (!content) return;
      total += content.length;
      if (total > AI_MESSAGES_TOTAL_CHAR_LIMIT) throw aiError('AI 消息总长度超过处理上限，请缩短上下文后重试');
      out.push({ role: role, content: content });
    });
    return out;
  }

  function generateAiText(input) {
    if (runtime.destroyed) return Promise.reject(aiError('AI 桥已销毁'));
    input = input && typeof input === 'object' ? input : {};
    var config = getAiConfig();
    if (!config || !config.apiurl || !config.model) return Promise.reject(aiError('请先在设置中保存 API URL 与模型'));
    if (!config.key) return Promise.reject(aiError('当前会话没有 API Key，请先到设置中填写'));
    var runner = generationRunner();
    if (!runner) return Promise.reject(aiError('酒馆助手 generateRaw 接口尚未就绪'));
    var system, messages;
    try {
      system = aiPromptText(input.system, AI_SYSTEM_CHAR_LIMIT, 'AI 系统提示词');
      messages = normalizeAiMessages(input.messages);
    } catch (error) { return Promise.reject(error); }
    if (!system || !messages.length) return Promise.reject(aiError('AI 生成上下文不完整'));
    var generationId = aiText(input.generationId, 128);
    if (!generationId) return Promise.reject(aiError('缺少 AI 请求标识'));
    if (!/^[A-Za-z0-9._:-]+$/.test(generationId)) return Promise.reject(aiError('AI 请求标识无效'));
    if (aiGenerations[generationId]) return Promise.reject(aiError('同一 AI 请求正在处理中'));
    var maxTokens = Math.max(64, Math.min(2048, Math.floor(Number(input.maxTokens)) || 512));
    var token = { cancelled: false, timer: 0 };
    aiGenerations[generationId] = token;
    token.timer = hostWindow.setTimeout(function () {
      if (aiGenerations[generationId] !== token) return;
      token.cancelled = true;
      delete aiGenerations[generationId];
      try {
        var helper = getTavernHelper();
        if (helper && typeof helper.stopGenerationById === 'function') helper.stopGenerationById(generationId);
      } catch (e) {}
      try { if (typeof token.reject === 'function') token.reject(aiError('AI 请求超时，请检查网络或模型后重试')); } catch (e) {}
    }, 45000);
    var request, ordered = [{ role: 'system', content: system }].concat(messages);
    try {
      request = Promise.resolve(runner.fn.call(runner.owner, {
        generation_id: generationId,
        should_silence: true,
        should_stream: false,
        max_chat_history: 0,
        ordered_prompts: ordered,
        custom_api: { apiurl: config.apiurl, key: config.key, model: config.model, source: 'openai', max_tokens: maxTokens }
      }));
    } catch (error) {
      try { hostWindow.clearTimeout(token.timer); } catch (e) {}
      delete aiGenerations[generationId];
      return Promise.reject(aiPublicError(error, 'generate'));
    }
    return new Promise(function (resolve, reject) {
      token.reject = reject;
      request.then(function (value) {
        if (aiGenerations[generationId] === token) { try { hostWindow.clearTimeout(token.timer); } catch (e) {} delete aiGenerations[generationId]; }
        if (token.cancelled) throw aiError('AI 请求已取消');
        if (typeof value !== 'string') throw aiError('API 返回了非文本结果');
        var text = String(value == null ? '' : value).trim();
        if (!text) throw aiError('API 未返回可用回复');
        if (text.length > AI_RESPONSE_CHAR_LIMIT) throw aiError('API 回复超过处理上限，请缩短生成内容后重试');
        return { generationId: generationId, text: text };
      }, function (error) {
        if (aiGenerations[generationId] === token) { try { hostWindow.clearTimeout(token.timer); } catch (e) {} delete aiGenerations[generationId]; }
        if (token.cancelled) throw aiError('AI 请求已取消');
        throw aiPublicError(error, 'generate');
      }).then(resolve, reject);
    });
  }

  function cancelAiGeneration(generationId) {
    generationId = aiText(generationId, 128);
    var token = generationId && aiGenerations[generationId];
    if (!token) return false;
    if (token.timer) { try { hostWindow.clearTimeout(token.timer); } catch (e) {} token.timer = 0; }
    token.cancelled = true;
    var helper = getTavernHelper();
    try { return !!(helper && typeof helper.stopGenerationById === 'function' && helper.stopGenerationById(generationId)); }
    catch (error) { return false; }
  }

  function cancelAllAiGenerations() {
    Object.keys(aiGenerations).forEach(cancelAiGeneration);
  }

  function saveAiConfig(input) {
    if (runtime.destroyed) throw aiError('AI 桥已销毁');
    input = input && typeof input === 'object' ? input : {};
    var next = normalizeAiConfig(input);
    next.apiurl = requireAiUrl(next.apiurl);
    if (!next.model) throw aiError('请先拉取并选择模型');
    var typedKey = aiText(input.key, 4096), stored = readAiKeyStore();
    var key = typedKey || (stored.apiurl === next.apiurl ? stored.key : '');
    if (!key) throw aiError('请填写当前 API URL 对应的 API Key');
    var oldStored = aiRead('localStorage', AI_KEY_STORE);
    if (typedKey && !aiWrite('localStorage', AI_KEY_STORE, JSON.stringify({ apiurl: next.apiurl, key: typedKey }))) throw aiError('当前环境无法保存 API Key');
    if (!aiWrite('localStorage', AI_CONFIG_KEY, JSON.stringify(next))) {
      if (typedKey) { if (oldStored) aiWrite('localStorage', AI_KEY_STORE, oldStored); else aiRemove('localStorage', AI_KEY_STORE); }
      throw aiError('当前环境无法保存 API 设置');
    }
    aiRemove('sessionStorage', AI_LEGACY_SESSION_KEY);
    aiConfig = next;
    return aiState();
  }

  function clearAiKey() {
    if (runtime.destroyed) throw aiError('AI 桥已销毁');
    var storage = aiStorage('localStorage');
    if (!storage) throw aiError('当前环境无法清除 API Key');
    try { storage.removeItem(AI_KEY_STORE); aiRemove('sessionStorage', AI_LEGACY_SESSION_KEY); }
    catch (error) { throw aiError('当前环境无法清除 API Key'); }
    return aiState();
  }

  var AI_BRIDGE_VALUE = {
    version: '1.0.9-r2',
    getState: aiState,
    fetchModels: fetchAiModels,
    generate: generateAiText,
    cancel: cancelAiGeneration,
    save: saveAiConfig,
    clearKey: clearAiKey
  };
  var AI_BRIDGE = typeof Object.freeze === 'function' ? Object.freeze(AI_BRIDGE_VALUE) : AI_BRIDGE_VALUE;

  function currentCard() {
    try {
      if (typeof getCharData === 'function') return getCharData('current');
    } catch (e) {}
    try {
      var helper = getTavernHelper();
      if (helper && typeof helper.getCharData === 'function') return helper.getCharData('current');
    } catch (e) {}
    try {
      var st = hostWindow.SillyTavern;
      var ctx = st && typeof st.getContext === 'function' ? st.getContext() : null;
      return ctx && ctx.characters && ctx.characterId >= 0 ? ctx.characters[ctx.characterId] : null;
    } catch (e) {}
    return null;
  }

  
  function hudHtml() {
    if (HUD_SOURCE && HUD_SOURCE.charAt(0) === '<') return HUD_SOURCE;
    var card = currentCard();
    var ext = card && card.data && card.data.extensions;
    var value = ext && ext.phone_hud && ext.phone_hud.hud_html;
    return typeof value === 'string' ? value : '';
  }

  function hudSourceKey(source) {
    source = String(source || '');
    var hash = 5381;
    for (var i = 0; i < source.length; i++) hash = ((hash << 5) + hash) ^ source.charCodeAt(i);
    return source.length + ':' + (hash >>> 0).toString(36);
  }

  function readLatestStat() {
    try {
      var mvu = getMvu();
      if (mvu && typeof mvu.getMvuData === 'function') {
        var data = mvu.getMvuData({ type: 'message', message_id: 'latest' });
        if (data && data.stat_data) return data.stat_data;
      }
    } catch (e) {}
    try {
      var readVariables = getVariablesReader();
      if (readVariables) {
        var persisted = readVariables({ type: 'message', message_id: 'latest' });
        if (persisted && persisted.stat_data) return persisted.stat_data;
      }
    } catch (e) {}
    return null;
  }

  function commitStat(stat) {
    if (!stat || typeof stat !== 'object') return false;
    var encoded = '';
    try { encoded = JSON.stringify(stat); } catch (e) { return false; }
    if (!encoded) return false;
    if (runtime.committedStat && encoded === runtime.committedStatJson) return true;
    var snapshot = null;
    try { snapshot = JSON.parse(encoded); } catch (e) { return false; }
    if (!snapshot || typeof snapshot !== 'object') return false;
    runtime.committedStat = snapshot;
    runtime.committedStatJson = encoded;
    runtime.statRevision += 1;
    return true;
  }

  function commitMvuData(data) {
    return !!(data && commitStat(data.stat_data));
  }

  function syncLatestStat(expectedChatEpoch, force) {
    if (runtime.destroyed || expectedChatEpoch !== runtime.chatEpoch) return false;
    if (!force && runtime.phase !== 'cold' && runtime.phase !== 'stable' && runtime.phase !== 'switching') return false;
    var stat = readLatestStat();
    if (!stat || !commitStat(stat)) return false;
    runtime.isGenerating = false;
    runtime.awaitingPersist = false;
    runtime.activeUpdateChatEpoch = null;
    runtime.phase = 'stable';
    requestRefresh(0);
    return true;
  }

  function getStat() {
    return runtime.committedStat;
  }

  function bridgeMessageId() {
    var value = null;
    try { if (typeof getLastMessageId === 'function') value = getLastMessageId(); } catch (e) {}
    try { if (value === null && typeof getCurrentMessageId === 'function') value = getCurrentMessageId(); } catch (e) {}
    try {
      var helper = getTavernHelper();
      if (value === null && helper && typeof helper.getLastMessageId === 'function') value = helper.getLastMessageId();
      if (value === null && helper && typeof helper.getCurrentMessageId === 'function') value = helper.getCurrentMessageId();
    } catch (e) {}
    try {
      if (value === null && typeof hostWindow.getLastMessageId === 'function') value = hostWindow.getLastMessageId();
      if (value === null && typeof hostWindow.getCurrentMessageId === 'function') value = hostWindow.getCurrentMessageId();
    } catch (e) {}
    var numeric = Number(value);
    return Number.isInteger(numeric) && numeric >= 0 ? numeric : null;
  }

  function bridgeMessageMatches(messageId) {
    return messageId !== null && String(bridgeMessageId()) === String(messageId);
  }

  function copyMvuData(value) {
    try { if (typeof structuredClone === 'function') return structuredClone(value); } catch (e) {}
    try { return JSON.parse(JSON.stringify(value)); } catch (e) { return null; }
  }

  function writeCharacterBond(name) {
    name = String(name || '').trim();
    if (!name) return Promise.reject(new Error('角色姓名为空'));
    if (runtime.destroyed) return Promise.reject(new Error('状态栏桥已销毁'));
    if (runtime.bondWritePending) return Promise.reject(new Error('另一项羁绊写入正在处理'));
    if (runtime.isGenerating || runtime.awaitingPersist || (runtime.phase !== 'stable' && runtime.phase !== 'cold')) return Promise.reject(new Error('变量正在结算，请稍后再试'));
    var mvu = getMvu(), messageId = bridgeMessageId(), epoch = runtime.chatEpoch, options = { type: 'message', message_id: messageId };
    if (messageId === null) return Promise.reject(new Error('无法确认当前最新楼层，请稍后再试'));
    if (!mvu || typeof mvu.getMvuData !== 'function' || typeof mvu.replaceMvuData !== 'function') return Promise.reject(new Error('MVU 写入接口尚未就绪'));
    var current = null, next = null, schema = null;
    try { current = mvu.getMvuData(options); } catch (error) { return Promise.reject(error); }
    next = copyMvuData(current);
    if (!next || !next.stat_data || typeof next.stat_data !== 'object') return Promise.reject(new Error('当前楼层变量尚未就绪'));
    var archive = next.stat_data.角色档案;
    if (!archive || typeof archive !== 'object' || Array.isArray(archive) || !archive[name] || typeof archive[name] !== 'object' || Array.isArray(archive[name])) return Promise.reject(new Error('角色档案缺失：' + name));
    if (archive[name].羁绊标签 === true) return Promise.resolve(true);
    archive[name].羁绊标签 = true;
    archive[name].角色类型 = '羁绊角色';
    try { schema = helperWindow.__phMvuSchema || hostWindow.__phMvuSchema; } catch (e) {}
    if (!schema || typeof schema.parse !== 'function') return Promise.reject(new Error('变量 schema 尚未就绪'));
    try { next.stat_data = schema.parse(next.stat_data); } catch (error) { return Promise.reject(error); }
    if (epoch !== runtime.chatEpoch || !bridgeMessageMatches(messageId)) return Promise.reject(new Error('对话或楼层已切换，请重新操作'));
    runtime.bondWritePending = true;
    var task = null;
    try { task = mvu.replaceMvuData(next, options); } catch (error) { runtime.bondWritePending = false; return Promise.reject(error); }
    return Promise.resolve(task).then(function () {
      runtime.bondWritePending = false;
      if (runtime.destroyed || epoch !== runtime.chatEpoch || !bridgeMessageMatches(messageId)) throw new Error('对话或楼层已切换，旧操作不再回写当前界面');
      commitMvuData(next);
      runtime.phase = 'stable';
      requestRefresh(0);
      return true;
    }, function (error) { runtime.bondWritePending = false; throw error; });
  }

  function removeMvuRecord(path) {
    path = String(path || '').trim();
    if (!path || path.indexOf('/') < 0) return Promise.reject(new Error('删除路径无效'));
    var rootKey = path.split('/')[0];
    if (['居所', '载具', '资产库', '雷达系统'].indexOf(rootKey) < 0) return Promise.reject(new Error('该变量根不允许玩家删除'));
    if (runtime.destroyed) return Promise.reject(new Error('状态栏桥已销毁'));
    if (runtime.bondWritePending) return Promise.reject(new Error('另一项写入正在处理'));
    if (runtime.isGenerating || runtime.awaitingPersist || (runtime.phase !== 'stable' && runtime.phase !== 'cold')) return Promise.reject(new Error('变量正在结算，请稍后再试'));
    var mvu = getMvu(), messageId = bridgeMessageId(), epoch = runtime.chatEpoch, options = { type: 'message', message_id: messageId };
    if (messageId === null) return Promise.reject(new Error('无法确认当前最新楼层，请稍后再试'));
    if (!mvu || typeof mvu.getMvuData !== 'function' || typeof mvu.replaceMvuData !== 'function') return Promise.reject(new Error('MVU 写入接口尚未就绪'));
    var current = null, next = null, schema = null;
    try { current = mvu.getMvuData(options); } catch (error) { return Promise.reject(error); }
    next = copyMvuData(current);
    if (!next || !next.stat_data || typeof next.stat_data !== 'object') return Promise.reject(new Error('当前楼层变量尚未就绪'));
    var parts = path.split('/'), parent = next.stat_data;
    for (var i = 0; i < parts.length - 1; i++) {
      parent = parent && parent[parts[i]];
      if (!parent || typeof parent !== 'object') return Promise.reject(new Error('路径不存在：' + path));
    }
    var leaf = parts[parts.length - 1];
    if (!Object.prototype.hasOwnProperty.call(parent, leaf)) return Promise.reject(new Error('条目不存在：' + path));
    delete parent[leaf];
    try { schema = helperWindow.__phMvuSchema || hostWindow.__phMvuSchema; } catch (e) {}
    if (schema && typeof schema.parse === 'function') { try { next.stat_data = schema.parse(next.stat_data); } catch (error) { return Promise.reject(error); } }
    if (epoch !== runtime.chatEpoch || !bridgeMessageMatches(messageId)) return Promise.reject(new Error('对话或楼层已切换，请重新操作'));
    runtime.bondWritePending = true;
    var task = null;
    try { task = mvu.replaceMvuData(next, options); } catch (error) { runtime.bondWritePending = false; return Promise.reject(error); }
    return Promise.resolve(task).then(function () {
      runtime.bondWritePending = false;
      if (runtime.destroyed || epoch !== runtime.chatEpoch || !bridgeMessageMatches(messageId)) throw new Error('对话或楼层已切换，旧操作不再回写当前界面');
      commitMvuData(next);
      runtime.phase = 'stable';
      requestRefresh(0);
      return true;
    }, function (error) { runtime.bondWritePending = false; throw error; });
  }

  function scheduleStableSync(chatEpoch, attempt, delay) {
    schedule('stat-sync', function () {
      if (syncLatestStat(chatEpoch, false)) return;
      if (attempt < 119 && chatEpoch === runtime.chatEpoch
        && (runtime.phase === 'cold' || runtime.phase === 'switching')) {
        scheduleStableSync(chatEpoch, attempt + 1, 250);
      }
    }, delay);
  }

  function beginNavigation(clearCommitted, delay) {
    runtime.chatEpoch += 1;
    runtime.isGenerating = false;
    runtime.awaitingPersist = false;
    runtime.activeUpdateChatEpoch = null;
    runtime.phase = 'switching';
    clearTimer('stat-finalize');
    clearTimer('stat-reconcile');
    if (clearCommitted) { runtime.committedStat = null; runtime.committedStatJson = ''; runtime.statRevision += 1; }
    requestRefresh(0);
    scheduleStableSync(runtime.chatEpoch, 0, typeof delay === 'number' ? delay : 280);
  }

  function escPipe(text) {
    return String(text).replace(/\|/g, '\\|');
  }

  function getSlashRunner() {
    var helper = getTavernHelper();
    if (helper && typeof helper.triggerSlash === 'function') {
      return function (command) { return helper.triggerSlash(command); };
    }
    try {
      if (typeof triggerSlash === 'function') return function (command) { return triggerSlash(command); };
    } catch (e) {}
    return null;
  }

  function runSlash(command) {
    var runner = getSlashRunner();
    if (!runner) return Promise.reject(new Error('酒馆助手命令接口尚未就绪'));
    try { return Promise.resolve(runner(command)); }
    catch (error) { return Promise.reject(error); }
  }

  function hostInputValue() {
    try {
      var input = hostDocument.querySelector('#send_textarea');
      if (!input) return '';
      return String(input.value != null ? input.value : input.textContent || '');
    } catch (e) { return ''; }
  }

  function hostInputText() {
    return hostInputValue().trim();
  }

  function doSend(text) {
    return runSlash('/send ' + escPipe(text) + ' | /trigger').then(function () { return true; });
  }

  function doInput(text) {
    if (hostInputText()) return Promise.reject(new Error('输入框已有内容，请先清空或自行合并'));
    return runSlash('/setinput ' + escPipe(text)).then(function () { return true; });
  }

  function doAppendInput(text) {
    var current = hostInputValue().replace(/[\t ]+$/gm, '').replace(/\s+$/, '');
    var combined = current ? current + '\n' + text : text;
    var commandText = escPipe(combined).replace(/\r?\n/g, '{{newline}}');
    return runSlash('/setinput ' + commandText).then(function () { return true; });
  }

  var FLOORCHAT_TIMERS = [];
  var FLOORCHAT_DISPOSERS = [];
  function ensureFloorChatStyle() {
    try {
      if (hostDocument.getElementById('ph-floorchat-style')) return;
      var st = hostDocument.createElement('style');
      st.id = 'ph-floorchat-style';
      st.textContent = '.ph-fc-wrap{display:flex;flex-direction:column;gap:7px;margin:10px 0;max-width:560px}'
        + '.ph-fc-head{align-self:center;display:flex;align-items:center;gap:10px;font-size:11px;color:rgba(236,240,246,.45);letter-spacing:.5px;margin:2px 0}'
        + '.ph-fc-head::before,.ph-fc-head::after{content:"";height:1px;width:44px}'
        + '.ph-fc-head::before{background:linear-gradient(90deg,transparent,rgba(211,173,99,.4))}'
        + '.ph-fc-head::after{background:linear-gradient(90deg,rgba(211,173,99,.4),transparent)}'
        + '.ph-fc-bubble{max-width:84%;padding:9px 11px;border-radius:14px;font-size:13px;line-height:1.55;white-space:pre-wrap;word-break:break-word;border:.5px solid rgba(255,255,255,.09);color:rgba(255,255,255,.92)}'
        + '.ph-fc-user{align-self:flex-end;background:rgba(211,173,99,.18);border-color:rgba(211,173,99,.28);border-bottom-right-radius:5px}'
        + '.ph-fc-them{align-self:flex-start;background:rgba(255,255,255,.05);border-bottom-left-radius:5px}'
        + '.ph-fc-name{display:block;font-size:9px;color:#a6c8bd;margin-bottom:3px;letter-spacing:.4px}'
        + '.ph-fc-sys{align-self:center;font-size:11px;color:rgba(236,240,246,.4)}';
      (hostDocument.head || hostDocument.documentElement).appendChild(st);
    } catch (e) {}
  }
  function buildFloorChat(text) {
    var wrap = hostDocument.createElement('div');
    wrap.className = 'ph-fc-wrap';
    var lines = String(text || '').split(/\r\n|\r|\n/);
    var lastWho = null, expectThem = '';
    for (var i = 0; i < lines.length; i++) {
      var line = lines[i];
      if (!line.trim()) continue;
      if (line.charAt(0) === '#') {
        var hd = hostDocument.createElement('div');
        hd.className = 'ph-fc-head';
        hd.textContent = line.slice(1).trim();
        wrap.appendChild(hd);
        lastWho = null;
        var hm = line.match(/与\s*(.+?)\s*的幽讯/);
        expectThem = hm ? hm[1] : '';
        continue;
      }
      if (line.charAt(0) === '·') {
        var sy = hostDocument.createElement('div');
        sy.className = 'ph-fc-sys';
        sy.textContent = line.slice(1).trim();
        wrap.appendChild(sy);
        continue;
      }
      var m = line.match(/^(.+?):\s?([\s\S]*)$/);
      if (!m) continue;
      var who = m[1].trim(), content = m[2];
      var isMe = who === '我' || who.toLowerCase() === 'user' || who === '{{user}}';
      var b = hostDocument.createElement('div');
      b.className = 'ph-fc-bubble ' + (isMe ? 'ph-fc-user' : 'ph-fc-them');
      if (!isMe && who !== lastWho && who !== expectThem) {
        var nm = hostDocument.createElement('span');
        nm.className = 'ph-fc-name';
        nm.textContent = who;
        b.appendChild(nm);
      }
      b.appendChild(hostDocument.createTextNode(content));
      wrap.appendChild(b);
      lastWho = who;
    }
    return wrap;
  }
  function renderFloorChat() {
    try {
      var codes = hostDocument.querySelectorAll('pre > code');
      for (var i = 0; i < codes.length; i++) {
        var code = codes[i], pre = code.parentNode;
        if (!pre || !pre.parentNode) continue;
        var cls = String(code.className || ''), txt = String(code.textContent || '');
        if (cls.indexOf('phchat') === -1 && !/^\s*#与 .+ 的幽讯/.test(txt)) continue; // 认领必须严：围栏语言或首行协议头
        var built = buildFloorChat(txt);
        if (built && built.childNodes.length) pre.parentNode.replaceChild(built, pre);
      }
    } catch (e) {}
  }
  function bindFloorChat() {
    ensureFloorChatStyle();
    renderFloorChat();
    [600, 1500, 3000, 6000].forEach(function (d) { FLOORCHAT_TIMERS.push(hostWindow.setTimeout(renderFloorChat, d)); });
    try {
      var ev = getEventOn();
      var names = hostWindow.tavern_events || {};
      var list = [names.CHAT_CHANGED, names.CHARACTER_MESSAGE_RENDERED, names.USER_MESSAGE_RENDERED, names.MESSAGE_UPDATED, names.MESSAGE_SWIPED].filter(Boolean);
      if (typeof ev === 'function') list.forEach(function (nm) {
        try {
          var disp = ev(nm, function () { hostWindow.setTimeout(renderFloorChat, 140); });
          if (typeof disp === 'function') FLOORCHAT_DISPOSERS.push(disp);
          else if (disp && disp.stop) FLOORCHAT_DISPOSERS.push(function () { disp.stop(); });
        } catch (e) {}
      });
    } catch (e) {}
  }

  function onOrbOpenPhone() {
    try {
      var root = hostDocument.getElementById('ph-statusbar-root');
      if (!root) { mountHud(); root = hostDocument.getElementById('ph-statusbar-root'); }
      if (!root) return;
      root.style.transition = 'box-shadow .3s';
      root.style.boxShadow = '0 0 0 3px rgba(216,166,86,.7),0 0 24px rgba(216,166,86,.45)';
      hostWindow.setTimeout(function () { try { root.style.boxShadow = ''; } catch (e) {} }, 1400);
    } catch (e) {}
  }
  try { hostWindow.addEventListener('ph-orb:open-phone', onOrbOpenPhone); } catch (e) {}

  function exposeBridge(target) {
    if (!target) return;
    try {
      target.__phStatBridge = getStat;
      target.__phSend = doSend;
      target.__phInput = doInput;
      target.__phAi = AI_BRIDGE;
      target.__phBond = writeCharacterBond;
      target.__phRemove = removeMvuRecord;
    } catch (e) {}
  }

  function clearBridge(target) {
    if (!target) return;
    try { if (target.__phStatBridge === getStat) delete target.__phStatBridge; } catch (e) {}
    try { if (target.__phSend === doSend) delete target.__phSend; } catch (e) {}
    try { if (target.__phInput === doInput) delete target.__phInput; } catch (e) {}
    try { if (target.__phAi === AI_BRIDGE) delete target.__phAi; } catch (e) {}
    try { if (target.__phBond === writeCharacterBond) delete target.__phBond; } catch (e) {}
    try { if (target.__phRemove === removeMvuRecord) delete target.__phRemove; } catch (e) {}
  }

  function clearTimer(name) {
    var id = runtime.timers[name];
    if (id === undefined) return;
    try { hostWindow.clearTimeout(id); } catch (e) {}
    delete runtime.timers[name];
  }

  function schedule(name, fn, delay) {
    clearTimer(name);
    runtime.timers[name] = hostWindow.setTimeout(function () {
      delete runtime.timers[name];
      if (!runtime.destroyed) fn();
    }, delay);
  }

  function bindEvent(type, handler) {
    var on = getEventOn();
    if (!type || !on) return false;
    try {
      var listener = on(type, handler);
      if (listener && typeof listener.stop === 'function') {
        runtime.stops.push(function () { listener.stop(); });
      }
      return true;
    } catch (e) {
      return false;
    }
  }

  var OPTION_COLORS = {
    '理性': '#6ea8e6', '感性': '#c25a82', '直觉': '#8b6fc0', '冲动': '#cf6a48',
    '利益': '#d3ad63', '道德': '#3fa07f',
    '武力': '#df5b57', '智取': '#62a7c7', '交涉': '#d59a5f', '求助': '#78a7e8',
    '合作': '#58b78f', '对抗': '#d75f64', '功利': '#c9a35b', '个性': '#af7bd6',
    '移动': '#69a4d8', '外出': '#4fb7ad', '换角色': '#d07fab', '换地点': '#7c91d8',
    '探索': '#5cbba4', '观察': '#7aa6e6', '利用': '#c49a61',
    '增进好感': '#e588a9', '建立信任': '#65b59a', '制造疏远': '#8f91aa',
    '时跳': '#9b8ad4',
    '激化矛盾': '#e05f58', '引入变量': '#58a8cf', '制造困境': '#c77a4b', '揭露秘密': '#9b72ce',
    '日常': '#73839f', '亲密': '#e07aa5', '色情': '#e35374',
    '反套路': '#7f91e6', '意外': '#e7a353', '无厘头': '#42b2a6', '打破常规': '#b873d1'
  };
  var OPTION_FALLBACK_COLORS = ['#6ea8e6', '#e07aa5', '#a884e8', '#ef7d57', '#d8b45f', '#58b78f', '#42b2a6'];

  function optionColor(type) {
    if (OPTION_COLORS[type]) return OPTION_COLORS[type];
    var hash = 0;
    for (var i = 0; i < type.length; i++) hash = ((hash << 5) - hash + type.charCodeAt(i)) | 0;
    return OPTION_FALLBACK_COLORS[Math.abs(hash) % OPTION_FALLBACK_COLORS.length];
  }

  function closestWithAttr(node, attr) {
    while (node && node !== hostDocument) {
      try { if (node.getAttribute && node.getAttribute(attr) !== null) return node; } catch (e) {}
      node = node.parentNode;
    }
    return null;
  }

  function fragmentTip(root, attr, text, bad) {
    var tip = null;
    try { tip = root && root.querySelector('[' + attr + ']'); } catch (e) {}
    if (!tip) return;
    tip.textContent = text;
    tip.style.display = 'block';
    tip.style.color = bad ? '#c24a4a' : '#d3ad63';
  }

  function errorText(error) {
    return error && error.message ? error.message : '递送失败，请稍后重试';
  }

  function notifyHost(text, bad) {
    try {
      var toast = hostWindow.toastr;
      var fn = toast && toast[bad ? 'error' : 'info'];
      if (typeof fn === 'function') fn.call(toast, text, '小手机');
    } catch (e) {}
  }

  function setFragmentBusy(root, button, busy) {
    if (root) root.__phBusy = !!busy;
    if (!button) return;
    if (busy) {
      button.__phOldOpacity = button.style.opacity || '';
      button.disabled = true;
      button.style.opacity = '.6';
    } else {
      button.disabled = false;
      button.style.opacity = button.__phOldOpacity || '';
    }
  }

  function optionAlreadyInInput(text) {
    return hostInputValue().split(/\r?\n/).some(function (line) { return line.trim() === String(text).trim(); });
  }

  function markOptionAdded(button, added) {
    if (!button) return;
    button.__phAdded = !!added;
    button.setAttribute('aria-pressed', added ? 'true' : 'false');
    button.style.borderColor = added ? 'rgba(211,173,99,.58)' : 'rgba(255,255,255,.09)';
    button.style.background = added ? 'rgba(211,173,99,.12)' : 'rgba(255,255,255,.045)';
    button.style.boxShadow = added ? 'inset 0 0 0 1px rgba(211,173,99,.08)' : 'none';
  }

  function openingText(root, skip) {
    var parts = [];
    if (!skip) {
      ['国家', '省份', '城市', '具体地点'].forEach(function (key) {
        var field = root.querySelector('[data-phopen="' + key + '"]');
        var value = field ? String(field.value || '').trim().replace(/\s+/g, ' ') : '';
        if (value) parts.push(key + ':' + value);
      });
    }
    return '【开局设定】'
      + (parts.length ? parts.join(' ') : '交给剧情安排一座大城市')
      + ' ——设定完成,从这里开始吧。';
  }

  function handleOpening(root, button, skip) {
    if (!root || root.__phBusy) return;
    setFragmentBusy(root, button, true);
    fragmentTip(root, 'data-phopen-tip', '正在写入输入框……', false);
    doInput(openingText(root, skip)).then(function () {
      fragmentTip(root, 'data-phopen-tip', '已写入输入框，请检查后发送', false);
    }, function (error) {
      fragmentTip(root, 'data-phopen-tip', errorText(error), true);
    }).then(function () { setFragmentBusy(root, button, false); });
  }

  function handleOption(root, button) {
    if (!root || !button || root.__phBusy) return;
    var text = button.__phOptionText || '';
    var direct = root.querySelector('[data-phopt-direct]');
    var wantSend = !!(direct && direct.checked);
    if (!wantSend && optionAlreadyInInput(text)) {
      markOptionAdded(button, true);
      fragmentTip(root, 'data-phopt-tip', '该选项已在输入框中，可直接继续编辑', false);
      return;
    }
    setFragmentBusy(root, button, true);
    fragmentTip(root, 'data-phopt-tip', wantSend ? '正在直发……' : '正在追加到输入框……', false);
    (wantSend ? doSend(text) : doAppendInput(text)).then(function () {
      if (!wantSend) markOptionAdded(button, true);
      fragmentTip(root, 'data-phopt-tip', wantSend ? '已直发并开始生成' : '已换行填入，可继续多选或自行编辑', false);
    }, function (error) {
      var message = wantSend
        ? '直发未完整完成，消息可能已写入聊天；请先检查记录再重试：' + errorText(error)
        : errorText(error);
      fragmentTip(root, 'data-phopt-tip', message, true);
      if (wantSend) notifyHost(message, true);
    }).then(function () { setFragmentBusy(root, button, false); });
  }

  function applyOptionCollapsed(root, collapsed) {
    var list = root && root.querySelector('[data-phopt-list]');
    var btn = root && root.querySelector('[data-phopt-collapse]');
    if (list) list.style.display = collapsed ? 'none' : '';
    if (btn) { btn.setAttribute('aria-expanded', collapsed ? 'false' : 'true'); btn.textContent = collapsed ? '展开' : '收起'; }
  }

  function hydrateOptionRoot(root) {
    if (!root) return;
    var raw = root.querySelector('[data-phopt-raw]');
    var list = root.querySelector('[data-phopt-list]');
    var direct = root.querySelector('[data-phopt-direct]');
    if (!raw || !list || !direct) return;
    if (root.__phOptHydrated && (list.childNodes || []).length) return;
    root.__phOptHydrated = true;
    try { direct.checked = hostWindow.localStorage.getItem('ph_opt_direct') === '1'; } catch (e) {}
    var optCollapsed = false;
    try { optCollapsed = hostWindow.localStorage.getItem('ph_opt_collapsed') === '1'; } catch (e) {}
    applyOptionCollapsed(root, optCollapsed);
    list.innerHTML = '';
    var count = 0;
    String(raw.textContent || '').split(/\r?\n/).forEach(function (line) {
      var match = line.trim().match(/^(\d+)\s*\|\s*([^|]+?)\s*\|\s*(.+)$/);
      if (!match) return;
      var type = match[2].trim();
      var optionText = match[3].trim();
      var color = optionColor(type);
      var button = hostDocument.createElement('button');
      button.type = 'button';
      button.setAttribute('data-phopt-choice', String(count));
      button.setAttribute('aria-pressed', 'false');
      button.__phOptionText = optionText;
      button.style.cssText = 'display:flex;align-items:center;gap:8px;width:100%;min-width:0;text-align:left;padding:8px 11px;border-radius:12px;background:rgba(255,255,255,.045);border:.5px solid rgba(255,255,255,.09);cursor:pointer;font-size:13px;line-height:1.35;color:rgba(255,255,255,.88);font-family:inherit;transition:background .16s,border-color .16s,transform .16s';
      var tag = hostDocument.createElement('span');
      tag.style.cssText = 'flex-shrink:0;white-space:nowrap;font-size:10px;font-weight:600;line-height:1.2;padding:2px 7px;border-radius:7px;border:1px solid ' + color + '55;background:' + color + '2e;color:' + color;
      tag.textContent = type;
      var label = hostDocument.createElement('span');
      label.style.cssText = 'min-width:0;overflow-wrap:anywhere;word-break:break-word';
      label.textContent = optionText;
      button.appendChild(tag);
      button.appendChild(label);
      list.appendChild(button);
      count += 1;
    });
    if (!count) root.style.display = 'none';
  }

  function hydrateSettlementRoot(root) {
    if (!root || root.__phSettlementHydrated) return;
    root.__phSettlementHydrated = true;
    ['[data-ph-settlement-analysis]', '[data-ph-settlement-patch]'].forEach(function (selector) {
      var node = root.querySelector(selector);
      if (!node) return;
      node.textContent = String(node.textContent || '')
        .replace(/\r/g, '')
        .replace(/\n[ \t]*\n+/g, '\n')
        .trim();
    });
  }

  function hydrateFragments() {
    if (runtime.destroyed || !hostDocument || !hostDocument.querySelectorAll) return;
    var roots = hostDocument.querySelectorAll('[data-phopt-root]');
    for (var i = 0; i < roots.length; i++) hydrateOptionRoot(roots[i]);
    roots = hostDocument.querySelectorAll('[data-ph-settlement]');
    for (var j = 0; j < roots.length; j++) hydrateSettlementRoot(roots[j]);
  }

  function requestFragments(delay) {
    schedule('fragments', hydrateFragments, typeof delay === 'number' ? delay : 40);
  }

  function onHostClick(event) {
    var button = closestWithAttr(event && event.target, 'data-phopen-go');
    if (button) { handleOpening(closestWithAttr(button, 'data-phopen-root'), button, false); return; }
    button = closestWithAttr(event && event.target, 'data-phopen-skip');
    if (button) { handleOpening(closestWithAttr(button, 'data-phopen-root'), button, true); return; }
    button = closestWithAttr(event && event.target, 'data-phopt-collapse');
    if (button) {
      var optRoot = closestWithAttr(button, 'data-phopt-root');
      if (optRoot) {
        var optList = optRoot.querySelector('[data-phopt-list]');
        if (optList && !(optList.childNodes || []).length) { optRoot.__phOptHydrated = false; hydrateOptionRoot(optRoot); }
        var nowCollapsed = button.getAttribute('aria-expanded') !== 'false';
        applyOptionCollapsed(optRoot, nowCollapsed);
        try { hostWindow.localStorage.setItem('ph_opt_collapsed', nowCollapsed ? '1' : '0'); } catch (e) {}
      }
      return;
    }
    button = closestWithAttr(event && event.target, 'data-phopt-choice');
    if (button) handleOption(closestWithAttr(button, 'data-phopt-root'), button);
  }

  function onHostChange(event) {
    var toggle = closestWithAttr(event && event.target, 'data-phopt-direct');
    if (!toggle) return;
    try { hostWindow.localStorage.setItem('ph_opt_direct', toggle.checked ? '1' : '0'); } catch (e) {}
  }

  function destroyMountedRoot() {
    var root = runtime.root;
    runtime.root = null;
    runtime.hudSourceKey = '';
    if (!root) return;
    try { if (typeof root.__phDestroy === 'function') root.__phDestroy(); } catch (e) {}
    try { root.remove(); } catch (e) {
      try { if (root.parentNode) root.parentNode.removeChild(root); } catch (_e) {}
    }
  }

  function mountHud(source, sourceKey) {
    if (runtime.destroyed || !hostDocument || !hostDocument.body) return false;
    source = typeof source === 'string' ? source : hudHtml();
    if (!source) return false;
    sourceKey = sourceKey || hudSourceKey(source);

    var node = null;
    try {
      var template = hostDocument.createElement('template');
      template.innerHTML = source.trim();
      node = template.content.querySelector('#ph-statusbar-root');
      if (!node) throw new Error('hud root missing');
      var script = node.querySelector('script');
      if (!script) throw new Error('hud script missing');
      var scriptText = script.textContent || '';
      script.remove();

      var stale = hostDocument.getElementById('ph-statusbar-root');
      if (stale && stale !== node) {
        try { if (typeof stale.__phDestroy === 'function') stale.__phDestroy(); } catch (e) {}
        try { stale.remove(); } catch (e) {}
      }

      hostDocument.body.appendChild(node);
      runtime.root = node;
      runtime.hudSourceKey = sourceKey;
      node.setAttribute('data-ph-build', runtime.build);
      node.__phHudSourceKey = sourceKey;

      var raf = typeof hostWindow.requestAnimationFrame === 'function'
        ? hostWindow.requestAnimationFrame.bind(hostWindow)
        : function (fn) { return hostWindow.setTimeout(fn, 16); };
      var caf = typeof hostWindow.cancelAnimationFrame === 'function'
        ? hostWindow.cancelAnimationFrame.bind(hostWindow)
        : function (id) { hostWindow.clearTimeout(id); };
      var runHud = new Function(
        'window',
        'document',
        'eventOn',
        'Mvu',
        'requestAnimationFrame',
        'cancelAnimationFrame',
        scriptText + '\n//# sourceURL=phone-hud-host.js'
      );
      runHud(hostWindow, hostDocument, getEventOn(), getMvu(), raf, caf);
      if (!node.__phInit || typeof node.__phRender !== 'function') {
        throw new Error('hud initialization incomplete');
      }
      return true;
    } catch (error) {
      try { console.warn('[小手机] 宿主抽屉挂载失败', error); } catch (e) {}
      try { if (node && typeof node.__phDestroy === 'function') node.__phDestroy(); } catch (e) {}
      if (node === runtime.root) {
        runtime.root = null;
        runtime.hudSourceKey = '';
      }
      try { if (node) node.remove(); } catch (e) {}
      return false;
    }
  }

  function ensureMounted(attempt) {
    if (runtime.destroyed) return;
    var source = hudHtml();
    if (!source) {
      if (attempt < 24) schedule('mount', function () { ensureMounted(attempt + 1); }, 250);
      return;
    }
    var sourceKey = hudSourceKey(source);
    var root = runtime.root;
    if (root && root.isConnected !== false && typeof root.__phRender === 'function'
      && root.__phHudSourceKey === sourceKey) {
      root.__phRender();
      return;
    }
    destroyMountedRoot();
    if (mountHud(source, sourceKey)) return;
    if (attempt < 24) schedule('mount', function () { ensureMounted(attempt + 1); }, 250);
  }

  function refreshHud() {
    if (runtime.destroyed) return;
    var root = runtime.root;
    if (root && root.isConnected !== false && typeof root.__phRender === 'function') {
      root.__phRender();
      return;
    }
    ensureMounted(0);
  }

  function requestRefresh(delay) {
    schedule('refresh', refreshHud, typeof delay === 'number' ? delay : 60);
  }

  function reconcileCard(attempt) {
    if (runtime.destroyed) return;
    if (hudHtml()) {
      ensureMounted(0);
      requestRefresh(20);
      return;
    }
    if (attempt < 8) {
      schedule('reconcile', function () { reconcileCard(attempt + 1); }, 150);
    } else {
      destroy('card-change');
    }
  }

  function bindTavernEvents() {
    if (runtime.tavernEventsBound) return true;
    var events = getTavernEvents();
    if (!events || !events.CHAT_CHANGED || !events.GENERATION_STARTED
      || !events.GENERATION_ENDED || !events.GENERATION_STOPPED || !events.MESSAGE_UPDATED) return false;
    var stopStart = runtime.stops.length;
    var coreBound = true;
    coreBound = bindEvent(events.CHAT_CHANGED, function () {
      beginNavigation(true, 300);
      reconcileCard(0);
      requestFragments(80);
    }) && coreBound;
    coreBound = bindEvent(events.GENERATION_STARTED, function (_type, _option, dryRun) {
      if (dryRun) return;
      syncLatestStat(runtime.chatEpoch, false);
      clearTimer('stat-finalize');
      clearTimer('stat-reconcile');
      runtime.isGenerating = true;
      runtime.awaitingPersist = false;
      runtime.activeUpdateChatEpoch = runtime.chatEpoch;
      runtime.phase = 'generating';
      requestRefresh(0);
    }) && coreBound;
    coreBound = bindEvent(events.GENERATION_ENDED, function () {
      if (runtime.phase === 'aborted' || runtime.phase === 'switching') return;
      runtime.isGenerating = false;
      runtime.awaitingPersist = true;
      runtime.phase = 'awaiting-persist';
      var chatEpoch = runtime.chatEpoch;
      schedule('stat-finalize', function () {
        if (runtime.phase === 'awaiting-persist') syncLatestStat(chatEpoch, true);
      }, 1200);
      requestRefresh(0);
      requestFragments(20);
    }) && coreBound;
    coreBound = bindEvent(events.GENERATION_STOPPED, function () {
      runtime.isGenerating = false;
      runtime.awaitingPersist = true;
      runtime.activeUpdateChatEpoch = null;
      runtime.phase = 'aborted';
      clearTimer('stat-finalize');
      clearTimer('stat-reconcile');
      requestRefresh(0);
    }) && coreBound;
    bindEvent(events.MESSAGE_RECEIVED, function () {
      requestRefresh(0);
      requestFragments(20);
    });
    coreBound = bindEvent(events.MESSAGE_UPDATED, function () {
      requestRefresh(0);
      requestFragments(20);
      var chatEpoch = runtime.chatEpoch;
      if (runtime.phase === 'awaiting-persist') {
        schedule('stat-reconcile', function () { syncLatestStat(chatEpoch, true); }, 300);
      } else if (runtime.phase === 'stable') {
        schedule('stat-reconcile', function () { syncLatestStat(chatEpoch, false); }, 80);
      }
    }) && coreBound;
    [events.MESSAGE_EDITED, events.MESSAGE_DELETED, events.MESSAGE_SWIPED].forEach(function (type) {
      bindEvent(type, function () {
        beginNavigation(false, 280);
        requestFragments(40);
      });
    });
    [events.CHARACTER_MESSAGE_RENDERED, events.USER_MESSAGE_RENDERED].forEach(function (type) {
      bindEvent(type, function () {
        requestRefresh(0);
        requestFragments(20);
      });
    });
    if (!coreBound) {
      runtime.stops.splice(stopStart).forEach(function (stop) {
        try { stop(); } catch (e) {}
      });
      return false;
    }
    runtime.tavernEventsBound = true;
    return true;
  }

  function awaitTavernEvents(attempt) {
    if (runtime.destroyed || bindTavernEvents()) return;
    if (attempt < 119) schedule('tavern-events', function () { awaitTavernEvents(attempt + 1); }, 250);
  }

  function bindMvuEvents() {
    if (runtime.mvuEventsBound) return true;
    var mvu = getMvu();
    if (!mvu || !mvu.events) return false;
    runtime.mvu = mvu;
    var stopStart = runtime.stops.length;
    var initBound = bindEvent(mvu.events.VARIABLE_INITIALIZED, function (variables) {
      if (runtime.phase === 'switching') {
        syncLatestStat(runtime.chatEpoch, false);
        return;
      }
      if (runtime.phase !== 'cold') return;
      if (commitMvuData(variables)) {
        runtime.isGenerating = false;
        runtime.awaitingPersist = false;
        runtime.activeUpdateChatEpoch = null;
        runtime.phase = 'stable';
        requestRefresh(0);
      }
    });
    var startedBound = bindEvent(mvu.events.VARIABLE_UPDATE_STARTED, function () {
      if (runtime.phase === 'aborted' || runtime.phase === 'switching') return;
      if (runtime.phase === 'cold') syncLatestStat(runtime.chatEpoch, false);
      runtime.isGenerating = true;
      runtime.awaitingPersist = false;
      runtime.activeUpdateChatEpoch = runtime.chatEpoch;
      runtime.phase = 'updating';
      clearTimer('stat-finalize');
      requestRefresh(0);
    });
    var endedBound = bindEvent(mvu.events.VARIABLE_UPDATE_ENDED, function (variables) {
      if (runtime.phase === 'aborted' || runtime.phase === 'switching') return;
      if (runtime.activeUpdateChatEpoch !== null && runtime.activeUpdateChatEpoch !== runtime.chatEpoch) return;
      if (commitMvuData(variables)) {
        runtime.isGenerating = false;
        runtime.awaitingPersist = true;
        runtime.activeUpdateChatEpoch = runtime.chatEpoch;
        runtime.phase = 'awaiting-persist';
        requestRefresh(0);
      }
    });
    var beforeBound = true;
    if (mvu.events.BEFORE_MESSAGE_UPDATE) {
      beforeBound = bindEvent(mvu.events.BEFORE_MESSAGE_UPDATE, function (context) {
        if (runtime.phase === 'aborted' || runtime.phase === 'switching') return;
        if (!context || !context.variables) return;
        if (commitMvuData(context.variables)) {
          runtime.isGenerating = false;
          runtime.awaitingPersist = true;
          runtime.phase = 'awaiting-persist';
          requestRefresh(0);
        }
      });
    }
    if (!initBound || !startedBound || !endedBound || !beforeBound) {
      runtime.stops.splice(stopStart).forEach(function (stop) {
        try { stop(); } catch (e) {}
      });
      return false;
    }
    runtime.mvuEventsBound = true;
    if (runtime.phase === 'cold' && !syncLatestStat(runtime.chatEpoch, false)) {
      scheduleStableSync(runtime.chatEpoch, 0, 0);
    }
    requestRefresh(0);
    return true;
  }

  function awaitMvu(attempt) {
    if (runtime.destroyed || bindMvuEvents()) return;
    if (attempt === 0) {
      try {
        if (typeof waitGlobalInitialized === 'function') {
          Promise.resolve(waitGlobalInitialized('Mvu')).then(function (mvu) {
            if (mvu) runtime.mvu = mvu;
            if (!runtime.destroyed) bindMvuEvents();
          }).catch(function () {});
        }
      } catch (e) {}
    }
    if (attempt < 119) schedule('mvu', function () { awaitMvu(attempt + 1); }, 250);
  }

  function destroy() {
    if (runtime.destroyed) return;
    runtime.destroyed = true;
    cancelAllAiGenerations();
    Object.keys(runtime.timers).forEach(clearTimer);
    runtime.stops.splice(0).forEach(function (stop) {
      try { stop(); } catch (e) {}
    });
    try { hostDocument.removeEventListener('click', onHostClick, true); } catch (e) {}
    try { hostDocument.removeEventListener('change', onHostChange, true); } catch (e) {}
    try { helperWindow.removeEventListener('pagehide', destroy); } catch (e) {}
    destroyMountedRoot();
    try { FLOORCHAT_TIMERS.forEach(function (t) { hostWindow.clearTimeout(t); }); FLOORCHAT_TIMERS.length = 0; } catch (e) {}
    try { FLOORCHAT_DISPOSERS.forEach(function (d) { d(); }); FLOORCHAT_DISPOSERS.length = 0; } catch (e) {}
    try { hostWindow.removeEventListener('ph-orb:open-phone', onOrbOpenPhone); } catch (e) {}
    clearBridge(helperWindow);
    if (hostWindow !== helperWindow) clearBridge(hostWindow);
    try { if (helperWindow.__phBridgeRuntime === runtime) delete helperWindow.__phBridgeRuntime; } catch (e) {}
    try { if (hostWindow[RUNTIME_KEY] === runtime) delete hostWindow[RUNTIME_KEY]; } catch (e) {}
  }

  exposeBridge(helperWindow);
  if (hostWindow !== helperWindow) exposeBridge(hostWindow);
  bindFloorChat();
  hostDocument.addEventListener('click', onHostClick, true);
  hostDocument.addEventListener('change', onHostChange, true);
  helperWindow.addEventListener('pagehide', destroy);
  if (!syncLatestStat(runtime.chatEpoch, false)) {
    scheduleStableSync(runtime.chatEpoch, 0, 0);
  }
  awaitTavernEvents(0);
  awaitMvu(0);
  hydrateFragments();
  ensureMounted(0);
})();
