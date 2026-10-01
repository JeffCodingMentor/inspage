import { test } from 'node:test';
import assert from 'node:assert/strict';
import { JSDOM } from 'jsdom';
import { createNotionActions } from '../notion-actions.js';

function setup(fetchImpl = async () => Response.json({ status: 'created', pageUrl: 'https://www.notion.so/course' }), endpoint = 'https://worker.example/api/notion/courses') {
  const dom = new JSDOM('<div id="slot"></div><div id="other"></div>');
  const alerts = [];
  dom.window.alert = message => alerts.push(message);
  let user = null;
  const actions = createNotionActions({ getUser: () => user, endpoint, fetchImpl });
  const slot = dom.window.document.getElementById('slot');
  const view = actions.mount(slot, '5484466');
  const button = slot.querySelector('button');
  return { dom, actions, slot, view, button, alerts, login(value = { getIdToken: async () => 'id-token' }) { user = value; actions.refresh(); } };
}
test('visitor hidden; login and logout synchronize existing view', () => {
  const f = setup(); assert.equal(f.slot.hidden, true); f.login(); assert.equal(f.slot.hidden, false);
  f.login(null); assert.equal(f.slot.hidden, true); assert.equal(f.button.disabled, true);
});
test('posts only courseId with current token and reports success in a popup', async () => {
  let call;
  const f = setup(async (url, options) => { call = { url, ...options }; return Response.json({ status: 'created', pageUrl: 'https://www.notion.so/course' }); });
  f.login(); await f.button.onclick();
  assert.deepEqual(JSON.parse(call.body), { courseId: '5484466' });
  assert.equal(call.headers.Authorization, 'Bearer id-token');
  assert.match(f.alerts[0], /已寫入 Notion/); assert.equal(f.slot.querySelector('.notion-status'), null);
  assert.equal(f.button.disabled, false);
});
test('existing result is not presented as new', async () => {
  const f = setup(async () => Response.json({ status: 'exists', pageUrl: 'https://www.notion.so/course' }));
  f.login(); await f.button.onclick(); assert.match(f.alerts[0], /已存在/);
});
for (const status of [400, 401, 403, 404, 429, 502, 503]) test(`HTTP ${status} displays error without retry`, async () => {
  let calls = 0; const f = setup(async () => { calls++; return Response.json({ error: { message: 'internal secret' } }, { status }); });
  f.login(); await f.button.onclick(); assert.equal(calls, 1); assert.equal(f.button.disabled, false);
  assert.doesNotMatch(f.alerts.join(' '), /internal secret/); assert.equal(f.slot.querySelector('.notion-status'), null);
  if (status === 401) assert.match(f.alerts[0], /重新登入/);
});
test('network error and malformed success do not claim completion', async () => {
  for (const fetchImpl of [async () => { throw new TypeError('Failed to fetch'); }, async () => Response.json({ status: 'created', pageUrl: 'javascript:alert(1)' })]) {
    const f = setup(fetchImpl); f.login(); await f.button.onclick(); assert.match(f.alerts[0], /確認|查看/);
  }
});
test('missing configuration makes no request', async () => {
  let calls = 0; const f = setup(async () => { calls++; }, ''); f.login(); await f.button.onclick();
  assert.equal(calls, 0); assert.match(f.alerts[0], /尚未設定/);
});
test('pending request blocks duplicates across reopened views and cannot update another course', async () => {
  let resolve, calls = 0;
  const f = setup(() => { calls++; return new Promise(r => { resolve = r; }); });
  f.login(); const operation = f.button.onclick(); await Promise.resolve();
  await f.button.onclick(); assert.equal(calls, 1); assert.equal(f.button.disabled, true);
  f.view.dispose(); f.slot.remove();
  const other = f.dom.window.document.getElementById('other');
  const reopened = f.actions.mount(other, '5484466'); assert.equal(other.querySelector('button').disabled, true);
  reopened.dispose(); f.actions.mount(other, '5699132'); assert.equal(other.querySelector('button').disabled, false);
  resolve(Response.json({ status: 'created', pageUrl: 'https://www.notion.so/course' })); await operation;
  assert.doesNotMatch(other.textContent, /已加入/);
});
test('logout during token refresh prevents sending; logout during fetch hides result', async () => {
  let resolveToken, calls = 0;
  const f = setup(async () => { calls++; return Response.json({ status: 'created', pageUrl: 'https://www.notion.so/course' }); });
  f.login({ getIdToken: () => new Promise(r => { resolveToken = r; }) });
  const operation = f.button.onclick(); f.login(null); resolveToken('token'); await operation; assert.equal(calls, 0);
  let resolveFetch;
  const g = setup(() => new Promise(r => { resolveFetch = r; })); g.login(); const pending = g.button.onclick(); await Promise.resolve();
  g.login(null); resolveFetch(Response.json({ status: 'created', pageUrl: 'https://www.notion.so/course' })); await pending;
  assert.equal(g.slot.hidden, true); assert.deepEqual(g.alerts, []);
});
