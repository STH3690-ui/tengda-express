# V57 续接检查与隔离验收（2026-11-13 UTC）

## 已核实状态

- 仓库 `STH3690-ui/tengda-express`，main HEAD 为 `56f8b9411b42523df179fcb4350260cb023e379e`；PR #40 已于 13:55:18 UTC 合并。
- 合并提交 GitHub Actions 的 cleanup-security-test、existing-suite、navigation-browser、scan-database 四项检查全部 success。
- 正式站点 https://tengda-express-station.netlify.app 可读取，`scan.js`、`scan-core.js`、`scan.css` 与 main 文件 SHA-256 分别相同。此证据确认扫码资源已上线；本会话无 Netlify 管理连接，未核验后台 deployment ID、发布队列或环境变量。
- 未修改扫码实现、原版 V57 SQL、APK、正式站点配置，未触发重新部署。

## 数据库兼容性与实际操作

- 正式项目 `yvsgawbbnyeyvynwghsc`（Teng Da Express）及测试项目 `amknufvdvqfhrgtobpwg`（tengda-v32-test）均为 PostgreSQL 17.11；已只读核对 V32/V50/V56 函数签名、V57 所用字段、私有 schema USAGE 和删除标记结构。
- 初始两库均无 V57。测试库额外缺少 `td_parcel_hidden_v51`、`td_pickup_hidden_v53`；正式库有这两表。V57 的前置检查会拒绝该不完整测试库。
- 仅测试项目执行 `v57_test_only_legacy_marker_prerequisites`，按正式库目录元数据补齐两张空表、主键/级联外键、非空字段、默认值、RLS、既有读取策略和权限；没有复制正式业务数据。该补齐只覆盖 V57 所需旧标记结构，不声称完整重放全部 V51/V53 历史功能。
- 随后仅测试项目安装现有 `20261113131906_smart_scan_pos_v57.sql`，外加事务内 lock_timeout=5s、statement_timeout=30s；原文件内容未修改。安装成功。
- V57 属于单次迁移，含非 IF NOT EXISTS 的建表/函数/触发器语句，不可盲目重复安装。新增规范化运单防重触发器也影响原入库，创建索引及触发器会持有表锁；历史重复不清理。
- 正式项目所有查询均显式 `BEGIN READ ONLY`，最后确认 V57 capabilities 函数和审计表仍不存在。未在正式项目执行任何迁移或业务写入。

## 本会话验证结果

| 范围 | 结果与边界 |
| --- | --- |
| Node / 语法 / 静态构建 | 107/107 通过；npm run check 和静态构建通过 |
| 一次性 PostgreSQL 17.11 | 现有 V32/V50/V54/V55/V56/V57 加载通过；防重、双连接并发入库/结算、幂等、账务、审计故障后整笔回滚、删除保护、RLS/电话屏蔽通过 |
| Chromium | 真实解码 Code128/Code39/EAN13/EAN8/QR 图片；连续扫码/HID/重复/客户选择/混客户/部分入库失败/确认/响应丢失/离线/缺迁移保护、30 组布局通过，页面错误 0。媒体和业务传输使用模拟 |
| 托管测试数据库 | tests/v57-hosted-acceptance.sql 通过：明确客户匹配、未匹配、两单入库及逐条失败、规范化重复、同客户两单连续结算、错客户拒绝、重复清单拒绝、未确认拒绝、幂等和已取件拒绝 |
| 托管运费与欠款 | 2 kg × 7,000 = 14,000 MMK；实收 5,000；欠款 9,000；通过现有 td_pickup_balances_authorized_v50() 验证 |
| 托管权限 | 使用真实 Supabase auth.uid() 实现、事务内测试 JWT claims 和 authenticated 角色；电话屏蔽、仅本人日志、无权限写入拒绝、审计伪造拒绝通过。未进行真实 Auth 登录/浏览器连接测试项目的完整 E2E |
| 本机 WebKit | 已下载浏览器，启动被系统缺失 libgtk-4、graphene、harfbuzz-icu、manette、hyphen、GLESv2 阻断；当前环境无 cloud-agent-packages。不能报告本机 WebKit 通过；合并提交已有 GitHub WebKit 检查成功记录 |

托管验收初次脚本错误地直读被 V50 禁止的旧余额视图，事务失败并回滚；已改为现有授权 RPC 后通过。测试未放宽任何权限。

测试数据始终在事务中，结束 ROLLBACK。复查测试用户/客户/包裹均 0 条残留，V57 审计及幂等请求表均 0 条；仅测试库 schema/migration 安装保留。

