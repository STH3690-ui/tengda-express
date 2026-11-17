import { readFile, mkdir, copyFile, rm, cp, writeFile } from 'node:fs/promises';
import { transform } from 'esbuild';
import { createHash } from 'node:crypto';
const html=await readFile('index.html','utf8');
if(!html.includes("const TD_SUPABASE_URL='https://yvsgawbbnyeyvynwghsc.supabase.co'"))throw new Error('Production project binding is required');
if(html.includes('amknufvdvqfhrgtobpwg'))throw new Error('Test project reference in production HTML');
if(/sb_secret_|SUPABASE_SERVICE_ROLE_KEY/.test(html))throw new Error('Privileged credential reference in production HTML');
await rm('dist',{recursive:true,force:true});await mkdir('dist/vendor',{recursive:true});
for(const file of ['photo-core-v63.js','photo-thumbs-v624.js','paged-data-v624.js','asset-loader-v624.js','brand-mark.webp','tengda-header.webp','index.html','navigation.js','scan-core.js','label-v58.js','label-ocr-v58.js','label-ui-v58.js','live-core-v59.js','live-ui-v59.js','live-v59.css','capture-core-v60.js','photo-core-v61.js','photo-ui-v61.js','capture-v60.css','photo-v61.css','intake-core-v62.js','intake-ui-v62.js','intake-v62.css','label-manual-v621.js','compact-ui-v622.js','compact-v622.css','unified-ui-v623.js','unified-v623.css','scan.js','scan.css','vendor/zxing-0.21.3.min.js','vendor/zxing-LICENSE','brand-interface.css','mobile-adaptation.css','app-icon.svg','tengda-header.jpg','tengda-staff-auth-v32.js','td-cleanup-ui.js','vendor/supabase-2.49.8.min.js','_headers'])await copyFile(file,'dist/'+file);
// Include existing PWA assets when present; never publish backups, SQL or server code.
for(const file of ['manifest.webmanifest','sw.js','icon-180.png','icon-192.png','icon-512.png']){
 try{await copyFile(file,'dist/'+file);}catch(e){if(e.code!=='ENOENT')throw e;}
}
await mkdir('dist/.well-known',{recursive:true});await copyFile('.well-known/assetlinks.json','dist/.well-known/assetlinks.json');
console.log('Production static bundle built; server source, backups and test files excluded.');

await cp('vendor/tesseract-v6','dist/vendor/tesseract-v6',{recursive:true});

const commit=(process.env.COMMIT_REF||'').trim();
if(commit&&!/^[a-f0-9]{40}$/i.test(commit))throw Error('Invalid release commit');
await writeFile('dist/release.json',JSON.stringify({version:'V63.1',commit:commit||null})+'\n');

// Preserve classic-script globals and inline handlers. Only whitespace/syntax are minified.
// Extract scripts BEFORE styles, because view templates contain literal style/link markup.
let output=html;const scripts=[];
output=output.replace(/<script([^>]*)>([\s\S]*?)<\/script>/g,(tag,attrs,body)=>{
 const src=attrs.match(/src=["']([^"']+)["']/)?.[1];
 if(src?.includes('vendor/supabase-'))return tag;
 scripts.push(src?{src}: {body});return '';
});
let css='';
output=output.replace(/<style(?:\s[^>]*)?>([\s\S]*?)<\/style>|<link\b[^>]*rel="stylesheet"[^>]*>/g,(tag,inline)=>{
 if(inline!==undefined)css+=inline+'\n';else css+='/*SOURCE:'+tag.match(/href="([^"']+)"/)[1]+'*/\n';return '';
});
css=await (async()=>{let result='';for(const part of css.split(/(\/\*SOURCE:[^*]+\*\/)/)){
 if(part.startsWith('/*SOURCE:'))result+=await readFile(part.slice(9,-2).replace(/^\.?\//,''),'utf8');else result+=part;
}return result.replace(/url\((['"]?)\.\//g,'url($1/');})();
let js='';for(const script of scripts)js+=(script.src?await readFile(script.src.replace(/^\.?\//,''),'utf8'):script.body)+';\n';
const [compactJS,compactCSS]=await Promise.all([transform(js,{loader:'js',target:['safari15','chrome96'],minifyWhitespace:true,minifySyntax:true,minifyIdentifiers:false,legalComments:'none'}),transform(css,{loader:'css',minify:true,legalComments:'none'})]);
const hash=text=>createHash('sha256').update(text).digest('hex').slice(0,16);
const jsPath='/assets/app.'+hash(compactJS.code)+'.js',cssPath='/assets/app.'+hash(compactCSS.code)+'.css';
await mkdir('dist/assets',{recursive:true});await writeFile('dist'+jsPath,compactJS.code);await writeFile('dist'+cssPath,compactCSS.code);
output=output.replace('</head>','<link rel="stylesheet" href="'+cssPath+'"></head>').replace('</body>','<script src="'+jsPath+'"></script></body>');
await writeFile('dist/index.html',output);
// Exact release shell; excludes API, signed photos, workers, language models and all business responses.
const shell=['/','/manifest.webmanifest','/app-icon.svg','/brand-mark.webp','/tengda-header.webp','/vendor/supabase-2.49.8.min.js',jsPath,cssPath];
let sw=await readFile('sw.js','utf8');sw=sw.replace('__TD_SHELL_VERSION__',hash(output)).replace(/\/\*__TD_SHELL_FILES__\*\/\[[^\]]*\]/,JSON.stringify(shell));await writeFile('dist/sw.js',sw);
console.log(JSON.stringify({version:'V63.1',jsBytes:Buffer.byteLength(compactJS.code),cssBytes:Buffer.byteLength(compactCSS.code),jsPath,cssPath}));
