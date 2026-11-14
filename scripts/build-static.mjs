import { readFile, mkdir, copyFile, rm, cp, writeFile } from 'node:fs/promises';
const html=await readFile('index.html','utf8');
if(!html.includes("const TD_SUPABASE_URL='https://yvsgawbbnyeyvynwghsc.supabase.co'"))throw new Error('Production project binding is required');
if(html.includes('amknufvdvqfhrgtobpwg'))throw new Error('Test project reference in production HTML');
if(/sb_secret_|SUPABASE_SERVICE_ROLE_KEY/.test(html))throw new Error('Privileged credential reference in production HTML');
await rm('dist',{recursive:true,force:true});await mkdir('dist/vendor',{recursive:true});
for(const file of ['index.html','navigation.js','scan-core.js','label-v58.js','label-ocr-v58.js','label-ui-v58.js','live-core-v59.js','live-ui-v59.js','live-v59.css','capture-core-v60.js','capture-ui-v60.js','capture-v60.css','scan.js','scan.css','vendor/zxing-0.21.3.min.js','vendor/zxing-LICENSE','brand-interface.css','mobile-adaptation.css','app-icon.svg','tengda-header.jpg','tengda-staff-auth-v32.js','td-cleanup-ui.js','vendor/supabase-2.49.8.min.js','_headers'])await copyFile(file,'dist/'+file);
// Include existing PWA assets when present; never publish backups, SQL or server code.
for(const file of ['manifest.webmanifest','sw.js','icon-180.png','icon-192.png','icon-512.png']){
 try{await copyFile(file,'dist/'+file);}catch(e){if(e.code!=='ENOENT')throw e;}
}
await mkdir('dist/.well-known',{recursive:true});await copyFile('.well-known/assetlinks.json','dist/.well-known/assetlinks.json');
console.log('Production static bundle built; server source, backups and test files excluded.');

await cp('vendor/tesseract-v6','dist/vendor/tesseract-v6',{recursive:true});

const commit=(process.env.COMMIT_REF||'').trim();
if(commit&&!/^[a-f0-9]{40}$/i.test(commit))throw Error('Invalid release commit');
await writeFile('dist/release.json',JSON.stringify({version:'V60',commit:commit||null})+'\n');
