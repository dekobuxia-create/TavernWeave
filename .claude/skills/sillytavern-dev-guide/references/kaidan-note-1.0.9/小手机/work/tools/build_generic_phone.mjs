import { promises as fs } from 'node:fs';
import path from 'node:path';

const workDir = path.resolve(import.meta.dirname, '..');
const genericDir = path.join(workDir, 'generic');
const srcPhone = path.resolve(workDir, '../sources/1.0.9-内置图标/kdn_phone.js');
const regexSrc = path.resolve(workDir, '../../正则/sources/1.0.9');

function replaceOnce(text, from, to, label) {
  const count = text.split(from).length - 1;
  if (count !== 1) throw new Error(`${label}: expected 1, got ${count}`);
  return text.replace(from, to);
}

function renamePrefix(text) {
  return text
    .replace(/kaidan-note-bridge/g, 'phone-hud')
    .replace(/kaidan-note-media-library/g, 'ph-media-library')
    .replace(/kaidan-note-statusbar-host/g, 'phone-hud-host')
    .replace(/__kaidanMvuSchema/g, '__phMvuSchema')
    .replace(/kaidan_note/g, 'phone_hud')
    .replace(/KDN_/g, 'PH_')
    .replace(/kdnUtCav/g, 'phUtCav')
    .replace(/__kdn/g, '__ph')
    .replace(/data-kdn/g, 'data-ph')
    .replace(/#kdn-/g, '#ph-')
    .replace(/\.kdn-/g, '.ph-')
    .replace(/kdn-/g, 'ph-')
    .replace(/kdn_/g, 'ph_')
    .replace(/kdn\./g, 'ph.');
}

function cleanLeftovers(script) {
  const reps = [
    ["knSubmitting=false,knDraft=null,knGhostDraft=null,knTipText='',knTipBad=false,feedLawsOpen=false,", ''],
    ["var wcSubmitting=false,wcDraft='',wcTags=[],wcTipText='',wcTipBad=false,wcHaremOpen=false;\n", ''],
    ["function forumBoard(value){return value==='wish'?'wish':'hot'}", "function forumBoard(value){return 'hot'}"],
    ["function forumBoardName(value){return forumBoard(value)==='wish'?'祈愿论坛':'热议'}", "function forumBoardName(value){return '热议'}"],
    ['function forumStage(S){var archive=S.处刑档案||{},world=S.世界演化||{},opinion=S.舆论新闻||{},total=Math.max(0,Math.floor(n(archive.总处刑数))),level=total>=50?4:(total>=25?3:(total>=12?2:(total>=5?1:0))),awareness=String(world.社会认知度||\'无痕\'),support=Math.max(-100,Math.min(100,Math.round(n(opinion.民意值)))),awarenessCap=awareness===\'半公开\'?4:(awareness===\'发酵\'?2:(awareness===\'窃议\'?1:0)),opinionCap=support<0?1:(support<25?2:4),labels=[\'尚未成形\',\'零星窃语\',\'正式显形\',\'稳定板块\',\'民间生态\'];level=Math.min(level,awarenessCap,opinionCap);return {level:level,label:labels[level],total:total,awareness:awareness,publicOpinion:support}}\n', ''],
    ['return {version:2,hot:normalizeForumBoard(value.hot),wish:normalizeForumBoard(value.wish)}', 'return {version:2,hot:normalizeForumBoard(value.hot)}'],
    ['forumStore={version:2,hot:{posts:[],refreshedAt:0},wish:{posts:[],refreshedAt:0}}', 'forumStore={version:2,hot:{posts:[],refreshedAt:0}}'],
    ['var env=S.环境||{},place=env.所在位置||{},city=env.城市环境||{},world=S.世界演化||{},trend=S.影响倾向||{},opinion=S.舆论新闻||{}', 'var env=S.环境||{},place=env.所在位置||{},city=env.城市环境||{},world=S.世界演化||{},opinion=S.舆论新闻||{}'],
    [',influenceTrend:contentText(trend.当前档,40)', ''],
    ['var majorCase=news.some(function(item){return item.hotness>=70}),stage=forumStage(S);return {mode:\'forum_\'+board,board:board,scene:base.scene,publicWorld:base.publicWorld,recentNews:news,recentEvents:recentEvents,majorCase:majorCase,prayerStage:stage,execution:{total:stage.total},cardEvidence:evidence}', 'var majorCase=news.some(function(item){return item.hotness>=70});return {mode:\'forum_\'+board,board:board,scene:base.scene,publicWorld:base.publicWorld,recentNews:news,recentEvents:recentEvents,majorCase:majorCase,cardEvidence:evidence}'],
    [',wishLevel=Math.max(0,Math.floor(n(context&&context.prayerStage&&context.prayerStage.level)));', ';'],
    ["if(forumBoard(board)==='wish'&&wishLevel<2&&(claim!=='none'||kind!=='fictional'))return;", ''],
    ["if(forumBoard(board)==='hot')return '[PH_FORUM_HOT]\\n", "return '[PH_FORUM_HOT]\\n"],
    ["var store=forumEnsureScope(),board='hot',stage=forumStage(S),bridge=aiBridge()", "var store=forumEnsureScope(),board='hot',bridge=aiBridge()"],
    ["note=board==='wish'?('处刑 '+stage.total+' · '+stage.label+' · 社会认知 '+stage.awareness+' · 民意 '+stage.publicOpinion):'日常热帖为主，重大案件会明显抬头'", "note='日常热帖为主，重大案件会明显抬头'"],
    ['  captureKnDraft();\n  captureWcDraft();\n', ''],
    ['  captureWcDraft();captureChatDraft();', '  captureChatDraft();'],
    ["  if(el.getAttribute('data-ph-wc-input')!==null){wcDraft=String(el.value||'').slice(0,2000);return}\n", ''],
    ["if(el.getAttribute('data-ph-wc-input')!==null)captureWcDraft();", ''],
    ['var fav=n(c.好感度),lv=chFavLv(fav),gz=false,bond=c.羁绊标签===true;', 'var fav=n(c.好感度),lv=chFavLv(fav),bond=c.羁绊标签===true;'],
    ['+(gz?\' <i class="ti ti-sparkles" style="color:var(--g)"></i>\':\'\')', ''],
  ];
  for (const [from, to] of reps) {
    const count = script.split(from).length - 1;
    if (!count) throw new Error(`leftover-clean missing: ${from.slice(0, 72)}`);
    script = script.replaceAll(from, to);
  }
  const wishTail = script.match(/;return '\[PH_FORUM_WISH\]\\n[\s\S]*?\+schema/);
  if (!wishTail) throw new Error('leftover-clean missing: PH_FORUM_WISH');
  script = script.replace(wishTail[0], '');
  return script;
}

// 2026-08-27 拍板：媒体库拆独立脚本（name「媒体库」/ id ph-media-library），数据仓挂媒体库自己名下。
// 边界=容器归媒体库（数据仓+读写桥），界面归 HUD（渲染/弹层/导入采集，经 __phMedia 桥读写，桥不在时自动降级）。
function extractHostFn(text, name) {
  const start = text.indexOf(`function ${name}(`);
  if (start < 0) throw new Error(`media-split: function ${name} not found`);
  const end = text.indexOf('\n  }', start);
  if (end < 0) throw new Error(`media-split: function ${name} end not found`);
  return '  ' + text.slice(start, end + 4).trimEnd() + '\n';
}

function splitMediaLibrary(hostText) {
  const segStartAnchor = "  var MEDIA_SCRIPT_ID = 'phone-hud';\n";
  const segEndAnchor = "  var MEDIA_BRIDGE = typeof Object.freeze === 'function' ? Object.freeze(MEDIA_BRIDGE_VALUE) : MEDIA_BRIDGE_VALUE;\n";
  const segStart = hostText.indexOf(segStartAnchor);
  const segEnd = hostText.indexOf(segEndAnchor);
  if (segStart < 0 || segEnd < 0 || segEnd <= segStart) throw new Error('media-split: MEDIA segment anchors not found');
  const segment = hostText.slice(segStart, segEnd + segEndAnchor.length);
  let core = replaceOnce(segment, "var MEDIA_SCRIPT_ID = 'phone-hud';", "var MEDIA_SCRIPT_ID = 'ph-media-library';", 'media-split: script id');

  let host = hostText.slice(0, segStart).replace(/\n+$/, '\n\n') + hostText.slice(segEnd + segEndAnchor.length).replace(/^\n+/, '');
  host = replaceOnce(host, '      target.__phMedia = MEDIA_BRIDGE;\n', '', 'media-split: exposeBridge line');
  host = replaceOnce(host, '    try { if (target.__phMedia === MEDIA_BRIDGE) delete target.__phMedia; } catch (e) {}\n', '', 'media-split: clearBridge line');

  const shared = ['resolveHostWindow', 'getTavernHelper', 'getVariablesReader', 'getVariablesReplacer']
    .map((name) => extractHostFn(hostText, name))
    .join('\n');

  const media = `// 媒体库（通用小手机包体 · 酒馆助手脚本）
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

${shared}
${core}
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
`;
  return { host, media };
}

// 2026-08-27 实装（SBS 机制研究落地，代码自写不搬运）：幽讯攒消息 + 楼层正文回放。
// ① 攒消息：回车=消息立即入 thread 上屏（攒），发送键才取尾部连续 user 段一并触发副 API 回复；
// ② 回放：每轮对话完成后把新消息写进最后一楼的 ```phchat 纯文本围栏（协议：#头行 / 「谁: 内容」行），
//    host 侧把围栏渲染成**小手机同款气泡**——与头像气泡脚本（四皮肤）两套系统互不干涉、不混用。
function transformChatOutbox(script) {
  // 1) pending 分支简化：user 消息攒进 thread 即已上屏，pending 只显示「正在输入…」
  script = replaceOnce(
    script,
    "if(pending){h+=chatBubble({role:'user',text:pending.text,at:pending.at},kind==='group');h+='",
    "if(pending){h+='",
    'hx-pending-simplify',
  );
  // 2) 输入框措辞：攒消息语义
  script = replaceOnce(
    script,
    `placeholder="'+(kind==='group'?'发到群里…':'给 '+esc(name)+' 发消息…')+'"`,
    `placeholder="'+(kind==='group'?'回车攒消息，全群一并回应…':'回车攒消息，可连打几条…')+'"`,
    'hx-placeholder',
  );
  // 3) 回车=攒一条（Shift+Enter 保留换行）
  script = replaceOnce(
    script,
    "if(el.getAttribute('data-ph-content-input')!==null&&ev.key==='Enter')",
    "if(el.getAttribute('data-ph-chat-input')!==null&&ev.key==='Enter'&&!ev.shiftKey){ev.preventDefault();queueChat();return}if(el.getAttribute('data-ph-content-input')!==null&&ev.key==='Enter')",
    'hx-enter-queue',
  );
  // 4.5) 设置→显示内容：加「聊天记录写进正文」开关（即时生效，localStorage）
  script = replaceOnce(
    script,
    "hiddenFrozen?(uiDraft.showFrozenCharacters?('已显示全部角色；关闭后将隐藏 '+hiddenFrozen+' 名普通冻结角色'):('当前隐藏 '+hiddenFrozen+' 名普通冻结角色')):'当前没有被隐藏的普通角色'));",
    "hiddenFrozen?(uiDraft.showFrozenCharacters?('已显示全部角色；关闭后将隐藏 '+hiddenFrozen+' 名普通冻结角色'):('当前隐藏 '+hiddenFrozen+' 名普通冻结角色')):'当前没有被隐藏的普通角色')+'<label class=\"ph-ui-check\"><span>聊天记录写进正文<small>'+(phFloorLogOn()?'开启中：幽讯每轮对话自动写进楼层正文，正文剧情直接可读':'已关闭：改用隐形注入让正文剧情知道手机聊天，正文不露记录')+'</small></span><input type=\"checkbox\" data-ph-hx-floorlog'+(phFloorLogOn()?' checked':'')+'></label>');",
    'hx-floorlog-switch-ui',
  );
  // 4.6) change 委托头部：开关即时切换
  script = replaceOnce(
    script,
    "root.addEventListener('change',function(ev){",
    "root.addEventListener('change',function(ev){var fl=ev.target&&ev.target.getAttribute&&ev.target.getAttribute('data-ph-hx-floorlog');if(fl!=null){setPhFloorLog(!!ev.target.checked);render();return}",
    'hx-floorlog-switch-change',
  );
  // 4.7) 启动整备：按开关态整备注入（关=注入摘要，开=撤注入）
  script = replaceOnce(
    script,
    'render();\n})();',
    'refreshPhDigest();\nrender();\n})();',
    'hx-digest-init',
  );
  // 4) sendChat 整函数替换为「queueChat（攒）+ sendChat（触发）+ floorLogChat（写围栏）」
  const start = script.indexOf('function sendChat(){');
  const endAnchor = '\n}\n/* ---- 居所';
  const end = script.indexOf(endAnchor, start);
  if (start < 0 || end < 0) throw new Error('hx-sendchat: anchors missing');
  const NEW_SEND = `var PH_FLOORLOG_LS='ph_hx_floorlog';
/* 聊天正文映射开关（设置→显示内容）：开=每轮对话写 \\\`\\\`\\\`phchat 围栏进楼层（主线从楼层直接读，无需注入）；
   关=不写楼层，改用 injectPrompts 隐形注入摘要让主线仍知道手机聊天（SBS 同款兜底思路）。默认开。 */
function phFloorLogOn(){try{return localStorage.getItem(PH_FLOORLOG_LS)!=='0'}catch(e){return true}}
function setPhFloorLog(on){try{localStorage.setItem(PH_FLOORLOG_LS,on?'1':'0')}catch(e){}refreshPhDigest()}
function buildPhDigest(){
  var store=chatEnsureScope();if(!store)return '';
  var threads=store.threads||{},ks=Object.keys(threads).filter(function(k){return (threads[k].messages||[]).length}).sort(function(a,b){return n(threads[b].updatedAt)-n(threads[a].updatedAt)});
  if(!ks.length)return '';
  var groupsById={};(store.groups||[]).forEach(function(g){groupsById[g.id]=g});
  var budget=120,used=0,blocks=[];
  for(var ki=0;ki<ks.length&&used<budget;ki++){
    var key=ks[ki],th=threads[key],msgs=th.messages||[];
    var take=Math.min(ki<3?30:6,budget-used,msgs.length);if(take<=0)break;
    var recent=msgs.slice(-take);used+=recent.length;
    var g=groupsById[key],disp=g?('群聊「'+g.name+'」'):key;
    var lines=['· 与 '+disp+' 的幽讯（最近'+recent.length+'条）— 仅参与者与 user 知晓，其他角色不知情：'];
    recent.forEach(function(m){var who=m.role==='user'?'user':(m.sender||disp);lines.push('   '+who+': '+String(m.text||'').slice(0,300))});
    blocks.push(lines.join('\\n'));
  }
  if(!blocks.length)return '';
  return '【user 手机（幽讯）私信备忘——带入正文人物的记忆，每人只记得自己参与的那段】\\n'+blocks.join('\\n')+'\\n（铁律：正文只写散文，绝不复述、排版或重写以上内容；任何角色都看不到 user 的手机，只能对亲历之事做反应。）';
}
var phDigestClean=false;
function refreshPhDigest(){
  try{
    var TH=window.TavernHelper;
    if(!TH||typeof TH.injectPrompts!=='function'||typeof TH.uninjectPrompts!=='function')return;
    if(phFloorLogOn()){if(!phDigestClean){try{TH.uninjectPrompts(['ph-hx-digest'])}catch(e){}phDigestClean=true}return}
    phDigestClean=false;
    try{TH.uninjectPrompts(['ph-hx-digest'])}catch(e){}
    var digest=buildPhDigest();if(!digest)return;
    TH.injectPrompts([{id:'ph-hx-digest',position:'in_chat',depth:1,role:'system',content:digest,should_scan:true}]);
  }catch(e){}
}
function afterChatRound(name,S,newMsgs){if(phFloorLogOn()){floorLogChat(name,S,newMsgs)}else{refreshPhDigest()}}
function chatTailUserRun(messages){var run=[];for(var i=(messages||[]).length-1;i>=0;i--){if(messages[i].role==='user')run.unshift(messages[i]);else break}return run}
function queueChat(){
  if(!chatScope||chatScopeId()!==chatScope){render();return}
  var store=chatStore,S=getStat(),kind=chatSelKind(subSel),key=chatThreadKeyOf(subSel),group=kind==='group'?chatGroupById(store,key):null;
  captureChatDraft();var text=String(chatDrafts[key]||'').trim().slice(0,2000);
  if(kind==='single'){if(!(S.角色档案||{})[key]){chatTipRole=key;chatTipText='角色档案已不存在';chatTipBad=true;render();return}}
  else if(kind==='group'){if(!group){chatTipRole=key;chatTipText='群已不存在';chatTipBad=true;render();return}}
  if(!text){chatTipRole=key;chatTipText='请输入消息';chatTipBad=true;render();return}
  var current=chatEnsureScope(),saved=current.threads[key]||{messages:[]},now=Date.now();
  current.threads[key]={messages:(saved.messages||[]).concat([{role:'user',sender:'',text:text,at:now}]).slice(-40),updatedAt:now};
  current.drafts[key]='';chatDrafts[key]='';
  var input=root.querySelector('[data-ph-chat-input]');
  if(input&&mode==='app'&&ca==='hx'&&chatThreadKeyOf(subSel)===key)input.value='';
  try{persistChatStore();chatTipText='';chatTipBad=false}catch(error){chatTipText=error&&error.message?error.message:'聊天记录保存失败';chatTipBad=true}
  chatTipRole=key;chatScrollBottom=true;render();
  if(!phFloorLogOn())refreshPhDigest();
  return true;
}
function sendChat(){
  if(chatPending)return;if(!chatScope||chatScopeId()!==chatScope){render();return}
  captureChatDraft();
  var kind=chatSelKind(subSel),key=chatThreadKeyOf(subSel);
  if(String(chatDrafts[key]||'').trim()){if(!queueChat())return}
  var store=chatStore,S=getStat(),group=kind==='group'?chatGroupById(store,key):null,bridge=aiBridge(),state={};
  try{state=bridge&&bridge.getState?bridge.getState():{}}catch(e){}
  if(kind==='single'){if(!(S.角色档案||{})[key]){chatTipRole=key;chatTipText='角色档案已不存在';chatTipBad=true;render();return}}
  else if(kind==='group'){if(!group){chatTipRole=key;chatTipText='群已不存在';chatTipBad=true;render();return}}
  if(!bridge||typeof bridge.generate!=='function'||!state.enabled||!state.hasKey){chatTipRole=key;chatTipText='请先在设置API中保存 URL、Key 与模型';chatTipBad=true;render();return}
  var thread=chatEnsureScope().threads[key]||{messages:[]},pendingRun=chatTailUserRun(thread.messages);
  if(!pendingRun.length){chatTipRole=key;chatTipText='先说点什么再发送';chatTipBad=true;render();return}
  var scope=chatScope,generationId='ph-hx-'+Date.now().toString(36)+'-'+(++chatSeq);
  var history=(thread.messages||[]).slice(-12).map(function(item){var content=item.text;if(kind==='group'&&item.role==='assistant'&&item.sender)content='【'+item.sender+'】'+content;return {role:item.role,content:content}});
  var batchHint=pendingRun.length>1?('\\nuser 刚连发了 '+pendingRun.length+' 条消息，把它们当作一组来读，'+(kind==='group'?'仍只由一位合适的成员回一条消息':'只回一条消息')+'，自然地一并回应，不要逐条分别回复。'):'';
  var token={scope:scope,role:key,at:Date.now(),generationId:generationId};
  chatPending=token;chatTipText='';chatTipBad=false;chatTipRole=key;chatScrollBottom=true;render();var task;
  try{task=Promise.resolve(bridge.generate({generationId:generationId,system:(kind==='group'?chatGroupSystemPrompt(group,S):chatSystemPrompt(key,(S.角色档案||{})[key]||{},S))+batchHint,messages:history,maxTokens:kind==='group'?720:640}))}catch(error){task=Promise.reject(error)}
  task.then(function(result){
    if(!alive||chatPending!==token)return;chatPending=null;if(chatScopeId()!==scope)return;
    var reply=String(result&&result.text||'').trim(),sender='';
    if(kind==='group'&&group){var m=reply.match(/^【(.{1,40}?)】([\\s\\S]+)$/);if(m){var who=String(m[1]).trim();sender=group.members.indexOf(who)>=0?who:(group.members[0]||'');reply=String(m[2]).trim()}}
    if(!reply||hasContentControlTags(reply)){chatTipRole=key;chatTipText=reply?'API 回复包含非法控制标记，已拒绝保存':'API 未返回可用回复';chatTipBad=true;if(mode==='app'&&ca==='hx')render();return}
    var current=chatEnsureScope(),saved=current.threads[key]||{messages:[]},now=Date.now(),replyMsg={role:'assistant',sender:sender,text:reply,at:now};
    current.threads[key]={messages:(saved.messages||[]).concat([replyMsg]).slice(-40),updatedAt:now};
    try{persistChatStore();chatTipText='';chatTipBad=false}catch(error){chatTipText=error&&error.message?error.message:'聊天记录保存失败';chatTipBad=true}
    chatTipRole=key;
    if(mode==='app'&&ca==='hx'){if(chatThreadKeyOf(subSel)===key)chatScrollBottom=true;render()}
    afterChatRound(kind==='group'?(group&&group.name||key):key,S,pendingRun.concat([replyMsg]));
  },function(error){if(!alive||chatPending!==token)return;chatPending=null;if(chatScopeId()!==scope)return;chatTipRole=key;chatTipText=error&&error.message?error.message:'消息发送失败';chatTipBad=true;if(mode==='app'&&ca==='hx')render()});
}
function floorLogChat(name,S,newMsgs){
  if(!newMsgs||!newMsgs.length)return;
  try{
    var TH=window.TavernHelper;
    if(!TH||typeof TH.getChatMessages!=='function'||typeof TH.setChatMessages!=='function'||typeof TH.getLastMessageId!=='function')return;
    var env=(S&&S.环境)||{},stamp=String(env.时间||'').trim()||chatTime(Date.now());
    var safe=function(v){return String(v==null?'':v).replace(/\\\`\\\`\\\`+/g,'···').replace(/[\\r\\n]+/g,' / ').trim()};
    var lines=['#与 '+safe(name).replace(/#/g,'＃')+' 的幽讯 · '+safe(stamp)];
    for(var i=0;i<newMsgs.length;i++){var m=newMsgs[i],who=m.role==='user'?'我':(m.sender||name);lines.push(safe(who).replace(/:/g,'：')+': '+safe(m.text))}
    var body=lines.join('\\n');
    Promise.resolve(TH.getLastMessageId()).then(function(lastId){
      if(lastId==null||lastId<0)return;
      return Promise.resolve(TH.getChatMessages(String(lastId))).then(function(msgs){
        var msg=msgs&&msgs[0];if(!msg)return;
        var txt=String(msg.message||'');
        if(txt.indexOf(body)!==-1)return;
        if(msg.role==='assistant'){
          var tail=txt.replace(/\\s+$/,''),open=tail.lastIndexOf('\\\`\\\`\\\`phchat\\n'),updated;
          if(open>=0&&tail.slice(open+10).lastIndexOf('\\\`\\\`\\\`')===tail.length-open-10-3){updated=tail.slice(0,tail.length-3).replace(/\\s+$/,'')+'\\n'+body+'\\n\\\`\\\`\\\`'}
          else{updated=tail+'\\n\\n\\\`\\\`\\\`phchat\\n'+body+'\\n\\\`\\\`\\\`'}
          return TH.setChatMessages([{message_id:msg.message_id,message:updated}],{refresh:'affected'});
        }
        if(typeof TH.createChatMessages==='function')return TH.createChatMessages([{role:'assistant',message:'\\\`\\\`\\\`phchat\\n'+body+'\\n\\\`\\\`\\\`',is_hidden:false}]);
      });
    }).catch(function(e){});
  }catch(e){}
}`;
  return script.slice(0, start) + NEW_SEND + script.slice(end + 2); // +2 保留 '\n}' 后的换行接注释行
}

function stripKaidanCopy(text) {
  return text
    .replaceAll('你是怪谈笔记世界内的', '你是当前世界内的')
    .replaceAll('你是怪谈笔记的', '你是当前世界的')
    .replaceAll('你正在扮演怪谈笔记世界中的', '你正在扮演当前世界中的')
    .replaceAll('交给怪谈安排一座大城市', '交给剧情安排一座大城市')
    .replaceAll("fn.call(toast, text, '怪谈笔记')", "fn.call(toast, text, '小手机')")
    .replaceAll('[怪谈笔记]', '[小手机]')
    .replaceAll('Kaidan Note', '小手机')
    .replaceAll('怪谈帖', '传闻帖')
    .replaceAll('data.extensions.kaidan_note.hud_html', 'data.extensions.phone_hud.hud_html');
}

const GENERIC_MOCK = `var MOCK={
  环境:{日期:'10月14日 周二',时间:'23:47',所在位置:{城市:'临江',行政区:'城东',街区:'老城区',具体地点:''},城市环境:{天气:'夜雨',体感温度:'14°'}},
  user:{状态:'',体力:86,饱腹值:70,水分值:64,洁净值:90,现金:1200,存款:8600,当前穿着:{上装:'连帽衫',下装:'长裤'}},
  世界演化:{体系信任:8,道德风气:12,秩序稳定:16,社会认知度:'日常',恶势力:{},时代事件:{}},
  舆论新闻:{民意值:6,新闻流:{
    N001:{标题:'城东夜市恢复营业',层级:'都市媒体',倾向:'中',热度:22,时间:'2 小时前',状态:'发酵中'}
  }},
  角色档案:{
    林衡:{角色类型:'当前互动',羁绊标签:true,身份:'同事',好感度:28,位置:'咖啡馆'}
  },
  资产库:{物品:{},容器:{随身:[]}},居所:{},载具:{},雷达系统:{}
}`;

const GENERIC_APPS = `var APPS=[
  {id:'wd',n:'世界',i:'world',c:'#3fa07f'},{id:'nw',n:'新闻',i:'news',c:'#cf6a48'},
  {id:'me',n:'自身',i:'user',c:'#4a82c2'},{id:'ch',n:'角色档案',i:'users',c:'#c25a82'},
  {id:'hx',n:'幽讯',i:'messages',c:'#3f9a95'},{id:'fm',n:'论坛',i:'message-circle',c:'#a6659a'},{id:'mk',n:'网购',i:'shopping-bag',c:'#d48a55'},{id:'js',n:'居所',i:'home',c:'#5a6a86'},
  {id:'zj',n:'载具',i:'car',c:'#4a7a9a'},{id:'zc',n:'资产',i:'briefcase',c:'#8a7a5c'},
  {id:'st',n:'设置',i:'settings',c:'#7a8290'}];
var APP_DEFAULT=['wd','nw','me','ch','hx','fm','mk','js','zj','zc','st'];
var DOCK_SLOT_COUNT=4;
var APP_LAYOUT_DEFAULT={wd:{zone:'dock',slot:0},nw:{zone:'dock',slot:1},me:{zone:'dock',slot:2},ch:{zone:'dock',slot:3},js:{zone:'grid',page:1,slot:0},zj:{zone:'grid',page:1,slot:1},zc:{zone:'grid',page:1,slot:2},st:{zone:'grid',page:1,slot:3},hx:{zone:'grid',page:1,slot:4},fm:{zone:'grid',page:1,slot:5},mk:{zone:'grid',page:1,slot:6}};`;

const GENERIC_FEED_STATS = `  var mo=S.舆论新闻||{},my=n(mo.民意值);
  h+='<div class="kdn-gl"><div style="color:var(--t2);font-size:12px;font-size:calc(12px * var(--kdn-font-scale));margin-bottom:11px">今日概览</div><div style="display:flex;gap:6px">'
    +mini('舆论',my>15?'偏热':(my<-15?'偏低':'平静'),'var(--b)')+'</div></div>';
  var radar=S.雷达系统||{},signals=keys(radar),people=nearbyPeople(S);`;

const raw = await fs.readFile(srcPhone, 'utf8');
const hudMatch = raw.match(/var HUD_SOURCE = "((?:\\.|[^"\\])*)";\r?\n/);
if (!hudMatch) throw new Error('HUD_SOURCE not found');
const hud = JSON.parse(`"${hudMatch[1]}"`);
const host = raw.slice(0, hudMatch.index) + raw.slice(hudMatch.index + hudMatch[0].length);

