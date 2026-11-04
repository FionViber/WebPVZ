"""Recreate supplied desktop packages using verified Electron runtimes."""
from pathlib import Path
import hashlib,json,struct,sys,urllib.request,zipfile,zlib

ROOT=Path(__file__).resolve().parents[1]
def digest(data):return hashlib.sha256(data).hexdigest()

def desktop(target):
    plan=json.loads((ROOT/'build'/f'{target}.json').read_text())
    cache=ROOT/'.build-cache';cache.mkdir(exist_ok=True)
    archive=cache/plan['runtime']
    if not archive.exists():
        urllib.request.urlretrieve('https://github.com/electron/electron/releases/download/v45.2.2/'+plan['runtime'],archive)
    assert digest(archive.read_bytes())==plan['runtimeSha256'],'Electron checksum mismatch'
    out=ROOT/'out';out.mkdir(exist_ok=True)
    with zipfile.ZipFile(archive) as runtime:
        for package in plan['packages']:
            path=out/package['name']
            with zipfile.ZipFile(path,'w',zipfile.ZIP_DEFLATED,compresslevel=6) as result:
                for item in package['entries']:
                    data=(ROOT/item['source']).read_bytes() if 'source' in item else runtime.read(item['runtimeEntry'])
                    if 'patch' in item:
                        patch=zlib.decompress((ROOT/item['patch']).read_bytes())
                        size=struct.unpack_from('<Q',patch)[0];buffer=bytearray(data[:size]);buffer.extend(b'\0'*(size-len(buffer)))
                        cursor=8
                        while cursor<len(patch):
                            offset,length=struct.unpack_from('<QI',patch,cursor);cursor+=12
                            buffer[offset:offset+length]=patch[cursor:cursor+length];cursor+=length
                        data=bytes(buffer)
                    assert digest(data)==item['sha256'],item['name']
                    info=zipfile.ZipInfo(item['name'],tuple(item['date']))
                    for key,field in [('compression','compress_type'),('externalAttr','external_attr'),('internalAttr','internal_attr'),('createSystem','create_system'),('createVersion','create_version'),('extractVersion','extract_version'),('flagBits','flag_bits')]:setattr(info,field,item[key])
                    info.extra=bytes.fromhex(item['extra']);info.comment=bytes.fromhex(item['comment'])
                    result.writestr(info,data)
            with zipfile.ZipFile(path) as check:
                assert len(check.infolist())==len(package['entries'])
                for item in package['entries']:assert digest(check.read(item['name']))==item['sha256'],item['name']
            print('Verified every packaged file:',path.name,flush=True)

def web():
    out=ROOT/'out';out.mkdir(exist_ok=True)
    for lang in ['EN','SC']:
        source=ROOT/'docs' if lang=='EN' else ROOT/'desktop'/'SC'/'game'
        with zipfile.ZipFile(out/f'WebPVZ-1.0.0-{lang}-Web.zip','w',zipfile.ZIP_DEFLATED,compresslevel=6) as z:
            for path in sorted(source.rglob('*')):
                if not path.is_file():continue
                relative=path.relative_to(source)
                data=(ROOT/'build/web-sc-index.html').read_bytes() if lang=='SC' and str(relative)=='index.html' else path.read_bytes()
                if str(relative)=='index.html':assert b'data-i=' in data and b'ciphertext' in data
                z.writestr(f'WebPVZ-{lang}/{relative.as_posix()}',data)
            z.writestr(f'WebPVZ-{lang}/README.txt','WebPVZ\n\nExtract the whole archive and open index.html in a current browser. Enter the page password to play. Keep all accompanying folders. Game progress is stored in this browser.\n')
        print('Packaged protected web edition:',lang,flush=True)

if __name__=='__main__':
    web() if sys.argv[1]=='web' else desktop(sys.argv[1])
