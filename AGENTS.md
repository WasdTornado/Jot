# 随记开发约定

## 项目边界

- 用中文沟通；新增代码注释使用中文。
- 任何时候都不向远端仓库提交或推送代码，不创建远端 Issue、PR 或发布。任务单中的“发布”仅指写入本地文件。
- 未经用户明确要求，不创建本地 Git 提交；技能中的自动提交步骤不适用于本项目。
- 保留用户及前序任务的未提交改动，不重置、覆盖或清理工作区。
- 默认在当前对话顺序实现，不自行创建后台任务、定时迭代或并行 Agent。
- 保持 Tot 式菜单栏小窗、七页便签与轻量书写体验；现有范围是本机自动保存和 Markdown 导出。
- 正式便签不用于测试；不自动强退正在运行的应用，不以扩大系统权限解决测试目录问题。

## 开始工作

先读 [工作流](docs/agents/workflow.md) 和 [领域文档规则](docs/agents/domain.md)，再按任务读取现有规格和相关代码。检查当前分支及未提交改动，明确本次范围与验收方式。已在当前对话确认的要求不重复询问。

## Agent skills

### Issue tracker

任务、问题和后续规格使用本地 Markdown，位于 `.scratch/<feature>/`。详见 [任务跟踪](docs/agents/issue-tracker.md)。

### Triage labels

使用五个默认分诊标签，标签与实现进度分开记录。详见 [标签映射](docs/agents/triage-labels.md)。

### Domain docs

采用 single-context；保留现有产品、设计与验收文档，领域词汇和 ADR 按需补充。详见 [领域文档规则](docs/agents/domain.md)。
