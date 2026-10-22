// Tijdelijke MVP-entry; wordt in latere taken uitgebouwd.
import { MSG } from '../shared/messages.js';

browser.browserAction.onClicked.addListener((tab) => {
  browser.tabs.sendMessage(tab.id, { type: MSG.TOGGLE }).catch(() => {});
});
