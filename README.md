# Jot（随记）

按用户选定设计稿实现的 macOS 菜单栏便签。默认 480 × 468 pt 内容区（可拖动边缘调整并记忆）、七色分页、系统毛玻璃、浅深色、置顶、字号、本机自动保存与 Markdown 导出。运行保持菜单栏常驻，不显示 Dock 图标。

项目目录：`/Users/mac/Desktop/StudySpace/Jot`。开发产物位于 `dist/Build.noindex/Jot.app`，日常运行使用应用程序目录中的安装版。

## 直接使用

本机已安装的应用：`~/Applications/Jot.app`，双击打开即可。运行应用不需要 Node.js 或开发服务器。

- 行首输入 `[]` 或 `[ ]`，再按空格，创建待办并在同一行继续写。
- Enter 续写下一条待办，空待办再次 Enter 退出列表。
- Tab / Shift+Tab 缩进或反缩进；Command+Shift+Enter 切换当前任务完成状态。
- Command+Enter 或 Shift+Enter 在当前格式块后新建普通正文，退出引用、列表、标题或代码块，并清除新段落的文字样式；原内容和选区文字保留。
- 段落开头输入 `/` 选择格式，支持中英文关键词、↑↓、Enter、Esc；路径正文与代码块不触发。
- 支持 Markdown 标题、加粗、斜体、引用、代码、普通列表。右下角 Aa 可选择格式并查看快捷键，选区的当前格式会高亮。
- Command+Z / Command+Shift+Z 撤销、重做；Command+S 立即保存；Command+Shift+E 或便签操作中的“导出当前页”打开原生保存面板，默认以首行命名。
- 点击菜单栏便签图标，或 Control+Option+空格，呼出/收起；可在设置中录制新组合键，按 Esc 取消，冲突时保留原快捷键。Esc、Command+W 收起；Command+Q 保存后退出。
- Command+1–7 或 Command+Option+左右切页。旧页保存失败时不会切走；每页有独立撤销历史、光标和滚动位置。
- 七色圆点填充表示该页有内容，下划线表示当前页；悬停可查看首行摘要。便签操作 → 备份与恢复 →“导出七页 Markdown”会创建独立文件夹，按圆点顺序导出七个文件（包括空白页）。
- 便签操作或菜单栏右键的“新建无格式正文”与上述快捷键行为一致；旧 Command+Shift+N 已移除。普通全局呼出键不含 Shift 且附加组合可注册时，再按 Shift 可呼出并新建无格式正文。
- Command+F 查找当前页或全部七页，点击结果跳到匹配文字；也能找到已折叠的完成项。
- 便签操作支持隐藏和移除已完成待办，保留仍有未完成子任务的分支。移除前强制备份，一次撤销可恢复。
- 便签操作 → 重命名当前页，最多 20 字；留空恢复默认名。页名用于悬停提示、搜索和原生菜单。
- 失焦时保存后收起；置顶后继续可见。设置支持自动/浅色/深色、减少透明效果；字号为小／标准／大（13/14/16 pt）。开机启动默认关闭，手动启用后按系统状态显示结果；待系统批准时会提示登录项设置位置。
- 右下角调色板按钮向上展开主题卡片：默认、方格手账、奶油贴纸、荧光清单、薄荷花园、樱花信笺、复古稿纸、海盐蓝调。悬停或键盘聚焦会在当前页临时预览，移出面板或按 Esc 恢复，点击或 Enter 才选定。选定后应用于全部七页；小窗口只滚动主题列表。
- 顶部空白处可以拖动；向下拉开会自动进入自由移动模式并置顶，轻拉后松手会回弹。左上角模式按钮也可切换，返回菜单栏时播放吸入与展开动效；关闭按钮独立保留。尊重系统“减少动态效果”。
- 置顶按钮位于右上角。深色模式下，置顶、皮肤、字号、深浅模式和格式的选中项使用更明显的底色与描边；皮肤另有勾号标记。
- 便签操作（···）→ 设置仍可调整字体、装饰、字号与深浅模式。正文字体支持跟随皮肤、系统字体、手写文楷和宋体；文楷随应用离线提供。恢复默认皮肤不会改变正文、字号或深浅色偏好。

若保存失败，内容继续保留在窗口中。恢复写盘条件后点击“重试保存”；也可以先导出 Markdown。底栏“详情”可查看完整错误和对应处理入口。不要通过强制退出处理保存错误。

## 数据与恢复

正式数据位于 `~/Library/Application Support/TotNotes/page-1.json` 至 `page-7.json`，Tiptap JSON 是唯一主数据，Markdown 为导出格式。原有 `page-1.json` 保持不变，对应第三个莓红“日常”页；新增页初始为空。设置保存在应用自己的本机偏好中。

