function showKnTip(t,bad){
  knTipText=String(t||'');knTipBad=!!bad;
  var tip=q('kntip');if(!tip)return;
  tip.textContent=knTipText;tip.style.display='block';tip.style.color=knTipBad?'#c24a4a':'var(--g)';
}
function setKnPending(button,pending){
  if(!button)return;button.disabled=!!pending;button.style.opacity=pending?'.6':'';button.textContent=pending?'写入中……':'落笔 —— 写入输入框';
}
function captureKnDraft(){
  if(!body||!body.querySelectorAll)return;
  var els=body.querySelectorAll('[data-kdnkn]');
  if(els&&els.length){var draft={};for(var i=0;i<els.length;i++){var key=els[i].getAttribute('data-kdnkn');if(key)draft[key]=String(els[i].value||'')}knDraft=draft}
  var gels=body.querySelectorAll('[data-kdnkn-ghost]');
  if(gels&&gels.length){var gd=knGhostDraft||{};for(var j=0;j<gels.length;j++){var gk=gels[j].getAttribute('data-kdnkn-ghost');if(gk)gd[gk]=String(gels[j].value||'')}knGhostDraft=gd}
}
function submitRule(){
  if(knSubmitting)return;
  var els=body.querySelectorAll('[data-kdnkn]'),vals={},byName={};
  for(var i=0;i<els.length;i++){var k=els[i].getAttribute('data-kdnkn');vals[k]=String(els[i].value||'').trim().replace(/\s+/g,' ');byName[k]=els[i];els[i].style.borderColor=''}
  knDraft=vals;
  var req=['对象','触发条件','怪谈内容'],miss=req.filter(function(k){return !vals[k]});
  if(miss.length){
    miss.forEach(function(k){if(byName[k])byName[k].style.borderColor='#c24a4a'});
    showKnTip('请补全必填项: '+miss.join('、'),true);
    if(byName[miss[0]]&&byName[miss[0]].focus)byName[miss[0]].focus();
    return;
  }
  var text='【Kaidan Note·提交规则】'
    +'对象:'+vals.对象
    +'；触发条件:'+vals.触发条件
    +'；怪谈内容:'+vals.怪谈内容
    +'；范围:'+(vals.范围||'未指定')
    +'；时限:'+(vals.时限||'未指定')
    +'；自由描述:'+(vals.自由描述||'无');
  var button=body.querySelector('[data-kdn-act="knsubmit"]');
  knSubmitting=true;setKnPending(button,true);showKnTip('写入中……',false);
  deliver(text,false).then(function(message){showKnTip(message,false)},function(error){showKnTip('写入失败：'+(error&&error.message?error.message:'未知错误'),true)}).then(function(){knSubmitting=false;setKnPending(body.querySelector('[data-kdn-act="knsubmit"]')||button,false)});
}

/* ---- 鬼怪捏造(与写规则同级,不耗修正) ---- */
function submitGhost(){
  if(knSubmitting)return;
  var els=body.querySelectorAll('[data-kdnkn-ghost]'),vals={},byName={};
  for(var i=0;i<els.length;i++){var k=els[i].getAttribute('data-kdnkn-ghost');vals[k]=String(els[i].value||'').trim().replace(/\s+/g,' ');byName[k]=els[i];els[i].style.borderColor=''}
  var gd=knGhostDraft||{};
  vals.类型=gd.类型||'鬼怪';vals.危害等级=gd.危害等级||'';
  knGhostDraft=Object.assign({},gd,vals);
  var req=['名称','形态','栖息地'],miss=req.filter(function(k){return !vals[k]});
  if(miss.length){
    miss.forEach(function(k){if(byName[k])byName[k].style.borderColor='#c24a4a'});
    showKnTip('请补全必填项: '+miss.join('、'),true);
    if(byName[miss[0]]&&byName[miss[0]].focus)byName[miss[0]].focus();
    return;
  }
  var text='【Kaidan Note·鬼怪捏造】'
    +'类型:'+vals.类型
    +'；名称:'+vals.名称
    +'；形态:'+vals.形态
    +'；栖息地:'+vals.栖息地
    +'；危害等级:'+(vals.危害等级||'未评级')
    +'；传闻:'+(vals.传闻||'尚无')
    +'；自由描述:'+(vals.自由描述||'无');
  var button=body.querySelector('[data-kdn-act="knghostsubmit"]');
  knSubmitting=true;
  if(button){button.disabled=true;button.style.opacity='.6';button.textContent='写入中……'}
  showKnTip('写入中……',false);
  deliver(text,false).then(function(message){showKnTip(message,false)},function(error){showKnTip('写入失败：'+(error&&error.message?error.message:'未知错误'),true)}).then(function(){
    knSubmitting=false;
    var btn=body.querySelector('[data-kdn-act="knghostsubmit"]')||button;
    if(btn){btn.disabled=false;btn.style.opacity='';btn.textContent='捏成 —— 写入输入框'}
  });
}

