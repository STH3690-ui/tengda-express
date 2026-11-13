import bwip from 'bwip-js';import {mkdir,writeFile} from 'node:fs/promises';
await mkdir('/tmp/tengda-scan-fixtures',{recursive:true});
for(const [bcid,text] of [['code128','TD12345678'],['code39','TD12345678'],['ean13','5901234123457'],['ean8','96385074'],['qrcode','TD12345678']])await writeFile('/tmp/tengda-scan-fixtures/'+bcid+'.png',await bwip.toBuffer({bcid,text,scale:3,height:20,padding:15,includetext:false}));
console.log('Generated Code128, Code39, EAN13, EAN8, QR test fixtures');
