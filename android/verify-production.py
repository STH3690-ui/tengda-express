"""Read-only production/DAL preflight. Never logs keys or performs database writes."""
import json, subprocess, urllib.request
from pathlib import Path
cfg=json.loads((Path(__file__).parent/'release-config.json').read_text())
base='https://tengda-express-station.netlify.app'
def fetch(path):
 req=urllib.request.Request(base+path,headers={'Cache-Control':'no-cache'})
 with urllib.request.urlopen(req,timeout=20) as r:
  assert r.status==200
  assert r.url==base+path,'Unexpected production redirect'
  return json.load(r)
release=fetch('/release.json')
assert release['version']==cfg['webVersion'],'Production web release version differs from APK configuration'
assert isinstance(release.get('commit'),str) and len(release['commit'])==40,'Missing production source identity'
# Ensure source contains the deployed web release rather than an old branch.
subprocess.run(['git','cat-file','-e',release['commit']+'^{commit}'],check=True)
subprocess.run(['git','merge-base','--is-ancestor',release['commit'],'HEAD'],check=True)
dal=fetch('/.well-known/assetlinks.json')
assert any(x.get('target',{}).get('package_name')==cfg['packageId'] and cfg['sha256Fingerprint'] in x['target'].get('sha256_cert_fingerprints',[]) for x in dal),'Production DAL does not trust this signing identity'
print(json.dumps({'web_version':release['version'],'web_commit':release['commit'],'dal_identity_verified':True,'production_writes':0}))
