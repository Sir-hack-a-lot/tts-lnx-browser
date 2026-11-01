// Berichttypen tussen content script en background page.
export const MSG = {
  TOGGLE: 'tts.toggle',   // background → content: werkbalkknop/sneltoets ingedrukt
  START: 'tts.start',     // content → background: {sentences, lang}
  CONTROL: 'tts.control', // content → background: {action, value?}
  EVENT: 'tts.event',     // background → content: {event}
  READ_SELECTION: 'tts.read-selection', // background → content: contextmenu op selectie
  VIEWER_HELLO: 'tts.viewer-hello',     // viewer → background: registreer tab-id
};

export const CONTROL = {
  PAUSE: 'pause', RESUME: 'resume', NEXT: 'next', PREV: 'prev',
  STOP: 'stop', SEEK: 'seek', RATE: 'rate',
};
