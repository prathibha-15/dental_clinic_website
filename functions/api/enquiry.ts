import { categories } from '../../src/data/services.ts';
import { notifyClinic, type SmsConfiguration, type SmsSender } from '../lib/sms.ts';

interface Env extends SmsConfiguration {
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

export async function handleEnquiry({ request, env }: Context, sendSms: SmsSender): Promise<Response> {
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
  if (!env.TURNSTILE_SECRET_KEY) {
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

  try {
    const result = await sendSms({
      patientName: enquiry.name,
      mobile: enquiry.mobile,
      treatment: enquiry.treatment,
      preferredDate: enquiry.date,
      preferredTime: enquiry.time,
      message: enquiry.message,
    }, env);
    if (result === 'accepted') return json({ accepted: true }, 200);
    if (result === 'rejected') return json({ error: 'The SMS provider rejected the request. Please contact the clinic directly.' }, 502);
    if (result === 'unknown') return json({ error: 'We could not confirm whether the notification was accepted. Please contact the clinic before retrying.' }, 502);
    return json({ error: 'The SMS notification service is unavailable. Please contact the clinic directly.' }, 503);
  } catch {
    console.error('Clinic notification could not be confirmed.');
    return json({ error: 'We could not confirm whether the notification was accepted. Please contact the clinic before retrying.' }, 502);
  }
}

export function onRequest(context: Context): Promise<Response> {
  return handleEnquiry(context, notifyClinic);
}