- 停顿 300ms 发起保存，持续输入最多等待 1 秒；显示“已保存到本机”才表示原生原子写入成功。
- 组合输入期间等待选词提交；正常关闭、隐藏和退出前刷新已提交内容。
- `backups/page-1/` 等页面目录分别保存最近 10 份历史快照，普通编辑最多每 60 秒新增一份。
- 便签操作 → 历史版本：查看 Markdown 预览后恢复；恢复前先保存并强制备份当前内容，恢复结果作为新版本写入。可再次进入历史恢复此前的内容。
- 主文件损坏时保留 `corrupt-*.json`，尝试恢复最近的有效备份；没有有效备份时停止加载，不覆盖成空白页。
- 不支持的未来格式会拒绝加载，原文件保持不变。
- 便签操作 → 备份与恢复，可导出七页正文、格式、页名的 JSON 完整备份（不包含应用偏好及历史版本）。Markdown 文件用于阅读与分享，不能作为完整备份导入。
- 从完整备份恢复时先预览七页摘要，确认后才替换；原生检查与编辑器检查都通过后，在同一磁盘原子交换准备好的整套目录。恢复前整套内容保存在 `workspace-backups/`；“找回上次恢复前的内容”可再预览找回。页名同时保存在 `page-names.json`，确保重启后与正文一致。
- 强制结束进程或断电只保证已确认落盘的版本。

验收数据独立保存在 `~/Library/Application Support/TotNotesQA/<验收名称>/notes/`，不与正式便签混用。旧验收记录仍保留在项目的 `.local-qa/`（Git 忽略）。

## 本地开发

开发前阅读 [AGENTS.md](AGENTS.md) 和 [mattpocock 开发工作流](docs/agents/workflow.md)。任务跟踪使用本地 Markdown，已有规格与验收记录保留原位；配置位于 `docs/agents/`，可直接编辑。

需要完整 Xcode（含 macOS SDK、XCTest）、macOS 14+，开发依赖安装与测试使用 Node 24.15+。本机可直接使用现有的 Node 24.19.0，无需切换全局工具链。

```sh
# 首次安装编辑器依赖：在 Web 目录运行 npm ci。
# 本机的 npm 受 Volta 管理，应显式使用 Node 24 运行 npm CLI。
/Users/mac/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin/node \
  /Users/mac/.volta/tools/image/node/18.12.0/lib/node_modules/npm/bin/npm-cli.js \
  ci --prefix Web --registry=https://registry.npmjs.org

npm ci --prefix Assets/AppIcon
node scripts/test.mjs
node scripts/launch.mjs
```

构建脚本显式选择 Xcode，不修改系统的 `xcode-select`。如 Xcode 在其他位置，可设置 `DEVELOPER_DIR`。测试 Node 可通过 `TOT_NOTES_NODE` 指定。

`launch.mjs` 会构建并复制到 `~/Applications/Jot.app` 后启动；更新前需从应用菜单正常退出。工程可以继续放在桌面，但不要直接从桌面的 `dist` 启动，避免网页资源读取触发 macOS 桌面文件夹授权。只生成构建产物时仍可运行 `node scripts/build.mjs`。

隔离启动示例（同样先正常退出）：

```sh
node scripts/launch.mjs --qa manual
```

所有代码和提交仅保留在本地，仓库不配置远端。构建产物使用本机临时签名，当前不是发布安装包。已支持快捷键自定义和窗口尺寸记忆；当前仍仅本机保存，不包含云同步。

## 文档与开源组件

- [设计规格](docs/superpowers/specs/2026-10-19-tot-style-notes-design.md)
- [实施计划](docs/superpowers/plans/2026-10-19-core-notes.md)
- [核心验收记录](docs/verification/core.md)
- [设计稿实施与验收](docs/verification/ui-implementation.md)
- [退出、连续切页缺陷修复与验收](docs/verification/2026-10-26-bugfixes.md)
- [菜单栏窗口定位修复与验收](docs/verification/2026-10-26-window-anchor.md)
- [字号对齐与编辑交互迭代](docs/verification/2026-10-26-editor-polish.md)
- [焦点恢复与设置保存失败处理](docs/verification/2026-10-26-focus-preferences.md)
- [日常使用体验补齐与验收](docs/verification/2026-10-26-product-completion.md)
- [快速记录、搜索与整套恢复验收](docs/verification/2026-10-26-daily-flow.md)
- [列表加粗残影与桌面权限弹窗](docs/verification/2026-10-26-list-selection.md)
- 编辑器复用 [Tiptap](https://github.com/ueberdosis/tiptap) 的 MIT 开源核心；窗口与桥接为本项目实现。研究中参考了 FreeCastNotes、Peekie 的结构，未以反编译 Tot 工程作为基础。

Tiptap 及其依赖的许可位于 `Web/node_modules/` 对应包内；本地构建时随应用复制第三方许可说明。

英文产品名为 **Jot**，意为“随手记下”。macOS 显示名称已更新；应用包改为 `Jot.app`，内部 bundle ID 和原有数据目录继续保留，以兼容现有便签与系统登记。


编辑区启动失败会自动重建一次；持续失败可直接点击原生“重新加载编辑区”，无需退出应用。正常编辑中的内容不会被静默重载。内容进程退出后，已保存内容仍在本机，尚未送达保存的输入可能需要补录。

正式品牌图标采用 **A「轻叠」**：柔和彩色叠卡与单色菜单栏轮廓。应用与官网共用 `Assets/AppIcon/Jot.svg` 原稿；资源生成方式见 [图标资源说明](Assets/AppIcon/README.md)。

### 使用统计

0.2.3 起支持匿名使用统计，可在「设置 → 隐私」关闭。只发送随机安装标识、北京时间日期、版本和事件类型，不发送正文、标题、搜索内容或文件路径；后台启动和检查更新不计活跃。官网仅汇总 DMG 按钮点击，尊重 DNT / GPC，不创建访客标识。网络失败不影响书写和保存，统计可能漏计。详见 [统计说明](Analytics/README.md)。
