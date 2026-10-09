# 通用小手机工作稿 0.1.0-work

由 r2 内置图标源机械变换而来，不是从零捏的假界面。只改 `work/`，不改 `sources/`，不回封卡。

## 多脚本分职（2026-08-27 起）

构建产出**两个**酒馆助手脚本，按「每脚本各管各的功能」拆分：

| 产物 | name / script_id | 职责 |
|---|---|---|
| `ph_phone.js` | 小手机（`phone-hud`） | host 桥 + HUD 界面（含媒体的渲染/弹层/导入采集，经 `__phMedia` 桥读写） |
| `媒体库.js` | 媒体库（`ph-media-library`） | 媒体容器 / 图床 URL 地址存储中转：数据仓（挂自己名下的脚本级变量）+ 读写桥（挂 `__phMedia` 到宿主 window） |

两脚本零依赖、加载顺序无关：媒体库不在时，小手机角色档案等界面自动降级为无媒体展示（HUD `readMediaLibrary` 兜底空库）。媒体库元数据见 `媒体库.meta.json`（含面向制卡者的图床 URL 推荐；玩家游玩中导入媒体属正常使用，UI 不加提醒）。

## 源

| 项 | 值 |
|---|---|
| 源文件 | `小手机/sources/1.0.9-内置图标/kdn_phone.js` |
| 来源 | `怪谈笔记/components/scripts/kdn_phone.js` == `v1.0.9/r2` |
| SHA-256 | `2f8c4342d75435c025ad197b08470799ec95ad027b4d53979831a3969d045ee6` |
| 构建 | `node work/tools/build_generic_phone.mjs` |
| 产物 | `ph_phone.js`（host 桥 + 内嵌 `HUD_SOURCE`） |

可读拆稿在 `extracted/`：`host.bridge.js`、`hud.script.js`、`hud.html`。  
切出的 kn/wc 原文在 `plugins/kaidan_apps.reference.js`（参考稿，运行时未挂）。  
正则 HTML 副本在 `regex/assets/`，属性已改 `data-ph*`；正则条目名未改。

## 幽讯：攒消息 + 楼层正文回放（2026-08-27）

- **回车=攒**：消息立即入 thread 上屏可连打（Shift+Enter 换行）；**发送=触发**：取 thread 尾部连续 user 段一并交副 API 回应（连发时 system 追加「当作一组一并回应」）。失败消息保留在会话，再按发送即重试。
- **聊天记录写进正文**开关（设置→显示内容，即时生效，localStorage `ph_hx_floorlog`，默认开）：
  - **开** → 每轮对话写 ```phchat 围栏进最后一楼（协议：`#与 X 的幽讯 · 时间` / `谁: 内容` / `·` 系统行；尾加、并入已有围栏、user 楼另起 assistant 层），host 侧 `renderFloorChat` 扫 `pre>code` 严格认领后替换成 **小手机同款气泡**（`.ph-fc-*`）。此态**不注入**——围栏在楼层即在主线上下文。
  - **关** → 不写楼层，改 `injectPrompts` 隐形注入摘要（`ph-hx-digest`·in_chat·depth1·should_scan，预算 120 条、前 3 会话各 30，带隐私框架与「正文勿复述」铁律）。
  - 两态互斥：同一份聊天内容永不进两遍上下文。整备时机=攒消息/回复到达/开关切换/HUD 启动。
- **与头像气泡脚本两套系统**（总监裁定）：正文私信块=手机同款皮；头像气泡脚本的四套皮肤只管主线 `<ph-dialog>` 气泡，互不干涉不混用。围栏语言名 `phchat` 与他卡的 `chat` 隔离可共存。

## 已按拍板做的

- 前缀 `kdn` / `kaidan-note-bridge` → `ph` / `phone-hud`，无兼容别名
- 桌面去掉 `kn`、`wc`
- 授予者徽章 / 失控警示不再展示
- 世界页只留演化仪表；调查组、影响倾向条切掉
- 自身只留状态；权限/能力页切掉
- 论坛 UI 只留热议
- 开局去掉「对怪谈笔记的态度」
- 子宫填充留在角色详情：有 `私密档案.子宫填充度` 才画

`phone.config.default.json` / `phone.config.kaidan.json` 是边界说明书，**脚本尚未读取**。

## 与生产运行时的差异

- 脚本 id / storage / 全局键全部换了，旧聊天的 `kdn_*` 仓读不到
- 宿主适配：仍是酒馆助手脚本 + `new Function` 挂 HUD，和 r2 同一链路
- fixture：内置 `MOCK` 已换成中性都市样例，真机走 MVU `stat_data`
- 未挂：kn/wc adapter、授予者、祈愿板

## 壳内特化

论坛只留热议；`wish` / `forumStage` / kn-wc 死变量 / `captureKnDraft` 已从壳里删掉。子宫填充仍在角色详情。

## 没验

真机 SillyTavern 未挂。`node --check` 过、leftover 扫描过，不等于能用。

变量契约与初始化已在 `mvu-zod/work/generic/`：文件名是 `generic_mvu_schema.js`，9 根，`民间传闻名`，社会认知默认 `日常`。
