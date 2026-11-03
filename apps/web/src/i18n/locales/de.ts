import type en from './en.js';

const de: typeof en = {
  app: {
    tagline: 'Turniersoftware',
  },
  language: {
    label: 'Sprache',
  },
  home: {
    scaffoldRunning: 'Das Projektgerüst läuft.',
    domainInBrowser: 'Domänenbibliothek im Browser: v{version}',
  },
  status: {
    server: 'Server',
    database: 'Datenbank',
    checking: 'prüfe …',
    unreachable: 'nicht erreichbar: {error}',
    serverOk: '{status} (Domäne v{version})',
  },
};

export default de;
