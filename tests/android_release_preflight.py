"""Offline integration tests of the read-only APK production identity gate."""
import io,json,runpy,subprocess,unittest
from pathlib import Path
from unittest.mock import patch
ROOT=Path(__file__).resolve().parents[1]
CFG=json.loads((ROOT/'android/release-config.json').read_text())
class Response(io.BytesIO):
 status=200
 def __init__(self,path,data):super().__init__(json.dumps(data).encode());self.url='https://tengda-express-station.netlify.app'+path
class Preflight(unittest.TestCase):
 def check_gate(self,version='V63.1',fingerprint=None,ancestor=True):
  calls=[]
  def urlopen(req,timeout):
   calls.append(req.full_url);self.assertIsNone(req.data);self.assertEqual(req.get_method(),'GET');self.assertEqual(timeout,20)
   path=req.full_url.removeprefix('https://tengda-express-station.netlify.app')
   return Response(path,{'version':version,'commit':'a'*40} if path=='/release.json' else [{'target':{'package_name':CFG['packageId'],'sha256_cert_fingerprints':[fingerprint or CFG['sha256Fingerprint']]}}])
  def git(args,check):
   self.assertEqual(args[0],'git')
   if args[1]=='merge-base' and not ancestor:raise subprocess.CalledProcessError(1,args)
  with patch('urllib.request.urlopen',urlopen),patch('subprocess.run',git),patch('sys.stdout',io.StringIO()):runpy.run_path(str(ROOT/'android/verify-production.py'))
  self.assertEqual(len(calls),2)
 def test_correct_production_identity(self):self.check_gate()
 def test_old_web_release_rejected(self):
  with self.assertRaises(AssertionError):self.check_gate(version='V62.4')
 def test_changed_signing_identity_rejected(self):
  with self.assertRaises(AssertionError):self.check_gate(fingerprint='00:00')
 def test_source_excluding_production_rejected(self):
  with self.assertRaises(subprocess.CalledProcessError):self.check_gate(ancestor=False)
if __name__=='__main__':unittest.main()
