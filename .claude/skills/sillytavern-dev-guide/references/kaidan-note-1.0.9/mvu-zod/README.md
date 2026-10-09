# MVU Zod 套件（含世界书变量条目）

1.0.9 变量链路快照在 `sources/`。通用化工作稿在 `work/generic/`，15 根已收成 9 根；契约文件是 `generic_mvu_schema.js`，不要和源卡的 `zod_schema.js` 混用。

## 文件

| 文件 | 角色 |
|---|---|
| `sources/1.0.9/zod_schema.js` | Zod Schema（15 根） |
| `sources/1.0.9/mvu_zod_global.js` | 国外 CDN，失败切 testingcf |
| `sources/1.0.9/mvu_zod_cn.js` | 国内 testingcf，默认禁用 |
| `sources/1.0.9/InitialVariables.json` | 变量初始化正文 |
| `sources/1.0.9/mvu_update_full.txt` | 变量更新规则正文 |
| `sources/1.0.9/mvu_update_output_format.txt` | 变量输出格式正文 |
| `sources/1.0.9/worldbook/*.entry.json` | 上述三条在世界书里的完整条目（含 id / order / enabled） |
| `sources/1.0.9/worldbook.meta.json` | 三条条目元数据（不含正文） |
| `sources/1.0.9/scripts.meta.json` | 三条助手脚本元数据（不含正文） |

世界书只收这三条变量条目，不含 00–21 设定书。
