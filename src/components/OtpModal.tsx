import { useState, useEffect, FormEvent } from "react";
import { ShieldCheck, RefreshCw, X, CheckCircle2, AlertCircle, Copy } from "lucide-react";
import { sendOtpCode, verifyOtpCode } from "../lib/otpService";

interface OtpModalProps {
  isOpen: boolean;
  onClose: () => void;
  contact: string; // email or phone number
  type: "email" | "sms";
  onVerified: () => void;
  title?: string;
  subtitle?: string;
}

export default function OtpModal({
  isOpen,
  onClose,
  contact,
  type,
  onVerified,
  title = "Verify Identity",
  subtitle
}: OtpModalProps) {
  const [code, setCode] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState(false);
  const [resendTimer, setResendTimer] = useState(60);
  const [devCode, setDevCode] = useState<string | null>(null);

  // Send initial OTP when modal opens
  useEffect(() => {
    if (isOpen && contact) {
      setCode("");
      setError("");
      setSuccess(false);
      setResendTimer(60);
      sendOtp();
    }
  }, [isOpen, contact]);

  // Countdown timer for resend
  useEffect(() => {
    if (!isOpen || resendTimer <= 0) return;
    const interval = setInterval(() => {
      setResendTimer((prev) => prev - 1);
    }, 1000);
    return () => clearInterval(interval);
  }, [isOpen, resendTimer]);

  const sendOtp = async () => {
    setError("");
    setLoading(true);
    try {
      const res = await sendOtpCode(contact, type);
      if (res.success) {
        if (res.code) {
          setDevCode(res.code);
        }
      } else {
        setError(res.message || "Failed to send OTP code.");
      }
    } catch (err: any) {
      setError("Network error sending OTP. Please retry.");
    } finally {
      setLoading(false);
    }
  };

  const handleVerify = async (e?: FormEvent) => {
    if (e) e.preventDefault();
    if (code.length < 6) {
      setError("Please enter the complete 6-digit verification code.");
      return;
    }

    setError("");
    setLoading(true);
    try {
      const res = await verifyOtpCode(contact, code);
      if (res.success) {
        setSuccess(true);
        setTimeout(() => {
          onVerified();
        }, 600);
      } else {
        setError(res.error || "Invalid or expired OTP code.");
      }
    } catch (err: any) {
      setError("Verification service unreachable.");
    } finally {
      setLoading(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 bg-slate-900/70 backdrop-blur-xs flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-2xl max-w-sm w-full p-6 border border-slate-100 relative animate-in fade-in zoom-in-95">
        <button
          onClick={onClose}
          className="absolute top-4 right-4 text-slate-400 hover:text-slate-600 p-1 rounded-lg"
        >
          <X className="w-5 h-5" />
        </button>

        <div className="text-center mb-5">
          <div className="w-12 h-12 bg-blue-50 text-blue-600 rounded-2xl flex items-center justify-center mx-auto mb-3">
            <ShieldCheck className="w-6 h-6" />
          </div>
          <h3 className="text-lg font-black text-slate-900 tracking-tight">{title}</h3>
          <p className="text-xs text-slate-500 mt-1">
            {subtitle || (
              <>
                A 6-digit security code was dispatched to{" "}
                <span className="font-bold text-slate-800">{contact}</span>
              </>
            )}
          </p>
        </div>

        {/* Development preview badge */}
        {devCode && !success && (
          <div className="mb-4 p-2.5 bg-blue-50 border border-blue-200 rounded-xl flex items-center justify-between text-xs">
            <div className="flex items-center text-blue-800 font-semibold">
              <span className="mr-1.5">🔑</span>
              <span>Code: <strong className="font-mono tracking-wider text-sm">{devCode}</strong></span>
            </div>
            <button
              type="button"
              onClick={() => {
                setCode(devCode);
              }}
              className="text-[11px] font-bold text-blue-700 bg-blue-100 hover:bg-blue-200 px-2 py-0.5 rounded cursor-pointer transition"
            >
              Auto Fill
            </button>
          </div>
        )}

        {error && (
          <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-xl flex items-center text-xs font-semibold text-red-700">
            <AlertCircle className="w-4 h-4 mr-2 shrink-0" />
            <span>{error}</span>
          </div>
        )}

        {success ? (
          <div className="py-6 text-center text-emerald-600 font-bold flex flex-col items-center">
            <CheckCircle2 className="w-10 h-10 mb-2 animate-bounce" />
            <p className="text-sm">Verified Successfully!</p>
          </div>
        ) : (
          <form onSubmit={handleVerify} className="space-y-4">
            <div>
              <label className="block text-[11px] font-bold uppercase tracking-wider text-slate-600 mb-1 text-center">
                Enter 6-Digit Code
              </label>
              <input
                type="text"
                maxLength={6}
                autoFocus
                pattern="[0-9]*"
                inputMode="numeric"
                value={code}
                onChange={(e) => setCode(e.target.value.replace(/\D/g, ""))}
                placeholder="••••••"
                className="w-full text-center text-2xl font-black tracking-widest font-mono rounded-xl border border-slate-300 py-3 focus:outline-hidden focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
              />
            </div>

            <button
              type="submit"
              disabled={loading || code.length < 6}
              className="w-full py-3 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed text-white text-xs font-bold rounded-xl shadow-xs transition cursor-pointer"
            >
              {loading ? "Verifying..." : "Verify & Continue"}
            </button>

            <div className="flex items-center justify-between text-xs text-slate-500 pt-2">
              <span>Didn't receive code?</span>
              {resendTimer > 0 ? (
                <span className="font-semibold text-slate-400">Resend in {resendTimer}s</span>
              ) : (
                <button
                  type="button"
                  onClick={() => {
                    setResendTimer(60);
                    sendOtp();
                  }}
                  className="font-bold text-blue-600 hover:text-blue-800 flex items-center cursor-pointer"
                >
                  <RefreshCw className="w-3 h-3 mr-1" /> Resend Code
                </button>
              )}
            </div>
          </form>
        )}
      </div>
    </div>
  );
}