超时：Node 90s、一次性数据库 120s、Chromium/WebKit 每次 150s、HTTP 20s；托管验收 statement_timeout=20s、lock_timeout=3s、idle_in_transaction_session_timeout=30s；只读目录查询 statement_timeout=10s。没有无限重试。

## 安全检查与待办

Supabase advisors 前后对比新增 6 个 authenticated 可执行 SECURITY DEFINER 提示，对应 V57 的受控公开 RPC；均固定空 search_path，anon 不可执行，内部校验激活员工及操作权限，已做负面权限测试。私有请求表 RLS 无策略为拒绝客户端直接访问的设计。仍需上线审查人员明确接受受控 definer API 的权限边界。

- [SECURITY DEFINER 提示说明](https://supabase.com/docs/guides/database/database-linter?lint=0029_authenticated_security_definer_function_executable)
- [无 RLS 策略提示说明](https://supabase.com/docs/guides/database/database-linter?lint=0008_rls_enabled_no_policy)

既有 Auth 泄漏密码保护未开启提示仍存在，本任务未改 Auth 设置。已查看 Supabase changelog 和当前 RLS/数据库测试文档；测试实际运行于与正式库同版本 PostgreSQL。

下一步：用独立测试项目的真实员工登录和实际手机/扫码枪/快递单验收摄像头、拍照上传、网络恢复和 Auth/Data API 全链路；确认备份、低峰窗口和迁移锁等待策略。正式迁移必须获得用户明确批准后才能执行；当前尚未请求或取得该批准。

## 续轮验收与 PR 交付

本轮复查 `tengda-v32-test` 为 ACTIVE_HEALTHY，与正式项目使用不同 project ref、数据库主机及区域。测试库迁移历史已包含 `20261113142321 v57_test_only_legacy_marker_prerequisites` 与 `20261113142339 smart_scan_pos_v57`，因此本轮没有重复执行 V57。正式库末次只读核查仍无 V57 函数与审计表。

权限复核：两张 V57 表 RLS 均开启，六个公开 RPC 的 anon EXECUTE 均为 false、authenticated EXECUTE 均为 true；实际业务权限仍由函数内员工状态及 V50 权限校验。

重跑前已保存 16 张相关业务表的数据和 V57 列/函数/策略元数据快照，位于仓库外受限目录 `/workspace/private-v57-backups/test-pre-acceptance.json`（目录 0700、文件 0600），SHA-256 为 `a6f824031d771e8784223a6a6f7d6cb0f988167d065c6f52951fe609ec6f6979`。这是本轮验收前的范围逻辑备份，不包含 Auth 凭据、Storage 对象或完整数据库，未验证灾难恢复；也不声称它是上一轮安装 V57 前的备份。备份数据不提交 Git。

托管验收再次通过客户匹配、逐条入库、规范化防重、同客户两单取件、确认与权限、幂等、运费及欠款。新增故障用例在真实 V32/V57 结算写入完成后，主动抛出异常，由 PL/pgSQL 子事务回滚；库存、流水、批次、明细、收款凭证、审计行数以及幂等结果均恢复。该用例验证托管数据库事务回滚，局部注入边界是调用方子事务；V57 内部审计触发器故障回滚由已有本地 PostgreSQL 测试覆盖，不将两者混同。

验收全程使用新建测试夹具，最终外层 ROLLBACK。验收后对 16 张表做忽略行序的完整 JSON 内容比较，全部与验收前快照一致；原有客户/包裹/取件批次分别维持 5/5/5 条，流水和收款凭证各 7 条，V57 审计与请求记录均为 0。新建 Auth 用户同样处于外层事务，随事务回滚。本轮本地 107 项测试复核通过。

三个交付文件：本报告、[托管事务验收 SQL](../tests/v57-hosted-acceptance.sql)、[人工实机验收清单](V57_DEVICE_ACCEPTANCE_CHECKLIST.md)。仅提交到 `test/v57-isolated-acceptance` 分支发起 PR，不直接写 main。GitHub CI 的最终状态以该 PR 对应提交的 checks 为准；现有 CI 运行 Node、一次性 PostgreSQL、Chromium/WebKit 回归，不自动连接托管数据库。

仍待人工完成真实测试站点配置、测试员工登录、iPhone PWA、Android TWA、实体扫码枪、真实标签及存储上传全链路验收。当前工作仅提交验收材料，未重新开发扫码功能；正式迁移仍须用户明确批准。
