# 行动选项世界书

1.0.9 四条 CoT 入库。规则正文未改；示例已全部换成中性都市句。重抽会覆盖，不要用 `extract_action_options.mjs` 冲掉这四条。

和 `正则/sources/1.0.9/06_行动选项渲染.json` 配对：世界书写出 `<选择>`，正则渲成按钮。四条同 `insertion_order: 60`，同时只开一档。

| 文件 | 条目 | 默认 |
|---|---|---|
| `sources/1.0.9/worldbook/17_cot_行动选项_一档.entry.json` | `[cot]行动选项·一档(4项·默认开启)` | 开 |
| `sources/1.0.9/worldbook/19_cot_行动选项_二档.entry.json` | `[cot]行动选项·二档(6项·默认关闭)` | 关 |
| `sources/1.0.9/worldbook/20_cot_行动选项_三档.entry.json` | `[cot]行动选项·三档(8项·默认关闭)` | 关 |
| `sources/1.0.9/worldbook/21_cot_行动选项_四档.entry.json` | `[cot]行动选项·四档(10项·默认关闭)` | 关 |

源：`怪谈笔记/components/worldbook_entries/build/`，`content` 与 1.0.9 卡包一致。  
重抽：`node 怪谈笔记/小手机通用化改造/tools/extract_action_options.mjs`
