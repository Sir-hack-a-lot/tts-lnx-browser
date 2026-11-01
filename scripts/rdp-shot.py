#!/usr/bin/env python3
# Screenshot via de RDP screenshotActor van Firefox zelf.
# Gebruik: rdp-shot.py <poort> <uitvoer.png> [url-substring-van-tab]
import base64
import json
import sys

sys.path.insert(0, '/home/randy/TTS_LNX_Browser/scripts')
from rdp import RDP  # noqa: E402


def main():
    port, out = int(sys.argv[1]), sys.argv[2]
    url_part = sys.argv[3] if len(sys.argv) > 3 else None
    extra = json.loads(sys.argv[4]) if len(sys.argv) > 4 else {}
    rdp = RDP(port)
    root = rdp.request('root', 'getRoot', pred=lambda d: 'screenshotActor' in d)
    shot_actor = root['screenshotActor']
    kw = dict(extra)
    if url_part:
        tabs = rdp.request('root', 'listTabs', pred=lambda d: 'tabs' in d)
        tab = next((t for t in tabs['tabs'] if url_part in (t.get('url') or '')), None)
        if not tab:
            print('geen tab voor', url_part, file=sys.stderr)
            sys.exit(1)
        kw['browsingContextID'] = tab['browsingContextID']
    res = rdp.request(shot_actor, 'capture', timeout=60,
                      pred=lambda d: 'value' in d or 'error' in d, **kw)
    if 'error' in res:
        print('FOUT:', json.dumps(res)[:400])
        sys.exit(1)
    data = res['value']
    if ',' in data and data.startswith('data:'):
        data = data.split(',', 1)[1]
    with open(out, 'wb') as f:
        f.write(base64.b64decode(data))
    print('geschreven:', out)


if __name__ == '__main__':
    main()
