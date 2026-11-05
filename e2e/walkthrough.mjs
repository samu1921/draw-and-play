// End-to-end walkthrough of the tournament day UI, with screenshots: `npm run e2e` (needs the Docker stack running).
// Runs inside the Playwright Docker image, so no browser has to be installed locally.
import { existsSync, mkdirSync } from 'node:fs';
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

const browser = await chromium.launch();
const watch = (page, name) => {
  page.on('pageerror', (e) => errors.push(`${name}: ${e.message}`));
  page.on('console', (m) => {
    if (m.type() !== 'error') return;
    // Failed requests are the point while a page is deliberately offline.
    if (offline.has(name) && /ERR_INTERNET_DISCONNECTED/.test(m.text())) return;
    errors.push(`${name}: ${m.text()}`);
  });
};
const shot = (page, name, fullPage = true) => page.screenshot({ path: `${OUT}${name}.png`, fullPage });
const step = (text) => console.log(`• ${text}`);

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
await admin.getByLabel('Name', { exact: true }).fill('Vereinsmeisterschaft Demo');
await admin.getByLabel(/Kurzname/).fill(slug);
await admin.getByLabel('Tische').fill('4');
await admin.getByRole('button', { name: 'Veranstaltung anlegen' }).click();
await admin.waitForURL(/\/admin\/events\/[0-9a-f-]+$/);
const eventId = admin.url().split('/').pop();

step('players via API');
const players = [
  ['Anna', 'Berger', 'TTC Nord', 1720], ['Ben', 'Krüger', 'SV Süd', 1690], ['Clara', 'Wolf', 'TTC Nord', 1655],
  ['David', 'Schulz', 'TSG West', 1610], ['Emma', 'Lang', 'SV Süd', 1580], ['Felix', 'Hahn', 'TSG West', 1555],
  ['Greta', 'Vogel', 'TTC Nord', 1520], ['Hannes', 'Roth', 'SV Süd', 1490], ['Ida', 'Fuchs', 'TSG West', 1460],
  ['Jonas', 'Brandt', 'TTC Nord', 1430],
];
const personIds = [];
for (const [firstName, lastName, club, rating] of players) {
  const res = await admin.request.post(`${BASE}/api/events/${eventId}/persons`, { data: { firstName, lastName, club, rating } });
  personIds.push((await res.json()).person.id);
}

step('create competition via form');
await admin.getByRole('link', { name: 'Konkurrenzen' }).click();
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
await admin.getByRole('link', { name: 'Spieler', exact: true }).click();
await admin.getByLabel('Vorname').fill('Gast');
await admin.getByRole('button', { name: 'Hinzufügen', exact: true }).click();
await admin.getByRole('rowheader', { name: 'Gast', exact: true }).waitFor();
await shot(admin, '02b-persons');

step('PIN');
await admin.getByRole('link', { name: 'Einrichtung' }).click();
await admin.getByRole('button', { name: 'Neue PIN erzeugen' }).click();
const pinText = await admin.locator('.pin-display').textContent();
const pin = /(\d{6})/.exec(pinText)[1];
await shot(admin, '03-setup');

step('call matches at the desk');
await admin.getByRole('link', { name: 'Spielbetrieb' }).click();
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
await phone.goto(`${BASE}/e/${slug}/table/1`);
await phone.getByLabel('PIN').fill(pin);
await shot(phone, '05-phone-pin');
await phone.getByRole('button', { name: 'Weiter' }).tap();
await phone.getByText('Ergebnis', { exact: true }).waitFor();
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
await beamer.goto(`${BASE}/e/${slug}/display`);
await beamer.locator('.table-card').first().waitFor();
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
await visitor.goto(`${BASE}/e/${slug}`);
await visitor.locator('.table-card').first().waitFor();
await shot(visitor, '12-public-overview');
await visitor.getByRole('link', { name: 'Einzel' }).click();
await visitor.locator('.standings').first().waitFor();
await shot(visitor, '13-public-competition');

step('QR sheet');
await admin.goto(`${BASE}/admin/events/${eventId}/qr`);
await admin.locator('.qr-code svg').first().waitFor();
await shot(admin, '14-qr');

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
await admin.goto(`${BASE}/admin/events/${eventId}`);
const [download] = await Promise.all([admin.waitForEvent('download'), admin.getByRole('link', { name: 'Export herunterladen' }).click()]);
const exportFile = `${OUT}export.json`;
await download.saveAs(exportFile);
await admin.goto(`${BASE}/admin`);
await admin.getByLabel('Exportdatei (.json)').setInputFiles(exportFile);
await admin.waitForURL((url) => /\/admin\/events\/[0-9a-f-]+$/.test(url.pathname) && !url.pathname.endsWith(eventId));
const importedId = admin.url().split('/').pop();
const importedEvent = await (await admin.request.get(`${BASE}/api/events/${importedId}`)).json();
const importedSingles = importedEvent.competitions.find((c) => c.name === 'Einzel');
const importedState = await (await admin.request.get(`${BASE}/api/competitions/${importedSingles.id}/state`)).json();
const finishedCount = importedState.matches.filter((m) => m.status === 'finished').length;
if (finishedCount < 1) errors.push(`import: expected a finished match, got ${finishedCount}`);
await admin.getByRole('link', { name: 'Spielbetrieb' }).click();
await admin.locator('.queue-item').first().waitFor();
await shot(admin, '16-imported-desk');

console.log(JSON.stringify({ slug, eventId, errors }, null, 2));
await browser.close();
if (errors.length > 0) process.exit(1);
