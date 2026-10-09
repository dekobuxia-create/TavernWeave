# 参考研究 · Sugar Baby Simulator 的手机私信 ↔ 楼层正文映射机制

研究对象：`Sugar Baby Simulator：纸醉金迷`（chara_card_v3，作者 fannnnnnn）。卡内只有 3 个 loader（Supabase 版本指针 + jsDelivr 三域拉真身，架构与星月指针跟随同族）；真身两件：`dm_generator.js`（私信生成器 221KB）+ `phone_panel.js`（悬浮手机 336KB），本地快照留在 `V:\Downloads\.sbs_dm_generator.js` / `.sbs_phone_panel.js`（@main，2026-08-27 拉取）。**卡内正则 0 条**——所有渲染都是脚本 DOM 替换，不走酒馆正则。

## 总架构：双生成器（与我们的「主线输出标签→正则渲染」路线根本不同）

- **主线 LLM 只写散文**——正文永远是叙事，不要求它吐任何私信格式；
- **私信由脚本独立生成**：手机发事件 → `dm_generator` 用 `generateRaw`（玩家配了独立 API 则优先走独立 API，失败回退主 API+限速闸）开一个隐形小窗生成，`should_silence:true, max_chat_history:0, ordered_prompts` 全自控——**格式 100% 脚本控制、可重试、失败玩家看不见**。原作者注释原话：「彻底不依赖主线 LLM 吐格式」（三版血泪教训）。

## 六个机制环

### ① 攒消息（outbox 队列）——总监点名要的功能
- 聊天页**回车=入队**：消息立即写 `dm_history`（手机 UI 立刻显示）+ 按联系人推进 outbox 暂存队列，**不触发生成**，可连打 N 条；
- 点**发送**才触发：`replyOne(name)` 把这人攒的全部消息拼成情境串——『玩家在私信里对 X 说了：「a」、「b」、「c」。只让 X 本人回应这些，别的角色不要出现』——清空队列 → `eventEmit('sb_request_dm', {reason, n:'1-2'})`；
- 生成期间聊天窗底部插「X 正在输入…」气泡（回复到达后 `sb_updated` 整页重渲染自然消失，失败 `sb_dm_failed` 手动摘）；
- **重 roll**：删掉该联系人尾部一串 THEM 消息，**连带回滚这些消息的钱包/衣橱副作用**（rollbackMsgEffects），再带「换一种方式重新回应」的 hint 重新 emit。

### ② 独立生成与格式闸
- prompt 组装：NPC「声音卡」（每人一段浓缩人设+说话风格）+ 世界状态文本化（钱包/衣橱/日程）+ 主线最近散文（剧情进展）+ 等待名单（『他上一条还没得到回复，正常人会干等，本轮禁止再发』）+ 冷处理名单（硬禁发）+ 管家解读指令；
- 输出格式：**每行 `名字|类型|内容`**，类型有 text / tag（新人首现的属性标签）/ recall（撤回）/ gift / paybill / transfer 等——gift/paybill 直接驱动记账系统；
- 解析是严格白名单（挡预设注入的标签与字段行），失败自动带『再次强调：只能输出 名字|类型|内容 的行』重试；
- 写回 `sb.npcs[name].dm_history` → `eventEmit('sb_updated')` → 手机刷新。

### ③ 楼层正文映射（``` chat 围栏 + DOM 替换渲染）——两套气泡样式的谜底
- `appendChatBubbles`：把新私信写进**最后一楼**尾部的 ` ```chat ` 代码围栏。**围栏内是极简纯文本协议**：
  - `#20:45 · 与 SugarElite™ 的私信` —— `#` 行=时间分隔线；
  - `名字: 内容` —— 一行一条（名字里的半角冒号转全角防撞分隔符；内容内部换行压成 ` / `）；
  - `· 文本` —— 系统行（撤回/从略）。
  - 同围栏合并（用 lastIndexOf 定位最后一个围栏、不用跨消息正则防吞）、内容防重复、最后一楼是 user 楼则另起一层 assistant 楼。
