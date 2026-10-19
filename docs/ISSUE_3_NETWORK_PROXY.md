# Issue #3 — 同源连接测试方案

本分支仅供 PR / Netlify Deploy Preview。不得据此直接合并或发布生产。未执行数据库迁移、账号变更、业务写入或正式 Edge Function 部署。

## 根因与请求清单

受影响网络能访问 Netlify，但直连 Supabase 域名会超时。401 是收到上游响应，不能当作网络不可达。

| 功能 | SDK / 原请求 | 测试分支路径 |
| --- | --- | --- |
| 注册、用户名登录、创建/批准/停用员工 | functions/v1/staff-auth | /api/supabase/functions/v1/staff-auth |
| 刷新会话、读取当前用户、退出 | auth/v1/token?grant_type=refresh_token、user、logout | /api/supabase/auth/v1/... |
| 客户、订单、包裹、收付款、成员、站点、报表 | rest/v1 中明确列出的表/视图及 RPC | /api/supabase/rest/v1/... |
| 图片列表、10 MB 内图片上传、签名和签名图片读取 | storage/v1，私有 tengda-images 桶 | /api/supabase/storage/v1/... |
| 诊断 | auth/v1/health，无凭据只读 | /api/supabase-health |
| Realtime | 当前网页没有 channel/subscribe 或 WebSocket 订阅 | 不开放代理，CSP 也不允许直连 |

使用 SDK 2.49.8 原有 URL 前缀机制，Auth、PostgREST、Functions、Storage 和返回的签名链接均同源。显式保留旧 session storageKey，避免换 URL 后丢失现有会话。CSP connect-src 和 img-src 收紧到同源（另保留本地图片 data/blob），没有直接域名回退或额外 CDN 依赖。

## 代理安全边界

Netlify Edge Function 适配现有 10 MB 上传，避免普通缓冲式 Functions 请求体大小限制。固定 HTTPS 上游，路径和方法白名单，无 URL / Host 参数、无管理接口、无任意函数、无跨桶访问、无永久 DELETE。请求体最大 11 MiB，响应最大 12 MiB，完整传输期限 25 秒，诊断期限 8 秒；字节流实测大小而非仅信任 Content-Length。

透传调用者 Authorization、公开 apikey、PostgREST 查询/分页/Prefer、图片内容类型；不注入 service_role，不改变数据库权限。拒绝跨站 Origin / Sec-Fetch-Site；只接受明确的公开项目 key。不能用代理绕过原 JWT、员工启用状态或 RLS。仅将已验证同源请求的上游 Origin 设为正式站点原有白名单中的固定值，使预览请求也使用同一严格后台来源策略；不修改 Supabase 来源白名单。

不转发客户端 Cookie、Host、伪造 IP、任意路由头，不将上游 Cookie、CORS 通配符或重定向发回浏览器；所有响应 no-store，不记录请求体、密码、JWT、签名链接或业务内容。私有图片仍依赖原签名 token，非允许图片类型强制下载。现有登录限流保持原样；代理共享出口可能影响基于 IP 的限流，需在受影响网络多人验收时关注，不擅自放宽限流。

## 已执行与限制

`npm test` 包含原有权限/Auth/前端测试和新增代理测试，SDK 集成使用仓库固定版本的真实 SDK，但测试上游是隔离响应，不代表真实账号、数据库 RLS 或手机网络验收。

执行 `npm run check`、`node scripts/build-static.mjs`、`git diff --check`。只读现场检查不执行登录限流写入、不注册账号、不修改正式数据库。

## Deploy Preview 验收（仍需完成）

1. PR 的 Netlify Deploy Preview 应成功构建。确认 /api/supabase-health 返回 reachable:true，upstreamStatus:401 也算网络可达；healthy 与 reachable 分开。
2. 在实际受影响的 Safari / Android WebView 中打开预览站点，记录浏览器版本和网络类型，不采集密码、JWT 或含业务内容的 HAR。确认所有登录和业务请求均为预览域名 /api/supabase/...，没有 Supabase 直连。
3. 本分支仍绑定正式项目。当前授权禁止修改正式数据库，因此不要在预览中创建账号、改审批/权限、增删改业务或做登录尝试（登录会更新限流记录）。完整可写验收应先在隔离测试项目配置并部署匹配服务，或另获明确授权；不能因本分支已通过自动测试就宣布上述真实操作通过。
4. 隔离环境需要实际验证注册→待审批拒绝→管理员批准→员工登录；续期/重载/退出；停用旧 JWT；普通员工客户新增修改、禁止删除/恢复/归档；授权/撤销订单隐藏；订单财务保留；收付款、库存、报表；私有图片10 MB上传和签名读取。未授权请求仍由数据库拒绝。
5. 只有受影响网络与正常网络、测试项目真实验收都通过后，另行审查批准生产发布。当前 PR 保持测试状态，不自动合并。

## 后续发布与回滚

经授权后将确切已验收 SHA 合并到 main，观察 Netlify 自动部署，并核对关键资源、同源路径、真实登录和错误率。回滚使用 Netlify 上一个已确认的生产 deploy 或回退该提交；无数据库迁移需回滚。回滚旧站会恢复直连，受影响网络可能重新失败，但账号和业务数据不受本修复影响。
