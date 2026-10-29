# 分诊标签

| 技能角色 | 本项目标签 | 含义 |
| --- | --- | --- |
| needs-triage | needs-triage | 需要评估范围、价值和复现信息 |
| needs-info | needs-info | 缺少报告者提供的必要信息 |
| ready-for-agent | ready-for-agent | 已明确范围和验收条件，可由 Agent 实现 |
| ready-for-human | ready-for-human | 必须由人执行或决策 |
| wontfix | wontfix | 明确不处理，并记录原因 |

标签写在本地实施任务的 `Status:` 行，不创建远端标签。实现进度另用 `Progress:`，详见 [任务跟踪](issue-tracker.md)。

ready-for-agent 不表示授权后台运行、并行开发、提交或推送。已经获得的任务授权不重复申请；确有缺失信息时再提出具体问题。
