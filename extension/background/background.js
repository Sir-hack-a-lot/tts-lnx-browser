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
import { pdfRedirectUrl } from './pdf-redirect.js';

// PDF-navigaties omleiden naar de eigen viewer: de ingebouwde
// Firefox-PDF-viewer blokkeert content scripts, dus zonder deze redirect
// zou een PDF nooit voorgelezen kunnen worden.
const viewerBaseUrl = browser.runtime.getURL('viewer/viewer.html');
browser.webRequest?.onHeadersReceived.addListener(
  (details) => {
    const redirectUrl = pdfRedirectUrl(details, viewerBaseUrl);
    return redirectUrl ? { redirectUrl } : {};
  },
  { urls: ['http://*/*', 'https://*/*'], types: ['main_frame'] },
  ['blocking', 'responseHeaders'],
);

// Extension-pagina's (de PDF-viewer) zijn geen content scripts:
// tabs.sendMessage bereikt ze niet. Viewer-tabs registreren hun tab-id via
// VIEWER_HELLO en krijgen berichten via runtime.sendMessage met toTab-filter.
const viewerTabIds = new Set();

function sendToTab(tabId, payload) {
  if (viewerTabIds.has(tabId)) {
    browser.runtime.sendMessage({ ...payload, toTab: tabId }).catch(() => {});
  } else {
    browser.tabs.sendMessage(tabId, payload).catch(() => {});
  }
}

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
      sendToTab(activeTabId, { type: MSG.EVENT, event });
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
  viewerTabIds.delete(tabId);
  if (tabId === activeTabId) endSession();
});
browser.tabs.onUpdated.addListener((tabId, changeInfo) => {
  if (tabId === activeTabId && changeInfo.url) endSession();
});

// Werkbalkknop of Alt+R: content script (of de viewer) beslist (start of stop).
async function toggle(tab) {
  sendToTab(tab.id, { type: MSG.TOGGLE });
}

// Rechtermuisknop op een tekstselectie: lees alleen de selectie voor.
// Het menu-item is alleen zichtbaar als er tekst geselecteerd is.
const MENU_ID = 'tts-read-selection';
browser.contextMenus?.create({
  id: MENU_ID,
  title: browser.i18n.getMessage('contextMenuReadSelection'),
  contexts: ['selection'],
});
browser.contextMenus?.onClicked.addListener((info, tab) => {
  if (info.menuItemId === MENU_ID && tab?.id != null) {
    sendToTab(tab.id, { type: MSG.READ_SELECTION });
  }
});

browser.browserAction.onClicked.addListener(toggle);
browser.commands?.onCommand.addListener(async (command) => {
  if (command !== 'toggle-read') return;
  const [tab] = await browser.tabs.query({ active: true, currentWindow: true });
  if (tab) await toggle(tab);
});

browser.runtime.onMessage.addListener((msg, sender) => {
  // De PDF-viewer registreert haar tab-id zodat berichten naar haar via
  // runtime.sendMessage gerouteerd worden (tabs.sendMessage bereikt alleen
  // content scripts). Alleen onze eigen viewer-pagina mag zich aanmelden.
  if (msg.type === MSG.VIEWER_HELLO) {
    if (msg.tabId != null && sender.url?.startsWith(viewerBaseUrl)) {
      viewerTabIds.add(msg.tabId);
    }
    return false;
  }
  if (msg.type === MSG.START) {
    // Content scripts herkennen we aan sender.tab; de viewer stuurt haar
    // geregistreerde tab-id mee in het bericht.
    const tabId = sender.tab?.id ?? (viewerTabIds.has(msg.tabId) ? msg.tabId : undefined);
    if (tabId == null) return false;
    // Sessie-overname: de vorige actieve tab ruimt zijn playerbar en highlights op.
    if (activeTabId !== null && activeTabId !== tabId) {
      sendToTab(activeTabId, { type: MSG.EVENT, event: { type: 'taken-over' } });
    }
    activeTabId = tabId;
    const token = ++sessionToken;
    (async () => {
      const s = await settings.load();
      // Ondertussen een STOP of nieuwe START binnengekomen: niet starten.
      if (token !== sessionToken) return;
      // Kies de engine (edge/piper) vóór de stem: de voice-id's zijn
      // engine-afhankelijk. Faalt dit (helper offline, piper afwezig), dan
      // gaat de fout als error-event naar de playerbar.
      let engineNaam;
      try {
        ({ engine: engineNaam } = await (await routerPromise).pickEngine(msg.lang));
      } catch (err) {
        if (token !== sessionToken) return;
        sendToTab(tabId, {
          type: MSG.EVENT,
          event: { type: 'error', message: String(err?.message || err) },
        });
        return;
      }
      if (token !== sessionToken) return;
      // Laat de playerbar de ingestelde snelheid en de gekozen engine tonen
      // vóór de eerste player-event (init = rate + engine-indicator).
      sendToTab(tabId, {
        type: MSG.EVENT,
        event: { type: 'init', rate: s.rate, engine: engineNaam },
      });
      ensurePlayer(await routerPromise).start({
        sentences: msg.sentences,
        voice: resolveVoice(msg.lang, s.voiceOverrides, engineNaam),
        rate: s.rate,
      });
    })();
    return false;
  }
  // CONTROL is tab-gebaseerd: alleen de eigenaar van de sessie stuurt de player;
  // verlate berichten van een overgenomen tab worden genegeerd. De viewer
  // (geen sender.tab) stuurt haar geregistreerde tab-id mee.
  if (msg.type === MSG.CONTROL) {
    const senderTabId = sender.tab?.id ?? (viewerTabIds.has(msg.tabId) ? msg.tabId : undefined);
    if (senderTabId == null || senderTabId !== activeTabId) return false;
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
