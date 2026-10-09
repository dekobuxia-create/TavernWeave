---
name: sillytavern-dev-guide
description: Look up the distilled SillyTavern development guide set (STDB v1.1) when building or reviewing rolecards. Covers character-card format, worldbook, prompts and presets, render pipeline and macros, regex, MVU variable update rules, STScript and Quick Replies, Tavern Helper frontends (status bars, control centers, same-floor and standalone UI, opening pages, floating orb, drawer and popup status bars), database table templates, git mounting and resource loading, large-card performance, multi-model API differences, ST data directory and deployment, extension development, card security and XSS, mobile layout, group chat, message operations and checkpoints, audio and multimodal, Live2D, and workshop ecosystem. Use to find the right guide chapter by topic, then read only that chapter. Also holds a read-only case-study snapshot of the 怪谈笔记 1.0.9 generic-component workspace. Guides are distilled references, not proof of the installed runtime; verify version-sensitive API facts with sillytavern-api-reference.
---

# SillyTavern Dev Guide (STDB v1.1)

Pick the chapter that matches the task and read only that file from `references/guides/`. Do not load the whole set; chapters run to hundreds or thousands of lines.

## Chapter map

| Topic | Chapter |
|---|---|
| Harness / project setup checklist (rules file, memory, checks, rollback) | `A0_驾驭工程从零搭建检查单.md` |
| Character card format | `A2_角色卡格式规范.md` |
| Worldbook / lorebook | `A3_世界书优化.md` |
| Prompts and presets | `A4_提示词与预设.md` |
| Render pipeline and macros | `A5_渲染管线与宏.md` |
| Regex mechanics | `A6_正则机制.md` |
| MVU variable update rules, Zod schema | `B1_变量更新规则.md` |
| STScript, Quick Replies | `B2_STScript与QuickReplies.md` |
| Tavern Helper and iframe basics | `C1_前端基础-TavernHelper与iframe.md` |
| Status bar and control center | `C2_前端应用-状态栏与控制中心.md` |
| HTML and CSS styling | `C3_HTML美化与CSS.md` |
| Database table templates | `C4_数据库表格模板.md` |
| Same-floor frontend | `C5_同层前端.md` |
| Standalone frontend | `C6_独立前端.md` |
| Database-driven secondary frontend | `C7_数据库二创前端.md` |
| Database + same-floor (**experimental, unverified**) | `C8_数据库兼容同层前端-待验证.md` |
| Tavern UI styling | `C9_酒馆界面美化.md` |
| Opening page, custom opening | `C10_开局页与自定义开局.md` |
| Floating orb and feature entry | `C11_悬浮球与功能入口.md` |
| Drawer status bar (mobile) | `C12_抽屉式状态栏-移动端方案.md` |
| Popup status bar | `C13_浮窗式状态栏.md` |
| git mounting, resource loading | `D1_git挂载与资源加载.md` |
| Large-card performance | `D2_大卡性能优化.md` |
| Multi-model API differences | `D3_多模型API适配差异.md` |
| ST data directory, deployment | `D4_ST数据目录与部署运维.md` |
| Extension development | `D5_ST扩展开发完整指南.md` |
| Card security, XSS | `D6_角色卡安全与XSS防护.md` |
| Mobile and responsive | `D7_移动端与响应式适配.md` |
| Group chat, multi-character | `E1_ST群聊与多角色机制.md` |
| Message operations, branches, checkpoints | `E2_消息操作与分支检查点.md` |
| Audio, media, multimodal | `E3_音频媒体与多模态.md` |
| Expression sprites, Live2D | `E4_表情立绘与Live2D.md` |
| Workshop and extension ecosystem | `E5_创意工坊与扩展生态.md` |

## Rules

- Treat chapters as distilled evidence. Confidence tags such as `[本地实战]`, `[真机]` and `[运行时源码]` mark where a claim came from; version-sensitive facts (function signatures, event payloads, slash-command grammar) must be re-checked with `sillytavern-api-reference` and the installed runtime.
- C8 is experimental; never present it as a mature same-floor database route.
- Local-machine paths inside chapters (`C:/Users/...`, `OneDrive\ST-\...`) are provenance notes from the original author's machine. They do not exist in this environment; do not try to open them.
- Playbooks that need a live SillyTavern instance, browser driver or build toolchain cannot run in a cloud session; plan them and hand off to the user's machine.
- Not included on purpose: the archived command-era B1 and the "收集蓝图" planning document from the upload, because the bundled TavernWeave library already excludes archived and process records.
- This guide set overlaps `consult-tavernweave-library/references/st-guides/` (same chapters, same sanitized content). Prefer the library's router for write-capable TavernWeave tasks; use this skill for direct topic lookup.

## Case-study reference (read-only)

`references/kaidan-note-1.0.9/` is a snapshot of the 怪谈笔记 1.0.9 generic-component workspace: MVU/Zod suite and world-book variable entries, 10 regexes with HTML assets, phone (小手机) and floating-orb (悬浮球) scripts, avatar-bubble component, action-option CoT entries, and 星月 4.0.0 bubble/orb reference excerpts. Start from its `README.md` and `provenance.json`. Use it to study structure and mechanisms, not as a template to ship.

- Treat it as source-backed evidence only. It is not adopted work, not real-host acceptance, and not a licence for every use.
- `参考研究-SBS手机私信映射机制.md` is a mechanism study of a third-party product. Borrow the mechanism only; do not copy its code.
- Files named `星月*` are reference excerpts with their own provenance; do not repackage them as TavernWeave components.
- Build scripts (`*.mjs`) need Node and the original author's workspace layout; they are for reading, not for running here.
