import { readFile, mkdir, copyFile, rm } from 'node:fs/promises';
const html=await readFile('index.html','utf8');
if(!html.includes("const TD_SUPABASE_URL='https://yvsgawbbnyeyvynwghsc.supabase.co'"))throw new Error('Production project binding is required');
if(html.includes('amknufvdvqfhrgtobpwg'))throw new Error('Test project reference in production HTML');
if(/sb_secret_|SUPABASE_SERVICE_ROLE_KEY/.test(html))throw new Error('Privileged credential reference in production HTML');
await rm('dist',{recursive:true,force:true});await mkdir('dist/vendor',{recursive:true});
for(const file of ['index.html','tengda-header.jpg','tengda-staff-auth-v32.js','vendor/supabase-2.49.8.min.js','_headers'])await copyFile(file,'dist/'+file);
// Include existing PWA assets when present; never publish backups, SQL or server code.
for(const file of ['manifest.webmanifest','sw.js','icon-180.png','icon-192.png','icon-512.png']){
 try{await copyFile(file,'dist/'+file);}catch(e){if(e.code!=='ENOENT')throw e;}
}
console.log('Production static bundle built; server source, backups and test files excluded.');
