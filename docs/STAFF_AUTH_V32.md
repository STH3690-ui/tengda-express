> 本文为历史测试版记录。最新正式环境部署及验收状态见 [正式发布记录](PRODUCTION_RELEASE_20261019.md)。

# 员工认证 V3.2

本次改动基于 `feature/customer-recycle-bin-v31` 的 `96e1b7e12b429540f1e22892defbd7b7e37a8dda`。只面向 `tengda-v32-test`，没有改动 main 或任何远程数据库。

## 实现

- 前端输入用户名和密码，调用 `staff-auth` Edge Function，取得 Supabase Auth 会话，再读取实时成员权限。原有邮箱账号仍可通过原 Auth 邮箱登录。
- 管理员创建员工账号（邮箱、电话可选），新账号在数据库中为 `staff / active=false`，Auth 同时处于禁用状态。管理员批准后才能登录。
- 管理员批准、停用需经过 `auth.getUser()` 验证真实 JWT、查询实时 owner 身份，并由调用者 JWT 下的 SQL RPC 再次授权。停用先更新数据库，再禁用 Auth；即使 Auth 禁用失败，数据库也会拒绝旧 JWT 的业务操作。错误会明确提示重试停用。
- 普通员工只能新增客户、修改正常客户的姓名/电话/备注。前端隐藏删除、恢复、归档入口，数据库触发器同时约束直接写表和旧 SECURITY DEFINER RPC。已删除、已归档客户只允许管理员修改。
- `service_role` 只从 Edge Function 服务端环境读取。浏览器只使用现有 publishable key，不接触后台密钥。
- 不再在浏览器拼接示例域名邮箱。无邮箱账号使用服务端生成的随机 UUID 加**本测试项目真实的 `<project-ref>.supabase.co` 域名**作为内部 Auth 标识；`email_confirm=true`，不发送邮件。选填邮箱只作为联系资料保存。没有 SMTP 或邮箱所有权验证流程，也不支持通过这个内部地址发送密码重置邮件。
- 已有用户名从 Auth metadata 或旧示例邮箱中无歧义迁移。重复/不合规的旧用户名不会自动覆盖，需要在测试后台核对。
- 保留黑金狐狸图片、包裹、取件、财务、照片及原有业务函数；同步修改两个原本相同的入口 `index.html`、`index 9.html` 和 `.js.txt` 镜像。`index-backup.html` 保留为原始备份。

## 尚未部署：需要的连接与授权

当前 GitHub 连接返回 `push=false`；云环境无 Supabase 凭据，Git 命令行代理也无法连接。只能完成本地提交与补丁，不能声称已推送或已部署。

后续执行需要：

1. 对 `STH3690-ui/tengda-express` 的 GitHub 写入权限，仅推送 `feature/customer-recycle-bin-v31`。
2. Supabase 部署连接：能确认项目名为 `tengda-v32-test` 的项目 ref，能部署 Edge Function / 设置函数 secrets，并能对**该测试项目**执行数据库迁移。不要在聊天、Git 或浏览器代码中填写后台密钥。
3. 测试项目的现有 schema / RLS / RPC 校验权限，以及一个现有、启用中的 owner 测试账号。

仓库没有原 V3.1 SQL / RLS 定义。迁移前必须验证 `td_members.role` 接受 `staff`、相关表/列存在，以及 PostgreSQL 版本至少为 15。迁移内置必要表/列预检，并在事务中执行；失败会回滚。迁移会对现有 `public.td_*` 表追加限制性 RLS / 写触发器，并把 `td_*` 普通视图改为 `security_invoker`。必须在测试项目检查原视图的底层表授权和旧 RPC 是否兼容；不能把本地模拟测试当作实库验证。未来新增的业务表和视图也需要同样的权限限制。

## 授权后的测试部署顺序

