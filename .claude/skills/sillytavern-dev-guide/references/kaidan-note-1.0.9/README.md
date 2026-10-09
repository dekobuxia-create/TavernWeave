# 怪谈笔记 · 通用化改造（1.0.9 入库）

本目录是 1.0.9 运行时三类资产的**只读入库快照 + 通用化工作区**。本轮只分离，不改行为，不回封卡，不回落 `模块化组件/`。

机器清单与 SHA-256 见 `provenance.json`。重跑入库：

```powershell
node 怪谈笔记/小手机通用化改造/tools/ingest_1_0_9.mjs
```

## 目录

| 路径 | 用途 |
|---|---|
| `小手机/` | 通用版小手机目录。`sources/` 收纳两版 1.0.9 脚本；`work/generic/` = **通用组件**产物（`ph_phone.js` 含幽讯攒消息+楼层正文回放+映射开关、`媒体库.js`），由 `work/tools/build_generic_phone.mjs` 从 r2 源机械变换生成 |
| `mvu-zod/` | Zod Schema、国内/国外 MVU 加载器、世界书三条变量条目 |
| `正则/` | 10 条正则 + 3 个 HTML 资产 + 构建产物 + r1 导入包 |
| `行动选项/` | 世界书四条行动选项 CoT（正文未改） |
| `星月气泡与cot/` | 2026-08-27 增：星月 4.0.0 头像对话气泡全链路参考素材（2 条正则 + CoT 世界书条目 + media_library 渲染器 + bubble.css），只读快照、独立 provenance，不属于 1.0.9 入库范围 |
| `星月悬浮球/` | 2026-08-27 增：星月 4.0.0 悬浮球+轮盘+气泡头像管理器源码行段摘录（runtime control-center.js），只读参考、独立 provenance |
| `头像气泡/` | 2026-08-27 增：**通用组件**——气泡渲染器+四套皮肤+头像气泡管理（含皮肤切换），配套正则×2 与世界书 cot 条目，脚本 `ph-avatar-bubble` |
| `悬浮球/` | 2026-08-27 增：**通用组件**——桌宠点阵球+半轮盘（2 键：打开小手机 / 气泡头像管理），脚本 `ph-orb`，由 `tools/build_orb.mjs` 从参考件机械组装 |
| `参考研究-SBS手机私信映射机制.md` | 2026-08-27 增：Sugar Baby Simulator 手机↔正文映射机制逆向研究 + 已实装记录（攒消息 / phchat 围栏回放 / 映射开关与注入兜底）。⚠️其代码禁搬运，只借鉴机制 |
| `沙盘/` | 视觉校准沙盘（气泡校准台——四皮肤即出自它的拨定值） |
| `tools/ingest_1_0_9.mjs` | 从 1.0.9 卡包 / 工作区组件 / r1 / r2 再拷一次 |

## 本轮收了什么

- 小手机两版：卡内拉取图标库稿（`build: 1.0.9`）、r2 内置图标稿（`build: 1.0.9-r2`）
- MVU Zod 套件：`zod_schema.js`、`mvu_zod_cn.js`、`mvu_zod_global.js`
- 世界书变量条目：`[InitialVariables]变量初始化`、`[mvu_update]变量更新规则`、`[mvu_update]变量输出格式`
- 正则套件：10 条 + `opening_page.html` / `options_block.html` / `var_card.html`
- 行动选项世界书：一至四档 CoT，正文未改

## 本轮没动

- 世界观 / 角色 / 规则 / 其余 cot 世界书
- 开场白与消息
- `statusbar.html`（1.0.9 小手机已自包含 HUD）
- `v1.0.9` 发布 JSON/PNG
- `模块化组件/` 与 0.9.7 旧包
- 通用化改写本身

## 真相源

- 拉取图标库小手机：`怪谈笔记/v1.0.9/怪谈笔记·绮罗世界 MVU 1.0.9.json` 的 `kaidan-note-bridge`
- 内置图标小手机：`怪谈笔记/components/scripts/kdn_phone.js`，与 `v1.0.9/r2` 正文相同
- MVU / 变量条目 / 正则源文件：`怪谈笔记/components/`，与 1.0.9 卡包正文一致
- 结算卡完成条的酒馆导入包：`v1.0.9/r1`（源文件用 `replaceFile`，导入包带内联 `replaceString`）

入库时 23 个拷贝文件与源 SHA-256 全部对齐。

## 下一步

通用化已从 `小手机/work/` 起手，**不要改 `sources/`**。

当前工作稿：`小手机/work/generic/ph_phone.js`。重跑变换：

```powershell
node 怪谈笔记/小手机通用化改造/小手机/work/tools/build_generic_phone.mjs
```

变量规则工作稿：`mvu-zod/work/generic/`。未做：怪谈 adapter 装回、Zod / 变量初始化跟 9 根对齐、正则条目改名、回封 1.0.9、真机挂载。
