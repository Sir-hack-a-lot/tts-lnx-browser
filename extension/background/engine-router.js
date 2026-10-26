// Engine-router: kiest per synthesize-verzoek tussen 'edge' (cloud via de
// helper) en 'piper' (lokaal), op basis van de gebruikersvoorkeur
// (settings.enginePref) én de actuele helper-health.
//
// Interface:
//   createRouter({ helperEngine, settings }) → Promise van {
//     async pickEngine(lang?) → { engine: 'edge'|'piper', synthesize }
//       - gooit Error('helper-offline') als de helper niet bereikbaar is
//       - gooit Error('piper niet beschikbaar') bij pref 'local' zonder piper
//       - `synthesize` is een dunne wrapper die `engine` invult en doorgeeft
//         aan helperEngine.synthesize({ ...request, engine })
//     async synthesize(request) → resultaat van helperEngine.synthesize
//   }
//
// De router roept bij ELKE synthesize-aanroep opnieuw helperEngine.health()
// aan: de helper kan tussentijds starten, stoppen of van engine-status
// veranderen, dus health wordt bewust niet gecachet. Roep engine-methodes
// daarom altijd als method-call aan (helperEngine.health()), nooit
// gedestructureerd — available() gebruikt intern `this.health()`.
//
// Logica per pref:
//   'cloud'       → altijd edge (helper moet online zijn)
//   'local'       → piper; piper afwezig/uit → Error('piper niet beschikbaar')
//   'local-first' → piper als beschikbaar, anders edge
// Geeft een Promise terug: de test- en aanroepcode gebruikt
// `await createRouter(...)` resp. `createRouter(...).then(...)`.
export function createRouter(deps) {
  return Promise.resolve(maakRouter(deps));
}

function maakRouter({ helperEngine, settings }) {
  async function pickEngine() {
    const { enginePref = 'cloud' } = await settings.load();
    const health = await helperEngine.health();
    if (!health) throw new Error('helper-offline');

    const piperOk = health.engines?.piper === true;

    let engine;
    if (enginePref === 'cloud') {
      engine = 'edge';
    } else if (enginePref === 'local') {
      if (!piperOk) throw new Error('piper niet beschikbaar');
      engine = 'piper';
    } else {
      // 'local-first': piper als die er is, anders edge.
      engine = piperOk ? 'piper' : 'edge';
    }

    return {
      engine,
      // Dunne wrapper: vult de gekozen engine in en delegeert aan de helper.
      synthesize: (request) => helperEngine.synthesize({ ...request, engine }),
    };
  }

  return {
    pickEngine,
    async synthesize(request) {
      const { synthesize } = await pickEngine(request?.lang);
      return synthesize(request);
    },
  };
}
