#!/usr/bin/env python3
# RDP-driver in één verbinding (actor-ID's zijn per connectie geldig):
# vindt een tab op URL-substring en evalueert JS in zijn context.
# Gebruik: rdp-eval.py <poort> <url-substring> <js-expressie>
import json
import sys

sys.path.insert(0, '/home/randy/TTS_LNX_Browser/scripts')
from rdp import RDP  # noqa: E402


def main():
    port, url_part, js = int(sys.argv[1]), sys.argv[2], sys.argv[3]
    rdp = RDP(port)

    tabs = rdp.request('root', 'listTabs', pred=lambda d: 'tabs' in d)
    matches = [t for t in tabs['tabs'] if url_part in (t.get('url') or '')]
    if not matches:
        print('GEEN TAB gevonden voor', url_part, file=sys.stderr)
        for t in tabs['tabs']:
            print('  beschikbaar:', t.get('url'), file=sys.stderr)
        sys.exit(1)
    desc = matches[0]['actor']
    print('# tab:', matches[0].get('url'))

    target = rdp.request(desc, 'getTarget', pred=lambda d: 'frame' in d or 'target' in d or 'error' in d)
    frame = target.get('frame') or target.get('target') or {}
    actor, console = frame.get('actor'), frame.get('consoleActor')
    print('# target actor:', actor, '| consoleActor:', console)

    if actor and not console:
        att = rdp.request(actor, 'attach', pred=lambda d: 'consoleActor' in d or 'error' in d)
        if 'error' in att:
            print('ATTACH-FOUT:', json.dumps(att)[:300])
            sys.exit(1)
        console = att.get('consoleActor')

    res = rdp.request(console, 'evaluateJSAsync', timeout=90,
                      pred=lambda d: ('result' in d or 'error' in d or 'exception' in d),
                      text=js, mapped={'await': True}, eager=False)
    print('RESULT:', json.dumps(res)[:1500])


if __name__ == '__main__':
    main()
