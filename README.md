# Jot · 随记

让念头落脚，让自己轻一点。一个轻量的 macOS 菜单栏便签应用：七页独立便签，支持待办与 Markdown 快捷书写，内容自动保存在本机。

[官方网站](https://wasdtornado.github.io/Jot/) · [下载与安装说明](https://wasdtornado.github.io/Jot/download.html) · [下载与版本记录](https://github.com/WasdTornado/Jot/releases)

## 当前版本

0.2.0 预览版，要求 macOS 14 或更新系统，支持 Apple 芯片和 Intel。DMG 中将 Jot.app 拖入 Applications 即可复制应用。

**当前预览版尚未完成 Apple Developer ID 签名和公证，macOS 可能阻止首次打开。它不是已公证的正式发行版。** 自动更新使用 Sparkle 2 和 Ed25519 签名校验；只有验证通过的更新包会进入更新源。从旧版 Jotlet 迁移，请先正常退出旧应用，然后手动安装 Jot。

## Jot 0.2.0

新增八种纸张主题、离线中文手写字体与右下角换肤面板。悬停即时预览，点击保存；置顶按钮移至右上角，深色模式的选中态更清晰。官网支持主题预览。

## 功能

- 菜单栏小窗，七页彩色便签；本机自动保存，无需账号。
- `[]` 加空格创建待办，`/` 选择格式。
- 标题、引用、列表、加粗、斜体、行内代码与代码块。
- ⌘A 选择完整文档，包括 Markdown 结构节点。
- 行内代码末尾双空格退出样式；⌘Enter 或 ⇧Enter 新建无格式正文。
- 查找、历史恢复、Markdown 导出与整套备份。
- 应用菜单和设置里的“检查更新”，自动检查可关闭；安装前保存便签。

## 本地开发

需要 macOS 14+、完整 Xcode、Node.js 24+ 和 npm。

```sh
npm ci --prefix Web
npm ci --prefix Assets/AppIcon
node scripts/test.mjs
node scripts/build.mjs
```

构建产物：`dist/Jot.app`。内部 bundle ID 和数据目录沿用 TotNotes，以保留既有用户数据。首次构建会下载并校验固定版本的 Sparkle 二进制框架。

```sh
JOTLET_UNIVERSAL=1 node scripts/build.mjs
node scripts/package-dmg.mjs --preview
node scripts/build-site.mjs
```

DMG：`dist/release-0.2.0/`；网站静态文件：`dist/site/`。预览打包不会读取发布私钥；维护者如需生成更新源，可追加 `--sign-updates`，并通过 `JOTLET_UPDATE_DOWNLOAD_URL` 指定安装包实际下载目录（末尾带 `/`）。仅发布已经验签且下载地址验证通过的更新源。

签名密钥保存在发布者本机钥匙串 `jotlet-updates`，不在仓库中。其他开发者需要使用自己的密钥和更新源，不能为官方应用签发更新。

正式发行需设置 `JOTLET_SIGN_IDENTITY` 为 Developer ID Application 证书名称，以及 `JOTLET_NOTARY_PROFILE` 为已配置的 notarytool 钥匙串凭据，然后不带 `--preview` 打包。没有这些配置时脚本拒绝生成声称已公证的发行包。

## 数据与隐私

内容默认保存在 `~/Library/Application Support/TotNotes/`。不提供云同步，不上传便签。更新检查会连接官网更新源和 GitHub 下载服务。测试请使用 `TOT_NOTES_DATA_DIR` 指向独立目录，不使用真实便签做故障注入。

官网使用 GitHub Pages。公开代码不包含个人便签、本地测试数据、私钥或内部验收截图。

## 第三方组件

使用 Tiptap/ProseMirror 与 Sparkle。应用构建会收集实际依赖许可证，保存在资源目录的 `ThirdPartyLicenses.txt` 和 `Sparkle-LICENSE.txt` 中。项目代码的公开可见性不构成额外的开源许可授权。

中文手写字体使用霞鹜文楷（SIL OFL 1.1）；字体来源与许可见 `Web/assets/fonts/README.md` 和 `OFL.txt`。官网子集保留相同许可证。
