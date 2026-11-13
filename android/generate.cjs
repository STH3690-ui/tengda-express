// Generate a standard Android project with official Bubblewrap 1.27.0.
const fs=require('node:fs');const path=require('node:path');const crypto=require('node:crypto');
const {TwaManifest,TwaGenerator,ConsoleLog}=require('@bubblewrap/core');
const {fetchUtils}=require('@bubblewrap/core/dist/lib/FetchUtils');
const {Response}=require('node-fetch');
(async()=>{
 const root=path.resolve(__dirname,'..'),web=JSON.parse(fs.readFileSync(path.join(root,'manifest.webmanifest'))),cfg=JSON.parse(fs.readFileSync(path.join(__dirname,'release-config.json')));
 const icon=fs.readFileSync(path.join(root,'icon-512.png'));
 if(crypto.createHash('sha256').update(icon).digest('hex')!==cfg.originalIconSha256)throw Error('Original fox icon changed; refusing to regenerate');
 // Supply the exact repository PWA and original icon to Bubblewrap; no remote replacement art.
 const original=fetchUtils.fetch.bind(fetchUtils);
 fetchUtils.fetch=async u=>String(u)===cfg.iconUrl?new Response(icon,{headers:{'content-type':'image/png'}}):String(u)===cfg.webManifestUrl?new Response(JSON.stringify(web),{headers:{'content-type':'application/manifest+json'}}):original(u);
 const m=TwaManifest.fromWebManifestJson(new URL(cfg.webManifestUrl),web);
 Object.assign(m,{packageId:cfg.packageId,name:'腾达快递站',launcherName:'腾达快递站',iconUrl:cfg.iconUrl,maskableIconUrl:undefined,monochromeIconUrl:undefined,enableNotifications:false,enableSiteSettingsShortcut:true,orientation:'any',display:'standalone',minSdkVersion:24,appVersionCode:cfg.versionCode,appVersionName:cfg.versionName,generatorApp:'bubblewrap-cli',fallbackType:'customtabs',signingKey:{path:'../signing.keystore',alias:'tengda-release'},fingerprints:[{name:'release',value:cfg.sha256Fingerprint}],additionalTrustedOrigins:[]});
 const dir=path.join(__dirname,'project');fs.rmSync(dir,{recursive:true,force:true});fs.mkdirSync(dir,{recursive:true});
 await new TwaGenerator().createTwaProject(dir,m,new ConsoleLog('Tengda'));await m.saveToFile(path.join(dir,'twa-manifest.json'));
 // Pin a toolchain officially supporting compile/target 36 and remove retired jcenter.
 const gradle=path.join(dir,'build.gradle');fs.writeFileSync(gradle,fs.readFileSync(gradle,'utf8').replace(/jcenter\(\)/g,'mavenCentral()').replace('gradle:8.9.1','gradle:8.11.1'));
 const wrapper=path.join(dir,'gradle/wrapper/gradle-wrapper.properties');fs.writeFileSync(wrapper,fs.readFileSync(wrapper,'utf8').replace('gradle-8.11.1-bin.zip','gradle-8.13-bin.zip').replace('networkTimeout=10000','networkTimeout=120000'));
 const manifest=path.join(dir,'app/src/main/AndroidManifest.xml');fs.writeFileSync(manifest,fs.readFileSync(manifest,'utf8').replace('android:allowBackup="true"','android:allowBackup="false"\n        android:usesCleartextTraffic="false"').replace('android:supportsRtl="true"','android:supportsRtl="true"\n        android:resizeableActivity="true"'));
 // Release signing is configured only from environment variables, never committed passwords.
 fs.appendFileSync(path.join(dir,'app/build.gradle'),`\nif (System.getenv('ANDROID_KEYSTORE_PATH')) {\n android.signingConfigs { release { storeFile file(System.getenv('ANDROID_KEYSTORE_PATH')); storePassword System.getenv('ANDROID_KEYSTORE_PASSWORD'); keyAlias System.getenv('ANDROID_KEY_ALIAS'); keyPassword System.getenv('ANDROID_KEY_PASSWORD') } }\n android.buildTypes.release.signingConfig = android.signingConfigs.release\n}\n`);
 console.log('Bubblewrap Android project generated from original icon; no signing secrets written.');
})().catch(e=>{console.error(e);process.exitCode=1});
