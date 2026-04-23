const OTP_CODE = process.env.OTP_CODE || '1111';
const OTP_TTL_MS = 5 * 60 * 1000;
const MAX_ATTEMPTS = 5;

type OtpEntry = {
  code: string;
  expiresAt: number;
  attempts: number;
};

const otpStore = new Map<string, OtpEntry>();

export function sendOtp(phone: string): boolean {
  otpStore.set(phone, { code: OTP_CODE, expiresAt: Date.now() + OTP_TTL_MS, attempts: 0 });
  return true;
}

export type VerifyOtpResult = 'ok' | 'invalid' | 'expired' | 'not_found' | 'locked';

export function verifyOtp(phone: string, code: string): VerifyOtpResult {
  const entry = otpStore.get(phone);
  if (!entry) return 'not_found';
  if (Date.now() > entry.expiresAt) {
    otpStore.delete(phone);
    return 'expired';
  }
  if (entry.attempts >= MAX_ATTEMPTS) {
    otpStore.delete(phone);
    return 'locked';
  }
  if (entry.code !== code) {
    entry.attempts += 1;
    if (entry.attempts >= MAX_ATTEMPTS) {
      otpStore.delete(phone);
      return 'locked';
    }
    return 'invalid';
  }
  otpStore.delete(phone);
  return 'ok';
}
