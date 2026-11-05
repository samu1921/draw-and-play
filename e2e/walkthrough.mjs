// End-to-end walkthrough of the tournament day UI, with screenshots: `npm run e2e` (needs the Docker stack running).
// Runs inside the Playwright Docker image, so no browser has to be installed locally.
import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { chromium } from 'playwright-core';

if (!process.env.ADMIN_PASSWORD && existsSync('.env')) process.loadEnvFile('.env');
const BASE = process.env.BASE ?? 'http://localhost:8080';
const OUT = process.env.OUT ?? 'e2e/screenshots/';
const password = process.env.ADMIN_PASSWORD;
if (!password) throw new Error('ADMIN_PASSWORD is not set (see .env.example).');
mkdirSync(OUT, { recursive: true });
const slug = `vm-demo-${Date.now().toString(36).slice(-4)}`;
const errors = [];
/** Pages that are offline on purpose */
const offline = new Set();
/** Pages that wait for the viewer code or the PIN: their first requests are refused on purpose */
const locked = new Set();

const browser = await chromium.launch();
const watch = (page, name) => {
  page.on('pageerror', (e) => errors.push(`${name}: ${e.message}`));
  page.on('console', (m) => {
    if (m.type() !== 'error') return;
    // Failed requests are the point while a page is deliberately offline.
    if (offline.has(name) && /ERR_INTERNET_DISCONNECTED/.test(m.text())) return;
    if (locked.has(name) && /status of 401/.test(m.text())) return;
    errors.push(`${name}: ${m.text()}`);
  });
};
const shot = (page, name, fullPage = true) => page.screenshot({ path: `${OUT}${name}.png`, fullPage });
const step = (text) => console.log(`• ${text}`);
/** Opens a section of the event from its navigation (sidebar or tabs) */
const section = (page, name) => page.getByRole('navigation', { name: 'Bereiche der Veranstaltung' }).getByRole('link', { name, exact: true }).click();

process.on('unhandledRejection', async (error) => {
  console.error('FAILED:', error.message.split('\n')[0]);
  for (const ctx of browser.contexts()) for (const [i, p] of ctx.pages().entries()) await p.screenshot({ path: `${OUT}failure-${i}.png`, fullPage: true }).catch(() => {});
  console.log(JSON.stringify({ errors }, null, 2));
  process.exit(1);
});

// --- Tournament desk ---
const desk = await browser.newContext({ locale: 'de-DE', viewport: { width: 1360, height: 900 } });
const admin = await desk.newPage();
watch(admin, 'admin');

step('login');
await admin.goto(`${BASE}/admin`);
await admin.getByLabel('Benutzername').fill('admin');
await admin.getByLabel('Passwort').fill(password);
await admin.locator('form button[type=submit]').click();
await admin.waitForURL(`${BASE}/admin`);

step('create event');
await admin.getByRole('button', { name: 'Neue Veranstaltung' }).click();
await admin.getByLabel('Name', { exact: true }).fill('Vereinsmeisterschaft Demo');
await admin.getByLabel(/Kurzname/).fill(slug);
await admin.getByLabel('Tische').fill('4');
await admin.getByRole('button', { name: 'Veranstaltung anlegen' }).click();
await admin.waitForURL(/\/admin\/events\/[0-9a-f-]+$/);
const eventId = admin.url().split('/').pop();
await admin.getByRole('heading', { name: 'Vorbereitung' }).waitFor();
await shot(admin, '00-event-overview');

