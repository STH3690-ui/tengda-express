# V3.2 员工录入明细删除修复

## 根因与调用链

正式库只读检查确认：`tdAuditBulkDelete()` 原先逐条调用 `td_hide_audit_v52`，该函数包含：

```sql
insert into public.td_audit_hidden_v52(source_table,source_id,reason,hidden_by)
values(p_source_table,p_source_id,trim(p_reason)) on conflict do nothing;
```

四列只有三个值，缺少 `auth.uid()`，触发 `INSERT has more target columns than expressions`。这是函数本身的 SQL 错误；`td_audit_hidden_v52` 没有写触发器。已检查原业务表的 `td_active_write_v32`、`td_preserve_ledger_v32`、客户生命周期、包裹库存、取件及收付款权限触发器；本次不修改或禁用它们。

新调用链：单条/多选/全选 → `tdDeleteAuditRows()` → 一次 `td_hide_audit_batch_v54(jsonb,text)` → 同一事务写入业务删除标记和旧明细隐藏表。旧单条 `td_hide_audit_v52` 委托新实现。任何一条不存在、类型/UUID 无效或写入失败，整批回滚。重试按 `(source_table,source_id)` 幂等，保留第一次删除原因和快照。服务器锁定并检查当前激活且未删除的管理员身份；不信任前端角色。

## 关联与财务口径

- 只软删除明确选择的记录，不级联删除关联客户、订单、包裹、取件或收付款。原外键、收款凭证、签名、图片文件及库存余量全部保留；删除取件历史不会把已取库存重新加回。
- `td_business_hidden_v54` 保存操作者、原因、时间、批次 UUID 和完整原记录快照；普通账号不能直接插入、修改或删除日志，只有管理员可读完整日志。
- 普通账号通过 `td_business_hidden_ids_v54()` 仅读取删除编号。刷新时统一过滤五类业务，因此普通列表、总览、CSV/PDF 报表和员工统计都排除新删除记录。关联业务仍可显示原客户名称。
- 同一结算单的所有包裹均被本次软删除后，该结算单退出当前余额、期间运费统计和结算历史；原始 `td_pickup_receipts_v32` 收款凭证保持原样。单独删除一条取件明细不等于删除独立的结算单或其收款凭证。
- 旧 V52 历史隐藏仅维持其原有员工统计口径。本 SQL 不把既有历史隐藏自动转换为业务删除，也不清理正式库历史数据。
- 全选包含当前筛选的全部已加载记录，列表仍只显示前 1000 条。单事务上限 50000 条；客户端不分批提交。所有删除仍需原因及二次确认。

## 部署

完整 SQL：[`sql/staff-entry-delete-v54.sql`](../sql/staff-entry-delete-v54.sql)。这是自包含增量安装文件，可整体在 Supabase SQL Editor 执行；无需运行旧 DRAFT、生产清理脚本或重建数据库。

1. 已在 `tengda-v32-test`（`amknufvdvqfhrgtobpwg`）安装并验证。原始测试项目缺少 V52 表，安装文件包含兼容创建。
2. 正式库 `yvsgawbbnyeyvynwghsc` **尚未执行此 SQL**，本次仅作元数据只读检查。部署负责人应先整体执行上述 SQL，再发布修复分支到 `main`。
3. 发布包含 `index.html`、镜像 `index 9.html` 和 Netlify 代理允许列表的同一提交，避免新页面请求尚不存在的 RPC。SQL 部署后、前端发布前请暂停旧页面的删除操作，因为兼容单条 RPC 已切换为业务软删除语义。
4. 发布后用经确认的测试业务验证单条、多选及全选，并刷新页面核对。不要用正式财务历史记录试删。

故障回退优先回退前端版本并停止删除操作。不要删除新日志表或已保存标记，也不要自动恢复已删除业务；恢复须逐条审计并另行授权。旧前端不会理解新的业务标记，因此回退时需暂停普通业务统计，避免重新计入。

管理员审计查询（只读）：

```sql
select source_table, source_id, hidden_by, hidden_at, reason, batch_id, snapshot
from public.td_business_hidden_v54
order by hidden_at desc;
```

## 验证结果（2026-11-12）

- `npm test`：86/86 通过；新增全选超过 1000 条、单次 RPC、失败不改变本地状态、五类业务过滤、分页、原因及确认取消测试。修正了仓库原有“隐藏订单和已删除客户仍计入员工统计”的过时断言，与现有页面语义一致。
- `npm run check`、`node scripts/build-static.mjs`、`git diff --check`：通过。
- `python tests/browser_staff_delete.py`：Chromium 通过多选、单条、全选、即时消失、整页刷新持久化；接口全部模拟，不连接正式库。
- `tests/staff-entry-delete-v54.sql`：在真实测试 Supabase 验证五类混合批量、旧单条 RPC 四列 INSERT、幂等、员工/无身份/短原因拦截、第二条不存在导致前一条回滚、删除日志快照、原收付款和取件收款凭证未改变、关联和库存未改变、员工读取标记及无身份不可读取。测试以 `ROLLBACK` 结束；再次查询新删除表为 0 条。
- 权限查询确认：`anon` 不可执行删除；`authenticated` 不可直接插入或删除日志。身份场景使用数据库测试 JWT 上下文，不冒充真实用户登录。
- Supabase security advisors 已检查。新增两个 RPC 的 `SECURITY DEFINER` 可被 authenticated 调用会产生预期提示；这是受控 API，删除函数在服务端验证并锁定管理员，读取函数仅向激活账号返回编号，均固定空 `search_path` 并撤销 PUBLIC/anon 执行权限。项目原有无策略表及密码保护提示未在此修复中调整。[提示说明](https://supabase.com/docs/guides/database/database-linter?lint=0029_authenticated_security_definer_function_executable)。

测试 SQL 已执行；正式 SQL 和正式前端未部署，历史数据未清理。
