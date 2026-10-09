# 星月气泡与 CoT · 参考素材（摘自星月 4.0.0）

从星月最新发布版 **4.0.0**（`星月/星月 4.0.0/星月私立高等学院 MVU 4.0.0.json`）摘出的「头像对话气泡」全链路素材，供小手机通用化改造参考。**只读快照，不要在此改造**；逐文件来源与 SHA-256 见本目录 `provenance.json`（独立记账，不混入顶层 1.0.9 入库的 provenance）。

## 链路总览（四层）

模型输出标签 → 正则转占位 → JS 渲染 → CSS 样式。**正则只做「标签→占位 span」，真渲染全在 JS**——只搬正则不带渲染器，屏幕上只会剩空 span。

1. **世界书条目 `[cot]对话气泡`**（`worldbook/69_cot_对话气泡.entry.json`）：constant 常驻、`before_char`、order -9、depth 1。教模型把说出口的台词包进 `<xy-cot-dialog>` 成对标签，每行「说话者：台词」全角冒号，玩家写 `{{user}}`，台词纯文本。
2. **两条美化正则**（`regex/`，卡内真身原样）：
   - `02_对话气泡COT`：`<xy-cot-dialog>…</xy-cot-dialog>` → 占位 span，台词原文存进 hidden textarea；
   - `01_正文对话气泡`：`<xy-dialog speaker="…" avatar="…">…</xy-dialog>` → 占位 span，speaker/avatar 进 data 属性。
   - 共同参数：placement `[2]`（作用于 AI 输出）、`markdownOnly: true`（仅显示层、不改提示词）、`runOnEdit: false`、minDepth 0 / maxDepth null（全楼层生效）。
3. **渲染器 `renderer/media_library.js`**：`renderDialogBubbles()` 扫两类占位 span，交给 `renderDialogNode` / `renderCotDialogNode` 画成真气泡（函数集中在文件后段，一组为 `renderCotDialogNode → renderDialogNode → renderDialogBubbles → scheduleDialogRender → ensureDialogBubbleBinding`）。
4. **样式 `renderer/bubble.css`**：远程挂载真身（runtime/xingyue/4.0.0），作热修覆盖层；media_library 内置同款 `XY_BUBBLE_BASELINE` 兜底，离线/拉取失败也有样式。

## 通用化要点（星月侧实测过的设计与坑）

- **头像来源**：渲染时经 `resolveDialogMedia(avatar 属性, 说话者名, doc)` 从星月媒体库按名字解析，无命中用内置占位图（`DIALOG_PLACEHOLDER`）。通用化时这一层要换成自己的头像源。
- **4.0.0 主用链路是 CoT 气泡**：全卡扫描确认——除 69 号条目教 `<xy-cot-dialog>` 外，**没有任何指令教模型输出正文 `<xy-dialog>` 标签**；正文气泡正则是渲染兜底通道。要模型用哪种标签，指令写进世界书（照 69 条目的「用途/格式/边界/语气」四段写法）。
- **切段成多气泡**：正文气泡内容按 `<q>` 切段（`splitDialogSegments`），多段拆多气泡，段间文字作旁白（`.xy-dialog-narration`）不进气泡框。
- **ST custom- 前缀坑已兼容**：ST 会给消息 HTML 的 class 加 `custom-` 前缀，渲染器选择器同时匹配 `.xy-dialog-render` / `.custom-xy-dialog-render` / `[data-xy-dialog-render]` 三态；自己实现时选择器优先用 data 属性（不会被改名）。
- **重渲染时机**：刻意**不用**常驻 MutationObserver（2.9.8 版曾因全文档 subtree observer 在流式输出期卡顿回归），改「定时兜底（120ms~8s 八档）+ ST 事件驱动（CHAT_CHANGED / USER_MESSAGE_RENDERED / CHARACTER_MESSAGE_RENDERED / MESSAGE_UPDATED / MESSAGE_SWIPED）」。
- **源 textarea 首渲被吃坑**：占位内的 textarea 首次渲染后被 innerHTML 重建吃掉，台词需缓存到 `data-xy-dialog-content-cache` 属性，force 重渲（如换头像后刷新）才有内容可用。
- `media_library.js` 是星月全家桶（媒体库 + OMNI 状态栏渲染 + 气泡 + 远程皮肤拉取），共 179KB；只需要气泡时从上述一组函数下手摘。

## 文件清单

| 文件 | 内容 | 来源 |
|---|---|---|
| `regex/01_正文对话气泡.json` | `[美化]正文对话气泡 v4.0.0` 完整正则（卡内真身原样） | 卡 `extensions.regex_scripts`，id `xingyue-dialog-bubble-v4.0.0` |
| `regex/02_对话气泡COT.json` | `[美化]对话气泡 COT v4.0.0` 完整正则（同上） | 卡 `extensions.regex_scripts`，id `xingyue-dialog-cot-bubble-v4.0.0` |
| `worldbook/69_cot_对话气泡.entry.json` | CoT 输出格式指令条目（含全部注入参数） | 卡 `character_book.entries` id=69 |
| `renderer/media_library.js` | 渲染器完整快照 | `星月/星月 4.0.0/components/media_library.js` |
| `renderer/bubble.css` | 气泡样式远程挂载真身 | `rolecard-diy-workshop/runtime/xingyue/4.0.0/bubble.css` |

星月侧另有三个构建源件（形态不同、内容与上面同源，故不重复入库）：`星月/星月 4.0.0/components/` 下的 `dialog_bubble_regex.html`（正文气泡 replace 模板）、`dialog_cot_bubble_regex.html`（COT 气泡 replace 模板）、`cot_dialog_bubble.txt`（69 号条目正文的源件）。