1. 通过管理后台确认 `tengda-v32-test` 的真实 project ref；核对 `index.html` 中现有 URL `amknufvdvqfhrgtobpwg` 是否确实属于该测试项目。未经确认不要调用该地址或改动数据库。如不一致，两个活动 HTML 入口都改为经确认的测试 URL 和 publishable key。
2. 仅在已确认的测试数据库连接中执行下面两行（同一连接）。不要直接对未知连接运行 `supabase db push`：

   ```sql
   set td.environment = 'tengda-v32-test';
   -- 然后运行 supabase/test-migrations/202610180001_staff_auth_v32.sql 的完整内容
   ```

   使用 Supabase SQL Editor 或 `psql` 的 `\i` 文件导入；所有字段和权限升级都在事务内。已成功执行的迁移不要重复运行。
3. 如果测试库已有 `@staff.tengda.example.com` 用户，先在可信服务端环境配置 `TD_ENVIRONMENT=tengda-v32-test`、`TD_TEST_PROJECT_REF`、`SUPABASE_URL`、`SUPABASE_SERVICE_ROLE_KEY`，运行 `node scripts/repair-legacy-auth.mjs`。该脚本通过 Admin API 更新内部邮箱，不改密码、角色和批准状态，也不打印密钥。先执行数据库用户名回填，再修复邮箱，才能保留旧用户名映射。
4. 在测试项目为函数设置：
   - `TD_ENVIRONMENT=tengda-v32-test`
   - `TD_TEST_PROJECT_REF=<已确认的测试项目ref>`
   - `TD_ALLOWED_ORIGINS=<测试站点的准确origin>`，多个 origin 用逗号分隔，无路径、无通配符。
   Supabase 自动提供 `SUPABASE_URL`、`SUPABASE_ANON_KEY`、`SUPABASE_SERVICE_ROLE_KEY`。这些后台配置只放在函数服务端。
5. 在仓库目录执行 `supabase functions deploy staff-auth --project-ref <已确认的测试ref> --no-verify-jwt`。登录端点允许匿名请求，其他操作由函数主动验证 JWT；不能省略函数内的校验。部署完关闭 Supabase Auth 的公开注册入口；管理员创建使用 Admin API，不受影响。
6. 先执行事务式数据库验证 `tests/permissions.sql`（最终 `rollback`），再以测试 owner、员工账号进行真实浏览器验收：创建不填邮箱账号→待批准无法登录→批准后用户名登录→新增/修改客户→直接 RPC 和写表均不能删/恢复/归档→旧会话停用后业务拒绝访问→管理员和业务页面正常。
7. `npm test`、`npm run check`、`git diff --check` 通过后，只把提交推送到指定开发分支。不合并 main，不部署正式站点。

## 边界和测试状态

用户名不区分大小写，使用 3–30 位英文字母、数字或下划线；新密码长度 12–128 位。登录按规范化标识在数据库中做每15分钟10次限制，包含成功尝试；该限制不是完整的全站防刷服务。业务表权限以实时 `td_members.active` 为准；页面每30秒及回到前台时重新检查，清空停用用户缓存。

已有照片签名 URL 在原有效期内仍可访问，最长约1小时；停用不能撤销已下载文件或已经签发的 URL。邮箱为联系资料，忘记密码需管理员通过可信后台重置，前端不提供邮件重置。

本地 Node 测试使用模拟 Supabase 客户端，覆盖权限分支、参数校验、用户创建失败清理、会话和前端按钮，不会连接真实数据库。`tests/permissions.sql` 是待授权后执行的测试库集成验证。真实 Supabase 登录、数据库兼容性、旧 RPC 的全部行为、真实业务回归均以测试库验收结果为准。


## 本地验证记录

- `npm test`：40 项模拟客户端 / 前端逻辑测试通过。
- `npm run check` 和 `git diff --check`：通过。
- `python tests/browser_smoke.py`：已编写，但当前执行沙箱禁止 Chromium 所需的 socket 操作，启动时报 `setsockopt: Operation not permitted`，未完成浏览器验收。脚本需要 Python Playwright 和可启动的 Chromium，可通过 `CHROMIUM_EXECUTABLE` 指定路径。
- 数据库 SQL 集成测试、Deno Edge Function 部署及真实 Supabase Auth 验收：未执行；缺少测试项目连接，环境也没有 PostgreSQL / Deno CLI。