step('players via CSV import');
const players = [
  ['Anna', 'Berger', 'TTC Nord', 1720], ['Ben', 'Krüger', 'SV Süd', 1690], ['Clara', 'Wolf', 'TTC Nord', 1655],
  ['David', 'Schulz', 'TSG West', 1610], ['Emma', 'Lang', 'SV Süd', 1580], ['Felix', 'Hahn', 'TSG West', 1555],
  ['Greta', 'Vogel', 'TTC Nord', 1520], ['Hannes', 'Roth', 'SV Süd', 1490], ['Ida', 'Fuchs', 'TSG West', 1460],
  ['Jonas', 'Brandt', 'TTC Nord', 1430],
];
// As Excel saves it in German: semicolons, a byte order mark, one broken row that gets left out
const csvFile = `${OUT}players.csv`;
writeFileSync(
  csvFile,
  `\uFEFFVorname;Nachname;Verein;QTTR;Jahrgang\r\n${players.map((p) => `${p.join(';')};2000`).join('\r\n')}\r\nKaputt;Zeile;;;20x0\r\n`,
);
await section(admin, 'Spieler');
await admin.getByLabel('CSV-Datei').setInputFiles(csvFile);
await admin.getByText('10 neu, 0 vorhanden, 1 mit Fehlern').waitFor();
await shot(admin, '00-import-preview');
await admin.getByRole('button', { name: '10 Spieler importieren' }).click();
await admin.getByText('10 Spieler angelegt').waitFor();
const imported = (await (await admin.request.get(`${BASE}/api/events/${eventId}/persons`)).json()).persons;
const personIds = players.map(([firstName]) => imported.find((p) => p.firstName === firstName).id);

step('create competition via form');
await section(admin, 'Konkurrenzen');
await admin.getByLabel('Name', { exact: true }).fill('Einzel');
await admin.getByLabel('Erwartete Teilnehmer').fill('10');
await admin.getByLabel('Modus').selectOption('g2-top2');
await admin.getByRole('button', { name: 'Konkurrenz anlegen' }).click();
await admin.waitForURL(/competitions\/[0-9a-f-]+$/);

step('enter players and draw');
await admin.locator('.check-grid input[type=checkbox]').nth(9).waitFor();
for (const box of await admin.locator('.check-grid input[type=checkbox]').all()) await box.check();
await admin.getByRole('button', { name: 'Auswahl melden' }).click();
await admin.getByText('Meldungen (10)').waitFor();
await shot(admin, '01-competition-entries');
await admin.getByLabel('Seed (optional)').fill('demo');
await admin.getByRole('button', { name: 'Auslosen', exact: true }).click();
await admin.getByText('Ausgelost mit Seed demo').waitFor();
await admin.waitForTimeout(400);
await shot(admin, '02-competition-drawn');

step('second competition (hobby) via API, sharing players');
const hobby = await (await admin.request.post(`${BASE}/api/events/${eventId}/competitions`, {
  data: { name: 'Hobby', gamesToWin: 2, format: { groups: { groupCount: 1 } } },
})).json();
for (const id of personIds.slice(6, 10)) {
  await admin.request.post(`${BASE}/api/competitions/${hobby.competition.id}/entries`, { data: { personIds: [id] } });
}
await admin.request.post(`${BASE}/api/competitions/${hobby.competition.id}/draw`, { data: { seed: 'hobby' } });

step('guest with a first name only via form');
await section(admin, 'Spieler');
await admin.getByLabel('Vorname').fill('Gast');
await admin.getByRole('button', { name: 'Hinzufügen', exact: true }).click();
await admin.getByRole('rowheader', { name: 'Gast', exact: true }).waitFor();
await shot(admin, '02b-persons');

step('legal links of the event');
await section(admin, 'Einstellungen');
await admin.getByLabel('Impressum (URL)').fill('https://ttc.example/impressum');
await admin.getByLabel('Datenschutz (URL)').fill('https://ttc.example/datenschutz');
await admin.getByLabel(/Hinweis auf den öffentlichen Seiten/).fill('Namen, Vereine und Ergebnisse werden hier veröffentlicht.');
await admin.locator('section:has(#legal-title)').getByRole('button', { name: 'Speichern', exact: true }).click();
await admin.getByText('Gespeichert.').waitFor();