/* ---- Kaidan Note ---- */
function appKN(S){
  var h=hd('Kaidan Note')+tabs(['规则列表','写新规则','鬼怪捏造','处刑档案']);
  var laws=(S.怪谈笔记||{}).法则||{},ids=keys(laws);
  if(tabIdx===0){
    if(!ids.length)h+='<div style="text-align:center;color:var(--t3);padding:70px 0;font-size:13px;font-size:calc(13px * var(--kdn-font-scale))"><i class="ti ti-notebook" style="font-size:30px;font-size:calc(30px * var(--kdn-font-scale));display:block;margin-bottom:12px"></i>还没有写下任何怪谈</div>';
    ids.forEach(function(id){var L=laws[id],c=karmaColor(L.业力档),dim=L.状态!=='生效中';
      h+='<div class="kdn-rl"><div style="display:flex;justify-content:space-between;align-items:center"><span style="font-size:14px;font-size:calc(14px * var(--kdn-font-scale));font-weight:500;color:'+(dim?'var(--t3)':'var(--t1)')+'">'+esc(L.对象||L.名称||id)+'</span><span style="font-size:11px;font-size:calc(11px * var(--kdn-font-scale));background:'+c+'26;color:'+c+';padding:3px 9px;border-radius:9px">'+esc(L.业力档||'')+'</span></div>'
        +'<div style="font-size:12px;font-size:calc(12px * var(--kdn-font-scale));color:var(--t2);margin-top:6px">'+esc(L.怪谈内容||'')+'</div>'
        +'<div style="font-size:11px;font-size:calc(11px * var(--kdn-font-scale));color:var(--t3);margin-top:7px">'+esc(L.类型||'')+' · '+esc(L.状态||'')+(L.类型==='常驻'?' · 已兑现 ×'+n(L.兑现人数)+(n(L.破译进度)>0?' · 破译 '+n(L.破译进度)+'%':''):'')+'</div></div>';
    });
    var slot=(S.权限||{}).法则槽位||{};
    if(n(slot.上限)>0&&n(slot.已用)>=n(slot.上限))h+='<div class="kdn-rl" style="opacity:.65"><span style="font-size:13px;font-size:calc(13px * var(--kdn-font-scale));color:var(--t3)">法则槽位 '+n(slot.已用)+'/'+n(slot.上限)+' 已满——撤一条旧规则才能挂新的常驻法则</span></div>';
    var finishedCount=ids.filter(function(id){return laws[id]&&laws[id].状态!=='生效中'}).length;
    if(finishedCount>=2)h+='<div style="display:flex;justify-content:center;margin-top:4px"><button type="button" class="kdn-ui-chip" data-kdn-act="knarchive" style="color:var(--t3)"><i class="ti ti-archive"></i> 整理归档（'+finishedCount+' 条已完结）</button></div>';
  }else if(tabIdx===1){
    h+='<div style="color:var(--t3);font-size:12px;font-size:calc(12px * var(--kdn-font-scale));margin-bottom:12px">凡写进来的,都会成为现实。</div>';
    [['对象','写明确的人名(权限越高可越泛化)',1,'in'],
     ['触发条件','何时/何种情况生效;不填视为「立即」',1,'in'],
     ['怪谈内容','会发生什么——落笔时世界会预估注意力',1,'ta3'],
     ['范围','权限半径内,如 城东区/全城',0,'in'],
     ['时限','如 24小时/7天/长效',0,'in'],
     ['自由描述','可选,补充细节与氛围,怪谈同样会读取',0,'ta2']].forEach(function(f){
      var saved=knDraft&&knDraft[f[0]]!=null?String(knDraft[f[0]]):'';
      h+='<div class="kdn-rl" style="padding:10px 14px"><div style="font-size:12px;font-size:calc(12px * var(--kdn-font-scale));color:var(--g)">'+f[0]+(f[2]?' <span style="color:#c24a4a">*</span>':'')+'</div>'
        +(f[3]==='in'?'<input class="kdn-in" data-kdnkn="'+f[0]+'" value="'+esc(saved)+'" placeholder="'+f[1]+'">'
          :'<textarea class="kdn-in" data-kdnkn="'+f[0]+'" rows="'+(f[3]==='ta3'?3:2)+'" placeholder="'+f[1]+'" style="resize:vertical">'+esc(saved)+'</textarea>')+'</div>'});
    h+='<button data-kdn-act="knsubmit"'+(knSubmitting?' disabled':'')+' style="width:100%;padding:12px;border-radius:12px;border:none;background:var(--g);color:#2a1f08;font-size:13px;font-size:calc(13px * var(--kdn-font-scale));font-weight:600;cursor:pointer;font-family:inherit;letter-spacing:2px;margin-top:4px;opacity:'+(knSubmitting?'.6':'1')+'">'+(knSubmitting?'写入中……':'落笔 —— 写入输入框')+'</button>';
    h+='<div style="display:flex;justify-content:center;margin-top:6px"><button type="button" class="kdn-ui-chip" data-kdn-act="knclear" style="color:var(--t3)"><i class="ti ti-eraser"></i> 清空表单</button></div>';
    h+='<div data-kdn="kntip" style="display:'+(knTipText?'block':'none')+';font-size:11px;font-size:calc(11px * var(--kdn-font-scale));padding:8px 2px;text-align:center;color:'+(knTipBad?'#c24a4a':'var(--g)')+'">'+esc(knTipText)+'</div>';
    h+='<div style="text-align:center;color:var(--t3);font-size:11px;font-size:calc(11px * var(--kdn-font-scale));padding:8px 0 4px">写入输入框 · 检查后发送 · 撤销 20 修正 · 修改 10 修正</div>';
  }else if(tabIdx===2){
    var ghosts=(S.怪谈笔记||{}).鬼怪||{},gids=keys(ghosts),gd=knGhostDraft||{};
    if(gids.length){
      gids.forEach(function(id){var g=ghosts[id]||{};
        h+='<div class="kdn-rl"><div style="display:flex;justify-content:space-between;align-items:center;gap:8px"><span style="font-size:13px;font-size:calc(13px * var(--kdn-font-scale));color:var(--t1);font-weight:500">'+esc(g.名称||id)+'</span><span style="display:flex;align-items:center;gap:7px;flex:none"><span style="font-size:10px;font-size:calc(10px * var(--kdn-font-scale));color:var(--t3);white-space:nowrap">'+esc(g.类型||'鬼怪')+' · '+esc(g.状态||'')+'</span><button type="button" data-kdn-act="kndel:怪谈笔记/鬼怪/'+esc(id)+'" title="删除该鬼怪" style="background:none;border:none;color:var(--t3);cursor:pointer;padding:2px;font-size:13px;font-size:calc(13px * var(--kdn-font-scale))"><i class="ti ti-trash"></i></button></span></div><div style="font-size:11px;font-size:calc(11px * var(--kdn-font-scale));color:var(--t3);margin-top:4px">'+esc([g.危害等级,g.栖息地,g.传闻].filter(Boolean).join(' · '))+'</div></div>';
      });
    }else{
      h+='<div style="text-align:center;color:var(--t3);padding:26px 0 16px;font-size:12px;font-size:calc(12px * var(--kdn-font-scale))"><i class="ti ti-ghost" style="font-size:26px;font-size:calc(26px * var(--kdn-font-scale));display:block;margin-bottom:10px"></i>还没有捏出过什么</div>';
    }
    h+='<div style="color:var(--t3);font-size:12px;font-size:calc(12px * var(--kdn-font-scale));margin:6px 0 12px">捏出来的,都会自己走进夜里。</div>';
    h+='<div class="kdn-rl" style="padding:10px 14px"><div style="font-size:12px;font-size:calc(12px * var(--kdn-font-scale));color:var(--g)">捏造类型</div><div style="display:flex;gap:6px;margin-top:8px">'
      +['鬼怪','鬼域'].map(function(t){var on=(gd.类型||'鬼怪')===t;return '<button type="button" class="kdn-ui-chip" data-kdn-act="knghostchip:类型:'+t+'" style="'+(on?'border-color:var(--g);color:var(--g);background:rgba(211,173,99,.1)':'')+'">'+t+'</button>'}).join('')+'</div></div>';
    [['名称','给祂起个会在传闻里流传的名字',1,'in'],
     ['形态','长什么样、怎么出现、怎么被认出',1,'ta2'],
     ['栖息地','鬼怪常出没处 / 鬼域的位置与范围',1,'in'],
     ['传闻','民间流传的版本——越像真的越活',0,'ta2'],
     ['自由描述','可选,补充规则、禁忌与细节',0,'ta2']].forEach(function(f){
      var saved=gd[f[0]]!=null?String(gd[f[0]]):'';
      h+='<div class="kdn-rl" style="padding:10px 14px"><div style="font-size:12px;font-size:calc(12px * var(--kdn-font-scale));color:var(--g)">'+f[0]+(f[2]?' <span style="color:#c24a4a">*</span>':'')+'</div>'
        +(f[3]==='in'?'<input class="kdn-in" data-kdnkn-ghost="'+f[0]+'" value="'+esc(saved)+'" placeholder="'+f[1]+'">'
          :'<textarea class="kdn-in" data-kdnkn-ghost="'+f[0]+'" rows="2" placeholder="'+f[1]+'" style="resize:vertical">'+esc(saved)+'</textarea>')+'</div>'});
    h+='<div class="kdn-rl" style="padding:10px 14px"><div style="font-size:12px;font-size:calc(12px * var(--kdn-font-scale));color:var(--g)">危害等级</div><div style="display:flex;gap:6px;margin-top:8px;flex-wrap:wrap">'
      +['无害','扰民','危险','致命'].map(function(t){var on=(gd.危害等级||'')===t;return '<button type="button" class="kdn-ui-chip" data-kdn-act="knghostchip:危害等级:'+t+'" style="'+(on?'border-color:#c24a4a;color:#c24a4a;background:rgba(194,36,36,.08)':'')+'">'+t+'</button>'}).join('')+'</div></div>';
    h+='<button data-kdn-act="knghostsubmit"'+(knSubmitting?' disabled':'')+' style="width:100%;padding:12px;border-radius:12px;border:none;background:var(--g);color:#2a1f08;font-size:13px;font-size:calc(13px * var(--kdn-font-scale));font-weight:600;cursor:pointer;font-family:inherit;letter-spacing:2px;margin-top:4px;opacity:'+(knSubmitting?'.6':'1')+'">'+(knSubmitting?'写入中……':'捏成 —— 写入输入框')+'</button>';
    h+='<div style="display:flex;justify-content:center;margin-top:6px"><button type="button" class="kdn-ui-chip" data-kdn-act="knghostclear" style="color:var(--t3)"><i class="ti ti-eraser"></i> 清空表单</button></div>';
    h+='<div data-kdn="kntip" style="display:'+(knTipText?'block':'none')+';font-size:11px;font-size:calc(11px * var(--kdn-font-scale));padding:8px 2px;text-align:center;color:'+(knTipBad?'#c24a4a':'var(--g)')+'">'+esc(knTipText)+'</div>';
    h+='<div style="text-align:center;color:var(--t3);font-size:11px;font-size:calc(11px * var(--kdn-font-scale));padding:8px 0 4px">捏造与写规则同级 · 不耗修正 · 危害计入业力</div>';
  }else{
    var pa=S.处刑档案||{},dc=pa.死亡计数||{},dks=keys(dc),total=0;dks.forEach(function(k){total+=n(dc[k])});
    h+='<div class="kdn-gl" style="text-align:center"><div style="font-size:34px;font-size:calc(34px * var(--kdn-font-scale));font-weight:500;color:var(--t1)">'+n(pa.总处刑数)+'</div><div style="font-size:11px;font-size:calc(11px * var(--kdn-font-scale));color:var(--t3);margin-top:3px">总处刑数</div></div>';
    if(total>0){
      var colors=['#b8894a','#8b6fc0','#3fa07f','#cf6a48','#4a82c2','#c25a82'],acc=0,segs=[];
      dks.forEach(function(k,i){var deg=n(dc[k])/total*360;segs.push(colors[i%colors.length]+' '+acc+'deg '+(acc+deg)+'deg');acc+=deg});
      h+='<div class="kdn-gl" style="display:flex;gap:16px;align-items:center"><div style="width:96px;height:96px;border-radius:50%;background:conic-gradient('+segs.join(',')+');flex-shrink:0;box-shadow:inset 0 0 0 26px var(--bg)"></div><div style="flex:1">';
      dks.forEach(function(k,i){var pct=total?Math.round(n(dc[k])/total*100):0;h+='<div style="display:flex;justify-content:space-between;font-size:12px;font-size:calc(12px * var(--kdn-font-scale));margin:5px 0"><span style="color:var(--t2)"><span style="display:inline-block;width:8px;height:8px;border-radius:2px;background:'+colors[i%colors.length]+';margin-right:6px"></span>'+esc(k)+'</span><span style="color:var(--t3)">'+n(dc[k])+' 人 · '+pct+'%</span></div>'});
      h+='</div></div>';
    }
    var ge=pa.鬼怪处刑||{},gks=keys(ge),ghostsBook=(S.怪谈笔记||{}).鬼怪||{},geTotal=0;gks.forEach(function(k){geTotal+=n(ge[k])});
    if(gks.length){
      h+='<div class="kdn-dsec">鬼怪处刑 · '+geTotal+' 人</div>';
      gks.forEach(function(k){var gname=(ghostsBook[k]||{}).名称||k,pct=total?Math.round(n(ge[k])/total*100):0;
        h+='<div class="kdn-rl" style="padding:10px 12px"><div style="display:flex;justify-content:space-between;align-items:center;font-size:12px;font-size:calc(12px * var(--kdn-font-scale))"><span style="color:var(--t1)"><i class="ti ti-ghost" style="color:var(--t3);margin-right:5px"></i>'+esc(gname)+'</span><span style="color:var(--t3)">'+n(ge[k])+' 人 · '+pct+'%</span></div><div class="kdn-bar" style="margin-top:7px"><i style="width:'+pct+'%;background:#8b6fc0"></i></div></div>';
      });
    }
    if(total<=0&&!gks.length)h+='<div style="text-align:center;color:var(--t3);padding:40px 0;font-size:13px;font-size:calc(13px * var(--kdn-font-scale))">尚无记录</div>';
  }
  return h;
}