const scriptMatch = hud.match(/<script>([\s\S]*?)<\/script>/);
if (!scriptMatch) throw new Error('hud script missing');
let markup = hud.slice(0, scriptMatch.index);
let script = scriptMatch[1];
const afterScript = hud.slice(scriptMatch.index + scriptMatch[0].length);

const knStart = script.indexOf('function showKnTip');
const knEnd = script.indexOf('/* ---- 世界 ---- */');
const wcStart = script.indexOf('/* ---- 世界调制 ---- */');
const wcEnd = script.indexOf('/* ---- 自身 ---- */');
if (knStart < 0 || knEnd < 0 || wcStart < 0 || wcEnd < 0) throw new Error('kn/wc markers missing');

await fs.mkdir(path.join(genericDir, 'plugins'), { recursive: true });
await fs.writeFile(
  path.join(genericDir, 'plugins', 'kaidan_apps.reference.js'),
  `${script.slice(knStart, knEnd)}\n${script.slice(wcStart, wcEnd)}`,
  'utf8',
);

script = script.slice(0, knStart) + script.slice(knEnd, wcStart) + script.slice(wcEnd);

const mockHit = script.match(/var MOCK=\{[\s\S]*?雷达系统:\{\}\r?\n\};/);
if (!mockHit) throw new Error('MOCK: pattern not found');
script = replaceOnce(script, mockHit[0], GENERIC_MOCK, 'MOCK');
const appsHit = script.match(/var APPS=\[[\s\S]*?var APP_LAYOUT_DEFAULT=\{[\s\S]*?\};/);
if (!appsHit) throw new Error('APPS: pattern not found');
script = replaceOnce(script, appsHit[0], GENERIC_APPS, 'APPS');
script = replaceOnce(
  script,
  `function nearbyPeople(S){
  var chars=S.角色档案||{},out=[];
  keys(chars).forEach(function(name){
    var c=chars[name]||{},grant=c.授予者||{},presence=String(grant.在场||'');
    if(visibleCharacter(c)&&(presence==='在场'||c.角色类型==='当前互动'))out.push({name:name,data:c,presence:presence==='在场'?'在场':'互动中'});
  });
  return out;
}`,
  `function nearbyPeople(S){
  var chars=S.角色档案||{},out=[];
  keys(chars).forEach(function(name){
    var c=chars[name]||{};
    if(visibleCharacter(c)&&c.角色类型==='当前互动')out.push({name:name,data:c,presence:'互动中'});
  });
  return out;
}`,
  'nearbyPeople',
);
const feedHit = script.match(/  var mo=S\.舆论新闻\|\|\{\},my=n\(mo\.民意值\);[\s\S]*?var radar=S\.雷达系统\|\|\{\},signals=keys\(radar\),people=nearbyPeople\(S\);/);
if (!feedHit) throw new Error('pageFeed-stats: pattern not found');
script = replaceOnce(script, feedHit[0], GENERIC_FEED_STATS, 'pageFeed-stats');
script = replaceOnce(script, "var VIEWS={kn:appKN,wd:appWD,nw:appNW,wc:appWC,me:appME,ch:appCH,hx:appHX,fm:appFM,mk:appMK,js:appJS,zj:appZJ,zc:appZC,st:appST};", "var VIEWS={wd:appWD,nw:appNW,me:appME,ch:appCH,hx:appHX,fm:appFM,mk:appMK,js:appJS,zj:appZJ,zc:appZC,st:appST};", 'VIEWS');
script = replaceOnce(
  script,
  "var WC_TAGS=[['目标搜索',10],['个人级造美好',20],['收入一位角色',30],['操控新闻风向',50],['消抹暴露',50],['生体重塑',50],['给一人改命',100],['扶植/摧毁势力',150],['抹除社会记忆',800]];\n",
  '',
  'WC_TAGS',
);
script = replaceOnce(
  script,
  `function appWD(S){
  var h=hd('世界')+tabs(['世界演化','通缉']);
  var w=S.世界演化||{};
  if(tabIdx===0){
    var t=S.影响倾向||{},v=n(t.数值),pct=(v+100)/2;
    h+='<div style="font-size:12px;font-size:calc(12px * var(--kdn-font-scale));color:var(--t2);margin-bottom:8px">影响倾向 · '+esc(t.当前档||'中立')+(t.失控状态&&t.失控状态!=='无'?' · <span style="color:#c24a4a">失控:'+esc(t.失控状态)+'</span>':'')+'</div>';
    h+='<div style="position:relative;height:24px;border-radius:12px;background:rgba(255,255,255,.05);overflow:hidden"><div style="position:absolute;left:5px;right:50%;top:8px;height:8px;background:#c25a4a;border-radius:4px 0 0 4px;opacity:.85"></div><div style="position:absolute;left:50%;right:5px;top:8px;height:8px;background:#3a6bc4;border-radius:0 4px 4px 0;opacity:.85"></div><div style="position:absolute;left:'+pct+'%;top:3px;bottom:3px;width:3px;background:#fff;border-radius:2px;transform:translateX(-50%)"></div></div>';
    h+='<div style="display:flex;justify-content:space-between;font-size:11px;font-size:calc(11px * var(--kdn-font-scale));color:var(--t3);margin:6px 0 22px"><span>负向·破坏</span><span style="color:var(--b)">'+(v>=0?'+':'')+v+'</span><span>正向·修正</span></div>';
    [['体系信任',w.体系信任],['道德风气',w.道德风气],['秩序稳定',w.秩序稳定]].forEach(function(a){var av=n(a[1]),ap=(av+100)/2;
      h+='<div style="margin-bottom:13px"><div style="display:flex;justify-content:space-between;font-size:12px;font-size:calc(12px * var(--kdn-font-scale));margin-bottom:5px"><span style="color:var(--t2)">'+a[0]+'</span><span style="color:var(--t3)">'+(av>=0?'+':'')+av+'</span></div><div class="kdn-bar"><i style="width:'+ap+'%"></i></div></div>'});
    h+='<div class="kdn-gl" style="margin-top:18px"><div style="display:flex;justify-content:space-between;font-size:12px;font-size:calc(12px * var(--kdn-font-scale))"><span style="color:var(--t2)">社会认知</span><span style="color:var(--g)">'+esc(w.社会认知度||'无痕')+'</span></div><div style="font-size:11px;font-size:calc(11px * var(--kdn-font-scale));color:var(--t3);margin-top:6px">世界对「不可能之事」的察觉程度——涨易回难</div></div>';
  }else{
    var e=S.暴露调查组||{};
    h+='<div class="kdn-gl"><div style="display:flex;justify-content:space-between;font-size:12px;font-size:calc(12px * var(--kdn-font-scale));margin-bottom:8px"><span style="color:var(--t2)">暴露度</span><span style="color:#cf6a48">'+n(e.暴露度)+'/100 · '+esc(e.追查阶段||'平静')+'</span></div><div class="kdn-bar"><i style="width:'+n(e.暴露度)+'%;background:#cf6a48"></i></div></div>';
    h+='<div class="kdn-gl"><div style="font-size:12px;font-size:calc(12px * var(--kdn-font-scale));color:var(--t2);margin-bottom:8px">调查组</div><div style="font-size:12px;font-size:calc(12px * var(--kdn-font-scale));color:var(--t3);line-height:1.8">参与范围:'+esc(e.参与范围||'无')+'<br>整体建模:'+n(e.整体建模程度)+'%<br>核心对手:'+esc((e.核心对手||{}).姓名||'——')+' ('+esc((e.核心对手||{}).状态||'未上任')+')</div></div>';
    if((e.玩家潜伏||{}).状态&&e.玩家潜伏.状态!=='无')h+='<div class="kdn-gl"><div style="font-size:12px;font-size:calc(12px * var(--kdn-font-scale));color:var(--t2)">潜伏:'+esc(e.玩家潜伏.状态)+' · 怀疑度 '+n(e.玩家潜伏.怀疑度)+'%</div></div>';
  }
  return h;
}`,
  `function appWD(S){
  var h=hd('世界')+tabs(['世界演化']);
  var w=S.世界演化||{};
  [['体系信任',w.体系信任],['道德风气',w.道德风气],['秩序稳定',w.秩序稳定]].forEach(function(a){var av=n(a[1]),ap=(av+100)/2;
    h+='<div style="margin-bottom:13px"><div style="display:flex;justify-content:space-between;font-size:12px;font-size:calc(12px * var(--kdn-font-scale));margin-bottom:5px"><span style="color:var(--t2)">'+a[0]+'</span><span style="color:var(--t3)">'+(av>=0?'+':'')+av+'</span></div><div class="kdn-bar"><i style="width:'+ap+'%"></i></div></div>'});
  if(w.社会认知度)h+='<div class="kdn-gl" style="margin-top:18px"><div style="display:flex;justify-content:space-between;font-size:12px;font-size:calc(12px * var(--kdn-font-scale))"><span style="color:var(--t2)">社会认知</span><span style="color:var(--g)">'+esc(w.社会认知度)+'</span></div></div>';
  return h;
}`,
  'appWD',
);
script = replaceOnce(
  script,
  `function appME(S){
  var u=S.user||{},h=hd('自身')+tabs(['状态','能力']);
  if(tabIdx===0){
    h+='<div class="kdn-gl">';[['体力',u.体力],['饱腹',u.饱腹值],['水分',u.水分值],['洁净',u.洁净值]].forEach(function(a){
      h+='<div style="margin-bottom:11px"><div style="display:flex;justify-content:space-between;font-size:12px;font-size:calc(12px * var(--kdn-font-scale));margin-bottom:4px"><span style="color:var(--t2)">'+a[0]+'</span><span style="color:var(--t3)">'+n(a[1])+'</span></div><div class="kdn-bar"><i style="width:'+n(a[1])+'%;background:#4a82c2"></i></div></div>'});
    h+='</div><div class="kdn-gl"><div style="display:flex;justify-content:space-between;font-size:13px;font-size:calc(13px * var(--kdn-font-scale))"><span style="color:var(--t2)">现金 <b style="color:var(--t1)">'+n(u.现金)+'</b></span><span style="color:var(--t2)">存款 <b style="color:var(--t1)">'+n(u.存款)+'</b></span></div></div>';
    if(u.状态)h+='<div class="kdn-gl"><div style="font-size:12px;font-size:calc(12px * var(--kdn-font-scale));color:var(--t2)">'+esc(u.状态)+'</div></div>';
  }else{
    var p=S.权限||{};
    h+='<div class="kdn-gl"><div style="display:flex;justify-content:space-between;font-size:12px;font-size:calc(12px * var(--kdn-font-scale));margin-bottom:6px"><span style="color:var(--t2)">权限等级</span><span style="color:var(--g);font-size:15px;font-size:calc(15px * var(--kdn-font-scale));font-weight:500">Lv'+n(p.等级)+'</span></div><div style="font-size:11px;font-size:calc(11px * var(--kdn-font-scale));color:var(--t3)">范围上限 '+esc(p.范围上限||'')+' · 修正总合 '+n(p.修正总合)+'</div></div>';
    h+='<div style="font-size:12px;font-size:calc(12px * var(--kdn-font-scale));color:var(--t2);margin:12px 0 8px">已解锁</div>';
    ((p.解锁能力)||[]).forEach(function(c){h+='<div class="kdn-rl" style="padding:10px 14px"><span style="font-size:13px;font-size:calc(13px * var(--kdn-font-scale));color:var(--t1)">'+esc(c)+'</span></div>'});
  }
  return h;
}`,
  `function appME(S){
  var u=S.user||{},h=hd('自身')+tabs(['状态']);
  h+='<div class="kdn-gl">';[['体力',u.体力],['饱腹',u.饱腹值],['水分',u.水分值],['洁净',u.洁净值]].forEach(function(a){
    h+='<div style="margin-bottom:11px"><div style="display:flex;justify-content:space-between;font-size:12px;font-size:calc(12px * var(--kdn-font-scale));margin-bottom:4px"><span style="color:var(--t2)">'+a[0]+'</span><span style="color:var(--t3)">'+n(a[1])+'</span></div><div class="kdn-bar"><i style="width:'+n(a[1])+'%;background:#4a82c2"></i></div></div>'});
  h+='</div><div class="kdn-gl"><div style="display:flex;justify-content:space-between;font-size:13px;font-size:calc(13px * var(--kdn-font-scale))"><span style="color:var(--t2)">现金 <b style="color:var(--t1)">'+n(u.现金)+'</b></span><span style="color:var(--t2)">存款 <b style="color:var(--t1)">'+n(u.存款)+'</b></span></div></div>';
  if(u.状态)h+='<div class="kdn-gl"><div style="font-size:12px;font-size:calc(12px * var(--kdn-font-scale));color:var(--t2)">'+esc(u.状态)+'</div></div>';
  return h;
}`,
  'appME',
);
script = replaceOnce(
  script,
  "else if(type==='wd'){var world=S.世界演化||{},trend=S.影响倾向||{};main=trend.当前档||'中立';sub='社会认知 '+(world.社会认知度||'无痕');metrics='<div class=\"kdn-widget-metrics\">'+widgetMetric(n(world.体系信任),'信任')+widgetMetric(n(world.秩序稳定),'秩序')+widgetMetric(n(trend.数值),'倾向')+'</div>'}",
  "else if(type==='wd'){var world=S.世界演化||{};main=world.社会认知度||'日常';sub='体系 '+(n(world.体系信任)>=0?'+':'')+n(world.体系信任);metrics='<div class=\"kdn-widget-metrics\">'+widgetMetric(n(world.体系信任),'信任')+widgetMetric(n(world.道德风气),'风气')+widgetMetric(n(world.秩序稳定),'秩序')+'</div>'}",
  'widget-wd',
);
script = replaceOnce(script, "board=tabIdx===1?'wish':'hot'", "board='hot'", 'forum-board');
script = replaceOnce(script, "h=hd('论坛')+tabs(['热议','祈愿论坛'])", "h=hd('论坛')+tabs(['热议'])", 'forum-tabs');
script = script.replaceAll('var gz=c.授予者&&c.授予者.是否授予者', 'var gz=false');
script = replaceOnce(
  script,
  'var fav=n(c.好感度),lv=chFavLv(fav),gz=c.授予者&&c.授予者.是否授予者,bond=c.羁绊标签===true;',
  'var fav=n(c.好感度),lv=chFavLv(fav),gz=false,bond=c.羁绊标签===true;',
  'grantor-list',
);
script = replaceOnce(
  script,
  `  var gz=false;
  var badge=(gz?'<span style="font-size:10px;font-size:calc(10px * var(--kdn-font-scale));background:rgba(211,173,99,.15);color:var(--g);padding:3px 8px;border-radius:9px;white-space:nowrap"><i class="ti ti-sparkles" style="font-size:10px;font-size:calc(10px * var(--kdn-font-scale))"></i> 授予者 · '+esc(c.授予者.在场||'隐去')+'</span>':'')
    +(c.羁绊标签&&!gz?'<span style="font-size:10px;font-size:calc(10px * var(--kdn-font-scale));background:rgba(194,90,130,.15);color:#c25a82;padding:3px 8px;border-radius:9px;white-space:nowrap">羁绊</span>':'');`,
  `  var badge=(c.羁绊标签?'<span style="font-size:10px;font-size:calc(10px * var(--kdn-font-scale));background:rgba(194,90,130,.15);color:#c25a82;padding:3px 8px;border-radius:9px;white-space:nowrap">羁绊</span>':'');`,
  'grantor-badge',
);
script = replaceOnce(
  script,
  `+(gz&&c.授予者.失控警示?'<div style="font-size:11px;font-size:calc(11px * var(--kdn-font-scale));color:#c24a4a;margin-top:8px"><i class="ti ti-alert-triangle"></i> 她在担心你</div>':'')`,
  '',
  'grantor-warn',
);
script = replaceOnce(
  script,
  `  else if(p[0]==='knsubmit'){submitRule()}
  else if(p[0]==='knghostsubmit'){submitGhost()}
  else if(p[0]==='knclear'){knDraft=null;knTipText='';knTipBad=false;render()}
  else if(p[0]==='knarchive'){if(typeof window.confirm==='function'&&!window.confirm('整理归档会把已完结的同类定向规则合并为系列记录并释放旧编号（写入输入框，检查后发送）。继续？'))return;deliver('【Kaidan Note·整理归档】请将已兑现/已失效/已撤销的同类定向规则按系列归档合并为系列记录并释放旧编号;生效中规则不动。',false).then(function(message){knTipText=message;knTipBad=false;render()},function(error){knTipText=error&&error.message?error.message:'写入失败';knTipBad=true;render()})}
  else if(p[0]==='knghostclear'){knGhostDraft=null;knTipText='';knTipBad=false;render()}
  else if(p[0]==='knghostchip'){captureKnDraft();knGhostDraft=knGhostDraft||{};knGhostDraft[p[1]]=p[2];render()}
  else if(p[0]==='wctag'){toggleWorldTuneTag(p[1])}
  else if(p[0]==='wcsubmit'){submitWorldTune()}
  else if(p[0]==='wcclear'){wcDraft='';wcTags=[];wcTipText='';wcTipBad=false;render(true)}
  else if(p[0]==='wcharem'){wcHaremOpen=!wcHaremOpen;var haremCard=q('wcharem'),haremBody=q('wcharembody'),haremOpen=wcHaremOpen?'1':'0';if(haremCard){haremCard.setAttribute('data-kdn-open',haremOpen);haremCard.setAttribute('aria-expanded',wcHaremOpen?'true':'false')}if(haremBody)haremBody.setAttribute('aria-hidden',wcHaremOpen?'false':'true')}
  else if(p[0]==='feedlaws'){feedLawsOpen=!feedLawsOpen;var lawsCard=q('feedlaws'),lawsBody=q('feedlawsbody'),lawsOpen=feedLawsOpen?'1':'0';if(lawsCard){lawsCard.setAttribute('data-kdn-open',lawsOpen);lawsCard.setAttribute('aria-expanded',feedLawsOpen?'true':'false')}if(lawsBody)lawsBody.setAttribute('aria-hidden',feedLawsOpen?'false':'true')}
`,
  '',
  'kn-wc-actions',
);
script = replaceOnce(script, "settingsPanel('about','关于','info-circle','v1.0.9',row('Kaidan Note','<span style=\"font-size:11px;font-size:calc(11px * var(--kdn-font-scale));color:var(--t3)\">v1.0.9</span>'))", "settingsPanel('about','关于','info-circle','0.1.0',row('小手机','<span style=\"font-size:11px;font-size:calc(11px * var(--kdn-font-scale));color:var(--t3)\">0.1.0-work</span>'))", 'about');

let hostOut = host
  .replace(/^\/\/ 怪谈笔记 · 小手机\/平板（酒馆助手脚本，r2 起前端内嵌自包含）/, '// 通用小手机 / 平板（酒馆助手脚本，前端内嵌自包含）')
  .replace("build: '1.0.9-r2'", "build: '0.1.0-work'");

hostOut = hostOut.replace("['居所', '载具', '资产库', '怪谈笔记', '雷达系统']", "['居所', '载具', '资产库', '雷达系统']");
markup = markup
  .replace('content:"KDN"', 'content:"PHN"')
  .replace('/* KDN 1.0.3 r2：', '/* PH 0.1.0：')
  .replace('/* 怪谈笔记 · 状态栏 v1.0.9 —— 分尺寸多主屏 + 原生式小组件编辑 */', '/* 通用小手机 · 状态栏 —— 分尺寸多主屏 + 原生式小组件编辑 */')
  .replace('title="怪谈笔记"', 'title="小手机"');

hostOut = replaceOnce(
  hostOut,
  `  function openingText(root, skip) {
    var parts = [];
    var attitude = '';
    if (!skip) {
      ['国家', '省份', '城市', '具体地点'].forEach(function (key) {
        var field = root.querySelector('[data-kdnopen="' + key + '"]');
        var value = field ? String(field.value || '').trim().replace(/\\s+/g, ' ') : '';
        if (value) parts.push(key + ':' + value);
      });
      var attitudeField = root.querySelector('[data-kdnopen="对怪谈笔记的态度"]');
      attitude = attitudeField ? String(attitudeField.value || '').trim().replace(/\\s+/g, ' ') : '';
    }
    return '【开局设定】'
      + (parts.length ? parts.join(' ') : '交给怪谈安排一座大城市')
      + (attitude ? ' 对怪谈笔记的态度:' + attitude : '')
      + ' ——设定完成,从这里开始吧。';
  }`,
  `  function openingText(root, skip) {
    var parts = [];
    if (!skip) {
      ['国家', '省份', '城市', '具体地点'].forEach(function (key) {
        var field = root.querySelector('[data-phopen="' + key + '"]');
        var value = field ? String(field.value || '').trim().replace(/\\s+/g, ' ') : '';
        if (value) parts.push(key + ':' + value);
      });
    }
    return '【开局设定】'
      + (parts.length ? parts.join(' ') : '交给剧情安排一座大城市')
      + ' ——设定完成,从这里开始吧。';
  }`,
  'openingText',
);

hostOut = stripKaidanCopy(hostOut);
script = stripKaidanCopy(script);
markup = stripKaidanCopy(markup);

hostOut = renamePrefix(hostOut);
script = renamePrefix(script);
markup = renamePrefix(markup);
script = cleanLeftovers(script);
script = transformChatOutbox(script);

const mediaSplit = splitMediaLibrary(hostOut);
hostOut = mediaSplit.host;
const mediaOut = mediaSplit.media;

// 2026-08-27：楼层正文幽讯回放渲染（```phchat 围栏 → 手机同款气泡）。样式取自 HUD 主题实值
// （user 暖金 #d3ad63 系 / them 玻璃白 .05 / 圆角14底5），类名独立 .ph-fc-* 不与 HUD、头像气泡冲突。
hostOut = replaceOnce(
  hostOut,
  '  function exposeBridge(target) {',
  `  var FLOORCHAT_TIMERS = [];
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
    var lines = String(text || '').split(/\\r\\n|\\r|\\n/);
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
        var hm = line.match(/与\\s*(.+?)\\s*的幽讯/);
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
      var m = line.match(/^(.+?):\\s?([\\s\\S]*)$/);
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
        if (cls.indexOf('phchat') === -1 && !/^\\s*#与 .+ 的幽讯/.test(txt)) continue; // 认领必须严：围栏语言或首行协议头
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

  function exposeBridge(target) {`,
  'floorchat render section',
);
hostOut = replaceOnce(
  hostOut,
  '    clearBridge(helperWindow);',
  `    try { FLOORCHAT_TIMERS.forEach(function (t) { hostWindow.clearTimeout(t); }); FLOORCHAT_TIMERS.length = 0; } catch (e) {}
    try { FLOORCHAT_DISPOSERS.forEach(function (d) { d(); }); FLOORCHAT_DISPOSERS.length = 0; } catch (e) {}
    clearBridge(helperWindow);`,
  'floorchat destroy',
);

hostOut = replaceOnce(
  hostOut,
  '  exposeBridge(helperWindow);\n  if (hostWindow !== helperWindow) exposeBridge(hostWindow);',
  '  exposeBridge(helperWindow);\n  if (hostWindow !== helperWindow) exposeBridge(hostWindow);\n  bindFloorChat();',
  'floorchat bind on startup',
);

// 2026-08-27：悬浮球「打开小手机」对接——监听 ph-orb:open-phone，确保 HUD 挂载并闪烁提示根节点。
// 保守语义（不猜 HUD 内部开合）；真机确认小手机 UI 形态后可升级为真正的弹出/展开交互。
hostOut = replaceOnce(
  hostOut,
  '  function exposeBridge(target) {',
  `  function onOrbOpenPhone() {
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

  function exposeBridge(target) {`,
  'orb-open-phone listener',
);
hostOut = replaceOnce(
  hostOut,
  '    clearBridge(helperWindow);',
  `    try { hostWindow.removeEventListener('ph-orb:open-phone', onOrbOpenPhone); } catch (e) {}
    clearBridge(helperWindow);`,
  'orb-open-phone unbind',
);

const hudOut = `${markup}<script>${script}</script>${afterScript}`;
const assembled = `${hostOut}  var HUD_SOURCE = ${JSON.stringify(hudOut)};\n`;

await fs.mkdir(genericDir, { recursive: true });
await fs.writeFile(path.join(genericDir, 'ph_phone.js'), assembled, 'utf8');
await fs.writeFile(path.join(genericDir, '媒体库.js'), mediaOut, 'utf8');
await fs.writeFile(
  path.join(genericDir, '媒体库.meta.json'),
  JSON.stringify({
    type: 'script',
    enabled: true,
    name: '媒体库',
    id: 'ph-media-library',
    info: '媒体容器 / 图床 URL 地址存储中转。媒体数据存本脚本名下的酒馆助手脚本级变量，经 __phMedia 桥供小手机等前端读写；不装本脚本时小手机自动降级为无媒体展示。制卡配媒体优先图床 URL（base64 内置是全体玩家的基础负担，云酒馆/手机部署酒馆易炸内存；独立前端无此顾虑）；玩家游玩中导入媒体属正常使用。',
    button: { enabled: false, buttons: [] },
    data: {},
    export_with: { data: true, button: true },
  }, null, 2) + '\n',
  'utf8',
);
await fs.writeFile(path.join(genericDir, 'extracted', 'hud.html'), hudOut, 'utf8').catch(async () => {
  await fs.mkdir(path.join(genericDir, 'extracted'), { recursive: true });
  await fs.writeFile(path.join(genericDir, 'extracted', 'hud.html'), hudOut, 'utf8');
});
await fs.writeFile(path.join(genericDir, 'extracted', 'hud.script.js'), script, 'utf8');
await fs.writeFile(path.join(genericDir, 'extracted', 'host.bridge.js'), hostOut, 'utf8');

const regexOut = path.join(genericDir, 'regex');
await fs.cp(path.join(regexSrc, 'assets'), path.join(regexOut, 'assets'), { recursive: true });
for (const file of ['opening_page.html', 'options_block.html', 'var_card.html']) {
  const abs = path.join(regexOut, 'assets', file);
  let html = await fs.readFile(abs, 'utf8');
  html = stripKaidanCopy(html);
  html = html
    .replaceAll('开局设定 · 舞台与态度', '开局设定 · 舞台')
    .replaceAll('写下故事发生的地方——留空则由怪谈自己挑一座大城市。这是舞台的起点。', '写下故事发生的地方——留空则由剧情安排一座大城市。这是舞台的起点。')
    .replace(/\s*<input data-kdnopen="对怪谈笔记的态度"[^>]*>/, '')
    .replace(/\s*<input data-phopen="对世界的态度"[^>]*>/, '');
  html = renamePrefix(html);
  if (file === 'opening_page.html') {
    html = html.replace(
      /<input data-phopen="具体地点"[^>]*>/,
      (match) => `${match}`,
    );
  }
  await fs.writeFile(abs, html, 'utf8');
}

const leftovers = {
  kdn: [...assembled.matchAll(/kdn/gi)].length,
  kaidan: [...assembled.matchAll(/kaidan/gi)].length,
  怪谈: [...assembled.matchAll(/怪谈/g)].length,
  授予者: [...script.matchAll(/授予者/g)].length,
  处刑: [...script.matchAll(/处刑/g)].length,
  祈愿: [...script.matchAll(/祈愿|PH_FORUM_WISH|forumStage|wishLevel/g)].length,
  影响倾向: [...script.matchAll(/影响倾向/g)].length,
  knDead: [...script.matchAll(/knDraft|captureKnDraft|feedLaws/g)].length,
  wcDead: [...script.matchAll(/wcDraft|captureWcDraft|data-ph-wc/g)].length,
  knApp: [...script.matchAll(/function appKN|id:'kn'|appKN\(/g)].length,
  wcApp: [...script.matchAll(/function appWC|id:'wc'|appWC\(/g)].length,
  // 媒体库拆分门：host 里媒体容器零残留；HUD 侧只剩 mediaVariableApi 找桥的恰 1 处；媒体库脚本自含 id 与桥
  hostMediaResidue: [...hostOut.matchAll(/MEDIA_SCRIPT_ID|MEDIA_BRIDGE|__phMedia\b/g)].length,
  hudMediaApiDrift: [...script.matchAll(/__phMedia\b/g)].length === 1 ? 0 : 1,
  mediaScriptDrift: ([...mediaOut.matchAll(/ph-media-library/g)].length >= 2 && [...mediaOut.matchAll(/__phMedia\b/g)].length === 4) ? 0 : 1,
  // 幽讯攒消息+楼层回放门：HUD 侧三件在位（攒/触发/写围栏）、pending 简化生效、host 侧渲染段在位
  hxOutboxDrift: (script.includes('function queueChat()') && script.includes('function floorLogChat(') && script.includes('chatTailUserRun') && script.includes('回车攒消息') && !script.includes("chatBubble({role:'user',text:pending.text")) ? 0 : 1,
  // 正文映射开关门：开关函数/注入组件/设置行/change 分支/启动整备五件在位
  hxDigestDrift: (script.includes('function phFloorLogOn()') && script.includes('function buildPhDigest()') && script.includes('function refreshPhDigest()') && script.includes('function afterChatRound(') && script.includes('data-ph-hx-floorlog') && script.includes("injectPrompts([{id:'ph-hx-digest'") && script.includes('refreshPhDigest();\nrender();')) ? 0 : 1,
  floorChatDrift: (hostOut.includes('function renderFloorChat()') && hostOut.includes('bindFloorChat();') && hostOut.includes('.ph-fc-bubble') && hostOut.includes('phchat')) ? 0 : 1,
};
console.log(JSON.stringify({
  out: path.relative(path.resolve(workDir, '../../../..'), path.join(genericDir, 'ph_phone.js')).replaceAll('\\', '/'),
  bytes: Buffer.byteLength(assembled),
  mediaBytes: Buffer.byteLength(mediaOut),
  leftovers,
}, null, 2));
if (Object.values(leftovers).some(Boolean)) {
  console.error('leftover specializations remain');
  process.exitCode = 1;
}
