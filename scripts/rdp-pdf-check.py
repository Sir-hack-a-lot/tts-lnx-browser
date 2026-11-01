#!/usr/bin/env python3
# End-to-end-check van de PDF-flow in een draaiende Firefox (RDP, poort 6000):
# 1. installeer de extensie tijdelijk vanuit dist/
# 2. navigeer de actieve tab naar een PDF-url
# 3. controleer dat de webRequest-redirect naar de viewer ging
# 4. controleer dat pdf.js rendert (canvas + tekstlaag) en de zinnen er zijn
# Gebruik: rdp-pdf-check.py <poort> <pdf-url>
import json
import sys
import time

sys.path.insert(0, '/home/randy/TTS_LNX_Browser/scripts')
from rdp import RDP  # noqa: E402

DIST = '/home/randy/TTS_LNX_Browser/dist'

CHECK_JS = '''(async () => {
  const pages = document.querySelectorAll('.page').length;
  const spans = document.querySelectorAll('.textLayer > span').length;
  const status = document.getElementById('status')?.textContent || '';
  const canvas = document.querySelector('canvas');
  let nonBlank = false;
  if (canvas) {
    const d = canvas.getContext('2d').getImageData(0, 0, canvas.width, canvas.height).data;
    for (let i = 0; i < d.length; i += 4) {
      if (d[i] < 250 || d[i+1] < 250 || d[i+2] < 250) { nonBlank = true; break; }
    }
  }
  const tekst = document.querySelector('.textLayer')?.textContent || '';
  return { url: location.href, pages, spans, status, nonBlank,
           tekstBegin: tekst.slice(0, 80) };
})()'''


def eval_in_tab(rdp, url_part, js):
    tabs = rdp.request('root', 'listTabs', pred=lambda d: 'tabs' in d)
    matches = [t for t in tabs['tabs'] if url_part in (t.get('url') or '')]
    if not matches:
        return None
    target = rdp.request(matches[0]['actor'], 'getTarget',
                         pred=lambda d: 'frame' in d or 'target' in d or 'error' in d)
    frame = target.get('frame') or target.get('target') or {}
    console = frame.get('consoleActor')
    if not console and frame.get('actor'):
        att = rdp.request(frame['actor'], 'attach',
                          pred=lambda d: 'consoleActor' in d or 'error' in d)
        console = att.get('consoleActor')
    res = rdp.request(console, 'evaluateJSAsync', timeout=60,
                      pred=lambda d: 'result' in d or 'error' in d or 'exception' in d,
                      text=js, mapped={'await': True}, eager=False)
    result = res.get('result', {})
    if isinstance(result, dict):
        if 'value' in result:
            return result['value']
        # Object-actor: waarden uit de preview halen (geen extra roundtrip).
        props = result.get('preview', {}).get('ownProperties', {})
        if props:
            return {k: v.get('value') for k, v in props.items()}
        return result
    return result


def main():
    port, pdf_url = int(sys.argv[1]), sys.argv[2]
    rdp = RDP(port)

    root = rdp.request('root', 'getRoot', pred=lambda d: 'addonsActor' in d)
    addons = root['addonsActor']
    inst = rdp.request(addons, 'installTemporaryAddon',
                       pred=lambda d: 'addon' in d or 'error' in d, addonPath=DIST)
    if 'error' in inst:
        print('INSTALLATIE-FOUT:', json.dumps(inst)[:400])
        sys.exit(1)
    print('extensie geïnstalleerd:', inst['addon'].get('id'))

    # Navigeren in een NIEUW tabblad: een in-place navigatie naar de viewer
    # (extension-page) laat de devtools-server crashen op de target-wissel.
    nav = eval_in_tab(rdp, 'about:', f'window.open({json.dumps(pdf_url)}, "_blank"), "nav"')
    print('navigatie gestart:', nav)

    laatste = None
    for _ in range(30):
        time.sleep(1)
        laatste = eval_in_tab(rdp, 'viewer.html', CHECK_JS)
        if laatste and laatste.get('pages') and laatste.get('spans'):
            break
    print('RESULT:', json.dumps(laatste, ensure_ascii=False))

    ok = (laatste
          and 'viewer.html?src=' in laatste.get('url', '')
          and laatste['pages'] == 1
          and laatste['spans'] >= 3
          and laatste['nonBlank']
          and 'eerste zin' in laatste.get('tekstBegin', ''))
    print('PDF-CHECK:', 'OK' if ok else 'MISLUKT')
    sys.exit(0 if ok else 1)


if __name__ == '__main__':
    main()
