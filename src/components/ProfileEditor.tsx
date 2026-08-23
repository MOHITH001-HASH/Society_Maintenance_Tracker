import { useState, ChangeEvent } from 'react';
import { updateDoc, doc } from 'firebase/firestore';
import { db } from '../lib/firebase';
import { User } from '../types';
import { Camera, Mail, Phone, User as UserIcon, ShieldCheck } from 'lucide-react';
import { uploadMedia } from '../lib/mediaUpload';
import OtpModal from './OtpModal';

interface ProfileEditorProps {
  userProfile: User;
}

export default function ProfileEditor({ userProfile }: ProfileEditorProps) {
  const [name, setName] = useState(userProfile.name || '');
  const [email, setEmail] = useState(userProfile.email || '');
  const [phone, setPhone] = useState(userProfile.phone || '');
  const [photoURL, setPhotoURL] = useState(userProfile.photoURL || '');
  
  const [isSaving, setIsSaving] = useState(false);
  const [uploadingImage, setUploadingImage] = useState(false);
  const [message, setMessage] = useState({ type: '', text: '' });
  
  const [showOTP, setShowOTP] = useState(false);
  const [otpMode, setOtpMode] = useState<'email' | 'phone' | null>(null);
  
  const hasEmailChanged = email !== userProfile.email;
  const hasPhoneChanged = phone !== (userProfile.phone || '');
  const hasChanges = name !== userProfile.name || hasEmailChanged || hasPhoneChanged || photoURL !== (userProfile.photoURL || '');

  const handleSave = async () => {
    setMessage({ type: '', text: '' });
    
    if (hasEmailChanged) {
      setOtpMode('email');
      setShowOTP(true);
      return;
    }
    if (hasPhoneChanged) {
      setOtpMode('phone');
      setShowOTP(true);
      return;
    }
    
    await saveToDb();
  };

  const handleOtpVerified = async () => {
    setShowOTP(false);
    setOtpMode(null);
    await saveToDb();
  };

  const handleImageFileChange = async (e: ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      const file = e.target.files[0];
      setUploadingImage(true);
      try {
        const result = await uploadMedia(file);
        if (result.url) {
          setPhotoURL(result.url);
          setMessage({ type: 'success', text: 'Photo uploaded. Click Save Changes to apply.' });
        }
      } catch (err: any) {
        console.error('Upload failed', err);
        setMessage({ type: 'error', text: err.message || 'Image upload failed' });
      } finally {
        setUploadingImage(false);
      }
    }
  };

  const saveToDb = async () => {
    if (!userProfile.id) return;
    setIsSaving(true);
    try {
      await updateDoc(doc(db, 'users', userProfile.id), {
        name,
        email,
        phone,
        photoURL
      });
      setMessage({ type: 'success', text: 'Profile updated successfully.' });
    } catch(err) {
      console.error(err);
      setMessage({ type: 'error', text: 'Failed to update profile.' });
    }
    setIsSaving(false);
  };

  return (
    <div className="bg-white rounded-xl shadow-xs border border-slate-200 overflow-hidden max-w-3xl mx-auto">
      <div className="p-6 border-b border-slate-200 bg-slate-50">
        <h2 className="text-base font-bold text-slate-900">Personal Profile & Security</h2>
        <p className="text-xs text-slate-500 mt-0.5">Manage your personal credentials, contact details, and OTP verifications.</p>
      </div>
      <div className="p-6">
        {message.text && (
          <div className={`mb-5 p-3 rounded-xl text-xs font-semibold ${message.type === 'error' ? 'bg-red-50 text-red-700 border border-red-200' : 'bg-green-50 text-green-700 border border-green-200'}`}>
            {message.text}
          </div>
        )}

        <div className="flex flex-col md:flex-row gap-8">
          <div className="flex flex-col items-center space-y-3">
            <div className="relative w-28 h-28 rounded-2xl bg-slate-100 flex items-center justify-center text-slate-400 text-3xl font-bold overflow-hidden border-2 border-slate-200 shadow-2xs">
              {photoURL ? (
                <img src={photoURL} alt="Profile" className="w-full h-full object-cover" />
              ) : (
                userProfile.name?.charAt(0).toUpperCase() || <UserIcon className="w-10 h-10" />
              )}
              {uploadingImage && (
                <div className="absolute inset-0 bg-black/50 flex items-center justify-center text-white text-xs font-bold">
                  Uploading...
                </div>
              )}
            </div>
            <div>
              <label className="cursor-pointer bg-white border border-slate-300 text-slate-700 px-3 py-1.5 rounded-lg text-xs font-bold hover:bg-slate-50 shadow-2xs transition inline-flex items-center">
                <Camera className="w-3.5 h-3.5 mr-1.5" /> {uploadingImage ? 'Uploading...' : 'Change Photo'}
                <input 
                  type="file" 
                  className="hidden" 
                  accept="image/*"
                  onChange={handleImageFileChange} 
                />
              </label>
            </div>
          </div>

          <div className="flex-1 space-y-4">
            <div>
              <label className="block text-xs font-bold uppercase tracking-wider text-slate-700 mb-1">Full Name</label>
              <div className="relative">
                <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-slate-400">
                  <UserIcon className="w-4 h-4" />
                </div>
                <input
                  type="text"
                  value={name}
                  onChange={e => setName(e.target.value)}
                  className="pl-9 w-full rounded-lg border border-slate-300 px-3 py-2 text-xs font-semibold focus:outline-hidden focus:ring-1 focus:ring-blue-500"
                />
              </div>
            </div>

            <div>
              <label className="block text-xs font-bold uppercase tracking-wider text-slate-700 mb-1">Email Address</label>
              <div className="relative">
                <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-slate-400">
                  <Mail className="w-4 h-4" />
                </div>
                <input
                  type="email"
                  value={email}
                  onChange={e => setEmail(e.target.value)}
                  className="pl-9 w-full rounded-lg border border-slate-300 px-3 py-2 text-xs font-semibold focus:outline-hidden focus:ring-1 focus:ring-blue-500"
                />
              </div>
              {hasEmailChanged && (
                <p className="mt-1 text-[11px] text-amber-600 font-bold flex items-center">
                  <ShieldCheck className="w-3.5 h-3.5 mr-1"/> Requires OTP Verification
                </p>
              )}
            </div>

            <div>
              <label className="block text-xs font-bold uppercase tracking-wider text-slate-700 mb-1">Mobile Phone Number (India +91)</label>
              <div className="relative">
                <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-slate-500 font-bold text-xs">
                  🇮🇳 +91
                </div>
                <input
                  type="tel"
                  value={phone.replace(/^\+91\s*/, '')}
                  onChange={e => {
                    const val = e.target.value.replace(/[^\d\s]/g, '');
                    setPhone(val ? `+91 ${val}` : '');
                  }}
                  placeholder="98765 43210"
                  className="pl-16 w-full rounded-lg border border-slate-300 px-3 py-2 text-xs font-semibold focus:outline-hidden focus:ring-1 focus:ring-blue-500"
                />
              </div>
              {hasPhoneChanged && (
                <p className="mt-1 text-[11px] text-amber-600 font-bold flex items-center">
                  <ShieldCheck className="w-3.5 h-3.5 mr-1"/> Requires OTP Verification
                </p>
              )}
            </div>

            <div className="pt-4 border-t border-slate-100 flex justify-end">
              <button
                onClick={handleSave}
                disabled={!hasChanges || isSaving}
                className="bg-blue-600 text-white px-5 py-2.5 rounded-lg font-bold text-xs shadow-xs hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
              >
                {isSaving ? 'Saving...' : (hasEmailChanged || hasPhoneChanged) ? 'Verify with OTP & Save' : 'Save Changes'}
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* OTP Verification Modal */}
      <OtpModal
        isOpen={showOTP}
        onClose={() => {
          setShowOTP(false);
          setOtpMode(null);
        }}
        contact={otpMode === 'email' ? email : phone}
        type={otpMode === 'email' ? 'email' : 'sms'}
        onVerified={handleOtpVerified}
        title="Verify Contact Change"
        subtitle={`To update your ${otpMode === 'email' ? 'email address' : 'mobile number'}, enter the 6-digit OTP code.`}
      />
    </div>
  );
}
