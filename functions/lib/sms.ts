export interface EnquiryNotification {
  patientName: string;
  mobile: string;
  treatment: string;
  preferredDate: string;
  preferredTime: string;
  message: string;
}

export interface SmsConfiguration {
  SMS_API_KEY?: string;
  SMS_API_SECRET?: string;
}

export type SmsResult = 'accepted' | 'rejected' | 'unavailable' | 'unknown';
export type SmsSender = (notification: EnquiryNotification, config: SmsConfiguration) => Promise<SmsResult>;

export const CLINIC_SMS_DESTINATION = '+919488417158';

export const notifyClinic: SmsSender = async (_notification, _config) => {
  // Implement the selected provider here; return accepted only after its API confirms acceptance.
  return 'unavailable';
};
