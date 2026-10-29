# 任务跟踪：本地 Markdown

本项目没有远端，所有技能的 issue tracker 都是本地文件。禁止调用 `gh`、`glab` 或连接器创建远端任务、评论或 PR。

## 文件约定

- 每个功能或问题组一个目录：`.scratch/<feature-slug>/`。
- 新规格：`.scratch/<feature-slug>/spec.md`。
- 每个实施任务一个文件：`.scratch/<feature-slug>/issues/<NN>-<slug>.md`，从 01 编号，不把多项任务合成一个 tickets 文件。
- 旧规格、计划和验收记录保留原位，用相对链接引用，不复制出另一份相互冲突的版本。
- “publish to the issue tracker”表示创建或更新上述本地文件；“fetch the relevant ticket”表示读取指定路径。
- 评论、补充信息和决策追加到任务末尾的 `## Comments`。
- `.scratch/` 不加入忽略列表，作为可审查的项目文档；测试数据和运行产物不放这里。
- 明确的小修复可直接完成并记录证据；需要跨轮推进、分诊或拆分的工作再建任务，不为每次小改动制造流程负担。

## 实施任务格式

```markdown
# 01 任务标题

Type: task
Status: needs-triage
Progress: todo
Blocked by: none

## 问题与目标
描述用户可观察到的问题；缺陷附复现步骤。

## 范围
说明本任务边界，链接已确认规格。

## 验收条件
列出可验证的行为和对应验证层级。

## 验证证据
记录实际命令、结果、原生验收和未验证事项。

## Comments
追加沟通和决策。
```

`Status:` 使用 [分诊标签](triage-labels.md)；`Progress:` 使用 `todo`、`in-progress`、`blocked`、`done`。分诊就绪不等于实现完成。只有验收条件满足、证据已记录，才设为 done；受阻时写明原因和所需输入。

## x-wayfinder 探索任务

保留技能的独立状态协议，避免与实施任务混用：

- 地图：`.scratch/<effort>/map.md`，包含 Notes、Decisions-so-far、Fog。
- 子任务：`.scratch/<effort>/issues/NN-<slug>.md`；`Type:` 为 research、prototype、grilling 或 task。
- 探索状态：`Status: open / claimed / resolved`；仅用于明确由 x-wayfinder 创建的地图子任务。
- `Blocked by: NN, NN` 中的依赖全部 resolved 后才能开始。
- frontier 按编号选择尚未解决、未被领取且无阻塞的任务；开始前先写 claimed。
- 完成时追加 `## Answer`，设 resolved，并将摘要和链接写回地图 Decisions-so-far。
