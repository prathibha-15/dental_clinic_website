export interface SmsConfiguration {
  SMS_MODE?: string;
  SMS_API_KEY?: string;
  SMS_API_SECRET?: string;
}

export type NotificationStatus = 'disabled' | 'simulated' | 'failed';

export interface ClinicNotification {
  reference: string;
  destination: string;
}

export async function notifyClinic(
  notification: ClinicNotification,
  config: SmsConfiguration,
): Promise<NotificationStatus> {
  switch (config.SMS_MODE || 'disabled') {
    case 'disabled':
      return 'disabled';
    case 'mock':
      return 'simulated';
    case 'mock_failure':
      return 'failed';
    default:
      // Real providers must be integrated here with server-side credentials and
      // a verified delivery receipt before recording a delivered status.
      console.error('SMS provider is not configured.');
      return 'failed';
  }
}
