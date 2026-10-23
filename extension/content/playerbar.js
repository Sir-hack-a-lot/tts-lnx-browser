// Bedieningsbalk in een closed shadow DOM, zodat pagina-CSS niet meekijkt.
import { CONTROL } from '../shared/messages.js';

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

export function createPlayerBar(doc, { onControl }) {
  const host = doc.createElement('div');
  host.id = 'tts-lnx-playerbar';
  const shadow = host.attachShadow({ mode: 'closed' });
  shadow.innerHTML = `
    <style>${BAR_CSS}</style>
    <div class="bar" role="toolbar" aria-label="Voorleesbediening">
      <button data-a="prev" aria-label="Vorige zin" title="Vorige zin">⏮</button>
      <button data-a="pause" aria-label="Pauzeren" title="Pauzeren">⏸</button>
      <button data-a="next" aria-label="Volgende zin" title="Volgende zin">⏭</button>
      <button data-a="stop" aria-label="Stoppen" title="Stoppen">⏹</button>
      <select data-a="rate" aria-label="Snelheid">
        <option value="0.5">0,5×</option>
        <option value="0.75">0,75×</option>
        <option value="1" selected>1×</option>
        <option value="1.25">1,25×</option>
        <option value="1.5">1,5×</option>
        <option value="2">2×</option>
      </select>
      <span class="engine" title="Engine: cloud (Edge TTS)">☁</span>
    </div>`;

  let playing = true;
  const pauseBtn = shadow.querySelector('[data-a="pause"]');

  shadow.querySelector('[data-a="prev"]').addEventListener('click', () => onControl(CONTROL.PREV));
  shadow.querySelector('[data-a="next"]').addEventListener('click', () => onControl(CONTROL.NEXT));
  shadow.querySelector('[data-a="stop"]').addEventListener('click', () => onControl(CONTROL.STOP));
  pauseBtn.addEventListener('click', () => {
    onControl(playing ? CONTROL.PAUSE : CONTROL.RESUME);
  });
  shadow.querySelector('[data-a="rate"]').addEventListener('change', (e) => {
    onControl(CONTROL.RATE, parseFloat(e.target.value));
  });

  return {
    el: host,
    _shadow: shadow, // alleen voor tests; closed shadow is verder afgeschermd
    setPlaying(isPlaying) {
      playing = isPlaying;
      pauseBtn.textContent = isPlaying ? '⏸' : '▶';
      pauseBtn.setAttribute('aria-label', isPlaying ? 'Pauzeren' : 'Hervatten');
    },
    destroy() { host.remove(); },
  };
}
