# 腾达快递站 Android TWA 正式包

- 网站：https://tengda-express-station.netlify.app/
- 包名：`com.tengda.express`；App/桌面名称：`腾达快递站`。
- 当前 Android 外壳：63.1.0，versionCode 63100；正式网页：V63.1。原包名和签名指纹保留，可覆盖升级3.2.0；Android 7.0/API 24 起，target/compile API 36。
- 官方 Bubblewrap CLI/Core 1.27.0 生成标准 Android TWA；Android Browser Helper 2.7.4、AGP 8.11.1、Gradle 8.13。该版 Helper 的最低 API 为24，未强制忽略库限制。
- 不含任何原生 CPU 库，无 ABI 或触屏硬件限制，支持手机、平板、旋转和多窗口。横竖屏由系统和网页自动适配。
- 原图标 `icon-512.png` 不改动、不重绘。脚本核对其 SHA-256 后仅生成 Android 所需密度资源。公钥证书和 DAL 指纹可公开，私钥/密码绝不可公开。
- 业务由原网站和 Supabase 提供；APK不内嵌账号、service_role、数据库副本或正式业务数据。不修改数据库。业务需要联网及兼容的 TWA 浏览器；不支持 TWA 时回退到浏览器 Custom Tab，不能保证所有第三方 ROM 都无浏览器栏。

## 本地重建

需要 Node 22+、完整 JDK17、Android SDK platform36/build-tools36.0.0。

```sh
cd android
npm ci --ignore-scripts
npm run generate
cd project
# 在本地安全环境中设置；不要把值写进源码或命令历史。
export ANDROID_KEYSTORE_PATH=/absolute/path/tengda-release.p12
export ANDROID_KEY_ALIAS=tengda-release
# ANDROID_KEYSTORE_PASSWORD / ANDROID_KEY_PASSWORD 从密码管理器注入。
./gradlew --no-daemon assembleRelease bundleRelease
```

签名 APK：`project/app/build/outputs/apk/release/app-release.apk`。
签名 AAB：`project/app/build/outputs/bundle/release/app-release.aab`。
使用 build-tools 中的 apksigner 和 JDK jarsigner 运行 `python3 ../verify-release.py <apk> <aab>`。校验会核对 APK、AAB 与 DAL 三者证书一致，拒绝未签名包。

## 一次性 GitHub Secrets 设置（当前连接没有 Secrets 写入权限）

旧版 PKCS12 私钥不在当前工作区，当前 GitHub 连接没有 Secrets 管理权限。2026-11-17 已实际触发正式 Actions，确认四项 Secrets 缺失，构建按设计在签名步骤失败。**不能从公钥证书或旧 APK 恢复私钥，也不能换新密钥冒充可覆盖升级版。**

请从用户自己的离线加密备份/密码管理器找回原 `tengda-release.p12` 和密码。不要上传到仓库、Issue、Release 或公开日志；临时任务工作区不能当作永久密钥备份。公钥指纹应保持 release-config.json 中现有值。

仓库所有者在自己的电脑使用有本仓库 Secrets 管理权限的 gh 登录后运行：

```sh
gh auth login
bash android/configure-signing-secrets.sh /path/tengda-release.p12 /path/keystore-password.txt
```

脚本安全地通过 stdin 设置以下四项，不在终端回显值：

- `ANDROID_KEYSTORE_BASE64`
- `ANDROID_KEYSTORE_PASSWORD`
- `ANDROID_KEY_PASSWORD`
- `ANDROID_KEY_ALIAS`（固定 `tengda-release`）

未配置时，PR仍可编译验证；手动正式构建/标签发布会明确失败，绝不会把未签名包冒充正式包。

## GitHub Actions

`.github/workflows/android.yml` 在相关PR构建 APK/AAB（无签名，不作正式发布）；workflow_dispatch 使用 Secrets 签名、验证并上传 Actions artifacts；推送 `android-v*` 标签时，先签名及版本/DAL校验成功，再上传 APK/AAB/SHA256 到 GitHub **Draft Release**。草稿不能当作正式下载链接；必须实际核对安装、登录、拍照/相册、条码及权限后才能公开。

首次安装包由本次受控工作区签名并手动发布到 `v3.2.0-android` Release，不依赖尚未配置的 Actions Secrets。未来更新先递增 `release-config.json` 的 versionCode/versionName，再推送例如 `android-v3.2.1`。

## Digital Asset Links

网站 `/.well-known/assetlinks.json` 必须无重定向返回 JSON，包名和 SHA256 必须与 `release-config.json`、APK及AAB一致。静态构建已包括该隐藏目录，Netlify 配置 JSON 内容类型。首次发布/换设备时浏览器可能需要联网刷新域名验证缓存。

若以后启用 Google Play App Signing，Play 分发包将使用 Play 应用签名证书：从 Play Console 获取**应用签名证书** SHA256 并加入 assetlinks 数组，保留当前直装证书指纹；不要误用上传密钥指纹。

## 已验证与限制

- 签名 APK/AAB 构建成功；apksigner APK校验、jarsigner AAB校验及两者证书/DAL匹配通过。
- Node 测试98/98通过，语法检查、生产静态构建通过。
- Chromium测试6种手机/平板横竖屏尺寸 × 9个主要页面，共54个组合，无整页横向溢出或脚本错误；测试后再次复核安全区域CSS。业务接口均模拟，不操作正式记录。
- 已在无KVM的软件 Android 10（API29）模拟器中通过 ADB 实际安装签名APK，系统返回 Success。模拟器使用稀疏测试磁盘，未接入真实账号或业务数据。该AOSP镜像没有兼容TWA的Chrome浏览器，因此仍未完成完整TWA页面启动/无地址栏验证，也未做真机测试。首台真机应验证安装、TWA无地址栏、登录、拍照/相册上传、下载/PDF、旋转和返回键。
- GitHub Secrets 403：需要仓库所有者按上述步骤设置。Google Play未发布；AAB为已签名的上传包，Play Console 账号/商店审核属于后续流程。

## V63.1 发布验收状态

- TWA直接运行正式HTTPS网站，沿用正式Supabase连接，不包含测试库配置或原生业务副本。
- 摄像头、相册和下载由兼容浏览器及系统选择器处理；保留浏览器按站点请求相机权限，拒绝权限后仍可手动录入。无需申请整个相册、全部文件或后台相机权限。不得增加 MANAGE_EXTERNAL_STORAGE。
- 外壳无原生 `.so`，通用APK兼容 arm64，OCR WASM由设备浏览器执行。
- 未验证项目：新版签名APK构建、安装/覆盖升级、Android TWA启动、真实账号登录、相机/相册/扫码、实际权限请求。缺少旧签名私钥期间不得标记通过或公开正式APK。
- iPhone配置GitHub Secrets：仓库 Settings → Secrets and variables → Actions → New repository secret，设置上面四项。BASE64应在用户本地可信电脑用已有脚本写入，勿复制到聊天。然后 Actions → Android TWA → Run workflow（main）。验收通过后再创建 `android-v63.1.0` 标签；标签发布默认草稿。
