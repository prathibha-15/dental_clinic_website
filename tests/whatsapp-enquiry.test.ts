import assert from 'node:assert/strict';
import test from 'node:test';
import { categories } from '../src/data/services.ts';
import { buildWhatsAppUrl, validateEnquiry, type Enquiry } from '../src/lib/whatsapp-enquiry.ts';

const valid: Enquiry = {
  patientName: 'Test Patient',
  mobile: '9488417158',
  reason: 'Dental consultation',
  preferredDate: '2027-03-19',
  preferredTime: 'Morning',
  message: '',
  consent: true,
};

test('accepts a valid enquiry and every confirmed treatment', () => {
  for (const category of categories) {
    for (const reason of category.treatments) {
      assert.deepEqual(validateEnquiry({ ...valid, reason }), {});
    }
  }
});

test('accepts the updated children and diagnostics treatments', () => {
  assert.deepEqual(categories.find((category) => category.title === "Children's Dentistry")?.treatments, ["Children's dental treatment"]);
  assert.deepEqual(categories.find((category) => category.title === 'Diagnostics')?.treatments, ['Digital X-rays']);
  for (const reason of ["Children's dental treatment", 'Digital X-rays']) {
    assert.deepEqual(validateEnquiry({ ...valid, reason }), {});
  }
});

test('rejects invalid required fields', () => {
  assert.ok(validateEnquiry({ ...valid, patientName: '  ' }).patientName);
  assert.ok(validateEnquiry({ ...valid, patientName: 'A\nB' }).patientName);
  for (const mobile of ['5488417158', '948841715', '+919488417158', 'abcdefghij']) {
    assert.ok(validateEnquiry({ ...valid, mobile }).mobile);
  }
  assert.ok(validateEnquiry({ ...valid, reason: '' }).reason);
  assert.ok(validateEnquiry({ ...valid, reason: 'Unconfirmed treatment' }).reason);
  assert.ok(validateEnquiry({ ...valid, consent: false }).consent);
});

test('validates optional fields', () => {
  assert.deepEqual(validateEnquiry({ ...valid, preferredDate: '', preferredTime: '', message: '' }), {});
  assert.ok(validateEnquiry({ ...valid, preferredDate: '2027-02-29' }).preferredDate);
  assert.ok(validateEnquiry({ ...valid, preferredTime: 'Midnight' }).preferredTime);
  assert.ok(validateEnquiry({ ...valid, message: 'x'.repeat(501) }).message);
});

test('encodes message content without changing the destination or adding parameters', () => {
  const enquiry = {
    ...valid,
    patientName: '  மீனா & Co  ',
    message: 'Hello & welcome + ? #\nSecond line = yes',
    reason: "Children's dental treatment",
  };
  const url = new URL(buildWhatsAppUrl(enquiry));
  assert.equal(url.origin, 'https://wa.me');
  assert.equal(url.pathname, '/919488417158');
  assert.deepEqual([...url.searchParams.keys()], ['text']);
  assert.equal(url.searchParams.get('text'), [
    'Appointment enquiry - Sudharsan Dental Clinic',
    'Patient name: மீனா & Co',
    'Mobile number: 9488417158',
    "Reason for visit: Children's dental treatment",
    'Preferred date: 2027-03-19',
    'Preferred time: Morning',
    'Additional message: Hello & welcome + ? #\nSecond line = yes',
  ].join('\n'));
});

test('includes clear defaults for omitted optional fields', () => {
  const url = new URL(buildWhatsAppUrl({ ...valid, preferredDate: '', preferredTime: '', message: ' ' }));
  const text = url.searchParams.get('text');
  assert.ok(text?.includes('Preferred date: Not specified'));
  assert.ok(text?.includes('Preferred time: Not specified'));
  assert.ok(text?.includes('Additional message: Not provided'));
});
