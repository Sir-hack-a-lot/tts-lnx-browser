// Tijdelijke MVP-entry: toont een balk als bewijs dat de extensie laadt.
import { MSG } from '../shared/messages.js';

browser.runtime.onMessage.addListener((msg) => {
  if (msg.type !== MSG.TOGGLE) return;
  const el = document.createElement('div');
  el.textContent = 'TTS-extensie actief';
  el.style.cssText = 'position:fixed;bottom:0;left:0;right:0;background:#263238;color:#fff;padding:8px;z-index:2147483647;text-align:center;font:14px sans-serif';
  document.body.appendChild(el);
});
