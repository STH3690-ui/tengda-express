# 腾达快递站 Android TWA 正式包

- 网站：https://tengda-express-station.netlify.app/
- 包名：`com.tengda.express`；App/桌面名称：`腾达快递站`。
- 首版：3.2.0，versionCode 32000；Android 7.0/API 24 起，target/compile API 36。
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

此次已生成正式 PKCS12 签名密钥，保存在任务工作区外部私有目录 `/workspace/shared/tengda-android-signing/`，权限为目录700/文件600。**立即分别下载 `tengda-release.p12` 和 `keystore-password.txt`，在用户自己的密码管理器/离线加密存储中持久备份；临时工作区不保证长期保留。不要把它们上传为 Release 附件，也不要提交仓库。**今后更新必须复用同一密钥，丢失后无法覆盖升级当前安装包。

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

`.github/workflows/android.yml` 在相关PR构建 APK/AAB（无签名，不作正式发布）；workflow_dispatch 使用 Secrets 签名、验证并上传 Actions artifacts；推送 `android-v*` 标签时，先签名校验成功，再上传 APK/AAB/SHA256 到 GitHub Release。

首次安装包由本次受控工作区签名并手动发布到 `v3.2.0-android` Release，不依赖尚未配置的 Actions Secrets。未来更新先递增 `release-config.json` 的 versionCode/versionName，再推送例如 `android-v3.2.1`。

## Digital Asset Links

网站 `/.well-known/assetlinks.json` 必须无重定向返回 JSON，包名和 SHA256 必须与 `release-config.json`、APK及AAB一致。静态构建已包括该隐藏目录，Netlify 配置 JSON 内容类型。首次发布/换设备时浏览器可能需要联网刷新域名验证缓存。

若以后启用 Google Play App Signing，Play 分发包将使用 Play 应用签名证书：从 Play Console 获取**应用签名证书** SHA256 并加入 assetlinks 数组，保留当前直装证书指纹；不要误用上传密钥指纹。

## 已验证与限制

- 签名 APK/AAB 构建成功；apksigner APK校验、jarsigner AAB校验及两者证书/DAL匹配通过。
- Node 测试98/98通过，语法检查、生产静态构建通过。
- Chromium测试6种手机/平板横竖屏尺寸 × 9个主要页面，共54个组合，无整页横向溢出或脚本错误；测试后再次复核安全区域CSS。业务接口均模拟，不操作正式记录。
- 已尝试官方Android模拟器/ADB安装验证，当前环境无连接真机、无KVM；软件模拟器受环境磁盘/运行条件限制，未完成设备内安装和启动验证。不能把构建签名校验当作真机测试。首台真机应验证安装、TWA无地址栏、登录、拍照/相册上传、下载/PDF、旋转和返回键。
- GitHub Secrets 403：需要仓库所有者按上述步骤设置。Google Play未发布；AAB为已签名的上传包，Play Console 账号/商店审核属于后续流程。