/* ---- 世界调制 ---- */
function captureWcDraft(){var input=root.querySelector('[data-kdn-wc-input]');if(input)wcDraft=String(input.value||'').slice(0,2000)}
function showWcTip(text,bad){wcTipText=String(text||'');wcTipBad=!!bad;var tip=q('wctip');if(!tip)return;tip.textContent=wcTipText;tip.style.display=wcTipText?'block':'none';tip.style.color=wcTipBad?'#cf7b7b':'var(--g)'}
function toggleWorldTuneTag(index){if(wcSubmitting)return;index=Math.floor(n(index));if(index<0||index>=WC_TAGS.length)return;captureWcDraft();var at=wcTags.indexOf(index);if(at>=0)wcTags.splice(at,1);else wcTags.push(index);wcTags.sort(function(a,b){return a-b});wcTipText='';wcTipBad=false;render(true)}
function submitWorldTune(){
  if(wcSubmitting)return;captureWcDraft();var wish=String(wcDraft||'').trim().replace(/\s+/g,' ');wcDraft=wish;
  if(!wish){showWcTip('请先写下要世界实现的愿望',true);var emptyInput=root.querySelector('[data-kdn-wc-input]');if(emptyInput&&emptyInput.focus)emptyInput.focus();return}
  var selected=wcTags.map(function(index){return WC_TAGS[index]}).filter(Boolean),tagText=selected.length?selected.map(function(item){return item[0]+'('+item[1]+'修正)'}).join('、'):'未指定';
  var text='【世界调制·提交愿望】干涉标签:'+tagText+'；愿望内容:'+wish+'；请按当前权限、当期修正与世界状态重新判定类型、花费与兑现方式。';
  wcSubmitting=true;wcTipText='写入中……';wcTipBad=false;render(true);
  deliver(text,false).then(function(message){var input=root.querySelector('[data-kdn-wc-input]');if(input)input.value='';wcDraft='';wcTags=[];wcTipText=message;wcTipBad=false},function(error){wcTipText='写入未完整完成，内容可能已进输入框；请检查后重试：'+(error&&error.message?error.message:'未知错误');wcTipBad=true}).then(function(){wcSubmitting=false;render(true)});
}
function appWC(S){
  var h=hd('世界调制'),m=S.世界调制||{},hm=m.后宫空间||{},members=hm.成员||{},memberNames=keys(members),selectedCost=0;wcTags.forEach(function(index){if(WC_TAGS[index])selectedCost+=WC_TAGS[index][1]});
  h+='<div class="kdn-gl"><div style="display:flex;justify-content:space-between;font-size:12px;font-size:calc(12px * var(--kdn-font-scale))"><span style="color:var(--t2)">当期修正</span><span style="color:#3fa07f;font-size:16px;font-size:calc(16px * var(--kdn-font-scale));font-weight:500">'+n((S.权限||{}).当期修正)+'</span></div></div>';
  h+='<div class="kdn-gl kdn-wc-harem kdn-collapse" data-kdn="wcharem" data-kdn-act="wcharem" data-kdn-open="'+(wcHaremOpen?'1':'0')+'" aria-expanded="'+(wcHaremOpen?'true':'false')+'"><div style="display:flex;justify-content:space-between;align-items:center;gap:8px;font-size:12px;font-size:calc(12px * var(--kdn-font-scale))"><span style="color:var(--t2)">'+(hm.已开通?'后宫空间 · 成员 '+memberNames.length:'后宫空间 · 未开通(10 修正)')+'</span><span style="color:var(--t3);white-space:nowrap">'+(hm.已开通?'已开通':'未开通')+' <i class="ti ti-chevron-down kdn-collapse-icon" style="font-size:12px;font-size:calc(12px * var(--kdn-font-scale))"></i></span></div><div class="kdn-collapse-body" data-kdn="wcharembody" aria-hidden="'+(wcHaremOpen?'false':'true')+'"><div class="kdn-collapse-inner"><div style="font-size:11px;font-size:calc(11px * var(--kdn-font-scale));color:var(--t3);line-height:1.5;padding-top:9px">'+esc(hm.场景描述||'阳光沙滩海岛在传闻的另一侧等着')+'</div>';
  if(!memberNames.length)h+='<div style="font-size:11px;font-size:calc(11px * var(--kdn-font-scale));color:var(--t3);padding-top:10px">尚无成员</div>';
  memberNames.forEach(function(name){var member=members[name]||{},meta=[member.来源,member.备注].filter(Boolean).join(' · ');h+='<div style="border-top:.5px solid rgba(255,255,255,.07);padding-top:9px;margin-top:9px"><div style="display:flex;justify-content:space-between;gap:8px"><span style="font-size:12px;font-size:calc(12px * var(--kdn-font-scale));color:var(--t1);font-weight:500">'+esc(name)+'</span><span style="font-size:10px;font-size:calc(10px * var(--kdn-font-scale));color:#58b78f;text-align:right">'+esc(member.状态||'')+'</span></div>'+(meta?'<div style="font-size:11px;font-size:calc(11px * var(--kdn-font-scale));color:var(--t3);line-height:1.5;margin-top:4px">'+esc(meta)+'</div>':'')+'</div>'});
  h+='</div></div></div>';
  h+='<div style="display:flex;justify-content:space-between;gap:8px;align-items:end;margin-top:14px"><div><div style="font-size:12px;font-size:calc(12px * var(--kdn-font-scale));color:var(--t2)">干涉标签（可选）</div><div style="font-size:10px;font-size:calc(10px * var(--kdn-font-scale));color:var(--t3);margin-top:3px">可多选，只作意图与参考价提示</div></div><span style="font-size:10px;font-size:calc(10px * var(--kdn-font-scale));color:var(--g);white-space:nowrap">'+(selectedCost?'参考 '+selectedCost+' 修正':'自由愿望')+'</span></div><div class="kdn-wc-tags">';
  WC_TAGS.forEach(function(item,index){var selected=wcTags.indexOf(index)>=0;h+='<button type="button" class="kdn-wc-tag" data-kdn-act="wctag:'+index+'" data-kdn-selected="'+(selected?'1':'0')+'" aria-pressed="'+(selected?'true':'false')+'"><span>'+esc(item[0])+'</span><b>'+item[1]+'</b></button>'});
  h+='</div><div class="kdn-wc-compose"><label style="display:block;font-size:12px;font-size:calc(12px * var(--kdn-font-scale));color:var(--t2);margin-bottom:7px">愿望内容 <span style="color:#cf7b7b">*</span></label><textarea class="kdn-in" data-kdn-wc-input maxlength="2000" rows="4" placeholder="直接写你希望世界发生什么；对象、范围与细节都可以自由描述"'+(wcSubmitting?' disabled':'')+'>'+esc(wcDraft)+'</textarea><button class="kdn-ui-primary" data-kdn-act="wcsubmit" style="width:100%"'+(wcSubmitting?' disabled':'')+'>'+(wcSubmitting?'写入中……':'写入输入框')+'</button><div style="display:flex;justify-content:center;margin-top:7px"><button type="button" class="kdn-ui-chip" data-kdn-act="wcclear" style="color:var(--t3)"><i class="ti ti-eraser"></i> 清空愿望与标签</button></div><div data-kdn="wctip" aria-live="polite" style="display:'+(wcTipText?'block':'none')+';font-size:10px;font-size:calc(10px * var(--kdn-font-scale));text-align:center;padding-top:8px;color:'+(wcTipBad?'#cf7b7b':'var(--g)')+'">'+esc(wcTipText)+'</div></div>';
  h+='<div style="text-align:center;color:var(--t3);font-size:10px;font-size:calc(10px * var(--kdn-font-scale));line-height:1.5;padding:10px 6px 2px">标签不锁死结果；最终权限、花费与冲突由当前世界状态结算</div>';
  return h;
}
