// Berichtenrouter: koppelt content scripts aan de player.
import { MSG, CONTROL } from '../shared/messages.js';
import { createSettings } from '../shared/settings.js';
import { resolveVoice } from '../shared/voices.js';
import { createEdgeEngine } from './engines/edge-tts.js';
import { createAudioPlayer } from './audio-player.js';
import { createPlayer } from './player.js';

const settings = createSettings(browser.storage.local);
const engine = createEdgeEngine();
let player = null;
let activeTabId = null;

function ensurePlayer() {
  if (player) return player;
  player = createPlayer({
    engine,
    audio: createAudioPlayer(),
    onEvent: (event) => {
      if (activeTabId == null) return;
      browser.tabs.sendMessage(activeTabId, { type: MSG.EVENT, event }).catch(() => {});
    },
  });
  return player;
}

// Werkbalkknop of Alt+R: content script beslist (start of stop).
async function toggle(tab) {
  try {
    await browser.tabs.sendMessage(tab.id, { type: MSG.TOGGLE });
  } catch {
    // Pagina zonder content script (about:*, addons.mozilla.org) — negeren.
  }
}

browser.browserAction.onClicked.addListener(toggle);
browser.commands?.onCommand.addListener(async (command) => {
  if (command !== 'toggle-read') return;
  const [tab] = await browser.tabs.query({ active: true, currentWindow: true });
  if (tab) await toggle(tab);
});

browser.runtime.onMessage.addListener((msg, sender) => {
  if (msg.type === MSG.START && sender.tab) {
    activeTabId = sender.tab.id;
    (async () => {
      const s = await settings.load();
      ensurePlayer().start({
        sentences: msg.sentences,
        voice: resolveVoice(msg.lang, s.voiceOverrides),
        rate: s.rate,
      });
    })();
    return false;
  }
  if (msg.type === MSG.CONTROL && player) {
    const { action, value } = msg;
    if (action === CONTROL.PAUSE) player.pause();
    else if (action === CONTROL.RESUME) player.resume();
    else if (action === CONTROL.NEXT) player.seek(player.currentIndex() + 1);
    else if (action === CONTROL.PREV) player.seek(player.currentIndex() - 1);
    else if (action === CONTROL.SEEK) player.seek(value);
    else if (action === CONTROL.STOP) player.stop();
    else if (action === CONTROL.RATE) player.setRate(value);
    return false;
  }
  return false;
});
