import { categories } from '../data/services.ts';

export interface Enquiry {
  patientName: string;
  mobile: string;
  reason: string;
  preferredDate: string;
  preferredTime: string;
  message: string;
  consent: boolean;
}

export type EnquiryErrors = Partial<Record<keyof Enquiry, string>>;
const treatments = new Set<string>(categories.flatMap((category) => [...category.treatments]));

export function validateEnquiry(enquiry: Enquiry): EnquiryErrors {
  const errors: EnquiryErrors = {};
  const name = enquiry.patientName.trim();
  if (!name || name.length > 100 || /[\u0000-\u001f\u007f]/.test(name)) {
    errors.patientName = 'Enter a patient name of at most 100 characters.';
  }
  if (!/^[6-9][0-9]{9}$/.test(enquiry.mobile.trim())) {
    errors.mobile = 'Enter a valid 10-digit Indian mobile number starting with 6, 7, 8 or 9.';
  }
  if (!treatments.has(enquiry.reason)) errors.reason = 'Please select a reason for your visit.';
  if (!enquiry.consent) errors.consent = 'Please consent to being contacted.';
  if (enquiry.preferredDate) {
    const date = new Date(`${enquiry.preferredDate}T00:00:00Z`);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(enquiry.preferredDate) || Number.isNaN(date.getTime()) || date.toISOString().slice(0, 10) !== enquiry.preferredDate) {
      errors.preferredDate = 'Enter a valid date.';
    }
  }
  if (enquiry.preferredTime && !['Morning', 'Evening', 'Any time'].includes(enquiry.preferredTime)) {
    errors.preferredTime = 'Select a valid preferred time.';
  }
  if (enquiry.message.length > 500) errors.message = 'The message must be 500 characters or fewer.';
  return errors;
}

export function buildWhatsAppUrl(enquiry: Enquiry): string {
  const lines = [
    'Appointment enquiry - Sudharsan Dental Clinic',
    `Patient name: ${enquiry.patientName.trim()}`,
    `Mobile number: ${enquiry.mobile.trim()}`,
    `Reason for visit: ${enquiry.reason}`,
    `Preferred date: ${enquiry.preferredDate || 'Not specified'}`,
    `Preferred time: ${enquiry.preferredTime || 'Not specified'}`,
    `Additional message: ${enquiry.message.trim() || 'Not provided'}`,
  ];
  const params = new URLSearchParams({ text: lines.join('\n') });
  return `https://wa.me/919488417158?${params.toString()}`;
}
