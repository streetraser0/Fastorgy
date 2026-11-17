#!/usr/bin/env python3
"""Verify a git-archive source ZIP against one immutable commit and checkout."""
import datetime
import hashlib
import json
from pathlib import Path, PurePosixPath
import subprocess
import tempfile
import sys
import zipfile

ROOT = Path(__file__).resolve().parents[1]
REPORT = Path(tempfile.gettempdir()) / 'fas-source-archive-verification.json'
ALLOWLIST = ['README.md', 'AGENTS.md', 'dist', 'mobile', 'tests', 'REVIEW.md', 'worker', 'scripts', 'drizzle',
             'docs', 'integrations', 'reports', '.gitignore', '.openai/hosting.json', 'releases/.gitignore']
PREFIX = 'fas-torgi/'
report = {
    'created_utc': datetime.datetime.now(datetime.timezone.utc).isoformat(),
    'allowlist': ALLOWLIST, 'prefix': PREFIX,
    'checks': [], 'mismatches': [], 'files': [], 'declared_export_conversions': [],
}

def digest(data):
    return hashlib.sha256(data).hexdigest()

def git(*args):
    return subprocess.run(['git', *args], cwd=ROOT, check=True,
                          stdout=subprocess.PIPE, stderr=subprocess.PIPE).stdout

def check(condition, name, detail=None):
    item = {'name': name, 'passed': bool(condition)}
    if detail is not None:
        item['detail'] = detail
    report['checks'].append(item)
    if not condition:
        report['mismatches'].append(item)

def prohibited(path):
    p = PurePosixPath(path)
    parts = p.parts
    reasons = []
    if path.startswith(('dist/server/', 'dist/.openai/', 'dist/drizzle/')):
        reasons.append('generated web backend or hosting metadata')
    if '.openai' in parts and path != '.openai/hosting.json':
        reasons.append('unexpected hosting metadata')
    if any(part in {'node_modules', '.android-sdk', '.gradle-cache', '.jdk', '.gradle',
                    '.git', '.aws', '.codex', '.agents', 'Pods', '__pycache__'} for part in parts):
        reasons.append('dependency, cache, or private configuration directory')
    if path.startswith(('mobile/www/', 'mobile/ios/App/App/public/',
                        'mobile/android/app/src/main/assets/public/')):
        reasons.append('generated native web payload')
    if path.startswith('mobile/') and any(part == 'build' for part in parts[:-1]):
        reasons.append('native build output directory')
    if path == 'mobile/android/local.properties':
        reasons.append('machine-specific Android configuration')
    if p.suffix.lower() in {'.apk', '.aab', '.ipa', '.zip', '.keystore', '.jks', '.p12', '.pfx', '.mobileprovision', '.pem', '.key'}:
        reasons.append('release binary or private signing material')
    if p.name in {'id_rsa', 'id_ed25519', '.env'} or (p.name.startswith('.env.') and p.name not in {'.env.example', '.env.sample', '.env.template'}):
        reasons.append('secret configuration filename')
    return reasons

