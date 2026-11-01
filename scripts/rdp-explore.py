#!/usr/bin/env python3
# RDP-verkenner: getTarget/attach/evaluate op een tab-descriptor.
# Gebruik: rdp-explore.py <poort> <descriptorActor> [js-expressie]
import json
import sys

sys.path.insert(0, '/home/randy/TTS_LNX_Browser/scripts')
from rdp import RDP  # noqa: E402


def main():
    port, desc = int(sys.argv[1]), sys.argv[2]
    js = sys.argv[3] if len(sys.argv) > 3 else None
    rdp = RDP(port)

    target = rdp.request(desc, 'getTarget', pred=lambda d: 'frame' in d or 'target' in d or 'error' in d)
    print('TARGET:', json.dumps(target)[:500])
    frame = target.get('frame') or target.get('target') or {}
    actor = frame.get('actor')
    console = frame.get('consoleActor')
    print('actor:', actor, '| consoleActor:', console)

    if actor and not console:
        att = rdp.request(actor, 'attach', pred=lambda d: 'consoleActor' in d or 'error' in d)
        print('ATTACH:', json.dumps(att)[:400])
        console = att.get('consoleActor')

    if js and console:
        res = rdp.request(console, 'evaluateJSAsync', timeout=60,
                          pred=lambda d: ('result' in d or 'error' in d or 'exception' in d),
                          text=js, mapped={'await': True}, eager=False)
        print('RESULT:', json.dumps(res)[:800])


if __name__ == '__main__':
    main()