- `phone_panel.renderChatBubbles`：扫宿主 `pre > code`，**认领条件严**（class 含 `chat` **或**首行匹配 `#…的私信`——防误伤 YAML/JSON 代码块）→ `parseBubs` 解析 → **`replaceChild` 整体换成气泡 DOM**（`.br/.me` 行、`.av` 首字母头像+title、同人连发只露第一条头像其余留空位对齐、`.bn` 名字、`.bb` 气泡体，一律 `textContent` 防 HTML 注入）；
- 重渲染时机：**MutationObserver 观察 `#chat`（childList+subtree）+ 260ms 防抖**——酒馆重绘（新楼/翻页/编辑/切聊天）会把气泡吹回代码块，攒一拍补渲染。⚠️与星月 2.9.8「全文档 observer 卡顿」教训相反的选择，靠防抖+轻回调（只扫 pre>code）压成本，移植时需流式性能实测。
- **两套气泡样式的原因**：手机内气泡=iframe 里手机 UI 自己的样式；正文气泡=code 块替换渲染的另一套 CSS。**数据同源（dm_history），皮肤各异**。
- ` ```chat ` 围栏协议的妙处：不渲染时优雅降级成可读代码块；纯文本进上下文对模型无害；便于防重复与合并。

### ④ 主线感知（syncInject——正文与手机不失忆的关键）
- `buildDigest`：把 dm_history 组装成摘要注入主线——预算制（玩家可调，默认 150 条上限 300；按最近活跃排序，前 3 人各占预算 1/3 至少 20 条，其余每人 8 条）；带**隐私框架**（每段标注『仅 X 与 User 知晓，其他角色不知情』防串知；撤回消息只注入『她撤回过』不注入内容）；顺带注入衣橱/行程/论坛帖/捞金榜等状态 + WALLET/CLOSET/TIME 标记规则；
- `injectPrompts([{id:'sbnyc-dm-digest', position:'in_chat', depth:1, role:'system', should_scan:true}])`——玩家不可见；**`should_scan:true` 让注入内容还能激活对应 NPC 的世界书条目**（妙）；
- 刷新时机：手机发消息时 / NPC 回复后 / 每次主线生成前（`GENERATION_AFTER_COMMANDS`）兜底；脚本关闭时 `uninjectPrompts` 撤干净（注入不随脚本关闭消失）。

### ⑤ 反向同步（删楼/重 roll → 手机记录回滚）
- 每次写围栏给涉及的 dm_history 条目打代号 `_bub = bubGen`（每写一次 +1）；最新两代（now/last）允许被删楼带走，更早算定案——删掉/重 roll 带气泡的楼层时按代号回滚 dm_history，楼层与手机双向一致。默认关，手机设置里开。

### ⑥ 标记记账（正文 → 变量）
- 主线正文末尾输出 `[WALLET:±金额:备注]` `[CLOSET:+品名|价格]` `[TIME:HH:MM|YYYY-MM-DD]`（世界书条目教格式+syncInject 里贴脸重申）→ 脚本解析入账后**把标记从消息里删掉**（防重复计+玩家看不到格式）；解析带容错（冒号旁空格/金额逗号/￥符号）；LLM 忘写=不入账，啥也不坏。

## 实装记录（2026-08-27 首批已落地）与后续映射

**总监裁定（实装前拍板）**：正文回放气泡走**小手机同款**对话气泡样式，与头像气泡脚本（四皮肤，渲染主线 `<ph-dialog>` 输出）是**两套系统，互不干涉、不混用**——正文私信块本质是手机聊天的回放，长得像手机才对。（本文档初稿建议的「进头像气泡吃皮肤」作废。）

已实装（改动全落 `build_generic_phone.mjs` 变换，产物 `ph_phone.js`）：

| 机制 | 实装形态 |
|---|---|
| outbox 攒消息 | 幽讯 app：**回车=攒**（消息立即入 thread 上屏，Shift+Enter 换行），**发送键=触发**（取 thread 尾部连续 user 段一并回应——比 SBS 更简洁：不需要独立 outbox 存储，尾部 user 连段天然就是待回队列）。连发多条时 system 追加「user 连发了 N 条，当作一组一并回应」。失败=消息保留在 thread（像真 IM），再按发送即重试 |
| 生成通道 | 沿用 phone 既有副 API 桥（`__phAi.generate`）——星月/怪谈本就不走主模型，无需引入 generateRaw |
| 围栏协议 | **```phchat**（独立语言名，与 SBS 卡的 ```chat 完全隔离可共存）：`#与 X 的幽讯 · HH:MM` 头行 / `谁: 内容` 行 / `·` 系统行；每轮对话完成后写进最后一楼（尾加 / 并入已有围栏 / user 楼另起 assistant 层，防重复），HUD 侧 `PH_FLOOR_LOG` 常量可关。写入走 `TavernHelper.getChatMessages/setChatMessages/createChatMessages`（⚠️API 可用性留真机验） |
| 正文渲染 | host 侧 `renderFloorChat`：扫 `pre>code` 严格认领（class 含 phchat 或首行协议头）→ DOM 替换成 `.ph-fc-*` 气泡（**小手机同款视觉实值**：user 暖金 rgba(211,173,99,.18)/them 玻璃白 .05/圆角 14 底角 5/名字标）；时机=定时兜底+ST 事件（沿用本包模式，未引 MutationObserver） |

- **syncInject → 已按总监终版方案实装（2026-08-27 第二批）**：做成**「聊天记录写进正文」开关**（设置→显示内容，即时生效）。开=写围栏、撤注入（围栏在楼层即在上下文，注入属冗余——总监先指出，SBS 注入本就是为其「可关的回放」兜底）；关=不写楼层、`injectPrompts` 注入摘要（SBS 同款参数 in_chat/depth1/should_scan+预算制+隐私框架）。两态互斥，同一份内容永不进两遍上下文。

未做（后续）：
- 反向同步（删楼/重 roll 回滚 thread）；WALLET/CLOSET 类标记记账（怪谈已有同族）；开态真机观察项（主线复述围栏/NPC 串知→补世界书 constant）。

## 版权注意

真身脚本头部声明：「可读可学，禁止直接搬运、改名、重新打包后公开发布；保留署名」。**实装时只借鉴机制思路（事件流/协议/防抖策略），代码自己写**——尤其通用包是要开源发布的，不能搬 SBS 代码。本文档记录的是机制而非代码。
