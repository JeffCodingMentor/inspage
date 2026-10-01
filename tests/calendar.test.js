import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { JSDOM } from 'jsdom';
import { createNotionActions } from '../notion-actions.js';

test('actual calendar preserves interests/navigation and synchronizes admin actions', async () => {
  const html = await readFile(new URL('../index.html', import.meta.url), 'utf8');
  let source = await readFile(new URL('../main.js', import.meta.url), 'utf8');
  source = source.replace(/^import .*;\r?\n/gm, '').replace(/import\.meta\.env/g, 'window.testEnv').replace("document.addEventListener('DOMContentLoaded', initCalendar);", 'window.initialize = initCalendar;');
  const dom = new JSDOM(html, { url: 'https://jeffcodingmentor.github.io/inspage/', runScripts: 'outside-only' });
  const win = dom.window;
  const today = new Date();
  const date = `${today.getFullYear()}/${String(today.getMonth() + 1).padStart(2, '0')}/${String(today.getDate()).padStart(2, '0')}`;
  const data = ['5484466', '5699132'].map((id, i) => ({ fields: Object.fromEntries(Object.entries({ id, name: `測試課程${i}`, dateStr: date, startTime: `${String(9 + i).padStart(2, '0')}:00`, rawTime: date, sourceUrl: 'https://example.com', speaker: '講師' }).map(([k, v]) => [k, { stringValue: v }])) }));
  let authCallback;
  const user = { email: 'admin@example.com', getIdToken: async () => 'test-token' };
  const auth = { currentUser: user };
  Object.assign(win, {
    testEnv: {}, createNotionActions, getApps: () => [], initializeApp: () => ({}), getAuth: () => auth,
    onAuthStateChanged: (_auth, cb) => { authCallback = cb; },
    fetch: async url => url.includes('/admins/') ? { ok: true } : { ok: true, json: async () => ({ documents: data }) },
    confirm: () => true, alert: () => {},
  });
  win.eval(source); await win.initialize();
  const doc = win.document;
  assert.equal(doc.querySelectorAll('.course-item').length, 2);
  doc.querySelector('.course-item').click();
  assert.equal(doc.getElementById('notionActionArea').hidden, true);
  assert.equal(doc.getElementById('btnCopy'), null);
  assert.equal(doc.getElementById('btnDeleteCourse').hidden, true);
  doc.getElementById('btnInterested').click();
  assert.equal(JSON.parse(win.localStorage.getItem('interested_courses'))['5484466'].status, 'interested');
  doc.getElementById('btnInterested').click();
  assert.equal(JSON.parse(win.localStorage.getItem('interested_courses'))['5484466'].status, 'following');
  await authCallback(user);
  assert.equal(doc.getElementById('notionActionArea').hidden, false);
  assert.equal(doc.getElementById('btnDeleteCourse').hidden, false);
  doc.getElementById('btnNextCourse').click(); assert.match(doc.querySelector('.detail-value.title').textContent, /課程1/);
  await authCallback(null);
  assert.equal(doc.getElementById('notionActionArea').hidden, true);
  assert.equal(doc.getElementById('btnDeleteCourse').hidden, true);
  doc.getElementById('modalClose').click(); assert.equal(doc.getElementById('modalOverlay').classList.contains('active'), false);
  dom.window.close();
});
