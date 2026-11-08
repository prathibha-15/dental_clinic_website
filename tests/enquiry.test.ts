import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { handleEnquiry, onRequest } from '../functions/api/enquiry.ts';
import { CLINIC_SMS_DESTINATION, type EnquiryNotification, type SmsSender } from '../functions/lib/sms.ts';

const originalFetch = globalThis.fetch;
const verifySuccess = () => { globalThis.fetch = async () => Response.json({ success: true, hostname: 'clinic.example', action: 'appointment' }); };
verifySuccess();
after(() => { globalThis.fetch = originalFetch; });

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
const env = { TURNSTILE_SECRET_KEY: 'test-secret' };
const request = (body: string, method = 'POST') => new Request('https://clinic.example/api/enquiry', {
  method,
  headers: { 'Content-Type': 'application/json' },
  ...(method === 'POST' ? { body } : {}),
});
const accepted: SmsSender = async () => 'accepted';
const call = (body: unknown, sender: SmsSender = accepted) =>
  handleEnquiry({ request: request(JSON.stringify(body)), env }, sender);

test('accepted SMS results in success and forwards the validated details', async () => {
  let notification: EnquiryNotification | undefined;
  const response = await call(valid, async (details) => { notification = details; return 'accepted'; });
  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), { accepted: true });
  assert.deepEqual(notification, {
    patientName: 'Test Patient', mobile: '9876543210', treatment: 'Dental consultation',
    preferredDate: '2027-01-15', preferredTime: 'Morning', message: 'Please call after 10.',
  });
  assert.equal(CLINIC_SMS_DESTINATION, '+919488417158');
});

for (const [label, change, key] of [
  ['missing patient name', { patientName: '  ' }, 'patientName'],
  ['invalid mobile number', { mobile: '1234567890' }, 'mobile'],
  ['missing consent', { consent: false }, 'consent'],
  ['invalid treatment', { reason: 'Unconfirmed treatment' }, 'reason'],
  ['invalid date', { preferredDate: '2027-02-30' }, 'preferredDate'],
  ['invalid time', { preferredTime: 'Midnight' }, 'preferredTime'],
  ['message too long', { message: 'a'.repeat(501) }, 'message'],
  ['missing Turnstile token', { turnstileToken: '' }, 'turnstile'],
] as const) {
  test(label, async () => {
    let called = false;
    const response = await call({ ...valid, ...change }, async () => { called = true; return 'accepted'; });
    assert.equal(response.status, 400);
    assert.ok((await response.json()).fields[key]);
    assert.equal(called, false);
  });
}

test('malformed JSON, oversized bodies, non-POST and cross-origin requests are rejected', async () => {
  assert.equal((await handleEnquiry({ request: request('{'), env }, accepted)).status, 400);
  assert.equal((await handleEnquiry({ request: request('', 'GET'), env }, accepted)).status, 405);
  assert.equal((await call({ ...valid, message: 'a'.repeat(9000) })).status, 413);
  const crossOrigin = new Request('https://clinic.example/api/enquiry', {
    method: 'POST', headers: { 'content-type': 'application/json', origin: 'https://other.example' }, body: JSON.stringify(valid),
  });
  assert.equal((await handleEnquiry({ request: crossOrigin, env }, accepted)).status, 403);
});

test('message control characters are removed before forwarding', async () => {
  let actual = '';
  const response = await call({ ...valid, message: 'hello\u0001world' }, async (details) => { actual = details.message; return 'accepted'; });
  assert.equal(response.status, 200);
  assert.equal(actual, 'helloworld');
});

for (const [result, status] of [['rejected', 502], ['unknown', 502], ['unavailable', 503]] as const) {
  test(`SMS ${result} is not successful`, async () => {
    const response = await call(valid, async () => result);
    assert.equal(response.status, status);
    assert.notEqual((await response.json()).accepted, true);
  });
}

test('provider exception does not report success', async () => {
  const response = await call(valid, async () => { throw new Error('provider error'); });
  assert.equal(response.status, 502);
  assert.match((await response.json()).error, /could not confirm/i);
});

test('production adapter without provider fails closed', async () => {
  const response = await onRequest({ request: request(JSON.stringify(valid)), env });
  assert.equal(response.status, 503);
  assert.notEqual((await response.json()).accepted, true);
});

test('failed or mismatched Turnstile never invokes the SMS provider', async () => {
  try {
    for (const result of [
      { success: false },
      { success: true, hostname: 'other.example', action: 'appointment' },
      { success: true, hostname: 'clinic.example', action: 'other' },
    ]) {
      globalThis.fetch = async () => Response.json(result);
      let called = false;
      const response = await call(valid, async () => { called = true; return 'accepted'; });
      assert.equal(response.status, 403);
      assert.equal(called, false);
    }
  } finally { verifySuccess(); }
});

test('Turnstile outage and missing secret fail closed', async () => {
  try {
    globalThis.fetch = async () => { throw new Error('network error'); };
    assert.equal((await call(valid)).status, 503);
    assert.equal((await handleEnquiry({ request: request(JSON.stringify(valid)), env: {} }, accepted)).status, 503);
  } finally { verifySuccess(); }
});
