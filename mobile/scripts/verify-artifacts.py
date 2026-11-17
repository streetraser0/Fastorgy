#!/usr/bin/env python3
"""Audit frozen shared web assets in all native release payloads without mutation."""
import datetime
import hashlib
import json
from pathlib import Path
import sys
import subprocess
import tempfile
import zipfile

ROOT = Path(__file__).resolve().parents[2]
REPORT = Path(tempfile.gettempdir()) / 'fas-native-artifact-verification.json'
EXCLUDED = {'server', '.openai', 'drizzle'}
BRIDGE = b'<script src="native-bridge.js"></script>'
NATIVE_EXTRA = {'native-bridge.js', 'native-build.json'}
CAP_EXTRA = {'cordova.js', 'cordova_plugins.js'}
BUILD_APK = ROOT / 'mobile/android/app/build/outputs/apk/debug/app-debug.apk'
RELEASE_APK = ROOT / 'releases/fas-torgi-android-demo-debug.apk'
report = {
    'created_utc': datetime.datetime.now(datetime.timezone.utc).isoformat(),
    'expected_shared_files': None,
    'source_selection': 'Git-tracked public dist files; generated backend/hosting/migration output excluded',
    'checks': [],
    'errors': [],
    'manifests': {},
    'artifacts': {},
}

def digest(data):
    return hashlib.sha256(data).hexdigest()

def check(condition, name, detail=None):
    item = {'name': name, 'passed': bool(condition)}
    if detail is not None:
        item['detail'] = detail
    report['checks'].append(item)
    if not condition:
        report['errors'].append(item)

def directory_files(directory):
    return {p.relative_to(directory).as_posix(): p.read_bytes()
            for p in sorted(directory.rglob('*')) if p.is_file()}

def manifest(name, files):
    entries = [{'file': path, 'bytes': len(data), 'sha256': digest(data)}
               for path, data in sorted(files.items())]
    aggregate = ''.join(f"{e['sha256']}  {e['file']}\n" for e in entries).encode()
    report['manifests'][name] = {
        'count': len(entries),
        'sha256': digest(aggregate),
        'files': entries,
    }

def compare(files, expected, label):
    check(set(files) == set(expected), f'{label}: exact file set', {
        'missing': sorted(set(expected) - set(files)),
        'unexpected': sorted(set(files) - set(expected)),
    })
    for name, expected_bytes in sorted(expected.items()):
        if name in files:
            check(files[name] == expected_bytes, f'{label}: bytes {name}')

def run():
    dist_all = directory_files(ROOT / 'dist')
    shared = {name: data for name, data in dist_all.items()
              if name.split('/')[0] not in EXCLUDED}
    tracked_raw = subprocess.check_output(['git', 'ls-files', '-z', '--', 'dist'], cwd=ROOT)
    tracked = {name.decode('utf-8')[len('dist/'):] for name in tracked_raw.split(b'\0')
               if name and name.startswith(b'dist/')}
    expected_names = {name for name in tracked if name.split('/')[0] not in EXCLUDED}
    report['expected_shared_files'] = len(expected_names)
    check(bool(expected_names), 'tracked public source is nonempty')
    check(set(shared) == expected_names, 'dist public files match tracked source', {
        'missing': sorted(expected_names - set(shared)),
        'unexpected': sorted(set(shared) - expected_names),
    })
    check('index.html' in shared, 'dist has index.html')
    if 'index.html' not in shared:
        return
    check(shared['index.html'].count(BRIDGE) == 0, 'dist index has no injected native bridge')
    check(shared['index.html'].count(b'</body>') == 1, 'dist index has one body close')
    expected_shared = dict(shared)
    expected_shared['index.html'] = shared['index.html'].replace(b'</body>', BRIDGE + b'</body>', 1)
    manifest('dist_public', shared)

    payloads = {}
    for label, relative in [
        ('prepared_www', 'mobile/www'),
        ('android_assets', 'mobile/android/app/src/main/assets/public'),
        ('ios_public', 'mobile/ios/App/App/public'),
    ]:
        payloads[label] = directory_files(ROOT / relative)

    for label, path in [('android_build_apk', BUILD_APK), ('android_release_apk', RELEASE_APK)]:
        check(path.is_file(), f'{label}: artifact exists')
        if path.is_file():
            data = path.read_bytes()
            report['artifacts'][label] = {
                'path': str(path), 'bytes': len(data), 'sha256': digest(data),
            }
    if BUILD_APK.is_file() and RELEASE_APK.is_file():
        check(BUILD_APK.read_bytes() == RELEASE_APK.read_bytes(), 'release APK equals Gradle build bytes')
    if RELEASE_APK.is_file():
        with zipfile.ZipFile(RELEASE_APK) as archive:
            members = [entry.filename for entry in archive.infolist() if not entry.is_dir()]
            check(len(members) == len(set(members)), 'APK has no duplicate file entries')
            check(archive.testzip() is None, 'APK ZIP CRC integrity')
            payloads['apk_public'] = {
                name[len('assets/public/'):]: archive.read(name)
                for name in members if name.startswith('assets/public/')
            }
            forbidden_assets = [name for name in members
                                if name.startswith('assets/public/')
                                and name[len('assets/public/'):].split('/')[0] in EXCLUDED]
            check(not forbidden_assets, 'APK excludes backend output', forbidden_assets)

    prepared = payloads.get('prepared_www', {})
    for name in sorted(NATIVE_EXTRA):
        check(name in prepared, f'prepared_www has {name}')
    native_files = {name: prepared[name] for name in NATIVE_EXTRA if name in prepared}
    for label, files in payloads.items():
        extras = NATIVE_EXTRA | (CAP_EXTRA if label != 'prepared_www' else set())
        expected_names = set(expected_shared) | extras
        check(set(files) == expected_names, f'{label}: exact public file set', {
            'actual_count': len(files), 'expected_count': len(expected_names),
            'missing': sorted(expected_names - set(files)),
            'unexpected': sorted(set(files) - expected_names),
        })
        forbidden = [name for name in files if name.split('/')[0] in EXCLUDED]
        check(not forbidden, f'{label}: backend excluded', forbidden)
        for name, expected_bytes in sorted(expected_shared.items()):
            if name in files:
                check(files[name] == expected_bytes, f'{label}: shared bytes {name}')
        if 'index.html' in files:
            check(files['index.html'].count(BRIDGE) == 1, f'{label}: native bridge injected exactly once')
        for name, expected_bytes in sorted(native_files.items()):
            if name in files:
                check(files[name] == expected_bytes, f'{label}: native adapter bytes {name}')
        manifest(label, files)
    check(set(payloads) == {'prepared_www', 'android_assets', 'ios_public', 'apk_public'},
          'all four native payloads audited', {'actual': sorted(payloads)})

try:
    run()
except Exception as exc:
    check(False, 'audit completed without exception', {'type': type(exc).__name__, 'message': str(exc)})
report['passed_checks'] = sum(item['passed'] for item in report['checks'])
report['failed_checks'] = len(report['errors'])
report['success'] = not report['errors']
REPORT.write_text(json.dumps(report, ensure_ascii=False, indent=2) + '\n')
print(json.dumps({
    'report': str(REPORT), 'success': report['success'],
    'passed_checks': report['passed_checks'], 'failed_checks': report['failed_checks'],
    'artifacts': report['artifacts'],
}, ensure_ascii=False, indent=2))
if report['errors']:
    print(json.dumps(report['errors'], ensure_ascii=False, indent=2))
sys.exit(0 if report['success'] else 1)
