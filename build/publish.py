from pathlib import Path
import hashlib,json,os,subprocess

def gh(*args):return subprocess.check_output(['gh',*args])
repo=os.environ['GITHUB_REPOSITORY'];base=f'repos/{repo}'
release=next(r for r in json.loads(gh('api',base+'/releases?per_page=100')) if r['tag_name']=='v1.0.0')
expected={f'WebPVZ-1.0.0-{lang}-{platform}-{arch}.zip' for lang in ['EN','SC'] for platform,arch in [('Windows','x64'),('macOS','x64'),('macOS','arm64'),('Linux','x64'),('Linux','arm64')]}
expected|={f'WebPVZ-1.0.0-{lang}-Web.zip' for lang in ['EN','SC']}
assets={a['name']:a for a in release['assets'] if a['state']=='uploaded'}
assert expected<=assets.keys(),'Missing release packages'
lines=[]
for name in sorted(expected):
    asset=assets[name];value=asset.get('digest') or ''
    if value.startswith('sha256:'):value=value.removeprefix('sha256:')
    else:value=hashlib.sha256(gh('api',base+'/releases/assets/'+str(asset['id']),'-H','Accept: application/octet-stream')).hexdigest()
    assert len(value)==64 and all(c in '0123456789abcdef' for c in value)
    lines.append(value+'  '+name)
Path('SHA256SUMS.txt').write_text('\n'.join(lines)+'\n',encoding='ascii')
gh('release','upload','v1.0.0','SHA256SUMS.txt','--clobber')
body={'draft':False,'target_commitish':os.environ['RELEASE_COMMIT'],'make_latest':'true','body':Path('build/release-notes.md').read_text()}
Path('release-update.json').write_text(json.dumps(body))
gh('api',base+'/releases/'+str(release['id']),'-X','PATCH','--input','release-update.json')
print('Published 12 packages and SHA256SUMS.txt')
