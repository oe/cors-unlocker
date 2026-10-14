#!/usr/bin/env python3
"""Prepare the documentation-only legacy npm patch; never publish it."""

import argparse
import base64
import hashlib
import io
import json
from pathlib import Path
import tarfile
import urllib.request


def prepare(source_bytes: bytes, root: Path, output: Path) -> Path:
    spec = json.loads((root / 'release/legacy-sdk/source.json').read_text())
    expected = spec['integrity'].removeprefix('sha512-')
    actual = base64.b64encode(hashlib.sha512(source_bytes).digest()).decode()
    if actual != expected:
        raise ValueError('Published 0.1.0 archive integrity mismatch')

    with tarfile.open(fileobj=io.BytesIO(source_bytes), mode='r:gz') as archive:
        members = archive.getmembers()
        if any(not item.isfile() for item in members):
            raise ValueError('Unexpected non-file entry in the published archive')
        original = {item.name: archive.extractfile(item).read() for item in members}

    package = json.loads(original['package/package.json'])
    if (package['name'], package['version']) != (spec['name'], spec['sourceVersion']):
        raise ValueError('Unexpected source package identity')
    package['version'] = spec['targetVersion']
    updated = dict(original)
    updated['package/package.json'] = (json.dumps(package, indent=2) + '\n').encode()
    notice = (root / 'release/legacy-sdk/migration-notice.md').read_bytes().rstrip()
    updated['package/readme.md'] = notice + b'\n\n---\n\n' + original['package/readme.md']

    output.mkdir(parents=True, exist_ok=True)
    target = output / f"{spec['name']}-{spec['targetVersion']}.tgz"
    # Preserve every published file; only package version and README may change
    with tarfile.open(target, mode='w:gz') as archive:
        for member in members:
            data = updated[member.name]
            member.size = len(data)
            archive.addfile(member, io.BytesIO(data))

    with tarfile.open(target, mode='r:gz') as archive:
        packed = {item.name: archive.extractfile(item).read() for item in archive.getmembers()}
    if set(packed) != set(original):
        raise ValueError('Package file list changed')
    for name, data in original.items():
        if name not in ('package/package.json', 'package/readme.md') and packed[name] != data:
            raise ValueError(f'Runtime file changed: {name}')
    verified_package = json.loads(packed['package/package.json'])
    verified_package['version'] = spec['sourceVersion']
    if verified_package != json.loads(original['package/package.json']):
        raise ValueError('Package metadata changed beyond the version')
    print(f'Prepared {target}')
    print('Verified identical runtime bundles, type definitions, file list and entry points')
    print('Not published. Follow docs/release-checklist.md before publishing')
    return target


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--source', type=Path, help='Use a downloaded 0.1.0 archive (integrity still checked)')
    parser.add_argument('--output', type=Path, help='Output directory; defaults to ignored artifacts/legacy-sdk')
    args = parser.parse_args()
    root = Path(__file__).resolve().parents[1]
    spec = json.loads((root / 'release/legacy-sdk/source.json').read_text())
    if args.source:
        source_bytes = args.source.read_bytes()
    else:
        with urllib.request.urlopen(spec['tarball'], timeout=30) as response:
            source_bytes = response.read()
    prepare(source_bytes, root, args.output or root / 'artifacts/legacy-sdk')


if __name__ == '__main__':
    main()
