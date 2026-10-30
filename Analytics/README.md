# Jot 最小使用统计

Cloudflare Workers + D1 接收官网 DMG 点击与每日活跃安装事件。0.2.3 构建默认接入 `https://jot-statistics.wasdtornado.workers.dev/events`；`JOT_ANALYTICS_URL` 可覆盖地址，显式设为空字符串可生成不发送统计的构建。

## 口径

- 下载：官网实际 DMG 链接的点击次数，包括鼠标中键和键盘激活。进入下载说明页不计数，不代表下载完成或独立用户。不会为网站访问者创建安装 ID；尊重 DNT / GPC。
- DAU：用户主动打开便签，或对打开的正文编辑，一台安装在北京时间一天内只算一次。点入已显示正文也视为用户使用便签。
- 自动登录启动、无启动来源的后台启动、更新检查、自动保存、滚动、光标移动、网页试写和 QA 实例都不计入 DAU。正常启动时通过系统 Open Application 事件识别主动打开；系统未提供明确来源时，等用户实际打开或编辑再计数。
- 应用开关位于 设置 → 隐私 → 匿名使用统计，默认开启，可随时关闭。旧设置解码兼容；关闭会取消当前任务并停止后续上报，不能撤回已经到达服务端的事件。
- 应用发送严格四字段：`installation_id`（本机随机 UUID）、`date`（北京时间日期）、`version`、`event`（active_install）。网站同样四字段，其中 installation_id 为 null，event 为 download_click。
- 应用标识存于应用偏好，跨版本复用。清除偏好会生成新标识；同一人多台 Mac 算多个安装。
- 不读取/发送正文、标题、搜索词、文件路径，也不采集硬件标识。HTTP 路由本身仍会向托管服务暴露来源 IP；代码不读取或保存 IP、UA、Referer，关闭 Worker observability，不写请求日志。不能将随机 ID 解释为不可关联的绝对匿名数据。

## 存储与查看

D1 `daily_active` 主键为 `(date, installation_id)`，服务端跨版本/重试去重；version 是当天首次成功记录的版本。`download_clicks` 只保存按日/版本累计次数。原始标识不通过报表返回。

`GET /stats?from=YYYY-MM-DD&to=YYYY-MM-DD` 仅接受 `Authorization: Bearer ...`，最多查询 90 天，未配置至少 32 字符密钥则拒绝查询。无记录日期不返回行，应理解为 0 或当天没有有效上报，不能证明无人使用。

```sh
# 设置环境变量后查询，不把查询密钥放进网页或应用。
node scripts/usage-report.mjs 2026-10-30 2026-10-30
```

查询使用 `JOT_ANALYTICS_URL=https://实际服务/events` 和 `JOT_STATS_TOKEN`。不要提交真实密钥、D1 数据文件或用户统计结果。

## 部署与后续发布

1. 登录自己的 Cloudflare 账号，启用 Workers / D1 免费计划。
2. 用官方 Wrangler 创建 `jot-statistics` D1 数据库，将 ID 填入 `wrangler.jsonc`。
3. 从 Analytics 目录执行 `wrangler d1 execute jot-statistics --remote --file=schema.sql`。
4. `wrangler secret put STATS_TOKEN` 设置随机生成的至少 32 字符查询密钥，再执行 `wrangler deploy`。
5. 验证公开接口的合法事件入库、无权限查询被拒绝、每日去重和官网跨域请求；国内实际网络需单独验证。
6. 将 `JOT_ANALYTICS_URL` 设为服务的 HTTPS `/events` 地址，分别运行 `node scripts/build.mjs` 与 `node scripts/build-site.mjs`。构建默认使用上述接收地址；显式设置空字符串可关闭构建中的统计。更换服务后需同步发布应用、官网和更新源。

配置只允许 HTTPS，不带查询串/用户名/密码。查询密钥仅在 Worker secret 和本机查询命令中使用。数据库 ID 不是密钥。

官方文档：
- https://developers.cloudflare.com/workers/platform/pricing/
- https://developers.cloudflare.com/d1/platform/pricing/
- https://developers.cloudflare.com/d1/get-started/
- https://developers.cloudflare.com/workers/configuration/secrets/

## 验证与限制

`node scripts/test.mjs` 会运行 Web、Swift、Worker+真实 SQLite 测试（脚本使用项目 Node 24）。D1 单测使用 SQLite 适配器，不等于 Cloudflare 实机验收。

失败不影响编辑/保存：应用请求最多等待 8 秒，只在后续真实操作发生且间隔至少 60 秒时重试，不启动后台定时器、不补报过去日期。官网请求使用 keepalive、不携带 Cookie 或 Referer、不阻断导航、不自动重试。因此离线、拦截器、关闭开关会造成漏计。

公开写入接口不是防作弊系统：来源白名单限制网页跨域，不是安装认证；伪造客户端仍可能刷数。免费额度和统计趋势需监控，正式开放时可在 Cloudflare 设置限流；不要在客户端放所谓永久秘密。当前未搭建复杂看板、账号体系或全量行为追踪。