def run():
    if len(sys.argv) != 3:
        raise ValueError('usage: verify-source-archive.py COMMIT_SHA ZIP_PATH')
    commit = git('rev-parse', '--verify', sys.argv[1] + '^{commit}').decode().strip()
    archive_path = Path(sys.argv[2]).resolve()
    report['commit'] = commit
    report['archive_path'] = str(archive_path)
    archive_bytes = archive_path.read_bytes()
    report['archive_bytes'] = len(archive_bytes)
    report['archive_sha256'] = digest(archive_bytes)
    raw_tree = git('ls-tree', '-r', '-z', '--full-tree', commit, '--', *ALLOWLIST)
    expected = {}
    for entry in raw_tree.split(b'\0'):
        if not entry:
            continue
        metadata, path_bytes = entry.split(b'\t', 1)
        mode, kind, oid = metadata.decode().split()
        path = path_bytes.decode('utf-8')
        check(kind == 'blob', f'git tree entry is blob: {path}')
        if kind == 'blob':
            expected[path] = {'mode': mode, 'oid': oid}
    report['expected_file_count'] = len(expected)
    check(bool(expected), 'git allowlist is nonempty')
    for path in sorted(expected):
        reasons = prohibited(path)
        check(not reasons, f'expected source excludes generated/private output: {path}', reasons)
    blob_cache = {}
    with zipfile.ZipFile(archive_path) as archive:
        infos = archive.infolist()
        names = [entry.filename for entry in infos]
        check(len(names) == len(set(names)), 'ZIP has no duplicate entries')
        check(archive.testzip() is None, 'ZIP CRC integrity')
        invalid_paths = [name for name in names
                         if not name.startswith(PREFIX)
                         or '..' in PurePosixPath(name).parts
                         or name.startswith('/') or '\\' in name]
        check(not invalid_paths, 'all ZIP entries use safe source prefix', invalid_paths)
        file_infos = [entry for entry in infos if not entry.is_dir()]
        actual = {entry.filename[len(PREFIX):]: entry
                  for entry in file_infos if entry.filename.startswith(PREFIX)}
        report['archive_file_count'] = len(file_infos)
        check(set(actual) == set(expected), 'ZIP exact expected git blob set', {
            'missing': sorted(set(expected) - set(actual)),
            'unexpected': sorted(set(actual) - set(expected)),
        })
        for path, info in sorted(actual.items()):
            reasons = prohibited(path)
            check(not reasons, f'ZIP excludes generated/private output: {path}', reasons)
            if path not in expected:
                continue
            oid = expected[path]['oid']
            if oid not in blob_cache:
                blob_cache[oid] = git('cat-file', 'blob', oid)
            raw_bytes = blob_cache[oid]
            expected_bytes = git('cat-file', '--filters', '--path=' + path, oid)
            if expected_bytes != raw_bytes:
                attributes = git('check-attr', 'eol', '--', path).decode().strip()
                declared_attributes = git('show', commit + ':mobile/.gitattributes').decode()
                check(path == 'mobile/android/gradlew.bat'
                      and attributes.endswith(': eol: crlf')
                      and '*.bat text eol=crlf' in declared_attributes
                      and b'\r' not in raw_bytes
                      and expected_bytes == raw_bytes.replace(b'\n', b'\r\n'),
                      f'Git export conversion is exact committed CRLF rule: {path}')
                report['declared_export_conversions'].append({
                    'file': path, 'reason': 'mobile/.gitattributes: *.bat text eol=crlf',
                    'raw_blob_bytes': len(raw_bytes), 'export_bytes': len(expected_bytes),
                    'raw_blob_sha256': digest(raw_bytes), 'export_sha256': digest(expected_bytes),
                })
            actual_bytes = archive.read(info)
            check(actual_bytes == expected_bytes, f'ZIP exported bytes match commit with declared Git attributes: {path}')
            checkout = ROOT / path
            check(checkout.is_file(), f'checkout file exists: {path}')
            if checkout.is_file():
                check(checkout.read_bytes() == expected_bytes, f'checkout bytes match commit: {path}')
            report['files'].append({'file': path, 'bytes': len(actual_bytes),
                                    'sha256': digest(actual_bytes), 'raw_blob_sha256': digest(raw_bytes), 'git_blob': oid})
    current_commit = git('rev-parse', 'HEAD').decode().strip()
    report['checkout_head'] = current_commit
    check(current_commit == commit, 'checkout HEAD equals release commit')

try:
    run()
except Exception as exc:
    check(False, 'audit completed without exception', {'type': type(exc).__name__, 'message': str(exc)})
report['passed_checks'] = sum(item['passed'] for item in report['checks'])
report['failed_checks'] = len(report['mismatches'])
report['success'] = not report['mismatches']
REPORT.write_text(json.dumps(report, ensure_ascii=False, indent=2) + '\n')
print(json.dumps({key: report.get(key) for key in [
    'success', 'commit', 'expected_file_count', 'archive_file_count', 'archive_path',
    'archive_bytes', 'archive_sha256', 'passed_checks', 'failed_checks',
]}, ensure_ascii=False, indent=2))
print('Report:', REPORT)
if report['mismatches']:
    print(json.dumps(report['mismatches'], ensure_ascii=False, indent=2))
sys.exit(0 if report['success'] else 1)
