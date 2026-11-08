import { categories } from '../../src/data/services.ts';
import { notifyClinic, type SmsConfiguration } from '../lib/sms.ts';

interface D1Statement {
  bind(...values: (string | number | null)[]): { run(): Promise<{ success: boolean }> };
}

interface Env extends SmsConfiguration {
  DB: { prepare(query: string): D1Statement };
  TURNSTILE_SECRET_KEY?: string;
}

interface Context {
  request: Request;
  env: Env;
}

type FieldErrors = Record<string, string>;
const treatments = new Set<string>(categories.flatMap((category) => [...category.treatments]));
const maxBodyBytes = 8192;
const testSecret = '1x0000000000000000000000000000000AA';
const clinicNumber = '919488417158';

function json(body: object, status: number, extraHeaders: Record<string, string> = {}): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff', ...extraHeaders },
  });
}

async function readBody(request: Request): Promise<string | null> {
  if (!request.body) return '';
  const reader = request.body.getReader();
  const decoder = new TextDecoder();
  let body = '';
  let size = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.byteLength;
    if (size > maxBodyBytes) {
      await reader.cancel();
      return null;
    }
    body += decoder.decode(value, { stream: true });
  }
  return body + decoder.decode();
}

function validDate(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(`${value}T00:00:00Z`);
  return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value;
}

function validate(data: Record<string, unknown>) {
  const errors: FieldErrors = {};
  const name = typeof data.patientName === 'string' ? data.patientName.trim() : '';
  const mobile = typeof data.mobile === 'string' ? data.mobile.trim() : '';
  const treatment = typeof data.reason === 'string' ? data.reason : '';
  if (!name || name.length > 100 || /[\u0000-\u001f\u007f]/.test(name)) errors.patientName = 'Enter a patient name of at most 100 characters.';
  if (!/^[6-9][0-9]{9}$/.test(mobile)) errors.mobile = 'Enter a valid 10-digit Indian mobile number.';
  if (!treatments.has(treatment)) errors.reason = 'Select an available treatment.';
  if (data.consent !== true) errors.consent = 'Consent to being contacted is required.';

  const optionalString = (value: unknown, key: string): string => {
    if (value === undefined || value === null || value === '') return '';
    if (typeof value !== 'string') {
      errors[key] = 'Enter a valid value.';
      return '';
    }
    return value.trim();
  };
  const date = optionalString(data.preferredDate, 'preferredDate');
  const time = optionalString(data.preferredTime, 'preferredTime');
  const rawMessage = optionalString(data.message, 'message');
  if (date && !validDate(date)) errors.preferredDate = 'Enter a valid date.';
  if (time && !['Morning', 'Evening', 'Any time'].includes(time)) errors.preferredTime = 'Select a valid preferred time.';
  if (rawMessage.length > 500) errors.message = 'The message must be 500 characters or fewer.';
  const message = rawMessage.replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g, '');
  if (typeof data.turnstileToken !== 'string' || !data.turnstileToken || data.turnstileToken.length > 2048) {
    errors.turnstile = 'Complete the security check.';
  }
  return { errors, name, mobile, treatment, date, time, message, token: data.turnstileToken as string };
}

async function verifyTurnstile(token: string, secret: string, request: Request): Promise<boolean> {
  const payload = new URLSearchParams({ secret, response: token });
  const response = await fetch('https://challenges.cloudflare.com/turnstile/v0/siteverify', { method: 'POST', body: payload });
  if (!response.ok) throw new Error('Turnstile service unavailable');
  const result: unknown = await response.json();
  if (!result || typeof result !== 'object') return false;
  const { success, hostname, action } = result as { success?: unknown; hostname?: unknown; action?: unknown };
  const host = new URL(request.url).hostname;
  const isLocalTest = secret === testSecret && (host === 'localhost' || host === '127.0.0.1');
  return success === true && (isLocalTest || (hostname === host && action === 'appointment'));
}

export async function onRequest({ request, env }: Context): Promise<Response> {
  if (request.method !== 'POST') return json({ error: 'Method not allowed.' }, 405, { Allow: 'POST' });
  const url = new URL(request.url);
  if (url.protocol !== 'https:' && url.hostname !== 'localhost' && url.hostname !== '127.0.0.1') {
    return json({ error: 'HTTPS is required.' }, 403);
  }
  if (request.headers.get('origin') && request.headers.get('origin') !== url.origin) {
    return json({ error: 'Request origin is not allowed.' }, 403);
  }
  if (!/^application\/json(?:\s*;|$)/i.test(request.headers.get('content-type') || '')) {
    return json({ error: 'Content-Type must be application/json.' }, 415);
  }
  if (Number(request.headers.get('content-length')) > maxBodyBytes) return json({ error: 'Request is too large.' }, 413);

  let data: unknown;
  try {
    const body = await readBody(request);
    if (body === null) return json({ error: 'Request is too large.' }, 413);
    data = JSON.parse(body);
  } catch {
    return json({ error: 'Malformed JSON request.' }, 400);
  }
  if (!data || typeof data !== 'object' || Array.isArray(data)) return json({ error: 'Expected a JSON object.' }, 400);
  const enquiry = validate(data as Record<string, unknown>);
  if (Object.keys(enquiry.errors).length) return json({ error: 'Please correct the highlighted fields.', fields: enquiry.errors }, 400);
  if (!env.TURNSTILE_SECRET_KEY || !env.DB) {
    console.error('Enquiry service configuration is incomplete.');
    return json({ error: 'The enquiry service is temporarily unavailable.' }, 503);
  }
  try {
    if (!await verifyTurnstile(enquiry.token, env.TURNSTILE_SECRET_KEY, request)) {
      return json({ error: 'Security check failed. Please try again.', fields: { turnstile: 'Complete the security check again.' } }, 403);
    }
  } catch {
    console.error('Turnstile verification is unavailable.');
    return json({ error: 'Security verification is temporarily unavailable.' }, 503);
  }

  const reference = crypto.randomUUID();
  try {
    const result = await env.DB.prepare(
      'INSERT INTO appointment_enquiries (id, patient_name, mobile_number, treatment, preferred_date, preferred_time, additional_message, consent) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
    ).bind(reference, enquiry.name, enquiry.mobile, enquiry.treatment, enquiry.date || null, enquiry.time || null, enquiry.message || null, 1).run();
    if (!result.success) throw new Error('Insert failed');
  } catch {
    console.error('Unable to save an enquiry.');
    return json({ error: 'Unable to save the enquiry. Please contact the clinic.' }, 503);
  }

  let notificationStatus: 'disabled' | 'simulated' | 'failed' = 'failed';
  try {
    notificationStatus = await notifyClinic({ reference, destination: clinicNumber }, env);
  } catch {
    console.error('Clinic notification failed.');
  }
  let recordedStatus: string = notificationStatus;
  try {
    const result = await env.DB.prepare('UPDATE appointment_enquiries SET notification_status = ? WHERE id = ?')
      .bind(notificationStatus, reference).run();
    if (!result.success) throw new Error('Update failed');
  } catch {
    console.error('Unable to update enquiry notification status.');
    recordedStatus = 'pending';
  }
  return json({ reference, notificationStatus: recordedStatus }, 201);
}
