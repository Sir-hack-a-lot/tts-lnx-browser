#!/usr/bin/env python3
# Upload een nieuwe listed versie naar AMO: extensie-zip uploaden, wachten op
# validatie, daarna de versie aanmaken met broncode-zip en licentie.
# Gebruik: amo-upload-version.py <extensie.zip> <broncode.zip>
import json
import sys
import time
import urllib.parse

sys.path.insert(0, '/home/randy/TTS_LNX_Browser/scripts')
from amo import Amo  # noqa: E402


def main():
    ext_pad, bron_pad = sys.argv[1], sys.argv[2]
    guid = urllib.parse.quote('tts-lnx-browser@localhost', safe='')
    amo = Amo()

    with open(ext_pad, 'rb') as f:
        ext_zip = f.read()
    status, up = amo.call('POST', '/addons/upload/',
                          body={'channel': 'listed'},
                          files={'upload': (ext_pad.rsplit('/', 1)[-1], ext_zip)})
    print('upload:', status, up.get('uuid', up) if isinstance(up, dict) else up)
    if status >= 400:
        sys.exit(1)
    uuid = up['uuid']

    for _ in range(60):
        time.sleep(5)
        status, chk = amo.call('GET', f'/addons/upload/{uuid}/')
        if chk.get('processed'):
            print('validatie klaar; geldig:', chk.get('valid'))
            break
    else:
        print('validatie-timeout')
        sys.exit(1)
    if not chk.get('valid'):
        print(json.dumps(chk.get('validation'), indent=1)[:1500])
        sys.exit(1)

    with open(bron_pad, 'rb') as f:
        bron_zip = f.read()
    status, ver = amo.call('POST', f'/addons/addon/{guid}/versions/',
                           body={'upload': uuid, 'license': 'MPL-2.0'},
                           files={'source': (bron_pad.rsplit('/', 1)[-1], bron_zip)})
    print('versie:', status, ver.get('id'), ver.get('version') if isinstance(ver, dict) else ver)
    if status >= 400:
        print(json.dumps(ver)[:800])
        sys.exit(1)


if __name__ == '__main__':
    main()
