# 通用变量套件 0.1.0-work

对照源：`mvu-zod/sources/1.0.9/`。  
只改 `work/`，不改 `sources/`，不回封卡。

重跑：

```powershell
node 怪谈笔记/通用化改造/mvu-zod/work/tools/build_generic_mvu.mjs
```

## 9 根（规则 / 契约 / 初始化已对齐）

`环境`、`user`、`世界演化`、`舆论新闻`、`角色档案`、`资产库`、`居所`、`载具`、`雷达系统`。

| 文件 | 作用 |
|---|---|
| `generic_mvu_schema.js` | 运行时变量契约，全局名 `__phMvuSchema` |
| `InitialVariables.json` | 开局空档，`角色档案` 为空 |
| `mvu_update_full.txt` | 变量更新规则 |
| `mvu_update_output_format.txt` | 输出格式 |
| `worldbook/*.entry.json` | 上列文件打成的世界书条目 |

不要把本文件叫 `zod_schema.js`，避免和原卡 15 根契约撞名。

## 这一轮清掉的叶子

- `舆论新闻.民间怪谈名` → `民间传闻名`
- 社会认知档 `无痕 / 窃议 / 发酵 / 半公开` → `日常 / 私下议论 / 公开讨论 / 广为人知`，开局默认 `日常`
- 角色档案无授予者扩展；子宫填充度仍按女性字段写

## 没验

真机 SillyTavern 未挂。离线只验了根集合、禁词和世界书条目写出。
