import { useState, useEffect, FormEvent, ChangeEvent } from "react";
import { collection, query, where, onSnapshot, addDoc, orderBy, doc, updateDoc, limit, getDocs, deleteDoc } from "firebase/firestore";
import { LogOut, Plus, Image as ImageIcon, Users, AlertCircle, Camera, Mail, User as UserIcon, Building2, Bell, Megaphone, CheckCircle2, Clock, Trash2, ZoomIn, ShieldAlert, Hourglass, XCircle, ShieldCheck, Filter, History, Sparkles } from "lucide-react";
import { auth, db } from "../lib/firebase";
import { useAuth } from "../contexts/AuthContext";
import { Complaint, Notice, Society, User, HouseholdRequest } from "../types";
import { format } from "date-fns";
import { sendNotification } from "../lib/notify";
import { uploadMedia } from "../lib/mediaUpload";
import { checkIsOverdue, getOpenForText, getSlaStatus, getSlaDescription } from "../lib/complaintUtils";
import ProfileEditor from "../components/ProfileEditor";
import ImageLightboxModal from "../components/ImageLightboxModal";
import ComplaintHistoryModal from "../components/ComplaintHistoryModal";

export default function ResidentDashboard() {
  const { user, userProfile } = useAuth();
  
  // Default tab explicitly directed towards Notices first
  const [activeTab, setActiveTab] = useState<"notices" | "complaints" | "household" | "profile">("notices");
  
  const [complaints, setComplaints] = useState<(Complaint & { isOverdue?: boolean })[]>([]);
  const [complaintsLimit, setComplaintsLimit] = useState(10);
  const [notices, setNotices] = useState<Notice[]>([]);
  const [noticesLimit, setNoticesLimit] = useState(8);
  const [society, setSociety] = useState<Society | null>(null);
  const [householdMembers, setHouseholdMembers] = useState<User[]>([]);
  const [removalRequests, setRemovalRequests] = useState<HouseholdRequest[]>([]);
  
  // Complaint filters
  const [priorityFilter, setPriorityFilter] = useState<string>("All");
  const [statusFilter, setStatusFilter] = useState<string>("All");
  const [selectedComplaintForHistory, setSelectedComplaintForHistory] = useState<Complaint | null>(null);

  const [showNewForm, setShowNewForm] = useState(false);
  const [showAddMember, setShowAddMember] = useState(false);
  const [newMemberEmail, setNewMemberEmail] = useState("");
  const [newMemberName, setNewMemberName] = useState("");
  const [showDemoModal, setShowDemoModal] = useState(false);
  
  // Cloud Media Upload & Lightbox state
  const [uploadingImage, setUploadingImage] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [lightboxImage, setLightboxImage] = useState<string | null>(null);

  const [newComplaint, setNewComplaint] = useState<{
    category: string;
    description: string;
    photoUrl: string;
    spaceType: "Private" | "Public";
    preferredVisitTime: string;
    priority: "Low" | "Medium" | "High" | "Urgent";
  }>({ 
    category: "Plumbing", 
    description: "", 
    photoUrl: "", 
    spaceType: "Private", 
    preferredVisitTime: "",
    priority: "Low"
  });


  const societyId = userProfile?.societyId || "";

  useEffect(() => {
    if (!user || !userProfile) return;
    
    // 1. Fetch Society Details
    let unsubSociety = () => {};
    if (societyId) {
      unsubSociety = onSnapshot(doc(db, "societies", societyId), (docSnap) => {
        if (docSnap.exists()) {
          setSociety({ id: docSnap.id, ...docSnap.data() } as Society);
        }
      });
    }

    // 2. Fetch Complaints (for user's unit in this society)
    let unsubComplaints = () => {};
    if (societyId && userProfile.unitNumber) {
      const qComplaints = query(
        collection(db, "complaints"),
        where("societyId", "==", societyId),
        where("unitNumber", "==", userProfile.unitNumber),
        orderBy("createdAt", "desc"),
        limit(complaintsLimit)
      );
      
      unsubComplaints = onSnapshot(qComplaints, (snapshot) => {
        const data = snapshot.docs.map(doc => {
          const c = { id: doc.id, ...doc.data() } as Complaint;
          return {
            ...c,
            isOverdue: checkIsOverdue(c)
          };
        });
        
        // Sort: Overdue first, then by createdAt descending
        data.sort((a, b) => {
          if (a.isOverdue && !b.isOverdue) return -1;
          if (!a.isOverdue && b.isOverdue) return 1;
          return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
        });
        setComplaints(data);
      }, (err) => {
        console.error("Error fetching unit complaints:", err);
      });
    } else if (societyId) {
      // Fallback by residentId
      const qComplaints = query(
        collection(db, "complaints"),
        where("societyId", "==", societyId),
        where("residentId", "==", user.uid),
        orderBy("createdAt", "desc"),
        limit(complaintsLimit)
      );
      unsubComplaints = onSnapshot(qComplaints, (snapshot) => {
        const data = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Complaint));
        setComplaints(data);
      });
    }

    // 3. Fetch Notices strictly for this society
    let unsubNotices = () => {};
    if (societyId) {
      const qNotices = query(
        collection(db, "notices"),
        where("societyId", "==", societyId),
        orderBy("createdAt", "desc"),
        limit(noticesLimit)
      );
      unsubNotices = onSnapshot(qNotices, (snapshot) => {
        setNotices(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Notice)));
      }, (err) => console.error("Error fetching notices:", err));
    }

    // 4. Fetch Household members in the same unit & society
    let unsubHousehold = () => {};
    let unsubRequests = () => {};
    
    if (societyId && userProfile.unitNumber) {
      const qHousehold = query(
        collection(db, "users"),
        where("societyId", "==", societyId),
        where("unitNumber", "==", userProfile.unitNumber)
      );
      unsubHousehold = onSnapshot(qHousehold, (snapshot) => {
        setHouseholdMembers(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as User)));
      });

      const qRequests = query(
        collection(db, "householdRequests"),
        where("societyId", "==", societyId),
        where("unitNumber", "==", userProfile.unitNumber)
      );
      unsubRequests = onSnapshot(qRequests, (snapshot) => {
        setRemovalRequests(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as HouseholdRequest)));
      });
    }

    return () => {
      unsubSociety();
      unsubComplaints();
      unsubNotices();
      unsubHousehold();
      unsubRequests();
    };
  }, [user, userProfile, societyId, complaintsLimit, noticesLimit]);

  const handleImageChange = async (e: ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      const file = e.target.files[0];
      setUploadingImage(true);
      setUploadProgress(0);
      try {
        const result = await uploadMedia(file, (progress) => {
          setUploadProgress(progress);
        });
        if (result.url) {
          setNewComplaint({ ...newComplaint, photoUrl: result.url });
        }
      } catch (err) {
        console.error("Image upload error:", err);
        alert("Failed to upload image to cloud storage.");
      } finally {
        setUploadingImage(false);
      }
    }
  };

  const handleSubmitComplaint = async (e: FormEvent) => {
    e.preventDefault();
    if (!user || !userProfile || !societyId) return;

    const initialHistory = [{
      status: "Open",
      timestamp: new Date().toISOString(),
      actorId: user.uid,
      actorName: userProfile.name,
      note: "Complaint submitted"
    }];

    const complaintDocRef = await addDoc(collection(db, "complaints"), {
      societyId: societyId,
      residentId: user.uid,
      unitNumber: userProfile.unitNumber || "101",
      category: newComplaint.category,
      description: newComplaint.description,
      photoUrl: newComplaint.photoUrl,
      spaceType: newComplaint.spaceType,
      preferredVisitTime: newComplaint.spaceType === 'Private' ? newComplaint.preferredVisitTime : null,
      status: "Open",
      priority: newComplaint.priority || "Low",
      history: initialHistory,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    });

    // Write audit log entry
    try {
      await addDoc(collection(db, "auditLogs"), {
        societyId: societyId,
        action: "Complaint Created",
        category: "complaint",
        description: `Unit ${userProfile.unitNumber}: ${userProfile.name} logged a ${newComplaint.priority} priority ${newComplaint.spaceType} complaint for "${newComplaint.category}".`,
        actorId: user.uid,
        actorName: userProfile.name,
        actorRole: userProfile.role || "resident",
        unitNumber: userProfile.unitNumber,
        targetId: complaintDocRef.id,
        timestamp: new Date().toISOString()
      });
    } catch (auditErr) {
      console.error("Audit log error:", auditErr);
    }

    // Multi-recipient notification for Private Space to all household members
    if (newComplaint.spaceType === 'Private' && userProfile.unitNumber) {
      try {
        const qUnitUsers = query(
          collection(db, "users"),
          where("societyId", "==", societyId),
          where("unitNumber", "==", userProfile.unitNumber),
          where("status", "==", "approved")
        );
        const snap = await getDocs(qUnitUsers);
        const emails = snap.docs.map(d => d.data().email).filter(Boolean);
        if (emails.length > 0) {
          const body = `A new private maintenance ticket has been logged for Unit ${userProfile.unitNumber}.\n\nCategory: ${newComplaint.category}\nPriority: ${newComplaint.priority} (${getSlaDescription(newComplaint.priority)})\nDescription: ${newComplaint.description}\nSubmitted by: ${userProfile.name}`;
          await sendNotification('email', emails, `[Unit ${userProfile.unitNumber}] New Maintenance Request: ${newComplaint.category}`, body);
        }
      } catch (err) {
        console.error("Error dispatching household complaint notification:", err);
      }
    }

    setNewComplaint({ 
      category: "Plumbing", 
      description: "", 
      photoUrl: "", 
      spaceType: "Private", 
      preferredVisitTime: "",
      priority: "Low"
    });
    setShowNewForm(false);
  };

  const handleConfirmResolution = async (complaintId: string) => {
    if (!user || !userProfile || !societyId) return;
    try {
      const complaintRef = doc(db, "complaints", complaintId);
      const currentComplaint = complaints.find(c => c.id === complaintId);
      if (!currentComplaint) return;

      const newHistoryEntry = {
        status: "Resolved",
        timestamp: new Date().toISOString(),
        actorId: user.uid,
        actorName: userProfile.name,
        note: "Resident confirmed issue resolved."
      };

      const updatedHistory = [...(currentComplaint.history || []), newHistoryEntry];
      
      await updateDoc(complaintRef, {
        status: "Resolved",
        history: updatedHistory,
        updatedAt: new Date().toISOString()
      });

      // Write audit log entry
      try {
        await addDoc(collection(db, "auditLogs"), {
          societyId: societyId,
          action: "Complaint Confirmed Resolved",
          category: "complaint",
          description: `Unit ${userProfile.unitNumber}: ${userProfile.name} confirmed resolution for ${currentComplaint.category} complaint #${complaintId.slice(0, 6)}.`,
          actorId: user.uid,
          actorName: userProfile.name,
          actorRole: userProfile.role || "resident",
          unitNumber: userProfile.unitNumber,
          targetId: complaintId,
          timestamp: new Date().toISOString()
        });
      } catch (auditErr) {
        console.error("Audit log error:", auditErr);
      }

      // Notify all household members about confirmed resolution
      if (currentComplaint.spaceType === 'Private' && userProfile.unitNumber) {
        const qUnitUsers = query(
          collection(db, "users"),
          where("societyId", "==", societyId),
          where("unitNumber", "==", userProfile.unitNumber),
          where("status", "==", "approved")
        );
        const snap = await getDocs(qUnitUsers);
        const emails = snap.docs.map(d => d.data().email).filter(Boolean);
        if (emails.length > 0) {
          const body = `The private maintenance issue regarding "${currentComplaint.category}" for Unit ${userProfile.unitNumber} has been confirmed resolved by ${userProfile.name}.`;
          await sendNotification('email', emails, `[Unit ${userProfile.unitNumber}] Maintenance Resolved: ${currentComplaint.category}`, body);
        }
      }
    } catch(err) {
      console.error(err);
    }
  };

  const handleRequestRemoval = async (targetUser: User) => {
    if (!userProfile || !societyId) return;
    
    // Check permission: Household members cannot remove the Primary Resident
    if (userProfile.residentType === "household" && targetUser.residentType === "primary") {
      alert("Household members do not have permission to remove the primary resident.");
      return;
    }

    try {
      const requestDoc = await addDoc(collection(db, "householdRequests"), {
        societyId: societyId,
        unitNumber: userProfile.unitNumber || "",
        targetUserId: targetUser.id || "",
        targetUserName: targetUser.name,
        targetUserEmail: targetUser.email,
        type: "removal",
        status: "pending",
        requestedBy: userProfile.id || user?.uid || "",
        requestedByName: userProfile.name,
        createdAt: new Date().toISOString()
      });

      // Write audit log entry
      try {
        await addDoc(collection(db, "auditLogs"), {
          societyId: societyId,
          action: "Household Removal Requested",
          category: "membership",
          description: `Unit ${userProfile.unitNumber}: ${userProfile.name} requested removal of household member ${targetUser.name} (${targetUser.email}).`,
          actorId: userProfile.id || user?.uid || "",
          actorName: userProfile.name,
          actorRole: userProfile.role || "resident",
          unitNumber: userProfile.unitNumber,
          targetId: targetUser.id,
          timestamp: new Date().toISOString()
        });
      } catch (auditErr) {
        console.error("Audit log error:", auditErr);
      }

      alert("Removal request submitted for administrator approval.");
    } catch(err) {
      console.error(err);
    }
  };

  const handleCancelInvite = async (memberId: string) => {
    if (!confirm("Are you sure you want to cancel this household invitation?")) return;
    try {
      await deleteDoc(doc(db, "users", memberId));

      // Write audit log entry
      try {
        await addDoc(collection(db, "auditLogs"), {
          societyId: societyId,
          action: "Household Invitation Cancelled",
          category: "membership",
          description: `Unit ${userProfile?.unitNumber}: ${userProfile?.name} cancelled pending invitation for member #${memberId.slice(0, 6)}.`,
          actorId: userProfile?.id || user?.uid || "",
          actorName: userProfile?.name || "Resident",
          actorRole: userProfile?.role || "resident",
          unitNumber: userProfile?.unitNumber,
          targetId: memberId,
          timestamp: new Date().toISOString()
        });
      } catch (auditErr) {
        console.error("Audit log error:", auditErr);
      }

      alert("Household invitation canceled.");
    } catch(err) {
      console.error("Error canceling invitation:", err);
      alert("Failed to cancel invitation.");
    }
  };

  const handleAddMember = async (e: FormEvent) => {
    e.preventDefault();
    if (!userProfile || !userProfile.unitNumber || !societyId) return;
    
    const emailToInvite = newMemberEmail.toLowerCase().trim();
    const nameToInvite = newMemberName.trim();

    try {
      // 1. Create user document with "invited" status requiring Admin approval
      const userRef = await addDoc(collection(db, "users"), {
        email: emailToInvite,
        name: nameToInvite,
        role: "resident",
        societyId: societyId,
        unitNumber: userProfile.unitNumber,
        status: "invited", // Requires Admin Approval!
        residentType: "household",
        invitedBy: userProfile.id || user?.uid || "",
        invitedByName: userProfile.name,
        createdAt: new Date().toISOString(),
      });

      // 2. Create household request record for admin queue
      await addDoc(collection(db, "householdRequests"), {
        societyId: societyId,
        unitNumber: userProfile.unitNumber,
        targetUserId: userRef.id,
        targetUserName: nameToInvite,
        targetUserEmail: emailToInvite,
        type: "addition",
        status: "pending",
        requestedBy: userProfile.id || user?.uid || "",
        requestedByName: userProfile.name,
        createdAt: new Date().toISOString()
      });
      
      // 3. Add to Audit Log
      await addDoc(collection(db, "auditLogs"), {
        societyId: societyId,
        action: "Household Member Invited",
        category: "membership",
        description: `Unit ${userProfile.unitNumber}: ${userProfile.name} invited ${nameToInvite} (${emailToInvite}) to Unit ${userProfile.unitNumber}. Awaiting Administrator approval.`,
        actorId: userProfile.id || user?.uid || "",
        actorName: userProfile.name,
        actorRole: userProfile.role || "resident",
        unitNumber: userProfile.unitNumber,
        targetId: userRef.id,
        timestamp: new Date().toISOString()
      });

      // 4. Send Email Notification to the invited user
      await sendNotification(
        'email', 
        emailToInvite, 
        `Household Invitation - Unit ${userProfile.unitNumber} at ${society?.name || "Society"}`, 
        `Hello ${nameToInvite},\n\n${userProfile.name} has invited you to join their household at Unit ${userProfile.unitNumber} in ${society?.name || "Society"}.\n\nYour invitation is currently pending administrator verification. Once approved by the society admin, you can sign in with your email to access all resident services (maintenance, notices, household directory, and profile).`
      );

      setShowAddMember(false);
      setNewMemberEmail("");
      setNewMemberName("");
      alert("Household member invitation submitted! The invitee will appear as 'Invited' until approved by the society administrator.");
    } catch(err) {
      console.error(err);
      alert("Failed to submit household member invitation.");
    }
  };

  return (
    <div className="min-h-screen bg-slate-100 flex">
      {/* Sidebar */}
      <aside className="w-72 bg-slate-900 text-white hidden md:flex flex-col shrink-0 border-r border-slate-800">
        
        {/* Society & Resident Header */}
        <div className="p-5 border-b border-slate-800">
          <div className="flex items-center space-x-3 mb-2">
            <div className="w-8 h-8 rounded-lg bg-blue-600 flex items-center justify-center text-white shadow-xs">
              <Building2 className="w-4 h-4" />
            </div>
            <div className="min-w-0 flex-1">
              <h1 className="text-sm font-bold text-white truncate">
                {society?.name || society?.buildingName || "Resident Portal"}
              </h1>
              <p className="text-[11px] text-slate-400 truncate">
                Unit {userProfile?.unitNumber || "N/A"} • {userProfile?.residentType === 'household' ? 'Household Member' : 'Primary Resident'}
              </p>
            </div>
          </div>
          {society?.address && (
            <p className="text-[10px] text-slate-400 mt-1 truncate">
              📍 {society.address}
            </p>
          )}
        </div>
        
        {/* Sidebar Nav: Notices FIRST as requested */}
        <div className="flex-1 px-3 py-4 space-y-1 overflow-y-auto">
          <button
            onClick={() => setActiveTab('notices')}
            className={`w-full flex items-center px-3 py-2.5 text-xs font-bold rounded-lg transition-colors ${activeTab === 'notices' ? 'bg-blue-600 text-white shadow-xs' : 'text-slate-300 hover:bg-slate-800 hover:text-white'}`}
          >
            <Megaphone className="w-4 h-4 mr-3 shrink-0" />
            Notice Board
            {notices.filter(n => n.isImportant).length > 0 && (
              <span className="ml-auto bg-red-500 text-white px-2 py-0.5 rounded-full text-[10px] font-bold">
                {notices.filter(n => n.isImportant).length} New
              </span>
            )}
          </button>

          <button
            onClick={() => setActiveTab('complaints')}
            className={`w-full flex items-center px-3 py-2.5 text-xs font-bold rounded-lg transition-colors ${activeTab === 'complaints' ? 'bg-blue-600 text-white shadow-xs' : 'text-slate-300 hover:bg-slate-800 hover:text-white'}`}
          >
            <AlertCircle className="w-4 h-4 mr-3 shrink-0" />
            Maintenance & Complaints
            {complaints.filter(c => c.status === "Open" || c.status === "In Progress").length > 0 && (
              <span className="ml-auto bg-slate-700 text-slate-200 px-2 py-0.5 rounded-full text-[10px] font-bold">
                {complaints.filter(c => c.status === "Open" || c.status === "In Progress").length}
              </span>
            )}
          </button>

          <button
            onClick={() => setActiveTab('household')}
            className={`w-full flex items-center px-3 py-2.5 text-xs font-bold rounded-lg transition-colors ${activeTab === 'household' ? 'bg-blue-600 text-white shadow-xs' : 'text-slate-300 hover:bg-slate-800 hover:text-white'}`}
          >
            <Users className="w-4 h-4 mr-3 shrink-0" />
            My Household ({householdMembers.length})
          </button>

          <button
            onClick={() => setActiveTab('profile')}
            className={`w-full flex items-center px-3 py-2.5 text-xs font-bold rounded-lg transition-colors ${activeTab === 'profile' ? 'bg-blue-600 text-white shadow-xs' : 'text-slate-300 hover:bg-slate-800 hover:text-white'}`}
          >
            <UserIcon className="w-4 h-4 mr-3 shrink-0" />
            Resident Profile
          </button>
        </div>
        
        {/* User Footer */}
        <div className="p-4 border-t border-slate-800 bg-slate-950/40">
          <div className="flex items-center mb-3">
             <div className="w-8 h-8 rounded-lg bg-slate-700 flex items-center justify-center text-xs font-bold text-white mr-3 overflow-hidden">
               {userProfile?.photoURL ? (
                 <img src={userProfile.photoURL} alt="Avatar" className="w-full h-full object-cover" />
               ) : (
                 userProfile?.name?.charAt(0).toUpperCase()
               )}
             </div>
             <div className="min-w-0 flex-1">
               <p className="text-xs font-bold text-white truncate">{userProfile?.name}</p>
               <p className="text-[10px] text-slate-400 truncate">{userProfile?.email}</p>
             </div>
          </div>
          <button
            onClick={() => auth.signOut()}
            className="w-full flex items-center justify-center px-3 py-2 text-xs font-semibold text-slate-300 rounded-lg hover:bg-slate-800 hover:text-white transition-colors border border-slate-800"
          >
            <LogOut className="w-3.5 h-3.5 mr-2" />
            Sign Out
          </button>
        </div>
      </aside>

      {/* Main Content Area */}
      <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
        
        {/* Mobile Header */}
        <header className="md:hidden bg-slate-900 text-white px-4 py-3 flex justify-between items-center shadow-xs">
            <div className="flex items-center space-x-2">
                <Building2 className="w-5 h-5 text-blue-400" />
                <h1 className="text-sm font-bold truncate max-w-[180px]">
                  {society?.name || "Resident Portal"}
                </h1>
            </div>
             <button
              onClick={() => auth.signOut()}
              className="text-slate-300 hover:text-white p-1"
             >
               <LogOut className="w-5 h-5" />
             </button>
        </header>

        {/* Top Header Navigation Bar */}
        <div className="bg-white border-b border-slate-200 px-6 py-3.5 flex flex-col sm:flex-row sm:justify-between sm:items-center sticky top-0 z-10 gap-3">
            <div className="flex items-center space-x-3">
              <h2 className="text-lg font-black text-slate-900 tracking-tight">
                {activeTab === 'notices' ? 'Notice Board' : activeTab === 'complaints' ? 'Maintenance & Complaints' : activeTab === 'household' ? 'Unit Household Members' : 'My Profile'}
              </h2>
            </div>

            {/* Mobile Tabs */}
            <div className="flex space-x-1.5 md:hidden overflow-x-auto pb-1 hide-scrollbar">
              <button onClick={() => setActiveTab('notices')} className={`px-3 py-1 text-xs font-bold rounded-lg ${activeTab === 'notices' ? 'bg-slate-900 text-white' : 'bg-slate-100 text-slate-700'}`}>Notices</button>
              <button onClick={() => setActiveTab('complaints')} className={`px-3 py-1 text-xs font-bold rounded-lg ${activeTab === 'complaints' ? 'bg-slate-900 text-white' : 'bg-slate-100 text-slate-700'}`}>Complaints</button>
              <button onClick={() => setActiveTab('household')} className={`px-3 py-1 text-xs font-bold rounded-lg ${activeTab === 'household' ? 'bg-slate-900 text-white' : 'bg-slate-100 text-slate-700'}`}>Household</button>
              <button onClick={() => setActiveTab('profile')} className={`px-3 py-1 text-xs font-bold rounded-lg ${activeTab === 'profile' ? 'bg-slate-900 text-white' : 'bg-slate-100 text-slate-700'}`}>Profile</button>
            </div>
            
            {/* Discrete Demo Sandbox Access */}
            <div className="flex items-center space-x-2">
              <button
                onClick={() => setShowDemoModal(true)}
                className="inline-flex items-center text-slate-500 hover:text-slate-800 bg-slate-100 hover:bg-slate-200 px-3 py-1.5 rounded-lg text-xs font-bold transition shadow-2xs cursor-pointer"
                title="Demo Sandbox & Testing Tools"
              >
                <Sparkles className="w-3.5 h-3.5 mr-1 text-amber-500" /> Demo
              </button>
            </div>
        </div>
        
        {/* Main View Body */}
        <main className="flex-1 overflow-y-auto p-4 md:p-6 space-y-6">
          
          {activeTab === 'profile' && userProfile ? (
            <ProfileEditor userProfile={userProfile} />
          ) : activeTab === 'notices' ? (
            /* Notices First View */
            <div className="space-y-6">
              <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-2xs flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
                <div>
                  <h3 className="text-base font-bold text-slate-900">Official Society Notices</h3>
                  <p className="text-xs text-slate-500">
                    Important broadcasts and announcements from the management of <strong>{society?.name || "your building"}</strong>.
                  </p>
                </div>
                <div className="px-3 py-1.5 bg-blue-50 text-blue-800 rounded-lg text-xs font-bold self-start sm:self-auto flex items-center">
                  <Bell className="w-3.5 h-3.5 mr-1.5 text-blue-600" />
                  Showing {notices.length} Announcements
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {notices.map(notice => (
                  <div 
                    key={notice.id} 
                    className={`bg-white p-5 rounded-2xl border transition-all ${
                      notice.isImportant 
                        ? 'border-red-200 ring-1 ring-red-100 shadow-sm' 
                        : 'border-slate-200 shadow-2xs'
                    }`}
                  >
                    <div className="flex justify-between items-start mb-2">
                      <h4 className="font-bold text-slate-900 text-sm">{notice.title}</h4>
                      {notice.isImportant && (
                        <span className="px-2 py-0.5 bg-red-100 text-red-700 text-[10px] font-black uppercase tracking-wider rounded">
                          Urgent Notice
                        </span>
                      )}
                    </div>
                    <p className="text-xs text-slate-600 mb-4 whitespace-pre-line leading-relaxed">{notice.content}</p>
                    <p className="text-[10px] text-slate-400 font-semibold border-t border-slate-100 pt-3">
                      Posted on {format(new Date(notice.createdAt), "MMMM d, yyyy 'at' h:mm a")}
                    </p>
                  </div>
                ))}
                {notices.length === 0 && (
                  <div className="col-span-full py-12 text-center text-slate-400 border border-dashed border-slate-300 rounded-2xl bg-white text-xs">
                    No notices posted for your society at this time.
                  </div>
                )}
              </div>

              {/* Notices Pagination / Load More */}
              {notices.length >= noticesLimit && (
                <div className="text-center pt-2">
                  <button
                    onClick={() => setNoticesLimit(prev => prev + 8)}
                    className="px-4 py-2 bg-white border border-slate-300 hover:bg-slate-50 text-slate-700 rounded-xl text-xs font-bold shadow-2xs transition"
                  >
                    Load More Notices
                  </button>
                </div>
              )}
            </div>
          ) : activeTab === 'complaints' ? (
            /* Maintenance & Complaints Tab */
            <div className="space-y-6">
              <div className="flex justify-between items-center">
                <div>
                  <h3 className="text-base font-bold text-slate-900">Unit Maintenance & Complaints</h3>
                  <p className="text-xs text-slate-500">Track and report maintenance requests for Unit {userProfile?.unitNumber}.</p>
                </div>
                <button
                  onClick={() => setShowNewForm(!showNewForm)}
                  className="inline-flex items-center px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold rounded-lg shadow-xs transition"
                >
                  <Plus className="w-4 h-4 mr-1.5" /> Raise Complaint
                </button>
              </div>

              {/* New Complaint Form */}
              {showNewForm && (
                <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm animate-in fade-in space-y-4">
                  <h4 className="text-sm font-bold text-slate-900">New Maintenance Request</h4>
                  <form onSubmit={handleSubmitComplaint} className="space-y-4">
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      <div>
                        <label className="block text-xs font-bold uppercase tracking-wider text-slate-700 mb-1">Space Type</label>
                        <div className="grid grid-cols-2 gap-2">
                          <button
                            type="button"
                            onClick={() => setNewComplaint({ ...newComplaint, spaceType: 'Private' })}
                            className={`py-2 px-3 text-xs font-bold rounded-lg transition ${newComplaint.spaceType === 'Private' ? 'bg-slate-900 text-white' : 'bg-slate-100 text-slate-700'}`}
                          >
                            Private (Inside Unit)
                          </button>
                          <button
                            type="button"
                            onClick={() => setNewComplaint({ ...newComplaint, spaceType: 'Public' })}
                            className={`py-2 px-3 text-xs font-bold rounded-lg transition ${newComplaint.spaceType === 'Public' ? 'bg-slate-900 text-white' : 'bg-slate-100 text-slate-700'}`}
                          >
                            Public / Common Area
                          </button>
                        </div>
                      </div>

                      <div>
                        <label className="block text-xs font-bold uppercase tracking-wider text-slate-700 mb-1">Issue Category</label>
                        <select
                          value={newComplaint.category}
                          onChange={(e) => setNewComplaint({ ...newComplaint, category: e.target.value })}
                          className="w-full px-3 py-2 text-xs rounded-lg border border-slate-300 focus:outline-hidden focus:ring-1 focus:ring-blue-500"
                        >
                          <option>Plumbing</option>
                          <option>Electrical</option>
                          <option>Carpentry</option>
                          <option>HVAC / AC</option>
                          <option>Cleaning</option>
                          <option>Pest Control</option>
                          <option>Other</option>
                        </select>
                      </div>
                    </div>

                    {/* Priority & SLA Threshold Selection */}
                    <div>
                      <label className="block text-xs font-bold uppercase tracking-wider text-slate-700 mb-1">
                        Urgency & SLA Priority Level
                      </label>
                      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                        {[
                          { key: "Low", label: "Low", sla: "3 Days SLA", desc: "Routine maintenance", color: "border-slate-300 peer-checked:border-slate-900 peer-checked:bg-slate-900 peer-checked:text-white" },
                          { key: "Medium", label: "Medium", sla: "2 Days SLA", desc: "Standard repair", color: "border-blue-300 peer-checked:border-blue-700 peer-checked:bg-blue-700 peer-checked:text-white" },
                          { key: "High", label: "High", sla: "1 Day (24h) SLA", desc: "Urgent issue", color: "border-orange-300 peer-checked:border-orange-700 peer-checked:bg-orange-700 peer-checked:text-white" },
                          { key: "Urgent", label: "Urgent", sla: "10 Hours SLA", desc: "Critical emergency", color: "border-red-300 peer-checked:border-red-700 peer-checked:bg-red-700 peer-checked:text-white" },
                        ].map((p) => (
                          <label
                            key={p.key}
                            className={`flex flex-col p-2.5 rounded-xl border cursor-pointer transition text-left ${
                              newComplaint.priority === p.key
                                ? p.key === 'Urgent'
                                  ? 'border-red-600 bg-red-50 text-red-950'
                                  : p.key === 'High'
                                  ? 'border-orange-600 bg-orange-50 text-orange-950'
                                  : p.key === 'Medium'
                                  ? 'border-blue-600 bg-blue-50 text-blue-950'
                                  : 'border-slate-800 bg-slate-100 text-slate-950'
                                : 'border-slate-200 bg-white hover:bg-slate-50 text-slate-700'
                            }`}
                          >
                            <input
                              type="radio"
                              name="priority"
                              value={p.key}
                              checked={newComplaint.priority === p.key}
                              onChange={() => setNewComplaint({ ...newComplaint, priority: p.key as any })}
                              className="sr-only"
                            />
                            <span className="text-xs font-bold">{p.label}</span>
                            <span className="text-[10px] font-semibold opacity-90">{p.sla}</span>
                            <span className="text-[9px] opacity-70 mt-0.5">{p.desc}</span>
                          </label>
                        ))}
                      </div>
                    </div>

                    <div>
                      <label className="block text-xs font-bold uppercase tracking-wider text-slate-700 mb-1">Description</label>
                      <textarea
                        rows={3}
                        required
                        placeholder="Describe the issue in detail..."
                        value={newComplaint.description}
                        onChange={(e) => setNewComplaint({ ...newComplaint, description: e.target.value })}
                        className="w-full px-3 py-2 text-xs rounded-lg border border-slate-300 focus:outline-hidden focus:ring-1 focus:ring-blue-500"
                      />
                    </div>

                    {newComplaint.spaceType === 'Private' && (
                      <div>
                        <label className="block text-xs font-bold uppercase tracking-wider text-slate-700 mb-1">Preferred Staff Visit Slot</label>
                        <input
                          type="text"
                          placeholder="e.g. Weekdays after 4:00 PM, or Saturday morning"
                          value={newComplaint.preferredVisitTime}
                          onChange={(e) => setNewComplaint({ ...newComplaint, preferredVisitTime: e.target.value })}
                          className="w-full px-3 py-2 text-xs rounded-lg border border-slate-300 focus:outline-hidden focus:ring-1 focus:ring-blue-500"
                        />
                      </div>
                    )}

                    <div>
                      <label className="block text-xs font-bold uppercase tracking-wider text-slate-700 mb-1">
                        Photo Attachment (Cloud Object Storage)
                      </label>
                      
                      {newComplaint.photoUrl ? (
                        <div className="relative inline-block mt-2">
                          <img 
                            src={newComplaint.photoUrl} 
                            alt="Preview" 
                            className="w-32 h-24 object-cover rounded-xl border border-slate-300 shadow-xs cursor-pointer"
                            onClick={() => setLightboxImage(newComplaint.photoUrl)}
                          />
                          <button
                            type="button"
                            onClick={() => setNewComplaint({ ...newComplaint, photoUrl: "" })}
                            className="absolute -top-2 -right-2 p-1 bg-red-600 text-white rounded-full hover:bg-red-700 shadow-sm"
                            title="Remove attached photo"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      ) : (
                        <div className="space-y-2">
                          <input
                            type="file"
                            accept="image/*"
                            onChange={handleImageChange}
                            className="text-xs text-slate-500 file:mr-3 file:py-1.5 file:px-3 file:rounded-lg file:border-0 file:text-xs file:font-semibold file:bg-blue-50 file:text-blue-700 hover:file:bg-blue-100 cursor-pointer"
                          />
                          {uploadingImage && (
                            <div className="w-full bg-slate-100 rounded-full h-2 overflow-hidden">
                              <div className="bg-blue-600 h-2 transition-all duration-300" style={{ width: `${uploadProgress}%` }} />
                            </div>
                          )}
                        </div>
                      )}
                    </div>

                    <div className="flex justify-end gap-2 pt-2">
                      <button
                        type="button"
                        onClick={() => setShowNewForm(false)}
                        className="px-4 py-2 text-xs font-bold text-slate-600"
                      >
                        Cancel
                      </button>
                      <button
                        type="submit"
                        disabled={uploadingImage}
                        className="px-5 py-2 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white text-xs font-bold rounded-lg shadow-xs"
                      >
                        Submit Request
                      </button>
                    </div>
                  </form>
                </div>
              )}

              {/* Complaints Filter Toolbar */}
              <div className="bg-white p-3.5 rounded-2xl border border-slate-200 shadow-2xs flex flex-wrap items-center justify-between gap-3">
                <div className="flex flex-wrap items-center gap-2 text-xs">
                  <div className="flex items-center text-slate-500 font-bold mr-1">
                    <Filter className="w-3.5 h-3.5 mr-1 text-slate-600" />
                    Priority:
                  </div>
                  {["All", "Overdue", "Urgent", "High", "Medium", "Low"].map((p) => {
                    const count = p === "All" 
                      ? complaints.length 
                      : p === "Overdue" 
                      ? complaints.filter(c => checkIsOverdue(c)).length 
                      : complaints.filter(c => c.priority === p).length;
                    
                    return (
                      <button
                        key={p}
                        onClick={() => setPriorityFilter(p)}
                        className={`px-2.5 py-1 rounded-lg text-xs font-bold transition flex items-center space-x-1 ${
                          priorityFilter === p
                            ? p === "Overdue"
                              ? "bg-red-600 text-white shadow-2xs"
                              : p === "Urgent"
                              ? "bg-red-700 text-white shadow-2xs"
                              : "bg-slate-900 text-white shadow-2xs"
                            : p === "Overdue" && count > 0
                            ? "bg-red-50 text-red-700 border border-red-200 hover:bg-red-100"
                            : "bg-slate-100 text-slate-600 hover:bg-slate-200"
                        }`}
                      >
                        <span>{p}</span>
                        <span className={`text-[10px] px-1.5 py-0.2 rounded-full ${
                          priorityFilter === p 
                            ? "bg-white/20 text-white" 
                            : p === "Overdue" && count > 0
                            ? "bg-red-200 text-red-900"
                            : "bg-slate-200 text-slate-700"
                        }`}>
                          {count}
                        </span>
                      </button>
                    );
                  })}
                </div>

                <div className="flex items-center space-x-2 text-xs">
                  <span className="text-slate-500 font-bold">Status:</span>
                  <select
                    value={statusFilter}
                    onChange={(e) => setStatusFilter(e.target.value)}
                    className="px-2.5 py-1 text-xs font-bold rounded-lg border border-slate-300 bg-slate-50 text-slate-800 focus:outline-hidden focus:ring-1 focus:ring-blue-500"
                  >
                    <option value="All">All Statuses ({complaints.length})</option>
                    <option value="Open">Open ({complaints.filter(c => c.status === 'Open').length})</option>
                    <option value="In Progress">In Progress ({complaints.filter(c => c.status === 'In Progress').length})</option>
                    <option value="Pending Resident Approval">Pending Approval ({complaints.filter(c => c.status === 'Pending Resident Approval').length})</option>
                    <option value="Resolved">Resolved ({complaints.filter(c => c.status === 'Resolved').length})</option>
                  </select>
                </div>
              </div>

              {/* Complaints List */}
              <div className="space-y-4">
                {(() => {
                  const processedComplaints = complaints.map(c => ({
                    ...c,
                    isOverdue: checkIsOverdue(c)
                  }));

                  let filtered = processedComplaints;
                  if (statusFilter !== "All") {
                    filtered = filtered.filter(c => c.status === statusFilter);
                  }
                  if (priorityFilter !== "All") {
                    if (priorityFilter === "Overdue") {
                      filtered = filtered.filter(c => c.isOverdue);
                    } else {
                      filtered = filtered.filter(c => c.priority === priorityFilter);
                    }
                  }

                  const priorityWeight: Record<string, number> = { "Urgent": 4, "High": 3, "Medium": 2, "Low": 1 };
                  filtered.sort((a, b) => {
                    if (a.isOverdue && !b.isOverdue) return -1;
                    if (!a.isOverdue && b.isOverdue) return 1;
                    const pA = priorityWeight[a.priority || "Low"] || 0;
                    const pB = priorityWeight[b.priority || "Low"] || 0;
                    if (pA !== pB) return pB - pA;
                    return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
                  });

                  return (
                    <>
                      {filtered.map(c => {
                        const sla = getSlaStatus(c);
                        return (
                          <div 
                            key={c.id} 
                            className={`bg-white p-5 rounded-2xl border transition-all ${
                              sla.isOverdue 
                                ? 'border-red-300 ring-1 ring-red-200 shadow-sm' 
                                : 'border-slate-200 shadow-2xs'
                            } space-y-3`}
                          >
                            <div className="flex flex-wrap justify-between items-start gap-2">
                              <div className="flex flex-wrap items-center gap-1.5">
                                <span className={`inline-block px-2.5 py-0.5 rounded-md text-[10px] font-bold uppercase ${
                                  c.status === 'Open' ? 'bg-amber-100 text-amber-800' :
                                  c.status === 'In Progress' ? 'bg-blue-100 text-blue-800' :
                                  c.status === 'Pending Resident Approval' ? 'bg-purple-100 text-purple-800' :
                                  'bg-emerald-100 text-emerald-800'
                                }`}>
                                  {c.status}
                                </span>

                                <span className={`inline-block px-2 py-0.5 rounded-md text-[10px] font-bold ${
                                  c.priority === 'Urgent' ? 'bg-red-100 text-red-700' :
                                  c.priority === 'High' ? 'bg-orange-100 text-orange-700' :
                                  c.priority === 'Medium' ? 'bg-blue-100 text-blue-700' :
                                  'bg-slate-100 text-slate-700'
                                }`}>
                                  {c.priority || 'Low'} Priority
                                </span>

                                {sla.isOverdue && (
                                  <span className="inline-flex items-center px-2 py-0.5 rounded-md text-[10px] font-black bg-red-600 text-white shadow-2xs animate-pulse">
                                    <ShieldAlert className="w-3 h-3 mr-1" />
                                    Overdue (&gt; {sla.slaHours}h SLA)
                                  </span>
                                )}

                                <span className="text-xs font-bold text-slate-900 ml-1">{c.category}</span>
                              </div>
                              <div className="text-right flex items-center space-x-2">
                                <div>
                                  <span className="text-[10px] text-slate-400 font-semibold block">{getOpenForText(c.createdAt)}</span>
                                  <span className="text-[9px] text-slate-400 font-medium">{sla.slaLabel}</span>
                                </div>
                                <button
                                  onClick={() => setSelectedComplaintForHistory(c)}
                                  className="p-1.5 text-slate-500 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition border border-slate-200"
                                  title="View Ticket Progress & History Time Logs"
                                >
                                  <History className="w-4 h-4" />
                                </button>
                              </div>
                            </div>

                            <p className="text-xs text-slate-600 leading-relaxed">{c.description}</p>

                            {/* Photo Attachment preview if present */}
                            {c.photoUrl && (
                              <div className="mt-2">
                                <p className="text-[10px] font-bold uppercase text-slate-400 mb-1">Attached Media</p>
                                <div 
                                  onClick={() => setLightboxImage(c.photoUrl)}
                                  className="relative inline-block group cursor-pointer"
                                >
                                  <img 
                                    src={c.photoUrl} 
                                    alt="Attachment" 
                                    className="w-24 h-24 object-cover rounded-xl border border-slate-200 group-hover:opacity-90 transition shadow-2xs" 
                                  />
                                  <div className="absolute inset-0 bg-black/40 rounded-xl opacity-0 group-hover:opacity-100 transition flex items-center justify-center text-white">
                                    <ZoomIn className="w-5 h-5" />
                                  </div>
                                </div>
                              </div>
                            )}

                            {c.assignedStaffName && (
                              <div className="p-3 bg-blue-50/60 border border-blue-100 rounded-xl text-xs flex justify-between items-center">
                                <div>
                                  <p className="font-bold text-blue-900">Assigned Technician: {c.assignedStaffName}</p>
                                  <p className="text-[11px] text-blue-700">Phone: {c.assignedStaffPhone} • Hours: {c.assignedStaffWorkingHours || "9am-5pm"}</p>
                                </div>
                              </div>
                            )}

                            {c.status === "Pending Resident Approval" && (
                              <div className="p-3 bg-purple-50 border border-purple-100 rounded-xl flex items-center justify-between">
                                <span className="text-xs font-bold text-purple-900">Technician marked this task as complete. Please confirm.</span>
                                <button
                                  onClick={() => handleConfirmResolution(c.id || "")}
                                  className="px-3 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg text-xs font-bold shadow-2xs"
                                >
                                  <CheckCircle2 className="w-3.5 h-3.5 inline mr-1" /> Confirm Resolved
                                </button>
                              </div>
                            )}

                            {/* Activity Log preview */}
                            {c.history && c.history.length > 0 && (
                              <div className="border-t border-slate-100 pt-3 space-y-1.5">
                                <div className="flex justify-between items-center">
                                  <p className="text-[10px] font-bold uppercase text-slate-400">Activity Log & Time Logs</p>
                                  <button
                                    onClick={() => setSelectedComplaintForHistory(c)}
                                    className="text-[10px] font-bold text-blue-600 hover:underline inline-flex items-center"
                                  >
                                    View Full Timeline ({c.history.length} events)
                                  </button>
                                </div>
                                {c.history.slice(-2).map((h, i) => (
                                  <div key={i} className="text-[11px] text-slate-500 flex justify-between">
                                    <span><strong>{h.actorName}:</strong> {h.status} {h.note ? `("${h.note}")` : ""}</span>
                                    <span className="text-slate-400">{format(new Date(h.timestamp), "MMM d, h:mm a")}</span>
                                  </div>
                                ))}
                              </div>
                            )}
                          </div>
                        );
                      })}
                      {filtered.length === 0 && (
                        <div className="py-12 text-center text-slate-400 border border-dashed border-slate-300 rounded-2xl bg-white text-xs">
                          No maintenance requests found matching your filters.
                        </div>
                      )}
                    </>
                  );
                })()}
              </div>

              {/* Complaints Pagination / Load More */}
              {complaints.length >= complaintsLimit && (
                <div className="text-center pt-2">
                  <button
                    onClick={() => setComplaintsLimit(prev => prev + 10)}
                    className="px-4 py-2 bg-white border border-slate-300 hover:bg-slate-50 text-slate-700 rounded-xl text-xs font-bold shadow-2xs transition"
                  >
                    Load More Complaints
                  </button>
                </div>
              )}
            </div>
          ) : (
            /* My Household Tab */
            <div className="space-y-6">
              <div className="flex justify-between items-center">
                <div>
                  <h3 className="text-base font-bold text-slate-900">Unit {userProfile?.unitNumber} Household Members</h3>
                  <p className="text-xs text-slate-500">
                    All residents in your unit share access to notices, private maintenance updates, and household features.
                  </p>
                </div>
                <button
                  onClick={() => setShowAddMember(!showAddMember)}
                  className="inline-flex items-center px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold rounded-lg shadow-xs transition"
                >
                  <Plus className="w-4 h-4 mr-1.5" /> Invite Member
                </button>
              </div>

              {showAddMember && (
                <form onSubmit={handleAddMember} className="bg-white p-5 rounded-2xl border border-slate-200 shadow-2xs space-y-3">
                  <h4 className="text-xs font-bold uppercase tracking-wider text-slate-700">Add Household Member</h4>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                    <input
                      type="text"
                      required
                      placeholder="Full Name"
                      value={newMemberName}
                      onChange={(e) => setNewMemberName(e.target.value)}
                      className="px-3 py-2 text-xs rounded-lg border border-slate-300"
                    />
                    <input
                      type="email"
                      required
                      placeholder="Google Email Address"
                      value={newMemberEmail}
                      onChange={(e) => setNewMemberEmail(e.target.value)}
                      className="px-3 py-2 text-xs rounded-lg border border-slate-300"
                    />
                  </div>
                  <div className="flex justify-end gap-2">
                    <button type="button" onClick={() => setShowAddMember(false)} className="px-3 py-1.5 text-xs text-slate-500">Cancel</button>
                    <button type="submit" className="px-4 py-1.5 bg-blue-600 text-white rounded-lg text-xs font-bold">Send Invitation</button>
                  </div>
                </form>
              )}

              {/* Members List */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {householdMembers.filter(m => m.status !== 'removed').map(member => {
                  const isPending = member.status === 'invited' || member.status === 'pending';
                  const isPrimary = member.residentType === 'primary';
                  const isCurrentLoggedInUser = member.id === user?.uid;

                  return (
                    <div key={member.id} className={`p-5 rounded-2xl border shadow-2xs flex justify-between items-center ${isPending ? 'bg-amber-50/50 border-amber-200' : 'bg-white border-slate-200'}`}>
                      <div>
                        <div className="flex items-center space-x-2">
                          <span className="font-bold text-slate-900 text-xs">{member.name}</span>
                          {isPending ? (
                            <span className="inline-flex items-center px-2 py-0.5 bg-amber-100 text-amber-800 text-[10px] font-black rounded-md border border-amber-200">
                              <Hourglass className="w-2.5 h-2.5 mr-1 text-amber-600 animate-pulse" />
                              Invited (Pending Admin Approval)
                            </span>
                          ) : isPrimary ? (
                            <span className="inline-flex items-center px-2 py-0.5 bg-blue-100 text-blue-800 text-[10px] font-bold rounded-md">
                              <ShieldCheck className="w-2.5 h-2.5 mr-1 text-blue-600" />
                              Primary Resident
                            </span>
                          ) : (
                            <span className="px-2 py-0.5 bg-slate-100 text-slate-700 text-[10px] font-bold rounded-md">
                              Household Member
                            </span>
                          )}
                        </div>
                        <p className="text-[11px] text-slate-500 mt-1">{member.email}</p>
                        {isPending && member.invitedByName && (
                          <p className="text-[10px] text-amber-700 font-medium mt-0.5">
                            Invited by {member.invitedByName} • Awaiting Admin Approval
                          </p>
                        )}
                      </div>

                      {/* Actions */}
                      <div>
                        {isPending ? (
                          <button
                            onClick={() => handleCancelInvite(member.id || "")}
                            className="px-3 py-1.5 text-xs font-bold text-amber-800 hover:bg-amber-100 rounded-lg transition border border-amber-300"
                            title="Cancel pending invitation"
                          >
                            Cancel Invite
                          </button>
                        ) : !isCurrentLoggedInUser && (
                          userProfile?.residentType === 'household' && isPrimary ? (
                            <span className="text-[10px] font-bold text-slate-400 bg-slate-100 px-2.5 py-1 rounded-md border border-slate-200">
                              Primary Resident (Protected)
                            </span>
                          ) : (
                            <button
                              onClick={() => handleRequestRemoval(member)}
                              className="px-3 py-1.5 text-xs font-bold text-red-600 hover:bg-red-50 rounded-lg transition border border-red-200"
                            >
                              Request Removal
                            </button>
                          )
                        )}
                      </div>
                    </div>
                  );
                })}
                {householdMembers.filter(m => m.status !== 'removed').length === 0 && (
                  <div className="col-span-full py-8 text-center text-slate-400 border border-dashed border-slate-300 rounded-2xl bg-white text-xs">
                    No household members registered for Unit {userProfile?.unitNumber}.
                  </div>
                )}
              </div>
            </div>
          )}
        </main>
      </div>

      {/* Demo Modal (Only visible when user explicitly clicks Demo) */}
      {showDemoModal && (
        <div className="fixed inset-0 z-50 bg-slate-950/70 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-2xl max-w-sm w-full p-6 border border-slate-100 relative animate-in fade-in zoom-in-95">
            <h3 className="text-base font-black text-slate-900 mb-1 flex items-center">
              <Sparkles className="w-4 h-4 text-amber-500 mr-1.5" /> Demo Sandbox Options
            </h3>
            <p className="text-xs text-slate-500 mb-4">
              Quickly switch workspace perspective or test administrative workflows.
            </p>
            <div className="space-y-2.5">
              <button
                onClick={async () => {
                  if (user?.uid) {
                    await updateDoc(doc(db, "users", user.uid), { role: "admin" });
                    setShowDemoModal(false);
                  }
                }}
                className="w-full text-left p-3 rounded-xl border border-slate-200 hover:border-purple-500 hover:bg-purple-50/50 transition flex items-center justify-between group cursor-pointer"
              >
                <div>
                  <h4 className="text-xs font-bold text-slate-900 group-hover:text-purple-700">Switch to Society Admin</h4>
                  <p className="text-[11px] text-slate-500">Access administrator console, manage staff, SLAs, and notices</p>
                </div>
                <span className="text-xs font-bold text-purple-600">Switch &rarr;</span>
              </button>
            </div>
            <button
              onClick={() => setShowDemoModal(false)}
              className="mt-4 w-full py-2 bg-slate-100 text-slate-700 hover:bg-slate-200 text-xs font-bold rounded-lg transition cursor-pointer"
            >
              Close Demo
            </button>
          </div>
        </div>
      )}

      {/* Lightbox Modal */}
      <ImageLightboxModal
        imageUrl={lightboxImage}
        onClose={() => setLightboxImage(null)}
      />

      {/* Complaint Progress Timeline & History Modal */}
      <ComplaintHistoryModal
        complaint={selectedComplaintForHistory}
        onClose={() => setSelectedComplaintForHistory(null)}
      />
    </div>
  );
}