step('PIN');
// New events keep their public views behind a viewer code
const viewerCode = (await (await admin.request.get(`${BASE}/api/events/${eventId}`)).json()).event.viewerCode;
if (!/^[A-Z0-9]{6}$/.test(viewerCode ?? '')) errors.push(`viewer code missing: ${viewerCode}`);
await section(admin, 'Einstellungen');
await admin.getByRole('button', { name: 'Neue PIN erzeugen' }).click();
const pinText = await admin.locator('.pin-display[role=status]').textContent();
const pin = /(\d{6})/.exec(pinText)[1];
await shot(admin, '03-setup');

step('call matches at the desk');
await section(admin, 'Spielbetrieb');
await admin.locator('.queue-item').first().waitFor();
await admin.getByRole('heading', { name: 'Prognose' }).waitFor();
await admin.getByText(/≈ \d{2}:\d{2} · Tisch/).first().waitFor();
for (let i = 0; i < 3; i++) {
  await admin.locator('.queue-item:not(.blocked) button:has-text("Aufrufen")').first().click();
  await admin.waitForTimeout(600);
}
await shot(admin, '04-desk');

// --- Phone at table 1 ---
step('phone: PIN and result');
const phoneContext = await browser.newContext({ locale: 'de-DE', viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
const phone = await phoneContext.newPage();
watch(phone, 'phone');
locked.add('phone');
await phone.goto(`${BASE}/e/${slug}/table/1`);
await phone.getByLabel('PIN').fill(pin);
await shot(phone, '05-phone-pin');
await phone.getByRole('button', { name: 'Weiter' }).tap();
await phone.getByText('Ergebnis', { exact: true }).waitFor();
locked.delete('phone');
for (const key of ['4', 'next', 'minus', '5', 'next', '9', 'next', '7']) {
  const name = key === 'next' ? /Nächster Satz/ : key === 'minus' ? 'Rechte Seite gewinnt diesen Satz' : key;
  await phone.getByRole('button', { name, exact: typeof name === 'string' }).tap();
}
await shot(phone, '06-phone-entry');
await phone.getByRole('button', { name: 'Ergebnis speichern' }).tap();
await phone.getByText('Danke!').waitFor();
await shot(phone, '07-phone-saved');

step('phone: result in a dead spot');
// The service worker keeps the app shell, the page its last data: a reload without a connection still works.
await phone.evaluate(() => navigator.serviceWorker.ready.then(() => true));
await phone.goto(`${BASE}/e/${slug}/table/2`);
await phone.getByText('Ergebnis', { exact: true }).waitFor();
await phoneContext.setOffline(true);
offline.add('phone');
await phone.reload();
await phone.getByText('Ergebnis', { exact: true }).waitFor();
for (const key of ['3', 'next', '3', 'next', '3']) {
  const name = key === 'next' ? /Nächster Satz/ : key;
  await phone.getByRole('button', { name, exact: typeof name === 'string' }).tap();
}
await phone.getByRole('button', { name: 'Ergebnis speichern' }).tap();
await phone.getByText('Auf diesem Handy gespeichert', { exact: true }).waitFor();
await shot(phone, '07b-phone-queued');
await phoneContext.setOffline(false);
await phone.getByText('Danke!').waitFor({ timeout: 30_000 });
offline.delete('phone');

await admin.waitForTimeout(800);
await shot(admin, '08-desk-after-phone');

// --- Projector ---
step('projector');
const beamer = await (await browser.newContext({ locale: 'de-DE', viewport: { width: 1920, height: 1080 } })).newPage();
watch(beamer, 'display');
locked.add('display');
// The projector link carries the code, so nobody has to type it there
await beamer.goto(`${BASE}/e/${slug}/display?code=${viewerCode}`);
await beamer.locator('.table-card').first().waitFor();
locked.delete('display');
await shot(beamer, '09-display-tables', false);
await beamer.keyboard.press('ArrowRight');
await beamer.waitForTimeout(800);
await shot(beamer, '10-display-next', false);
await beamer.keyboard.press('ArrowRight');
await beamer.waitForTimeout(800);
await shot(beamer, '11-display-competition', false);

// --- Public view ---
step('public');
const visitor = await (await browser.newContext({ locale: 'en-US', viewport: { width: 1280, height: 900 } })).newPage();
watch(visitor, 'public');
locked.add('public');
await visitor.goto(`${BASE}/e/${slug}`);
await visitor.getByLabel('Code', { exact: true }).fill(viewerCode.toLowerCase());
await shot(visitor, '12a-public-code');
await visitor.getByRole('button', { name: 'Open', exact: true }).click();
await visitor.locator('.table-card').first().waitFor();
locked.delete('public');
await shot(visitor, '12-public-overview');
await visitor.getByRole('link', { name: 'Einzel' }).click();
await visitor.locator('.standings').first().waitFor();
await shot(visitor, '13-public-competition');
const imprint = visitor.locator('.legal-footer a', { hasText: 'Legal notice' });
if ((await imprint.getAttribute('href')) !== 'https://ttc.example/impressum') errors.push('public footer: legal notice link missing');
if (!(await visitor.locator('.legal-footer').innerText()).includes('Namen, Vereine und Ergebnisse')) errors.push('public footer: privacy note missing');
// Served through Caddy, so the security headers are in place
const headers = (await visitor.request.get(`${BASE}/`)).headers();
if (!headers['content-security-policy']?.includes("script-src 'self'")) errors.push('Content-Security-Policy header missing');

step('audit log');
await admin.goto(`${BASE}/admin/events/${eventId}/audit`);
await admin.getByRole('cell', { name: 'Ergebnis eingetragen' }).first().waitFor();
await shot(admin, '14c-audit');

step('QR sheet');
await admin.goto(`${BASE}/admin/events/${eventId}/qr`);
await admin.locator('.qr-code svg').first().waitFor();
await shot(admin, '14-qr');
await admin.goto(`${BASE}/admin/events/${eventId}/viewer-notice`);
await admin.locator('.viewer-notice svg').waitFor();
await shot(admin, '14a-viewer-notice');

step('withdraw a player after the draw');
const overviewNow = await (await admin.request.get(`${BASE}/api/events/${eventId}`)).json();
const singlesId = overviewNow.competitions.find((c) => c.name === 'Einzel').id;
const singlesState = await (await admin.request.get(`${BASE}/api/competitions/${singlesId}/state`)).json();
// Someone without a match on a table right now
const leaving = singlesState.entries.find((e) => !singlesState.matches.some((m) => m.status === 'called' && m.sides.includes(e.id)));
const leavingName = leaving.members[0].name;
await admin.goto(`${BASE}/admin/events/${eventId}/competitions/${singlesId}`);
admin.once('dialog', (dialog) => dialog.accept());
await admin.locator('.withdraw-list li', { hasText: leavingName }).getByRole('button', { name: 'Zurückziehen' }).click();
await admin.locator('.withdraw-list li', { hasText: leavingName }).getByText('zurückgezogen').waitFor();
const afterWithdraw = await (await admin.request.get(`${BASE}/api/competitions/${singlesId}/state`)).json();
const walkovers = afterWithdraw.matches.filter((m) => m.sides.includes(leaving.id) && m.result?.walkover).length;
if (walkovers < 1) errors.push(`withdrawal: expected walkovers for ${leavingName}, got ${walkovers}`);
await shot(admin, '14b-withdrawn');

step('registration desk account');
const deskUser = `meldestelle-${slug.slice(-4)}`;
await admin.goto(`${BASE}/admin/users`);
await admin.getByLabel('Benutzername').fill(deskUser);
await admin.getByLabel(/^Passwort/).fill('meldestelle-passwort');
await admin.locator('form.fields select').selectOption('desk');
await admin.getByRole('button', { name: 'Benutzer anlegen' }).click();
await admin.getByText('Benutzer angelegt.').waitFor();
await shot(admin, '14d-users');

const deskContext = await browser.newContext({ locale: 'de-DE', viewport: { width: 1360, height: 900 } });
const deskPage = await deskContext.newPage();
watch(deskPage, 'desk');
await deskPage.goto(`${BASE}/login`);
await deskPage.getByLabel('Benutzername').fill(deskUser);
await deskPage.getByLabel('Passwort').fill('meldestelle-passwort');
await deskPage.locator('form button[type=submit]').click();
await deskPage.waitForURL(`${BASE}/admin`);
// Settings and match desk are not offered and lead to the event's overview
await deskPage.goto(`${BASE}/admin/events/${eventId}/desk`);
await deskPage.waitForURL(new RegExp(`/admin/events/${eventId}$`));
const deskTabs = await deskPage.locator('.event-nav a').allInnerTexts();
if (deskTabs.join('|') !== 'Übersicht|Spieler|Konkurrenzen|Drucken') errors.push(`desk tabs: ${deskTabs.join('|')}`);
await section(deskPage, 'Spieler');
await deskPage.getByLabel('Vorname').fill('Nachmeldung');
await deskPage.getByRole('button', { name: 'Hinzufügen', exact: true }).click();
await deskPage.getByRole('rowheader', { name: 'Nachmeldung', exact: true }).waitFor();
await shot(deskPage, '14e-desk-players');
await deskPage.goto(`${BASE}/account`);
await deskPage.getByLabel('Aktuelles Passwort').fill('meldestelle-passwort');
await deskPage.getByLabel(/^Neues Passwort \(/).fill('neues-meldestelle-passwort');
await deskPage.getByLabel('Neues Passwort wiederholen').fill('neues-meldestelle-passwort');
await deskPage.getByRole('button', { name: 'Passwort ändern' }).click();
await deskPage.getByText('Passwort geändert.', { exact: false }).waitFor();
await deskContext.close();

step('print pages');
await admin.goto(`${BASE}/admin/events/${eventId}/print`);
await admin.getByRole('heading', { name: 'Schiedsrichterzettel' }).waitFor();
await shot(admin, '15-print-menu');
const printPage = await desk.newPage();
watch(printPage, 'print');
for (const [kind, query, ready] of [
  ['scoresheets', '?scope=open', '.scoresheet'],
  ['schedule', '', '.schedule-sheet'],
  ['competitions', '', '.cross-table'],
  ['results', '', '.print-competition'],
  ['certificates', '?places=3', '.certificate, .print-empty'],
]) {
  await printPage.goto(`${BASE}/admin/events/${eventId}/print/${kind}${query}`);
  await printPage.locator(ready).first().waitFor();
  await printPage.pdf({ path: `${OUT}print-${kind}.pdf`, preferCSSPageSize: true, printBackground: true });
}
await printPage.close();

step('export and import');
await admin.goto(`${BASE}/admin/events/${eventId}/settings`);
const [download] = await Promise.all([admin.waitForEvent('download'), admin.getByRole('link', { name: 'Export herunterladen' }).click()]);
const exportFile = `${OUT}export.json`;
await download.saveAs(exportFile);
await admin.goto(`${BASE}/admin`);
await shot(admin, '00-events');
await admin.getByRole('button', { name: 'Neue Veranstaltung' }).click();
await admin.getByLabel('Exportdatei (.json)').setInputFiles(exportFile);
await admin.waitForURL((url) => /\/admin\/events\/[0-9a-f-]+$/.test(url.pathname) && !url.pathname.endsWith(eventId));
const importedId = admin.url().split('/').pop();
const importedEvent = await (await admin.request.get(`${BASE}/api/events/${importedId}`)).json();
const importedSingles = importedEvent.competitions.find((c) => c.name === 'Einzel');
const importedState = await (await admin.request.get(`${BASE}/api/competitions/${importedSingles.id}/state`)).json();
const finishedCount = importedState.matches.filter((m) => m.status === 'finished').length;
if (finishedCount < 1) errors.push(`import: expected a finished match, got ${finishedCount}`);
await section(admin, 'Spielbetrieb');
await admin.locator('.queue-item').first().waitFor();
await shot(admin, '16-imported-desk');

console.log(JSON.stringify({ slug, eventId, errors }, null, 2));
await browser.close();
if (errors.length > 0) process.exit(1);
