/**
 * Client for the Python OTP API. Codes are only returned by the backend in
 * development; production requests fail until an email/SMS provider is configured.
 */

export interface OtpApiResponse {
  success?: boolean;
  message?: string;
  error?: string;
  _devCode?: string;
}

/**
 * Normalizes contact information (Phone: India +91 format, Email: lowercase).
 */
export function formatContact(rawContact: string, type: "email" | "sms"): string {
  if (type === "email") {
    return rawContact.trim().toLowerCase();
  }

  const cleaned = rawContact.replace(/[^\d+]/g, "");
  if (cleaned.startsWith("+91")) {
    return cleaned;
  }
  if (cleaned.startsWith("91") && cleaned.length === 12) {
    return `+${cleaned}`;
  }
  const digitsOnly = cleaned.replace(/\D/g, "");
  if (digitsOnly.length === 10) {
    return `+91 ${digitsOnly.slice(0, 5)} ${digitsOnly.slice(5)}`;
  }

  return rawContact.trim();
}

export async function sendOtpCode(
  contact: string,
  type: "email" | "sms"
): Promise<{ success: boolean; code?: string; message: string }> {
  const normalized = formatContact(contact, type);
  const response = await fetch("/api/otp/send", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ contact: normalized, type }),
  });
  const result = await response.json() as OtpApiResponse;
  if (!response.ok) {
    return {
      success: false,
      message: result.error || "Failed to send OTP code.",
    };
  }

  return {
    success: true,
    code: result._devCode,
    message: result.message || `Verification code requested for ${normalized}`,
  };
}

export async function verifyOtpCode(
  contact: string,
  enteredCode: string,
  type: "email" | "sms"
): Promise<{ success: boolean; error?: string }> {
  const normalized = formatContact(contact, type);
  const response = await fetch("/api/otp/verify", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ contact: normalized, code: enteredCode.trim() }),
  });
  const result = await response.json() as OtpApiResponse;
  if (!response.ok) {
    return {
      success: false,
      error: result.error || "Invalid or expired OTP code.",
    };
  }
  return { success: true };
}
