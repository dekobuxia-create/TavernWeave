# 头像气泡（通用组件）

对话气泡渲染器 + 四套可切换皮肤 + 「头像气泡管理」面板。改造自星月 4.0.0（渲染器=media_library.js 的 renderDialog 系；管理器=control-center.js 的 3.4.9 气泡头像管理器），前缀统一 `ph`，已知坑全部保留（ST `custom-` 前缀兼容、textarea 首渲缓存、无常驻 MutationObserver）。

## 装进一张卡需要什么

| 件 | 放哪 | 说明 |
|---|---|---|
| `头像气泡.js` | 酒馆助手脚本（`ph-avatar-bubble`） | 渲染器+皮肤+管理面板，自包含 |
| `regex/01_正文对话气泡.json` | 卡内 `regex_scripts` | `<ph-dialog speaker avatar>` → 占位 span |
| `regex/02_对话气泡COT.json` | 卡内 `regex_scripts` | `<ph-cot-dialog>` → 占位 span |
| `worldbook/[cot]对话气泡.entry.json` | 世界书（constant） | 教模型输出 `<ph-cot-dialog>` 标签 |
| 媒体库脚本 | 酒馆助手脚本 | 头像存取依赖它（`__phMedia` 桥）；不装则头像全为占位剪影，其余功能正常 |

## 皮肤

内置四套（气泡校准台拨定）：`p5` PERSONA（默认）/ `glass` 霜镜 / `gilt` 鎏金档案 / `manga` 墨线分镜。玩家在管理面板切换（localStorage 本地偏好）；制卡者改脚本内 `DEFAULT_SKIN` 常量定默认。皮肤只是整套 CSS 替换，切换即时生效不重渲染。

## 管理面板

悬浮球轮盘「气泡头像」键呼出，或任何脚本调 `__phBubble.openManager()`。功能：气泡皮肤切换；按说话者名绑定/更换/清除头像（存共享媒体仓，`{{user}}` 是玩家自己的气泡头像）。

## 桥 API（`__phBubble`，挂 helper+宿主 window）

`openManager()` / `render({force})` / `setSkin(id)` / `getSkin()` / `listSkins()`

## 空头像

无媒体命中时显示中性灰阶剪影（2026-08-27 拍板，弃星月抽象占位图）。
