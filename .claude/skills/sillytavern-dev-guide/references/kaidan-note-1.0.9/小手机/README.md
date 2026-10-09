# 通用版小手机

后续通用化改造落在本目录。`sources/` 是 1.0.9 只读快照，新文件和改写放 `work/`。

## 已收纳的两版

| 目录 | 来源 | build | 图标策略 | SHA-256 前缀 |
|---|---|---|---|---|
| `sources/1.0.9-拉取图标库/` | 1.0.9 卡包 `kaidan-note-bridge` | `1.0.9` | 运行时拉图标库 | `89735fbab43fffbd` |
| `sources/1.0.9-内置图标/` | 工作区 `kdn_phone.js` = r2 | `1.0.9-r2` | 内嵌 Tabler 51 枚子集 + 子宫图标校准 | `2f8c4342d75435c0` |

两版都是自包含 HUD，不再依赖卡的 `hud_html`。脚本 id 仍是 `kaidan-note-bridge`，酒馆面板名是「小手机/平板」。元数据见各目录 `script.meta.json`。

## 工作区

`work/` 现在是空的。通用化时在这里新建文件，不要改 `sources/`。
