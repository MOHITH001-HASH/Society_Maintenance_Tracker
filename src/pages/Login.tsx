import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { signInWithPopup, GoogleAuthProvider, signInAnonymously } from "firebase/auth";
import { doc, setDoc, getDoc, collection, query, where, getDocs, deleteDoc, updateDoc, onSnapshot, addDoc } from "firebase/firestore";
import { auth, db } from "../lib/firebase";
import { Society } from "../types";
import { Building2, Plus, Users, ShieldCheck, MapPin, Mail, Phone, KeyRound } from "lucide-react";
import SocietyOnboardingModal from "../components/SocietyOnboardingModal";
import OtpModal from "../components/OtpModal";

export default function Login() {
  const [role, setRole] = useState<"resident" | "admin">("resident");
  const [societies, setSocieties] = useState<Society[]>([]);
  const [selectedSocietyId, setSelectedSocietyId] = useState<string>("");
  const [unitNumber, setUnitNumber] = useState("");
  const [residentType, setResidentType] = useState<"primary" | "household">("primary");
  const [error, setError] = useState("");
  const [loadingSocieties, setLoadingSocieties] = useState(true);
  
  // Auth method tab: Google vs OTP
  const [authMethod, setAuthMethod] = useState<"google" | "otp">("google");
  const [otpContact, setOtpContact] = useState("");
  const [otpContactType, setOtpContactType] = useState<"email" | "sms">("email");
  const [showOtpModal, setShowOtpModal] = useState(false);
  const [otpName, setOtpName] = useState("");
  
  // Quick Society Creation Modal for new admins
  const [showCreateSocietyModal, setShowCreateSocietyModal] = useState(false);
  
  const navigate = useNavigate();

  useEffect(() => {
    const qSocieties = query(collection(db, "societies"));
    const unsubscribe = onSnapshot(qSocieties, (snapshot) => {
      const docs = snapshot.docs.map((d) => ({ id: d.id, ...d.data() } as Society));
      setSocieties(docs);
      if (docs.length > 0 && !selectedSocietyId) {
        setSelectedSocietyId(docs[0].id);
      }
      setLoadingSocieties(false);
    }, (err) => {
      console.error("Error fetching societies:", err);
      setLoadingSocieties(false);
    });

    return () => unsubscribe();
  }, []);

  const selectedSociety = societies.find((s) => s.id === selectedSocietyId);

  const handleStartOtpFlow = () => {
    if (role === "resident") {
      if (!selectedSocietyId) {
        setError("Please select your Society or Apartment complex.");
        return;
      }
      if (!unitNumber.trim()) {
        setError("Please select or enter your Apartment / Unit number.");
        return;
      }
    }
    if (!otpContact.trim()) {
      setError(`Please enter your ${otpContactType === 'email' ? 'email address' : 'mobile phone number'}.`);
      return;
    }
    setError("");
    setShowOtpModal(true);
  };

  const handleOtpVerified = async () => {
    setShowOtpModal(false);
    try {
      // Sign in anonymously to obtain a valid Firebase Auth session
      const userCred = await signInAnonymously(auth);
      const uid = userCred.user.uid;
      const contactVal = otpContact.trim().toLowerCase();
      
      const userDoc = await getDoc(doc(db, "users", uid));
      if (!userDoc.exists()) {
        const isHousehold = role === "resident" && residentType === "household";
        const initialStatus = isHousehold ? "pending" : "approved";

        await setDoc(doc(db, "users", uid), {
          email: otpContactType === "email" ? contactVal : `${uid.slice(0, 6)}@society.internal`,
          phone: otpContactType === "sms" ? contactVal : "",
          name: otpName.trim() || (otpContactType === "email" ? contactVal.split("@")[0] : `Resident ${unitNumber}`),
          role: role,
          societyId: selectedSocietyId || null,
          unitNumber: role === "resident" ? unitNumber : null,
          residentType: role === "resident" ? residentType : null,
          status: initialStatus,
          createdAt: new Date().toISOString()
        });
      }

      navigate("/");
    } catch (err: any) {
      console.error("Error signing in via OTP:", err);
      setError(err.message || "Failed to complete authentication.");
    }
  };

  const handleGoogleSignIn = async () => {
    if (role === "resident") {
      if (!selectedSocietyId) {
        setError("Please select your Society or Apartment complex.");
        return;
      }
      if (!unitNumber.trim()) {
        setError("Please select or enter your Apartment / Unit number.");
        return;
      }
    }
    
    setError("");
    try {
      const provider = new GoogleAuthProvider();
      const userCred = await signInWithPopup(auth, provider);
      
      // Check if user already exists
      const userDoc = await getDoc(doc(db, "users", userCred.user.uid));
      
      if (!userDoc.exists()) {
        const emailLowerCase = userCred.user.email?.toLowerCase() || "";
        
        // Check if there is an invited placeholder profile
        const q = query(collection(db, "users"), where("email", "==", emailLowerCase));
        const querySnapshot = await getDocs(q);
        
        let existingData: any = null;
        let existingDocId: string | null = null;
        
        if (!querySnapshot.empty) {
          const docToCopy = querySnapshot.docs[0];
          existingData = docToCopy.data();
          existingDocId = docToCopy.id;
        }

        const isHousehold = role === "resident" && residentType === "household";
        let initialStatus = isHousehold ? "pending" : "approved";
        
        // If an invitation or registration doc exists, preserve its status and invitation details
        if (existingData && existingData.status) {
          initialStatus = existingData.status;
        }

        const assignedSocietyId = existingData?.societyId || (role === "resident" ? selectedSocietyId : (selectedSocietyId || null));

        const newUserName = userCred.user.displayName || existingData?.name || "New User";
        // Create new user profile linked to real UID
        await setDoc(doc(db, "users", userCred.user.uid), {
          email: emailLowerCase,
          name: newUserName,
          role: existingData?.role || role,
          societyId: assignedSocietyId,
          unitNumber: existingData?.unitNumber || (role === "resident" ? unitNumber : null),
          residentType: existingData?.residentType || (role === "resident" ? residentType : null),
          status: initialStatus,
          invitedBy: existingData?.invitedBy || null,
          invitedByName: existingData?.invitedByName || null,
          createdAt: existingData?.createdAt || new Date().toISOString()
        });

        // Audit Log entry for user join
        if (assignedSocietyId) {
          try {
            await addDoc(collection(db, "auditLogs"), {
              societyId: assignedSocietyId,
              action: initialStatus === "approved" ? "Resident Joined" : "Household Registration Pending",
              category: "membership",
              description: `${newUserName} (${emailLowerCase}) registered for Unit ${existingData?.unitNumber || unitNumber || 'Unassigned'} as ${existingData?.residentType || residentType || 'Resident'} (${initialStatus}).`,
              actorId: userCred.user.uid,
              actorName: newUserName,
              actorRole: existingData?.role || role,
              unitNumber: existingData?.unitNumber || (role === "resident" ? unitNumber : undefined),
              timestamp: new Date().toISOString()
            });
          } catch (e) {
            console.error("Audit log write error:", e);
          }
        }

        // Delete the orphan invitation document
        if (existingDocId) {
          await deleteDoc(doc(db, "users", existingDocId));
        }
      } else {
        // Existing user
        const existingData = userDoc.data();
        const updates: any = {};
        
        // If user changed role or updated society
        if (role !== existingData.role) {
          updates.role = role;
        }
        if (selectedSocietyId && (!existingData.societyId || existingData.societyId !== selectedSocietyId)) {
          updates.societyId = selectedSocietyId;
        }
        if (role === "resident" && unitNumber && unitNumber !== existingData.unitNumber) {
          updates.unitNumber = unitNumber;
        }

        if (Object.keys(updates).length > 0) {
          await updateDoc(doc(db, "users", userCred.user.uid), updates);
        }
      }
      
      navigate("/");
    } catch (err: any) {
      console.error(err);
      setError(err.message || "Failed to sign in with Google");
    }
  };

  return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-slate-900 px-4 py-8 relative">
      {/* Background Decor */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none opacity-20">
        <div className="absolute -top-40 -right-40 w-96 h-96 bg-blue-600 rounded-full blur-3xl" />
        <div className="absolute -bottom-40 -left-40 w-96 h-96 bg-indigo-600 rounded-full blur-3xl" />
      </div>

      <div className="max-w-md w-full bg-white rounded-2xl shadow-2xl p-6 sm:p-8 relative z-10 border border-slate-100">
        <div className="text-center mb-6">
          <div className="w-12 h-12 bg-blue-600 rounded-2xl flex items-center justify-center mx-auto mb-3 shadow-lg shadow-blue-500/30">
            <Building2 className="w-6 h-6 text-white" />
          </div>
          <h2 className="text-2xl font-black text-slate-900 tracking-tight">
            Society Portal
          </h2>
          <p className="text-xs text-slate-500 mt-1 font-medium">
            Multi-Tenant Resident & Society Management System
          </p>
        </div>
        
        {error && (
          <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-xl mb-5 text-xs font-semibold flex items-center">
            <span className="mr-2">⚠️</span> {error}
          </div>
        )}
        
        <div className="mb-6 bg-slate-50 border border-slate-200 rounded-xl p-4 space-y-4">
          <div>
            <label className="block text-xs font-bold uppercase tracking-wider text-slate-700 mb-1.5 flex items-center">
              <ShieldCheck className="w-4 h-4 mr-1 text-blue-600" /> Account Role
            </label>
            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={() => setRole("resident")}
                className={`py-2 px-3 rounded-lg text-xs font-bold transition-all ${
                  role === "resident"
                    ? "bg-blue-600 text-white shadow-xs"
                    : "bg-white text-slate-700 border border-slate-200 hover:bg-slate-100"
                }`}
              >
                Resident
              </button>
              <button
                type="button"
                onClick={() => setRole("admin")}
                className={`py-2 px-3 rounded-lg text-xs font-bold transition-all ${
                  role === "admin"
                    ? "bg-slate-900 text-white shadow-xs"
                    : "bg-white text-slate-700 border border-slate-200 hover:bg-slate-100"
                }`}
              >
                Society Admin
              </button>
            </div>
          </div>

          {/* Society / Apartment Selection */}
          <div>
            <div className="flex items-center justify-between mb-1.5">
              <label className="block text-xs font-bold uppercase tracking-wider text-slate-700 flex items-center">
                <Building2 className="w-4 h-4 mr-1 text-blue-600" /> Select Society / Apartment
              </label>
              {role === "admin" && (
                <button
                  type="button"
                  onClick={() => setShowCreateSocietyModal(true)}
                  className="text-xs text-blue-600 hover:text-blue-800 font-bold flex items-center"
                >
                  <Plus className="w-3 h-3 mr-0.5" /> New Society
                </button>
              )}
            </div>

            {loadingSocieties ? (
              <div className="text-xs text-slate-400 py-2">Loading registered societies...</div>
            ) : societies.length > 0 ? (
              <select
                value={selectedSocietyId}
                onChange={(e) => {
                  setSelectedSocietyId(e.target.value);
                  setUnitNumber(""); // reset unit selection
                }}
                className="block w-full rounded-lg border border-slate-300 px-3 py-2 text-xs font-semibold text-slate-900 bg-white shadow-2xs focus:border-blue-500 focus:outline-hidden focus:ring-1 focus:ring-blue-500"
              >
                <option value="">Choose Society / Complex...</option>
                {societies.map((soc) => (
                  <option key={soc.id} value={soc.id}>
                    {soc.name || soc.buildingName} ({soc.address})
                  </option>
                ))}
              </select>
            ) : (
              <div className="p-3 bg-amber-50 border border-amber-200 rounded-lg text-xs text-amber-800">
                No societies configured yet.
                {role === "admin" ? (
                  <button
                    type="button"
                    onClick={() => setShowCreateSocietyModal(true)}
                    className="block mt-1 font-bold text-blue-600 underline"
                  >
                    Click here to create your apartment complex now!
                  </button>
                ) : (
                  <span className="block mt-0.5">Please ask your Society Admin to initialize the building.</span>
                )}
              </div>
            )}

            {selectedSociety && (
              <p className="text-[11px] text-slate-500 mt-1 flex items-center">
                <MapPin className="w-3 h-3 mr-1 text-slate-400" /> {selectedSociety.address} ({selectedSociety.numberOfFloors} Floors, {selectedSociety.totalApartments} Units)
              </p>
            )}
          </div>

          {/* Resident Details */}
          {role === "resident" && (
            <>
              <div>
                <label className="block text-xs font-bold uppercase tracking-wider text-slate-700 mb-1.5">
                  Apartment Unit
                </label>
                {selectedSociety?.generatedUnits && selectedSociety.generatedUnits.length > 0 ? (
                  <select
                    required
                    value={unitNumber}
                    onChange={(e) => setUnitNumber(e.target.value)}
                    className="block w-full rounded-lg border border-slate-300 px-3 py-2 text-xs font-semibold text-slate-900 bg-white shadow-2xs focus:border-blue-500 focus:outline-hidden focus:ring-1 focus:ring-blue-500"
                  >
                    <option value="">Select your Apartment Unit...</option>
                    {selectedSociety.generatedUnits.map((unit) => (
                      <option key={unit} value={unit}>
                        Unit {unit}
                      </option>
                    ))}
                  </select>
                ) : (
                  <input
                    type="text"
                    required
                    placeholder="e.g. 101, 204, Apt 4B"
                    value={unitNumber}
                    onChange={(e) => setUnitNumber(e.target.value)}
                    className="block w-full rounded-lg border border-slate-300 px-3 py-2 text-xs font-semibold text-slate-900 bg-white shadow-2xs focus:border-blue-500 focus:outline-hidden focus:ring-1 focus:ring-blue-500"
                  />
                )}
              </div>

              <div>
                <label className="block text-xs font-bold uppercase tracking-wider text-slate-700 mb-1.5 flex items-center">
                  <Users className="w-4 h-4 mr-1 text-blue-600" /> Resident Type
                </label>
                <div className="grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    onClick={() => setResidentType("primary")}
                    className={`py-2 px-2.5 rounded-lg text-xs font-bold transition-all ${
                      residentType === "primary"
                        ? "bg-slate-900 text-white shadow-xs"
                        : "bg-white text-slate-700 border border-slate-200 hover:bg-slate-100"
                    }`}
                  >
                    Primary Resident
                  </button>
                  <button
                    type="button"
                    onClick={() => setResidentType("household")}
                    className={`py-2 px-2.5 rounded-lg text-xs font-bold transition-all ${
                      residentType === "household"
                        ? "bg-slate-900 text-white shadow-xs"
                        : "bg-white text-slate-700 border border-slate-200 hover:bg-slate-100"
                    }`}
                  >
                    Household Member
                  </button>
                </div>
                {residentType === "household" && (
                  <p className="text-[11px] text-orange-600 mt-1.5 font-medium">
                    Household members are subject to primary resident or admin approval.
                  </p>
                )}
              </div>
            </>
          )}
        </div>

        {/* Authentication Mode Switcher: Google vs OTP */}
        <div className="mb-4 flex border-b border-slate-200">
          <button
            type="button"
            onClick={() => setAuthMethod("google")}
            className={`flex-1 py-2 text-xs font-bold border-b-2 transition ${
              authMethod === "google"
                ? "border-blue-600 text-blue-600"
                : "border-transparent text-slate-400 hover:text-slate-700"
            }`}
          >
            Google Sign-In
          </button>
          <button
            type="button"
            onClick={() => setAuthMethod("otp")}
            className={`flex-1 py-2 text-xs font-bold border-b-2 transition flex items-center justify-center ${
              authMethod === "otp"
                ? "border-blue-600 text-blue-600"
                : "border-transparent text-slate-400 hover:text-slate-700"
            }`}
          >
            <KeyRound className="w-3.5 h-3.5 mr-1" /> OTP Microservice
          </button>
        </div>

        {authMethod === "google" ? (
          <button
            onClick={handleGoogleSignIn}
            className="w-full flex justify-center items-center bg-white border border-slate-300 text-slate-800 rounded-xl py-3 px-4 hover:bg-slate-50 focus:outline-hidden focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 transition-all font-bold text-xs shadow-xs"
          >
            <img src="https://www.gstatic.com/firebasejs/ui/2.0.0/images/auth/google.svg" alt="Google logo" className="w-4 h-4 mr-2" />
            Continue with Google Account
          </button>
        ) : (
          <div className="space-y-3">
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => setOtpContactType("email")}
                className={`flex-1 py-1.5 text-xs font-bold rounded-lg border transition ${
                  otpContactType === "email"
                    ? "bg-blue-50 border-blue-300 text-blue-700"
                    : "bg-white border-slate-200 text-slate-600"
                }`}
              >
                <Mail className="w-3.5 h-3.5 inline mr-1" /> Email OTP
              </button>
              <button
                type="button"
                onClick={() => setOtpContactType("sms")}
                className={`flex-1 py-1.5 text-xs font-bold rounded-lg border transition ${
                  otpContactType === "sms"
                    ? "bg-blue-50 border-blue-300 text-blue-700"
                    : "bg-white border-slate-200 text-slate-600"
                }`}
              >
                <Phone className="w-3.5 h-3.5 inline mr-1" /> SMS OTP
              </button>
            </div>

            <div>
              <label className="block text-[11px] font-bold uppercase tracking-wider text-slate-700 mb-1">
                Your Full Name (Optional)
              </label>
              <input
                type="text"
                value={otpName}
                onChange={(e) => setOtpName(e.target.value)}
                placeholder="e.g. John Doe"
                className="w-full px-3 py-2 text-xs rounded-lg border border-slate-300 focus:outline-hidden focus:ring-1 focus:ring-blue-500"
              />
            </div>

            <div>
              <label className="block text-[11px] font-bold uppercase tracking-wider text-slate-700 mb-1">
                {otpContactType === "email" ? "Email Address" : "Mobile Phone Number"}
              </label>
              <input
                type={otpContactType === "email" ? "email" : "tel"}
                value={otpContact}
                onChange={(e) => setOtpContact(e.target.value)}
                placeholder={otpContactType === "email" ? "user@example.com" : "+1 (555) 123-4567"}
                className="w-full px-3 py-2 text-xs rounded-lg border border-slate-300 focus:outline-hidden focus:ring-1 focus:ring-blue-500"
              />
            </div>

            <button
              onClick={handleStartOtpFlow}
              className="w-full flex justify-center items-center bg-blue-600 text-white rounded-xl py-3 px-4 hover:bg-blue-700 focus:outline-hidden focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 transition-all font-bold text-xs shadow-xs"
            >
              <KeyRound className="w-4 h-4 mr-2" /> Send One-Time Password
            </button>
          </div>
        )}

        <div className="mt-4 pt-4 border-t border-slate-100 text-center">
          <p className="text-[11px] text-slate-400">
            Real OTP verification microservice & multi-tenant isolation.
          </p>
        </div>
      </div>

      {/* OTP Verification Modal */}
      <OtpModal
        isOpen={showOtpModal}
        onClose={() => setShowOtpModal(false)}
        contact={otpContact}
        type={otpContactType}
        onVerified={handleOtpVerified}
        title="Sign-In Security Verification"
        subtitle={`Enter the 6-digit code sent to ${otpContact} to sign in to your society.`}
      />

      {/* Quick Society Onboarding Modal */}
      <SocietyOnboardingModal
        isOpen={showCreateSocietyModal}
        onClose={() => setShowCreateSocietyModal(false)}
        isDismissable={true}
        onSocietyCreated={(newId) => {
          setSelectedSocietyId(newId);
          setShowCreateSocietyModal(false);
        }}
      />
    </div>
  );
}
