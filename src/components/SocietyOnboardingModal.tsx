import { useState, FormEvent } from "react";
import { doc, setDoc, addDoc, collection, updateDoc } from "firebase/firestore";
import { db } from "../lib/firebase";
import { useAuth } from "../contexts/AuthContext";
import { Society } from "../types";
import { Building2, MapPin, Layers, Hash, CheckCircle2, Plus, Sparkles, ArrowRight } from "lucide-react";

interface SocietyOnboardingModalProps {
  isOpen: boolean;
  onClose?: () => void;
  existingSociety?: Society | null;
  onSocietyCreated?: (societyId: string) => void;
  isDismissable?: boolean;
}

export default function SocietyOnboardingModal({
  isOpen,
  onClose,
  existingSociety,
  onSocietyCreated,
  isDismissable = false
}: SocietyOnboardingModalProps) {
  const { user, userProfile } = useAuth();
  
  const [name, setName] = useState(existingSociety?.name || existingSociety?.buildingName || "");
  const [address, setAddress] = useState(existingSociety?.address || "");
  const [floors, setFloors] = useState(existingSociety?.numberOfFloors || 4);
  const [unitsPerFloor, setUnitsPerFloor] = useState(existingSociety?.unitsPerFloor || 4);
  const [customUnits, setCustomUnits] = useState<string[]>(existingSociety?.generatedUnits || []);
  const [newCustomUnit, setNewCustomUnit] = useState("");
  const [saving, setSaving] = useState(false);
  const [step, setStep] = useState<1 | 2>(1);
  const [error, setError] = useState("");

  if (!isOpen) return null;

  const generateDefaultUnits = (numFloors: number, perFloor: number) => {
    const list: string[] = [];
    for (let f = 1; f <= numFloors; f++) {
      for (let u = 1; u <= perFloor; u++) {
        list.push(`${f}0${u}`);
      }
    }
    return list;
  };

  const handleNext = (e: FormEvent) => {
    e.preventDefault();
    if (!name.trim() || !address.trim()) {
      setError("Please provide the society name and physical address.");
      return;
    }
    if (floors <= 0 || unitsPerFloor <= 0) {
      setError("Number of floors and units per floor must be greater than 0.");
      return;
    }
    setError("");
    if (customUnits.length === 0) {
      setCustomUnits(generateDefaultUnits(floors, unitsPerFloor));
    }
    setStep(2);
  };

  const handleAddUnit = () => {
    if (newCustomUnit.trim() && !customUnits.includes(newCustomUnit.trim())) {
      setCustomUnits([...customUnits, newCustomUnit.trim()]);
      setNewCustomUnit("");
    }
  };

  const handleRemoveUnit = (unitToRemove: string) => {
    setCustomUnits(customUnits.filter(u => u !== unitToRemove));
  };

  const handleSaveSociety = async () => {
    if (!user) return;
    setSaving(true);
    setError("");

    try {
      const unitsToSave = customUnits.length > 0 ? customUnits : generateDefaultUnits(floors, unitsPerFloor);
      const totalUnits = unitsToSave.length;
      
      const societyData: Omit<Society, "id"> = {
        name: name.trim(),
        buildingName: name.trim(),
        address: address.trim(),
        numberOfFloors: Number(floors),
        unitsPerFloor: Number(unitsPerFloor),
        totalApartments: totalUnits,
        generatedUnits: unitsToSave,
        adminId: user.uid,
        adminEmail: user.email || "",
        isSetupComplete: true,
        createdAt: existingSociety?.createdAt || new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };

      let targetSocietyId = existingSociety?.id;

      if (targetSocietyId) {
        await updateDoc(doc(db, "societies", targetSocietyId), societyData);
      } else {
        const newDocRef = await addDoc(collection(db, "societies"), societyData);
        targetSocietyId = newDocRef.id;
      }

      // Link current user to this society
      await updateDoc(doc(db, "users", user.uid), {
        societyId: targetSocietyId,
        role: "admin",
        status: "approved",
        updatedAt: new Date().toISOString(),
      });

      // Also create an audit log
      await addDoc(collection(db, "auditLogs"), {
        societyId: targetSocietyId,
        action: existingSociety ? "Society Settings Updated" : "Society Initialized",
        description: `Society "${name}" configured with ${floors} floors and ${totalUnits} units.`,
        timestamp: new Date().toISOString()
      });

      setSaving(false);
      if (onSocietyCreated) {
        onSocietyCreated(targetSocietyId);
      }
      if (onClose) {
        onClose();
      }
    } catch (err: any) {
      console.error("Error creating society:", err);
      setError(err.message || "Failed to initialize society");
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4 overflow-y-auto">
      <div className="bg-white rounded-2xl shadow-2xl max-w-xl w-full overflow-hidden border border-slate-200 animate-in fade-in zoom-in-95 duration-200">
        
        {/* Header */}
        <div className="bg-slate-900 px-6 py-5 text-white flex items-center justify-between">
          <div className="flex items-center space-x-3">
            <div className="p-2.5 bg-blue-600 rounded-xl shadow-xs">
              <Building2 className="w-6 h-6 text-white" />
            </div>
            <div>
              <h3 className="text-lg font-bold">
                {existingSociety ? "Configure Society & Apartments" : "Initialize Society / Apartment Complex"}
              </h3>
              <p className="text-xs text-slate-400">
                {step === 1 ? "Step 1 of 2: Basic Details & Floors" : "Step 2 of 2: Unit Generation & Confirmation"}
              </p>
            </div>
          </div>
          {isDismissable && onClose && (
            <button
              onClick={onClose}
              className="text-slate-400 hover:text-white text-sm font-medium transition-colors"
            >
              ✕
            </button>
          )}
        </div>

        <div className="p-6">
          {error && (
            <div className="mb-5 p-3 rounded-lg bg-red-50 border border-red-200 text-red-700 text-sm flex items-center">
              <span className="mr-2">⚠️</span> {error}
            </div>
          )}

          {step === 1 ? (
            <form onSubmit={handleNext} className="space-y-4">
              <div>
                <label className="block text-xs font-semibold uppercase tracking-wider text-slate-600 mb-1.5 flex items-center">
                  <Building2 className="w-4 h-4 mr-1.5 text-blue-600" /> Society / Apartment Complex Name
                </label>
                <input
                  type="text"
                  required
                  placeholder="e.g. Skyline Heights Apartments"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  className="w-full px-3.5 py-2.5 rounded-lg border border-slate-300 focus:outline-hidden focus:ring-2 focus:ring-blue-500 focus:border-blue-500 text-slate-900 text-sm font-medium"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold uppercase tracking-wider text-slate-600 mb-1.5 flex items-center">
                  <MapPin className="w-4 h-4 mr-1.5 text-blue-600" /> Full Address & Location
                </label>
                <input
                  type="text"
                  required
                  placeholder="e.g. 104 Park Avenue, Suite 400, NY 10022"
                  value={address}
                  onChange={(e) => setAddress(e.target.value)}
                  className="w-full px-3.5 py-2.5 rounded-lg border border-slate-300 focus:outline-hidden focus:ring-2 focus:ring-blue-500 focus:border-blue-500 text-slate-900 text-sm"
                />
              </div>

              <div className="grid grid-cols-2 gap-4 pt-2">
                <div>
                  <label className="block text-xs font-semibold uppercase tracking-wider text-slate-600 mb-1.5 flex items-center">
                    <Layers className="w-4 h-4 mr-1.5 text-blue-600" /> Number of Floors
                  </label>
                  <input
                    type="number"
                    min="1"
                    max="150"
                    required
                    value={floors}
                    onChange={(e) => {
                      const f = parseInt(e.target.value) || 1;
                      setFloors(f);
                      setCustomUnits(generateDefaultUnits(f, unitsPerFloor));
                    }}
                    className="w-full px-3.5 py-2.5 rounded-lg border border-slate-300 focus:outline-hidden focus:ring-2 focus:ring-blue-500 focus:border-blue-500 text-slate-900 text-sm font-semibold"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold uppercase tracking-wider text-slate-600 mb-1.5 flex items-center">
                    <Hash className="w-4 h-4 mr-1.5 text-blue-600" /> Units per Floor
                  </label>
                  <input
                    type="number"
                    min="1"
                    max="50"
                    required
                    value={unitsPerFloor}
                    onChange={(e) => {
                      const u = parseInt(e.target.value) || 1;
                      setUnitsPerFloor(u);
                      setCustomUnits(generateDefaultUnits(floors, u));
                    }}
                    className="w-full px-3.5 py-2.5 rounded-lg border border-slate-300 focus:outline-hidden focus:ring-2 focus:ring-blue-500 focus:border-blue-500 text-slate-900 text-sm font-semibold"
                  />
                </div>
              </div>

              <div className="p-3 bg-blue-50/70 border border-blue-100 rounded-xl text-xs text-blue-800 flex items-start space-x-2">
                <Sparkles className="w-4 h-4 text-blue-600 mt-0.5 shrink-0" />
                <span>
                  This will automatically configure <strong>{floors * unitsPerFloor} total apartment units</strong> mapped across {floors} floors (e.g. 101, 102, 201, 202...). You can customize unit numbers in the next step.
                </span>
              </div>

              <div className="pt-3 flex justify-end">
                <button
                  type="submit"
                  className="inline-flex items-center px-5 py-2.5 rounded-lg bg-blue-600 hover:bg-blue-700 text-white text-sm font-semibold shadow-xs transition-colors"
                >
                  Continue to Unit Matrix <ArrowRight className="w-4 h-4 ml-2" />
                </button>
              </div>
            </form>
          ) : (
            <div className="space-y-4">
              <div className="flex items-center justify-between pb-2 border-b border-slate-200">
                <div>
                  <h4 className="text-sm font-bold text-slate-800">Review & Customize Generated Units</h4>
                  <p className="text-xs text-slate-500">
                    Total Units: <strong className="text-blue-600 font-bold">{customUnits.length}</strong>
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => setCustomUnits(generateDefaultUnits(floors, unitsPerFloor))}
                  className="text-xs text-blue-600 hover:text-blue-800 font-semibold"
                >
                  Reset to Default
                </button>
              </div>

              {/* Add Custom Unit Input */}
              <div className="flex gap-2">
                <input
                  type="text"
                  placeholder="e.g. Penthouse-1, PH-A, 501"
                  value={newCustomUnit}
                  onChange={(e) => setNewCustomUnit(e.target.value)}
                  onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); handleAddUnit(); } }}
                  className="flex-1 px-3 py-2 text-xs rounded-lg border border-slate-300 focus:outline-hidden focus:ring-1 focus:ring-blue-500"
                />
                <button
                  type="button"
                  onClick={handleAddUnit}
                  className="px-3 py-2 bg-slate-800 hover:bg-slate-900 text-white rounded-lg text-xs font-semibold flex items-center transition"
                >
                  <Plus className="w-3.5 h-3.5 mr-1" /> Add Unit
                </button>
              </div>

              {/* Unit Matrix Chips */}
              <div className="max-h-56 overflow-y-auto p-3 bg-slate-50 rounded-xl border border-slate-200 flex flex-wrap gap-1.5">
                {customUnits.map((unit) => (
                  <span
                    key={unit}
                    className="inline-flex items-center px-2.5 py-1 rounded-md bg-white border border-slate-200 text-xs font-medium text-slate-800 shadow-2xs"
                  >
                    Unit {unit}
                    <button
                      type="button"
                      onClick={() => handleRemoveUnit(unit)}
                      className="ml-1.5 text-slate-400 hover:text-red-500 transition-colors"
                      title="Remove unit"
                    >
                      ✕
                    </button>
                  </span>
                ))}
              </div>

              <div className="pt-4 flex items-center justify-between">
                <button
                  type="button"
                  onClick={() => setStep(1)}
                  className="px-4 py-2 text-sm font-semibold text-slate-600 hover:text-slate-900 transition-colors"
                >
                  ← Back
                </button>

                <button
                  type="button"
                  disabled={saving || customUnits.length === 0}
                  onClick={handleSaveSociety}
                  className="inline-flex items-center px-6 py-2.5 rounded-lg bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white text-sm font-semibold shadow-xs transition-colors"
                >
                  {saving ? (
                    "Saving Society..."
                  ) : (
                    <>
                      <CheckCircle2 className="w-4 h-4 mr-2" /> Complete Setup & Activate
                    </>
                  )}
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
