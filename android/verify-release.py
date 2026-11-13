"""Fail release verification unless both artifact signatures match the published DAL identity."""
import hashlib,json,subprocess,sys,zipfile
from pathlib import Path
cfg=json.loads((Path(__file__).parent/'release-config.json').read_text())
apk,aab=map(Path,sys.argv[1:3])
v=subprocess.run(['apksigner','verify','--verbose','--print-certs',str(apk)],text=True,capture_output=True,check=True).stdout
expected=cfg['sha256Fingerprint'].replace(':','').lower()
assert expected in v.replace(':','').lower(),'APK certificate differs from Digital Asset Links'
r=subprocess.run(['jarsigner','-verify',str(aab)],text=True,capture_output=True,check=True)
assert 'jar verified.' in r.stdout,'AAB JAR signature verification failed'
pem=subprocess.check_output(['keytool','-printcert','-jarfile',str(aab),'-rfc'])
der=subprocess.check_output(['openssl','x509','-outform','DER'],input=pem)
assert hashlib.sha256(der).hexdigest()==expected,'AAB certificate differs from APK/DAL'
assert zipfile.is_zipfile(apk) and zipfile.is_zipfile(aab)
for p in (apk,aab):print(f'{hashlib.sha256(p.read_bytes()).hexdigest()}  {p.name}')
print('Verified release APK and AAB; signing certificate matches published Digital Asset Links.')
