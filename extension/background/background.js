// Berichtenrouter: koppelt content scripts aan de player.
// Synthese loopt via de lokale helper (HTTP 127.0.0.1:5020): de helper-engine
// doet de HTTP-calls, de engine-router kiest per verzoek edge (cloud) of
// piper (lokaal) op basis van de gebruikersvoorkeur en de helper-health.
import { MSG, CONTROL } from '../shared/messages.js';
import { createSettings } from '../shared/settings.js';
import { resolveVoice } from '../shared/voices.js';
import { createHelperEngine } from './engines/helper-engine.js';
import { createRouter } from './engine-router.js';
import { createAudioPlayer } from './audio-player.js';
import { createPlayer } from './player.js';

// De stem wordt per sessie vastgelegd via resolveVoice op de engine die
// pickEngine koos. Bekende beperking: bij pref 'local-first' kan de engine
// mid-sessie wisselen (de router evalueert de helper-health per zin; valt
// piper weg, dan gaat het verder met edge) terwijl de stem sessie-breed
// vastligt. De helper weigert dan de vreemde stem-id; de faalmodus is een
// net error-event naar de playerbar plus een schone stop van de player
// (gedocumenteerd; automatische failover naar een passende stem volgt later).
const settings = createSettings(browser.storage.local);
// createRouter geeft een Promise; de bundle is iife (geen top-level await),
// dus de router wordt ge-await in de START-flow vóór de player start.
const routerPromise = createRouter({ helperEngine: createHelperEngine(), settings });
let player = null;
let activeTabId = null;
// Sessietoken: elke START en elke sessie-beëindiging verhoogt de teller.
// Een asynchrone START-voortzetting (settings laden) breekt af als het token
// ondertussen is verhoogd — zo gaat een STOP tijdens het opstarten niet verloren.
let sessionToken = 0;

function ensurePlayer(router) {
  if (player) return player;
  player = createPlayer({
    engine: router,
    audio: createAudioPlayer(),
    onEvent: (event) => {
      if (activeTabId == null) return;
      browser.tabs.sendMessage(activeTabId, { type: MSG.EVENT, event }).catch(() => {});
    },
  });
  return player;
}

// Beëindig de sessie: stop de player, breek een lopende START af en koppel
// de tab los. player.stop() gaat vóór het loskoppelen zodat het laatste
// state-event nog naar de (oude) actieve tab kan.
function endSession() {
  sessionToken++;
  player?.stop();
  activeTabId = null;
}

// Sluiten of wegnavigeren van de actieve tab stopt het voorlezen;
// anders speelt de audio zonder playerbar door.
browser.tabs.onRemoved.addListener((tabId) => {
  if (tabId === activeTabId) endSession();
});
browser.tabs.onUpdated.addListener((tabId, changeInfo) => {
  if (tabId === activeTabId && changeInfo.url) endSession();
});

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
    const tabId = sender.tab.id;
    // Sessie-overname: de vorige actieve tab ruimt zijn playerbar en highlights op.
    if (activeTabId !== null && activeTabId !== tabId) {
      browser.tabs.sendMessage(activeTabId, { type: MSG.EVENT, event: { type: 'taken-over' } }).catch(() => {});
    }
    activeTabId = tabId;
    const token = ++sessionToken;
    (async () => {
      const s = await settings.load();
      // Ondertussen een STOP of nieuwe START binnengekomen: niet starten.
      if (token !== sessionToken) return;
      // Laat de playerbar de ingestelde snelheid tonen vóór de eerste player-event.
      browser.tabs.sendMessage(tabId, { type: MSG.EVENT, event: { type: 'init', rate: s.rate } }).catch(() => {});
      // Kies de engine (edge/piper) vóór de stem: de voice-id's zijn
      // engine-afhankelijk. Faalt dit (helper offline, piper afwezig), dan
      // gaat de fout als error-event naar de playerbar.
      let engineNaam;
      try {
        ({ engine: engineNaam } = await (await routerPromise).pickEngine(msg.lang));
      } catch (err) {
        if (token !== sessionToken) return;
        browser.tabs.sendMessage(tabId, {
          type: MSG.EVENT,
          event: { type: 'error', message: String(err?.message || err) },
        }).catch(() => {});
        return;
      }
      if (token !== sessionToken) return;
      ensurePlayer(await routerPromise).start({
        sentences: msg.sentences,
        voice: resolveVoice(msg.lang, s.voiceOverrides, engineNaam),
        rate: s.rate,
      });
    })();
    return false;
  }
  // CONTROL is tab-gebaseerd: alleen de eigenaar van de sessie stuurt de player;
  // verlate berichten van een overgenomen tab worden genegeerd.
  if (msg.type === MSG.CONTROL && sender.tab && sender.tab.id === activeTabId) {
    const { action, value } = msg;
    // STOP geldt ook zonder player: hij breekt een lopende START af.
    if (action === CONTROL.STOP) { endSession(); return false; }
    if (!player) return false;
    if (action === CONTROL.PAUSE) player.pause();
    else if (action === CONTROL.RESUME) player.resume();
    else if (action === CONTROL.NEXT) player.seek(player.currentIndex() + 1);
    else if (action === CONTROL.PREV) player.seek(player.currentIndex() - 1);
    else if (action === CONTROL.SEEK) player.seek(value);
    else if (action === CONTROL.RATE) player.setRate(value);
    return false;
  }
  return false;
});
