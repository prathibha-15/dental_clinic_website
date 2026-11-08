import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { readFileSync } from 'node:fs';
import { onRequest } from '../functions/api/enquiry.ts';

const db = new DatabaseSync(':memory:');
db.exec(readFileSync(new URL('../migrations/0001_appointment_enquiries.sql', import.meta.url), 'utf8'));
const binding = {
  prepare(query: string) {
    return {
      bind(...values: (string | number | null)[]) {
        return { async run() { db.prepare(query).run(...values); return { success: true }; } };
      },
    };
  },
};
const originalFetch = globalThis.fetch;
globalThis.fetch = async () => Response.json({ success: true, hostname: 'clinic.example', action: 'appointment' });
after(() => { globalThis.fetch = originalFetch; db.close(); });

const valid = {
  patientName: 'Test Patient',
  mobile: '9876543210',
  reason: 'Dental consultation',
  preferredDate: '2027-01-15',
  preferredTime: 'Morning',
  message: 'Please call after 10.',
  consent: true,
  turnstileToken: 'test-token',
};
const env = { DB: binding, TURNSTILE_SECRET_KEY: 'test-secret', SMS_MODE: 'mock' };
const request = (body: string, method = 'POST') => new Request('https://clinic.example/api/enquiry', {
  method,
  headers: { 'Content-Type': 'application/json' },
  ...(method === 'POST' ? { body } : {}),
});

test('valid enquiry is saved with a unique reference and simulated notification', async () => {
  const response = await onRequest({ request: request(JSON.stringify(valid)), env });
  assert.equal(response.status, 201);
  const data = await response.json();
  assert.match(data.reference, /^[0-9a-f-]{36}$/);
  assert.equal(data.notificationStatus, 'simulated');
  const row = db.prepare('SELECT * FROM appointment_enquiries WHERE id = ?').get(data.reference);
  assert.equal(row?.patient_name, valid.patientName);
  assert.equal(row?.notification_status, 'simulated');
  assert.equal(row?.consent, 1);
});

for (const [label, change, key] of [
  ['missing patient name', { patientName: '  ' }, 'patientName'],
  ['invalid mobile number', { mobile: '1234567890' }, 'mobile'],
  ['missing consent', { consent: false }, 'consent'],
  ['invalid treatment', { reason: 'Unconfirmed treatment' }, 'reason'],
  ['invalid date', { preferredDate: '2027-02-30' }, 'preferredDate'],
  ['invalid time', { preferredTime: 'Midnight' }, 'preferredTime'],
  ['message too long', { message: 'a'.repeat(501) }, 'message'],
] as const) {
  test(label, async () => {
    const response = await onRequest({ request: request(JSON.stringify({ ...valid, ...change })), env });
    assert.equal(response.status, 400);
    const data = await response.json();
    assert.ok(data.fields[key]);
  });
}

test('malformed JSON and non-POST requests are rejected', async () => {
  assert.equal((await onRequest({ request: request('{'), env })).status, 400);
  const response = await onRequest({ request: request('', 'GET'), env });
  assert.equal(response.status, 405);
  assert.equal(response.headers.get('Allow'), 'POST');
});

test('SMS failure keeps the enquiry and records failure', async () => {
  const response = await onRequest({ request: request(JSON.stringify(valid)), env: { ...env, SMS_MODE: 'mock_failure' } });
  assert.equal(response.status, 201);
  const result = await response.json();
  assert.equal(result.notificationStatus, 'failed');
  assert.equal(db.prepare('SELECT notification_status FROM appointment_enquiries WHERE id = ?').get(result.reference)?.notification_status, 'failed');
});

test('notification status update failure leaves a saved enquiry pending', async () => {
  const failingUpdate = {
    prepare(query: string) {
      if (query.startsWith('UPDATE')) return { bind: () => ({ async run() { throw new Error('test failure'); } }) };
      return binding.prepare(query);
    },
  };
  const response = await onRequest({ request: request(JSON.stringify(valid)), env: { ...env, DB: failingUpdate } });
  assert.equal(response.status, 201);
  const result = await response.json();
  assert.equal(result.notificationStatus, 'pending');
  assert.equal(db.prepare('SELECT notification_status FROM appointment_enquiries WHERE id = ?').get(result.reference)?.notification_status, 'pending');
});

test('database insertion failure does not report success', async () => {
  const brokenDb = { prepare() { return { bind() { return { async run() { throw new Error('test failure'); } }; } }; } };
  const response = await onRequest({ request: request(JSON.stringify(valid)), env: { ...env, DB: brokenDb } });
  assert.equal(response.status, 503);
});

test('spam verification failure rejects without inserting', async () => {
  const count = db.prepare('SELECT count(*) AS count FROM appointment_enquiries').get()?.count;
  globalThis.fetch = async () => Response.json({ success: false });
  try {
    const response = await onRequest({ request: request(JSON.stringify(valid)), env });
    assert.equal(response.status, 403);
    assert.equal(db.prepare('SELECT count(*) AS count FROM appointment_enquiries').get()?.count, count);
  } finally {
    globalThis.fetch = async () => Response.json({ success: true, hostname: 'clinic.example', action: 'appointment' });
  }
});

test('verification rejects wrong hostname and action', async () => {
  try {
    for (const result of [
      { success: true, hostname: 'other.example', action: 'appointment' },
      { success: true, hostname: 'clinic.example', action: 'other' },
    ]) {
      globalThis.fetch = async () => Response.json(result);
      assert.equal((await onRequest({ request: request(JSON.stringify(valid)), env })).status, 403);
    }
  } finally {
    globalThis.fetch = async () => Response.json({ success: true, hostname: 'clinic.example', action: 'appointment' });
  }
});

test('missing configuration fails closed', async () => {
  const response = await onRequest({ request: request(JSON.stringify(valid)), env: { ...env, TURNSTILE_SECRET_KEY: '' } });
  assert.equal(response.status, 503);
});

test('oversized payloads are rejected', async () => {
  const response = await onRequest({ request: request(JSON.stringify({ ...valid, message: 'a'.repeat(9000) })), env });
  assert.equal(response.status, 413);
});

test('message control characters are removed before storing', async () => {
  const response = await onRequest({ request: request(JSON.stringify({ ...valid, message: 'hello\u0001world' })), env });
  assert.equal(response.status, 201);
  const data = await response.json();
  assert.equal(db.prepare('SELECT additional_message FROM appointment_enquiries WHERE id = ?').get(data.reference)?.additional_message, 'helloworld');
});
