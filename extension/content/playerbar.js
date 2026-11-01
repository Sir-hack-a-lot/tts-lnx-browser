// Bedieningsbalk in een closed shadow DOM, zodat pagina-CSS niet meekijkt.
// De balk wordt met createElement opgebouwd (geen innerHTML): alle teksten
// zijn vertaalde strings of eigen constanten, dus DOM-bouw is net zo
// duidelijk en houdt de AMO-linter stil.
import { CONTROL } from '../shared/messages.js';
import { msg, uiLanguage } from '../shared/i18n.js';

const BAR_CSS = `
  .bar {
    position: fixed; bottom: 12px; left: 50%; transform: translateX(-50%);
    display: flex; gap: 6px; align-items: center;
    background: #263238; color: #fff; border-radius: 24px; padding: 8px 14px;
    box-shadow: 0 2px 12px rgba(0,0,0,.4); z-index: 2147483647;
    font: 14px/1 system-ui, sans-serif;
  }
  button {
    background: none; border: none; color: #fff; font-size: 18px; cursor: pointer;
    padding: 4px 8px; border-radius: 50%;
  }
  button:hover { background: rgba(255,255,255,.15); }
  select { background: #37474f; color: #fff; border: none; border-radius: 4px; padding: 4px; }
  .engine { font-size: 16px; margin-left: 4px; }
`;

const RATES = [0.5, 0.75, 1, 1.25, 1.5, 2];

export function createPlayerBar(doc, { onControl }) {
  const host = doc.createElement('div');
  host.id = 'tts-lnx-playerbar';
  const shadow = host.attachShadow({ mode: 'closed' });

  const style = doc.createElement('style');
  style.textContent = BAR_CSS;
  shadow.appendChild(style);

  const barEl = doc.createElement('div');
  barEl.className = 'bar';
  barEl.setAttribute('role', 'toolbar');
  barEl.setAttribute('aria-label', msg('playerbarLabel'));
  shadow.appendChild(barEl);

  const addButton = (action, labelKey, icon) => {
    const btn = doc.createElement('button');
    btn.dataset.a = action;
    btn.setAttribute('aria-label', msg(labelKey));
    btn.title = msg(labelKey);
    btn.textContent = icon;
    barEl.appendChild(btn);
    return btn;
  };
  addButton('prev', 'playerbarPrev', '⏮');
  const pauseBtn = addButton('pause', 'playerbarPause', '⏸');
  addButton('next', 'playerbarNext', '⏭');
  addButton('stop', 'playerbarStop', '⏹');

  // Decimaalteken volgt de UI-taal (0,5× in het Nederlands, 0.5× in het Engels).
  const rateFmt = new Intl.NumberFormat(uiLanguage());
  const rateSelect = doc.createElement('select');
  rateSelect.dataset.a = 'rate';
  rateSelect.setAttribute('aria-label', msg('playerbarRate'));
  for (const r of RATES) {
    const opt = doc.createElement('option');
    opt.value = String(r);
    opt.textContent = `${rateFmt.format(r)}×`;
    if (r === 1) opt.selected = true;
    rateSelect.appendChild(opt);
  }
  barEl.appendChild(rateSelect);

  const engineEl = doc.createElement('span');
  engineEl.className = 'engine';
  engineEl.title = msg('engineTooltipCloud');
  engineEl.textContent = '☁';
  barEl.appendChild(engineEl);

  let playing = true;

  shadow.querySelector('[data-a="prev"]').addEventListener('click', () => onControl(CONTROL.PREV));
  shadow.querySelector('[data-a="next"]').addEventListener('click', () => onControl(CONTROL.NEXT));
  shadow.querySelector('[data-a="stop"]').addEventListener('click', () => onControl(CONTROL.STOP));
  pauseBtn.addEventListener('click', () => {
    onControl(playing ? CONTROL.PAUSE : CONTROL.RESUME);
  });
  rateSelect.addEventListener('change', (e) => {
    onControl(CONTROL.RATE, parseFloat(e.target.value));
  });

  return {
    el: host,
    _shadow: shadow, // alleen voor tests; closed shadow is verder afgeschermd
    setPlaying(isPlaying) {
      playing = isPlaying;
      pauseBtn.textContent = isPlaying ? '⏸' : '▶';
      pauseBtn.setAttribute('aria-label', msg(isPlaying ? 'playerbarPause' : 'playerbarResume'));
    },
    setRate(r) {
      rateSelect.value = String(r);
    },
    // Engine-indicator: wolkje = cloud (Edge TTS via helper), huisje = lokaal
    // (Piper). De tooltip maakt expliciet waar de paginatekst heen gaat.
    setEngine(engine) {
      if (engine === 'piper') {
        engineEl.textContent = '🏠';
        engineEl.title = msg('engineTooltipLocal');
      } else {
        engineEl.textContent = '☁';
        engineEl.title = msg('engineTooltipCloud');
      }
    },
    destroy() { host.remove(); },
  };
}
