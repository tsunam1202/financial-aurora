#!/usr/bin/env python3
"""Build deterministic static deployment and complete CDN image archives.

Python 3.10+ standard library only. Never changes source files or browser storage.
"""
from pathlib import Path
from urllib.parse import urlparse
from zipfile import ZipFile, ZipInfo, ZIP_DEFLATED
import argparse
import hashlib
import json
import re

ROOT = Path(__file__).resolve().parents[1]
IMAGE_EXTENSIONS = {'.png', '.jpg', '.jpeg', '.gif', '.webp', '.svg', '.avif', '.ico'}

def sha(data):
    return hashlib.sha256(data).hexdigest()

def encode_json(data):
    return (json.dumps(data, ensure_ascii=False, indent=2)+'\n').encode('utf-8')

def archive(path, files, stamp):
    with ZipFile(path, 'w', compression=ZIP_DEFLATED, compresslevel=6) as z:
        for name, data in sorted(files.items()):
            entry = ZipInfo(name, stamp)
            entry.compress_type = ZIP_DEFLATED
            entry.external_attr = 0o644 << 16
            z.writestr(entry, data)
    with ZipFile(path) as z:
        assert z.testzip() is None
        assert sorted(z.namelist()) == sorted(files)
        for name, data in files.items():
            assert z.read(name) == data, name

def build(output, config):
    version = config['version']
    if not re.fullmatch(r'v\d+\.\d+\.\d+(?:[-.][A-Za-z0-9]+)*',version):
        raise ValueError('version must be a version such as v1.0.0')
    base = config['imageBase'].rstrip('/')+'/'
    parsed = urlparse(base)
    if parsed.scheme != 'https' or not parsed.netloc or parsed.query or parsed.fragment or not parsed.path.endswith('/assets/'):
        raise ValueError('imageBase must be an HTTPS URL ending /assets/')
    if urlparse(config['shopURL']).scheme != 'https':
        raise ValueError('shopURL must be HTTPS')
    runtime = {'index.html': (ROOT/'index.html').read_bytes()}
    for folder, extensions in [('css',{'.css'}),('js',{'.js','.html'}),('fonts',{'.ttf','.woff','.woff2','.txt'})]:
        for path in sorted((ROOT/folder).rglob('*')):
            if path.is_file() and path.suffix in extensions:
                runtime[path.relative_to(ROOT).as_posix()] = path.read_bytes()
    images = {p.relative_to(ROOT).as_posix():p.read_bytes() for p in sorted((ROOT/'assets').rglob('*')) if p.is_file() and p.suffix.lower() in IMAGE_EXTENSIONS}
    if not images:
        raise ValueError('No image assets present')
    config_js = '''/* Generated production config. Rebuild from release.config.json. */
(() => {
  window.AuroraReleaseConfig = Object.freeze(CONFIG);
  window.AuroraAssetURL = path => new URL(String(path).replace(/^assets\\//, ''), window.AuroraReleaseConfig.imageBase).href;
})();
'''.replace('CONFIG',json.dumps({'version':version,'imageBase':base,'shopURL':config['shopURL']},ensure_ascii=False))
    runtime['js/release-config.js'] = config_js.encode('utf-8')
    html = runtime['index.html'].decode('utf-8')
    def html_image(match):
        prefix,name,quote = match.groups()
        if name not in images:
            raise FileNotFoundError('HTML image missing: '+name)
        return prefix+base+name.removeprefix('assets/')+quote
    html = re.sub(r'''((?:src|href)=["'])(assets/[^"']+)(["'])''',html_image,html)
    runtime['index.html'] = html.encode('utf-8')
    for name,data in runtime.items():
        if Path(name).suffix.lower() in IMAGE_EXTENSIONS:
            raise ValueError('Image leaked into deployment: '+name)
        if name.endswith(('.html','.css','.js')) and b'../dist/' in data:
            raise ValueError('Parent-site runtime dependency remains in '+name)
    for match in re.finditer(r'''(?:src|href)=["']([^"']+)["']''', html):
        name = match.group(1)
        if name.startswith(('https:','http:','#','data:')):
            continue
        if name not in runtime:
            raise FileNotFoundError('Runtime dependency missing: '+name)
    date = config.get('releaseDate','2026-11-05')
    stamp = tuple(map(int,date.split('-')))+(0,0,0)
    output.mkdir(parents=True, exist_ok=True)
    for kind, files in [('deploy',runtime),('images',images)]:
        unpacked = output/'unpacked'/kind
        # Do not delete any caller files. Reject unexpected stale output instead.
        if unpacked.exists():
            extra = {p.relative_to(unpacked).as_posix() for p in unpacked.rglob('*') if p.is_file()} - files.keys()
            if extra:
                raise ValueError('Use a fresh output directory; unexpected files: '+', '.join(sorted(extra)))
        for name,data in files.items():
            dest=unpacked/name
            dest.parent.mkdir(parents=True, exist_ok=True)
            dest.write_bytes(data)
        archive(output/f'Financial-Aurora-{version}-{kind}.zip', files, stamp)
    manifest = {
        'version':version,'cdnImageBase':base,
        'deployment':{'file':f'Financial-Aurora-{version}-deploy.zip','files':[{'path':n,'bytes':len(d),'sha256':sha(d)} for n,d in sorted(runtime.items())]},
        'images':{'file':f'Financial-Aurora-{version}-images.zip','uploadPrefix':parsed.path.lstrip('/').removesuffix('assets/'),'files':[{'path':n,'url':base+n.removeprefix('assets/'),'bytes':len(d),'sha256':sha(d)} for n,d in sorted(images.items())]},
        'verification':{'archiveContentsReadBack':True,'cdnUploaded':False,'cdnLiveVerification':'pending uploader','browserQA':'see separate release QA report'}
    }
    for key in ('deployment','images'):
        package=output/manifest[key]['file']
        manifest[key]['sha256']=sha(package.read_bytes())
        manifest[key]['bytes']=package.stat().st_size
    (output/f'Financial-Aurora-{version}-manifest.json').write_bytes(encode_json(manifest))
    print(json.dumps({'version':version,'output':str(output),'deploymentFiles':len(runtime),'images':len(images),'deploymentBytes':manifest['deployment']['bytes'],'imagesBytes':manifest['images']['bytes']},ensure_ascii=False))

if __name__ == '__main__':
    parser=argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--output',type=Path,default=ROOT/'release')
    parser.add_argument('--config',type=Path,default=ROOT/'release.config.json')
    parser.add_argument('--cdn',help='Override imageBase for this build only')
    args=parser.parse_args()
    config=json.loads(args.config.read_text('utf-8-sig'))
    if args.cdn:
        config['imageBase']=args.cdn
    build(args.output.resolve(),config)
