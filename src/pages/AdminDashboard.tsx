import { useState, useEffect, FormEvent, ChangeEvent } from "react";
import { collection, query, onSnapshot, doc, updateDoc, addDoc, orderBy, getDoc, setDoc, limit, where, getDocs, deleteDoc } from "firebase/firestore";
import { LogOut, AlertCircle, CheckCircle2, Clock, Filter, Plus, Megaphone, Settings as SettingsIcon, Camera, Mail, User as UserIcon, Building2, ChevronDown, Sparkles, ZoomIn, Trash2, Image as ImageIcon, ShieldAlert, Hourglass, Check, X, ShieldCheck, History, Download, Search, FileText, Activity, Flame } from "lucide-react";
import { auth, db } from "../lib/firebase";
import { useAuth } from "../contexts/AuthContext";
import { User, Complaint, Notice, SocietySettings, HouseholdRequest, AuditLog, Staff, Society } from "../types";
import { format, isToday, isThisWeek, isThisMonth } from "date-fns";
import { Users } from "lucide-react";
import { sendNotification } from "../lib/notify";
import { uploadMedia } from "../lib/mediaUpload";
import { checkIsOverdue, getOpenForText, getSlaStatus, getSlaDescription } from "../lib/complaintUtils";
import ProfileEditor from "../components/ProfileEditor";
import SocietyOnboardingModal from "../components/SocietyOnboardingModal";
import ImageLightboxModal from "../components/ImageLightboxModal";
import ComplaintHistoryModal from "../components/ComplaintHistoryModal";

export default function AdminDashboard() {
  const { user, userProfile } = useAuth();
  const [activeTab, setActiveTab] = useState<"complaints" | "notices" | "directory" | "logs" | "settings" | "profile">("complaints");
  const [directorySubTab, setDirectorySubTab] = useState<"residents" | "approvals" | "staff">("residents");
  
  // Multi-Tenant Societies State
  const [societies, setSocieties] = useState<Society[]>([]);
  const [selectedSocietyId, setSelectedSocietyId] = useState<string>(userProfile?.societyId || "");
  const [showOnboardingModal, setShowOnboardingModal] = useState(false);
  const [isCreatingNewSociety, setIsCreatingNewSociety] = useState(false);
  
  // Data lists scoped to selectedSocietyId with pagination limits
  const [complaints, setComplaints] = useState<Complaint[]>([]);
  const [complaintsLimit, setComplaintsLimit] = useState(15);
  const [notices, setNotices] = useState<Notice[]>([]);
  const [noticesLimit, setNoticesLimit] = useState(10);
  const [usersList, setUsersList] = useState<User[]>([]);
  const [currentSociety, setCurrentSociety] = useState<Society | null>(null);
  const [householdRequests, setHouseholdRequests] = useState<HouseholdRequest[]>([]);
  const [auditLogs, setAuditLogs] = useState<AuditLog[]>([]);
  const [staffList, setStaffList] = useState<Staff[]>([]);

  // Cloud Media & Lightbox state
  const [lightboxImage, setLightboxImage] = useState<string | null>(null);
  const [uploadingNoticeImage, setUploadingNoticeImage] = useState(false);
  const [uploadNoticeProgress, setUploadNoticeProgress] = useState(0);
  
  // Settings Form State
  const [settingsForm, setSettingsForm] = useState<{
    name: string;
    address: string;
    numberOfFloors: number;
    unitsPerFloor: number;
    generatedUnits: string[];
  }>({
    name: "",
    address: "",
    numberOfFloors: 1,
    unitsPerFloor: 1,
    generatedUnits: []
  });
  const [isSavingSettings, setIsSavingSettings] = useState(false);
  
  // Filters
  const [statusFilter, setStatusFilter] = useState("All");
  const [priorityFilter, setPriorityFilter] = useState("All");
  const [categoryFilter, setCategoryFilter] = useState("All");
  const [dateFilter, setDateFilter] = useState("All");

  // Audit Logs Filter & Search State
  const [logCategoryFilter, setLogCategoryFilter] = useState("All");
  const [logSearchQuery, setLogSearchQuery] = useState("");

  // History Modal State
  const [selectedComplaintForHistory, setSelectedComplaintForHistory] = useState<Complaint | null>(null);

  // Admin Actions State
  const [selectedComplaint, setSelectedComplaint] = useState<Complaint | null>(null);
  const [updateNote, setUpdateNote] = useState("");
  const [updateStatus, setUpdateStatus] = useState<"Open" | "In Progress" | "Pending Resident Approval" | "Resolved">("In Progress");
  const [updatePriority, setUpdatePriority] = useState<"Low" | "Medium" | "High" | "Urgent">("Low");
  const [assignedStaffId, setAssignedStaffId] = useState<string>("");
  
  // Notice State
  const [showNoticeForm, setShowNoticeForm] = useState(false);
  const [newNotice, setNewNotice] = useState<{ title: string; content: string; isImportant: boolean; imageUrl: string }>({ 
    title: "", 
    content: "", 
    isImportant: false, 
    imageUrl: "" 
  });

  // Staff State
  const [newStaff, setNewStaff] = useState({ name: "", profession: "Plumbing", phone: "", email: "", workingHours: "9:00 AM - 5:00 PM" });
  const [showAddStaff, setShowAddStaff] = useState(false);
  const [editingStaffId, setEditingStaffId] = useState<string | null>(null);
  const [editStaffData, setEditStaffData] = useState<Partial<Staff>>({});

  // 1. Fetch all societies
  useEffect(() => {
    const qSocieties = query(collection(db, "societies"));
    const unsubSocieties = onSnapshot(qSocieties, (snapshot) => {
      const docs = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Society));
      setSocieties(docs);
      
      // Auto-select society if none selected or if user has a profile societyId
      if (!selectedSocietyId && docs.length > 0) {
        const matching = userProfile?.societyId ? docs.find(d => d.id === userProfile.societyId) : null;
        setSelectedSocietyId(matching ? matching.id : docs[0].id);
      } else if (docs.length === 0) {
        // No societies exist at all, trigger onboarding
        setShowOnboardingModal(true);
      }
    });

    return () => unsubSocieties();
  }, [userProfile?.societyId]);

  // 2. Fetch active society details & check if setup is needed
  useEffect(() => {
    if (!selectedSocietyId) {
      setCurrentSociety(null);
      return;
    }

    const unsubSocDoc = onSnapshot(doc(db, "societies", selectedSocietyId), (docSnap) => {
      if (docSnap.exists()) {
        const socData = { id: docSnap.id, ...docSnap.data() } as Society;
        setCurrentSociety(socData);
        setSettingsForm({
          name: socData.name || socData.buildingName || "",
          address: socData.address || "",
          numberOfFloors: socData.numberOfFloors || 1,
          unitsPerFloor: socData.unitsPerFloor || 1,
          generatedUnits: socData.generatedUnits || []
        });

        if (!socData.isSetupComplete) {
          setShowOnboardingModal(true);
        }
      } else {
        setCurrentSociety(null);
      }
    });

    return () => unsubSocDoc();
  }, [selectedSocietyId]);

  // 3. Listen to all sub-collections strictly filtered by selectedSocietyId
  useEffect(() => {
    if (!selectedSocietyId) {
      setComplaints([]);
      setNotices([]);
      setUsersList([]);
      setStaffList([]);
      setHouseholdRequests([]);
      setAuditLogs([]);
      return;
    }

    const qComplaints = query(
      collection(db, "complaints"),
      where("societyId", "==", selectedSocietyId),
      orderBy("createdAt", "desc"),
      limit(complaintsLimit)
    );
    const unsubComplaints = onSnapshot(qComplaints, (snapshot) => {
      setComplaints(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Complaint)));
    }, (err) => console.error("Complaints listener error:", err));

    const qNotices = query(
      collection(db, "notices"),
      where("societyId", "==", selectedSocietyId),
      orderBy("createdAt", "desc"),
      limit(noticesLimit)
    );
    const unsubNotices = onSnapshot(qNotices, (snapshot) => {
      setNotices(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Notice)));
    }, (err) => console.error("Notices listener error:", err));

    const qUsers = query(
      collection(db, "users"),
      where("societyId", "==", selectedSocietyId)
    );
    const unsubUsers = onSnapshot(qUsers, (snapshot) => {
      setUsersList(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as User)));
    }, (err) => console.error("Users listener error:", err));

    const qStaff = query(
      collection(db, "staff"),
      where("societyId", "==", selectedSocietyId)
    );
    const unsubStaff = onSnapshot(qStaff, (snapshot) => {
      setStaffList(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Staff)));
    }, (err) => console.error("Staff listener error:", err));

    const qRequests = query(
      collection(db, "householdRequests"),
      where("societyId", "==", selectedSocietyId),
      orderBy("createdAt", "desc")
    );
    const unsubRequests = onSnapshot(qRequests, (snapshot) => {
      setHouseholdRequests(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as HouseholdRequest)));
    }, (err) => console.error("Requests listener error:", err));

    const qLogs = query(
      collection(db, "auditLogs"),
      where("societyId", "==", selectedSocietyId),
      orderBy("timestamp", "desc")
    );
    const unsubLogs = onSnapshot(qLogs, (snapshot) => {
      setAuditLogs(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as AuditLog)));
    }, (err) => console.error("Logs listener error:", err));

    return () => {
      unsubComplaints();
      unsubNotices();
      unsubUsers();
      unsubStaff();
      unsubRequests();
      unsubLogs();
    };
  }, [selectedSocietyId, complaintsLimit, noticesLimit]);

  const handleUpdateComplaint = async (e: FormEvent) => {
    e.preventDefault();
    if (!selectedComplaint || !selectedComplaint.id || !userProfile || !selectedSocietyId) return;

    const newHistoryEntry = {
      status: updateStatus,
      timestamp: new Date().toISOString(),
      actorId: userProfile.id || "",
      actorName: userProfile.name || "Admin",
      note: updateNote
    };

    const updatedHistory = [...(selectedComplaint.history || []), newHistoryEntry];
    
    let staffName = selectedComplaint.assignedStaffName || null;
    let staffPhone = selectedComplaint.assignedStaffPhone || null;
    let staffWorkingHours = selectedComplaint.assignedStaffWorkingHours || null;

    if (assignedStaffId && updateStatus === 'In Progress') {
      const assignedStaff = staffList.find(s => s.id === assignedStaffId);
      if (assignedStaff) {
        staffName = assignedStaff.name;
        staffPhone = assignedStaff.phone;
        staffWorkingHours = assignedStaff.workingHours || null;
      }
    } else if (updateStatus !== 'In Progress') {
      staffName = null;
      staffPhone = null;
      staffWorkingHours = null;
    }

    await updateDoc(doc(db, "complaints", selectedComplaint.id), {
      status: updateStatus,
      priority: updatePriority,
      assignedStaffId: updateStatus === 'In Progress' ? assignedStaffId : null,
      assignedStaffName: staffName,
      assignedStaffPhone: staffPhone,
      assignedStaffWorkingHours: staffWorkingHours,
      history: updatedHistory,
      updatedAt: new Date().toISOString()
    });

    // Audit Log for Complaint Status/Priority/Staff Assignment
    try {
      await addDoc(collection(db, "auditLogs"), {
        societyId: selectedSocietyId,
        actorId: userProfile.id || "",
        actorName: userProfile.name || "Admin",
        actorRole: "admin",
        category: "complaint",
        action: "Complaint Status & Priority Updated",
        targetId: selectedComplaint.id,
        unitNumber: selectedComplaint.unitNumber,
        details: {
          previousStatus: selectedComplaint.status,
          newStatus: updateStatus,
          previousPriority: selectedComplaint.priority || "Low",
          newPriority: updatePriority,
          assignedStaffName: staffName || "None",
          note: updateNote || ""
        },
        description: `Admin updated complaint #${selectedComplaint.id?.slice(-6)} (${selectedComplaint.category}, Unit ${selectedComplaint.unitNumber}) to "${updateStatus}" [Priority: ${updatePriority}]${staffName ? ` and assigned to ${staffName}` : ""}.`,
        timestamp: new Date().toISOString()
      });
    } catch (logErr) {
      console.error("Failed to write audit log for complaint update:", logErr);
    }

    // Notify resident and staff
    try {
      const residentDoc = await getDoc(doc(db, "users", selectedComplaint.residentId));
      if (residentDoc.exists()) {
        const residentData = residentDoc.data();
        let residentMsg = `Your complaint regarding "${selectedComplaint.category}" has been updated to ${updateStatus}.`;
        if (updateNote) residentMsg += `\nNote: ${updateNote}`;
        if (staffName && updateStatus === 'In Progress') {
          residentMsg += `\nAssigned to: ${staffName} (Phone: ${staffPhone})`;
          if (staffWorkingHours) residentMsg += `\nWorking Hours: ${staffWorkingHours}`;
        }
        
        if (selectedComplaint.spaceType === 'Private' && residentData.unitNumber) {
           const unitUsersQuery = query(
             collection(db, "users"), 
             where("societyId", "==", selectedSocietyId),
             where("unitNumber", "==", residentData.unitNumber),
             where("status", "==", "approved")
           );
           const unitUsersSnapshot = await getDocs(unitUsersQuery);
           const emails = unitUsersSnapshot.docs.map(d => d.data().email);
           if (emails.length > 0) {
             await sendNotification('email', emails, `Complaint Status Updated: ${updateStatus}`, residentMsg);
           }
        } else {
           await sendNotification('email', residentData.email, `Complaint Status Updated: ${updateStatus}`, residentMsg);
        }
      }
      
      // Notify assigned staff
      if (assignedStaffId && updateStatus === 'In Progress') {
        const assignedStaff = staffList.find(s => s.id === assignedStaffId);
        if (assignedStaff) {
          const staffMsg = `You have been assigned a new complaint: ${selectedComplaint.description}\nUnit: ${selectedComplaint.unitNumber}\nSpace: ${selectedComplaint.spaceType || 'Unknown'}\nPriority: ${updatePriority}`;
          await sendNotification('email', assignedStaff.email, `New Complaint Assigned`, staffMsg);
          await sendNotification('sms', assignedStaff.phone, `New Complaint`, staffMsg);
        }
      }
    } catch(err) {
      console.error("Error sending notification", err);
    }

    setSelectedComplaint(null);
    setUpdateNote("");
    setAssignedStaffId("");
  };

  const handleNoticeImageChange = async (e: ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      const file = e.target.files[0];
      setUploadingNoticeImage(true);
      setUploadNoticeProgress(0);
      try {
        const res = await uploadMedia(file, (p) => setUploadNoticeProgress(p));
        if (res.url) {
          setNewNotice({ ...newNotice, imageUrl: res.url });
        }
      } catch (err) {
        console.error(err);
        alert("Failed to upload notice image.");
      } finally {
        setUploadingNoticeImage(false);
      }
    }
  };

  const handlePostNotice = async (e: FormEvent) => {
    e.preventDefault();
    if (!userProfile || !selectedSocietyId) return;

    await addDoc(collection(db, "notices"), {
      societyId: selectedSocietyId,
      ...newNotice,
      createdAt: new Date().toISOString(),
      authorId: userProfile.id || ""
    });

    try {
      await addDoc(collection(db, "auditLogs"), {
        societyId: selectedSocietyId,
        actorId: userProfile.id || "",
        actorName: userProfile.name || "Admin",
        actorRole: "admin",
        category: "notice",
        action: "Notice Published",
        targetId: newNotice.title,
        description: `Admin published notice: "${newNotice.title}" (${newNotice.isImportant ? "High Priority / Important" : "General"}).`,
        timestamp: new Date().toISOString()
      });
    } catch (logErr) {
      console.error("Failed to log notice:", logErr);
    }

    const residentEmails = usersList
      .filter(u => u.role === 'resident' && u.status === 'approved')
      .map(u => u.email);

    if (residentEmails.length > 0) {
      await sendNotification(
        'email', 
        residentEmails, 
        `${newNotice.isImportant ? 'IMPORTANT NOTICE' : 'Notice'}: ${newNotice.title}`, 
        newNotice.content
      );
    }

    setNewNotice({ title: "", content: "", isImportant: false, imageUrl: "" });
    setShowNoticeForm(false);
  };

  const handleApproveUser = async (userId: string) => {
    if (!userId || !selectedSocietyId) return;
    const userToApprove = usersList.find(u => u.id === userId);
    await updateDoc(doc(db, "users", userId), { status: "approved" });
    
    if (userToApprove) {
      // Also update any addition requests
      try {
        const qReq = query(
          collection(db, "householdRequests"),
          where("societyId", "==", selectedSocietyId),
          where("targetUserEmail", "==", userToApprove.email),
          where("status", "==", "pending")
        );
        const reqSnap = await getDocs(qReq);
        reqSnap.forEach(async (d) => {
          await updateDoc(doc(db, "householdRequests", d.id), { status: "approved" });
        });
      } catch (err) {
        console.error("Error updating householdRequest:", err);
      }

      await addDoc(collection(db, "auditLogs"), {
        societyId: selectedSocietyId,
        action: "Household Member Approved",
        description: `Admin approved household member ${userToApprove.name} (${userToApprove.email}) for Unit ${userToApprove.unitNumber}.`,
        timestamp: new Date().toISOString()
      });

      // Send approval notification email
      await sendNotification(
        'email',
        userToApprove.email,
        `Household Access Approved - ${currentSociety?.name || "Society Portal"}`,
        `Hello ${userToApprove.name},\n\nYour household registration for Unit ${userToApprove.unitNumber} at ${currentSociety?.name || "Society"} has been approved by the Administrator.\n\nYou now have full resident access to submit and track maintenance requests, view society notices, and manage your unit household roster.`
      );
    }
  };

  const handleRejectUser = async (userId: string) => {
    if (!userId || !selectedSocietyId) return;
    if (!confirm("Are you sure you want to reject and remove this household registration?")) return;
    
    const userToReject = usersList.find(u => u.id === userId);
    try {
      await deleteDoc(doc(db, "users", userId));
      
      if (userToReject) {
        const qReq = query(
          collection(db, "householdRequests"),
          where("societyId", "==", selectedSocietyId),
          where("targetUserEmail", "==", userToReject.email),
          where("status", "==", "pending")
        );
        const reqSnap = await getDocs(qReq);
        reqSnap.forEach(async (d) => {
          await updateDoc(doc(db, "householdRequests", d.id), { status: "rejected" });
        });

        await addDoc(collection(db, "auditLogs"), {
          societyId: selectedSocietyId,
          action: "Household Member Registration Rejected",
          description: `Admin rejected household registration for ${userToReject.name} (${userToReject.email}) for Unit ${userToReject.unitNumber}.`,
          timestamp: new Date().toISOString()
        });
      }
    } catch(err) {
      console.error("Error rejecting user:", err);
    }
  };

  const handleUpdateStaff = async (e: FormEvent) => {
    e.preventDefault();
    if (!editingStaffId) return;
    try {
      await updateDoc(doc(db, "staff", editingStaffId), editStaffData);
      setEditingStaffId(null);
      setEditStaffData({});
    } catch(err) {
      console.error(err);
      alert("Failed to update staff.");
    }
  };

  const handleAddStaff = async (e: FormEvent) => {
    e.preventDefault();
    if (!newStaff.name || !newStaff.phone || !newStaff.email || !selectedSocietyId) return;
    
    await addDoc(collection(db, "staff"), {
      societyId: selectedSocietyId,
      ...newStaff,
      createdAt: new Date().toISOString()
    });

    try {
      await addDoc(collection(db, "auditLogs"), {
        societyId: selectedSocietyId,
        actorId: userProfile?.id || "",
        actorName: userProfile?.name || "Admin",
        actorRole: "admin",
        category: "system",
        action: "Staff Member Added",
        targetId: newStaff.name,
        description: `Admin added new maintenance staff member ${newStaff.name} (${newStaff.profession}, Phone: ${newStaff.phone}).`,
        timestamp: new Date().toISOString()
      });
    } catch (logErr) {
      console.error("Failed to log staff add:", logErr);
    }
    
    setNewStaff({ name: "", profession: "Plumbing", phone: "", email: "", workingHours: "9:00 AM - 5:00 PM" });
    setShowAddStaff(false);
  };

  const handleSaveSettings = async (e: FormEvent) => {
    e.preventDefault();
    if (!selectedSocietyId) return;
    setIsSavingSettings(true);
    try {
      let units = settingsForm.generatedUnits || [];
      if (units.length === 0) {
        for (let i = 1; i <= settingsForm.numberOfFloors; i++) {
          for (let j = 1; j <= settingsForm.unitsPerFloor; j++) {
            units.push(`${i}${String(j).padStart(2, '0')}`);
          }
        }
      }
      
      const updatedData: Partial<Society> = {
        name: settingsForm.name.trim(),
        buildingName: settingsForm.name.trim(),
        address: settingsForm.address.trim(),
        numberOfFloors: Number(settingsForm.numberOfFloors),
        unitsPerFloor: Number(settingsForm.unitsPerFloor),
        totalApartments: units.length,
        generatedUnits: units,
        isSetupComplete: true,
        updatedAt: new Date().toISOString()
      };

      await updateDoc(doc(db, "societies", selectedSocietyId), updatedData);
      
      await addDoc(collection(db, "auditLogs"), {
        societyId: selectedSocietyId,
        action: "Society Settings Updated",
        description: `Settings updated for "${settingsForm.name}". Total units: ${units.length}.`,
        timestamp: new Date().toISOString()
      });

      alert("Settings saved successfully!");
    } catch (err) {
      console.error(err);
      alert("Failed to save settings.");
    }
    setIsSavingSettings(false);
  };

  const handleApproveRemovalRequest = async (requestId: string, targetUserId: string) => {
    if (!selectedSocietyId) return;
    try {
      await updateDoc(doc(db, "users", targetUserId), { status: "removed" });
      await updateDoc(doc(db, "householdRequests", requestId), { status: "approved" });
      
      const req = householdRequests.find(r => r.id === requestId);
      if (req) {
        await addDoc(collection(db, "auditLogs"), {
          societyId: selectedSocietyId,
          action: "Household Member Removed",
          description: `Admin approved removal of ${req.targetUserName} from Unit ${req.unitNumber}. Requested by ${req.requestedByName}.`,
          timestamp: new Date().toISOString()
        });
      }
    } catch(err) {
      console.error(err);
    }
  };

  const handleRejectRemovalRequest = async (requestId: string) => {
    try {
      await updateDoc(doc(db, "householdRequests", requestId), { status: "rejected" });
    } catch(err) {
      console.error(err);
    }
  };

  // Process data for rendering
  const processedComplaints = complaints.map(c => ({
    ...c,
    isOverdue: checkIsOverdue(c)
  }));

  let filteredComplaints = processedComplaints;
  if (statusFilter !== "All") filteredComplaints = filteredComplaints.filter(c => c.status === statusFilter);
  if (priorityFilter !== "All") {
    if (priorityFilter === "Overdue") {
      filteredComplaints = filteredComplaints.filter(c => c.isOverdue);
    } else {
      filteredComplaints = filteredComplaints.filter(c => c.priority === priorityFilter);
    }
  }
  if (categoryFilter !== "All") filteredComplaints = filteredComplaints.filter(c => c.category === categoryFilter);
  if (dateFilter !== "All") {
    filteredComplaints = filteredComplaints.filter(c => {
      const d = new Date(c.createdAt);
      if (dateFilter === "Today") return isToday(d);
      if (dateFilter === "This Week") return isThisWeek(d);
      if (dateFilter === "This Month") return isThisMonth(d);
      return true;
    });
  }

  // Sort: Overdue first, then by priority, then by date descending
  const priorityWeight = { "Urgent": 4, "High": 3, "Medium": 2, "Low": 1 };
  filteredComplaints.sort((a, b) => {
    if (a.isOverdue && !b.isOverdue) return -1;
    if (!a.isOverdue && b.isOverdue) return 1;
    
    const pA = priorityWeight[a.priority as keyof typeof priorityWeight] || 0;
    const pB = priorityWeight[b.priority as keyof typeof priorityWeight] || 0;
    if (pA !== pB) return pB - pA;
    
    return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
  });

  const metrics = {
    total: complaints.length,
    open: complaints.filter(c => c.status === "Open").length,
    inProgress: complaints.filter(c => c.status === "In Progress").length,
    resolved: complaints.filter(c => c.status === "Resolved").length,
    overdue: processedComplaints.filter(c => c.isOverdue).length
  };

  const categories = Array.from(new Set(complaints.map(c => c.category)));

  // Filtered Audit & Time Logs
  const filteredAuditLogs = auditLogs.filter(log => {
    if (logCategoryFilter !== "All" && log.category !== logCategoryFilter) {
      return false;
    }
    if (logSearchQuery.trim()) {
      const q = logSearchQuery.toLowerCase();
      const matchDesc = log.description?.toLowerCase().includes(q);
      const matchAction = log.action?.toLowerCase().includes(q);
      const matchActor = log.actorName?.toLowerCase().includes(q);
      const matchUnit = log.unitNumber?.toLowerCase().includes(q);
      const matchTarget = log.targetId?.toLowerCase().includes(q);
      return matchDesc || matchAction || matchActor || matchUnit || matchTarget;
    }
    return true;
  });

  const exportAuditLogsCSV = () => {
    if (filteredAuditLogs.length === 0) {
      alert("No audit log records to export.");
      return;
    }
    const headers = ["Timestamp", "Actor Name", "Actor Role", "Category", "Action", "Target / Unit", "Description"];
    const rows = filteredAuditLogs.map(l => [
      `"${l.timestamp}"`,
      `"${l.actorName || 'System'}"`,
      `"${l.actorRole || 'system'}"`,
      `"${l.category || 'general'}"`,
      `"${l.action || ''}"`,
      `"${l.unitNumber || l.targetId || ''}"`,
      `"${(l.description || '').replace(/"/g, '""')}"`
    ]);
    const csvContent = "data:text/csv;charset=utf-8," + [headers.join(","), ...rows.map(e => e.join(","))].join("\n");
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement("a");
    link.setAttribute("href", encodedUri);
    link.setAttribute("download", `audit_and_time_logs_${currentSociety?.name?.replace(/\s+/g, '_') || 'society'}_${format(new Date(), 'yyyy-MM-dd')}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  return (
    <div className="min-h-screen bg-slate-100 flex">
      {/* Sidebar */}
      <aside className="w-72 bg-slate-900 text-white hidden md:flex flex-col shrink-0 border-r border-slate-800">
        
        {/* Society Switcher Header in Sidebar */}
        <div className="p-4 border-b border-slate-800">
          <div className="flex items-center justify-between mb-2">
            <span className="text-[11px] font-bold uppercase tracking-wider text-slate-400">Current Society</span>
            <button
              onClick={() => {
                setIsCreatingNewSociety(true);
                setShowOnboardingModal(true);
              }}
              className="text-xs text-blue-400 hover:text-blue-300 font-bold flex items-center"
              title="Create another society"
            >
              <Plus className="w-3.5 h-3.5 mr-0.5" /> New
            </button>
          </div>

          <div className="relative">
            <select
              value={selectedSocietyId}
              onChange={(e) => {
                setSelectedSocietyId(e.target.value);
                if (user?.uid) {
                  updateDoc(doc(db, "users", user.uid), { societyId: e.target.value });
                }
              }}
              className="w-full bg-slate-800 border border-slate-700 text-white text-xs font-semibold rounded-lg px-3 py-2 appearance-none focus:outline-hidden focus:ring-1 focus:ring-blue-500 cursor-pointer pr-8"
            >
              {societies.map(s => (
                <option key={s.id} value={s.id}>
                  {s.name || s.buildingName}
                </option>
              ))}
            </select>
            <ChevronDown className="w-4 h-4 text-slate-400 absolute right-2.5 top-2.5 pointer-events-none" />
          </div>

          {currentSociety && (
            <p className="text-[11px] text-slate-400 mt-2 truncate">
              📍 {currentSociety.address}
            </p>
          )}
        </div>

        {/* Navigation Tabs */}
        <div className="flex-1 px-3 py-4 space-y-1 overflow-y-auto">
          <button
            onClick={() => setActiveTab('complaints')}
            className={`w-full flex items-center px-3 py-2.5 text-xs font-bold rounded-lg transition-colors ${activeTab === 'complaints' ? 'bg-blue-600 text-white shadow-xs' : 'text-slate-300 hover:bg-slate-800 hover:text-white'}`}
          >
            <AlertCircle className="w-4 h-4 mr-3 shrink-0" />
            Complaints
            {metrics.open > 0 && (
              <span className="ml-auto bg-amber-500 text-white px-2 py-0.5 rounded-full text-[10px] font-bold">
                {metrics.open} Open
              </span>
            )}
          </button>

          <button
            onClick={() => setActiveTab('notices')}
            className={`w-full flex items-center px-3 py-2.5 text-xs font-bold rounded-lg transition-colors ${activeTab === 'notices' ? 'bg-blue-600 text-white shadow-xs' : 'text-slate-300 hover:bg-slate-800 hover:text-white'}`}
          >
            <Megaphone className="w-4 h-4 mr-3 shrink-0" />
            Notices & Broadcasts
          </button>

          <button
            onClick={() => setActiveTab('directory')}
            className={`w-full flex items-center px-3 py-2.5 text-xs font-bold rounded-lg transition-colors ${activeTab === 'directory' ? 'bg-blue-600 text-white shadow-xs' : 'text-slate-300 hover:bg-slate-800 hover:text-white'}`}
          >
            <Users className="w-4 h-4 mr-3 shrink-0" />
            Directory & Staff
            {(usersList.filter(u => u.status === 'pending').length > 0 || householdRequests.filter(r => r.status === 'pending').length > 0) && (
              <span className="ml-auto bg-red-500 text-white px-2 py-0.5 rounded-full text-[10px] font-bold">
                {usersList.filter(u => u.status === 'pending').length + householdRequests.filter(r => r.status === 'pending').length}
              </span>
            )}
          </button>

          <button
            onClick={() => setActiveTab('logs')}
            className={`w-full flex items-center px-3 py-2.5 text-xs font-bold rounded-lg transition-colors ${activeTab === 'logs' ? 'bg-blue-600 text-white shadow-xs' : 'text-slate-300 hover:bg-slate-800 hover:text-white'}`}
          >
            <Clock className="w-4 h-4 mr-3 shrink-0" />
            Audit & Time Logs
            {auditLogs.length > 0 && (
              <span className="ml-auto bg-slate-800 text-slate-300 px-2 py-0.5 rounded-full text-[10px] font-bold">
                {auditLogs.length}
              </span>
            )}
          </button>

          <button
            onClick={() => setActiveTab('settings')}
            className={`w-full flex items-center px-3 py-2.5 text-xs font-bold rounded-lg transition-colors ${activeTab === 'settings' ? 'bg-blue-600 text-white shadow-xs' : 'text-slate-300 hover:bg-slate-800 hover:text-white'}`}
          >
            <SettingsIcon className="w-4 h-4 mr-3 shrink-0" />
            Society Settings
          </button>

          <button
            onClick={() => setActiveTab('profile')}
            className={`w-full flex items-center px-3 py-2.5 text-xs font-bold rounded-lg transition-colors ${activeTab === 'profile' ? 'bg-blue-600 text-white shadow-xs' : 'text-slate-300 hover:bg-slate-800 hover:text-white'}`}
          >
            <UserIcon className="w-4 h-4 mr-3 shrink-0" />
            My Profile
          </button>
        </div>
        
        {/* User Info & Signout */}
        <div className="p-4 border-t border-slate-800 bg-slate-950/40">
          <div className="flex items-center mb-3">
             <div className="w-8 h-8 rounded-lg bg-blue-600 flex items-center justify-center text-xs font-bold text-white mr-3 shadow-xs">
               {userProfile?.name?.charAt(0).toUpperCase()}
             </div>
             <div className="min-w-0 flex-1">
               <p className="text-xs font-bold text-white truncate">{userProfile?.name}</p>
               <p className="text-[10px] text-slate-400 truncate">Society Administrator</p>
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
                  {currentSociety?.name || "Admin Workspace"}
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
              <div className="hidden sm:block">
                <h2 className="text-lg font-black text-slate-900 tracking-tight">
                  {currentSociety?.name || "Society Management Portal"}
                </h2>
                <p className="text-xs text-slate-500 font-medium">
                  {currentSociety?.address ? `${currentSociety.address} • ${currentSociety.numberOfFloors || 0} Floors, ${currentSociety.totalApartments || 0} Units` : "Admin Workspace"}
                </p>
              </div>
            </div>

            {/* Mobile Tab Selector */}
            <div className="flex space-x-1.5 md:hidden overflow-x-auto pb-1 hide-scrollbar">
              <button onClick={() => setActiveTab('complaints')} className={`px-3 py-1 text-xs font-bold rounded-lg ${activeTab === 'complaints' ? 'bg-slate-900 text-white' : 'bg-slate-100 text-slate-700'}`}>Complaints</button>
              <button onClick={() => setActiveTab('notices')} className={`px-3 py-1 text-xs font-bold rounded-lg ${activeTab === 'notices' ? 'bg-slate-900 text-white' : 'bg-slate-100 text-slate-700'}`}>Notices</button>
              <button onClick={() => setActiveTab('directory')} className={`px-3 py-1 text-xs font-bold rounded-lg ${activeTab === 'directory' ? 'bg-slate-900 text-white' : 'bg-slate-100 text-slate-700'}`}>Directory</button>
              <button onClick={() => setActiveTab('logs')} className={`px-3 py-1 text-xs font-bold rounded-lg ${activeTab === 'logs' ? 'bg-slate-900 text-white' : 'bg-slate-100 text-slate-700'}`}>Logs</button>
              <button onClick={() => setActiveTab('settings')} className={`px-3 py-1 text-xs font-bold rounded-lg ${activeTab === 'settings' ? 'bg-slate-900 text-white' : 'bg-slate-100 text-slate-700'}`}>Settings</button>
            </div>
            
            {/* Quick Testing Switcher */}
            <div className="flex items-center space-x-2">
              <button
                onClick={() => {
                  setIsCreatingNewSociety(true);
                  setShowOnboardingModal(true);
                }}
                className="inline-flex items-center bg-blue-50 text-blue-700 border border-blue-200 px-3 py-1.5 rounded-lg text-xs font-bold hover:bg-blue-100 transition shadow-2xs"
              >
                <Plus className="w-3.5 h-3.5 mr-1" /> Add Society
              </button>
              
              <button
                onClick={() => updateDoc(doc(db, "users", user!.uid), { role: "resident" })}
                className="bg-indigo-50 text-indigo-700 border border-indigo-200 px-3 py-1.5 rounded-lg text-xs font-bold hover:bg-indigo-100 transition shadow-2xs"
                title="Switch to resident dashboard for testing"
              >
                Test As Resident
              </button>
            </div>
        </div>
        
        {/* Main View Body */}
        <main className="flex-1 overflow-y-auto p-4 md:p-6 space-y-6">
          
          {/* Setup Incomplete Notice Banner */}
          {currentSociety && !currentSociety.isSetupComplete && (
            <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 flex items-center justify-between">
              <div className="flex items-center space-x-3">
                <Sparkles className="w-5 h-5 text-amber-600 shrink-0" />
                <div>
                  <h4 className="text-xs font-bold text-amber-900">Setup Incomplete</h4>
                  <p className="text-xs text-amber-700">Please configure the number of floors and apartment units for this society.</p>
                </div>
              </div>
              <button
                onClick={() => {
                  setIsCreatingNewSociety(false);
                  setShowOnboardingModal(true);
                }}
                className="px-3.5 py-1.5 bg-amber-600 hover:bg-amber-700 text-white text-xs font-bold rounded-lg shadow-2xs transition"
              >
                Configure Now
              </button>
            </div>
          )}

          {activeTab === "profile" && userProfile ? (
            <ProfileEditor userProfile={userProfile} />
          ) : activeTab === "complaints" ? (
            <div className="space-y-6">
              {/* Metrics Row */}
              <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
                <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-2xs">
                  <p className="text-xs font-bold text-slate-500 uppercase tracking-wider">Total Complaints</p>
                  <p className="text-2xl font-black text-slate-900 mt-1">{metrics.total}</p>
                </div>
                <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-2xs">
                  <p className="text-xs font-bold text-amber-600 uppercase tracking-wider">Open</p>
                  <p className="text-2xl font-black text-amber-600 mt-1">{metrics.open}</p>
                </div>
                <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-2xs">
                  <p className="text-xs font-bold text-blue-600 uppercase tracking-wider">In Progress</p>
                  <p className="text-2xl font-black text-blue-600 mt-1">{metrics.inProgress}</p>
                </div>
                <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-2xs">
                  <p className="text-xs font-bold text-emerald-600 uppercase tracking-wider">Resolved</p>
                  <p className="text-2xl font-black text-emerald-600 mt-1">{metrics.resolved}</p>
                </div>
                <div className="bg-white p-4 rounded-xl border border-red-200 bg-red-50/50 shadow-2xs col-span-2 md:col-span-1">
                  <div className="flex items-center justify-between">
                    <p className="text-xs font-bold text-red-600 uppercase tracking-wider">SLA Overdue</p>
                    <ShieldAlert className="w-3.5 h-3.5 text-red-500" />
                  </div>
                  <p className="text-2xl font-black text-red-600 mt-1">{metrics.overdue}</p>
                  <p className="text-[9px] text-red-700/80 font-medium mt-0.5">U:&gt;10h • H:&gt;1d • M:&gt;2d • L:&gt;3d</p>
                </div>
              </div>

              {/* Priority Bar Filter Toolbar */}
              <div className="bg-white p-3.5 rounded-xl border border-slate-200 shadow-2xs flex flex-wrap items-center justify-between gap-2.5">
                <div className="flex items-center space-x-2 text-xs font-bold text-slate-700">
                  <Flame className="w-4 h-4 text-orange-500" />
                  <span>Filter by Priority / SLA:</span>
                </div>
                <div className="flex flex-wrap items-center gap-1.5">
                  {(["All", "Overdue", "Urgent", "High", "Medium", "Low"] as const).map((p) => {
                    const count = p === "All"
                      ? complaints.length
                      : p === "Overdue"
                      ? processedComplaints.filter(c => c.isOverdue).length
                      : complaints.filter(c => (c.priority || "Low") === p).length;

                    const isActive = priorityFilter === p;
                    return (
                      <button
                        key={p}
                        onClick={() => setPriorityFilter(p)}
                        className={`inline-flex items-center space-x-1 px-3 py-1 rounded-lg text-xs font-bold transition-all shadow-2xs ${
                          isActive
                            ? p === "Overdue" ? "bg-red-600 text-white shadow-xs" :
                              p === "Urgent" ? "bg-red-500 text-white shadow-xs" :
                              p === "High" ? "bg-orange-500 text-white shadow-xs" :
                              p === "Medium" ? "bg-blue-600 text-white shadow-xs" :
                              p === "Low" ? "bg-slate-800 text-white shadow-xs" :
                              "bg-blue-600 text-white shadow-xs"
                            : "bg-slate-100 text-slate-700 hover:bg-slate-200"
                        }`}
                      >
                        <span>{p}</span>
                        <span className={`ml-1.5 px-1.5 py-0.2 rounded-full text-[10px] ${
                          isActive ? "bg-white/25 text-white" : "bg-white text-slate-700 border border-slate-200 font-semibold"
                        }`}>
                          {count}
                        </span>
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Secondary Filters */}
              <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-2xs flex flex-wrap items-center justify-between gap-3">
                <div className="flex items-center space-x-2">
                  <Filter className="w-4 h-4 text-slate-500" />
                  <span className="text-xs font-bold text-slate-700">Detailed Filters:</span>
                </div>

                <div className="flex flex-wrap gap-2">
                  <select
                    value={statusFilter}
                    onChange={(e) => setStatusFilter(e.target.value)}
                    className="text-xs font-semibold border border-slate-300 rounded-lg px-2.5 py-1.5 bg-white text-slate-800"
                  >
                    <option value="All">All Statuses</option>
                    <option value="Open">Open</option>
                    <option value="In Progress">In Progress</option>
                    <option value="Pending Resident Approval">Pending Resident Approval</option>
                    <option value="Resolved">Resolved</option>
                  </select>

                  <select
                    value={categoryFilter}
                    onChange={(e) => setCategoryFilter(e.target.value)}
                    className="text-xs font-semibold border border-slate-300 rounded-lg px-2.5 py-1.5 bg-white text-slate-800"
                  >
                    <option value="All">All Categories</option>
                    {categories.map(c => <option key={c} value={c}>{c}</option>)}
                  </select>

                  <select
                    value={dateFilter}
                    onChange={(e) => setDateFilter(e.target.value)}
                    className="text-xs font-semibold border border-slate-300 rounded-lg px-2.5 py-1.5 bg-white text-slate-800"
                  >
                    <option value="All">All Dates</option>
                    <option value="Today">Today</option>
                    <option value="This Week">This Week</option>
                    <option value="This Month">This Month</option>
                  </select>
                </div>
              </div>

              {/* Complaints List Table / Grid */}
              <div className="bg-white rounded-xl border border-slate-200 shadow-2xs overflow-hidden">
                <div className="overflow-x-auto">
                  <table className="min-w-full divide-y divide-slate-200 text-left text-xs">
                    <thead className="bg-slate-50 text-slate-500 font-bold uppercase tracking-wider">
                      <tr>
                        <th className="px-4 py-3">Status / Space</th>
                        <th className="px-4 py-3">Category & Description</th>
                        <th className="px-4 py-3">Unit / Resident</th>
                        <th className="px-4 py-3">Priority & SLA</th>
                        <th className="px-4 py-3">Assigned Staff</th>
                        <th className="px-4 py-3">Duration / Date</th>
                        <th className="px-4 py-3 text-right">Actions</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 font-medium text-slate-800">
                      {filteredComplaints.map(c => (
                        <tr key={c.id} className={`hover:bg-slate-50/80 transition-colors ${c.isOverdue ? 'bg-red-50/30' : ''}`}>
                          <td className="px-4 py-3">
                            <div className="flex flex-col items-start gap-1">
                              <span className={`px-2 py-0.5 rounded-md text-[10px] font-bold ${
                                c.status === 'Open' ? 'bg-amber-100 text-amber-800' :
                                c.status === 'In Progress' ? 'bg-blue-100 text-blue-800' :
                                c.status === 'Pending Resident Approval' ? 'bg-purple-100 text-purple-800' :
                                'bg-emerald-100 text-emerald-800'
                              }`}>
                                {c.status}
                              </span>
                              {c.isOverdue && (
                                <span className="inline-flex items-center px-2 py-0.5 rounded-md text-[9px] font-black bg-red-600 text-white shadow-2xs">
                                  <ShieldAlert className="w-2.5 h-2.5 mr-1" />
                                  SLA Overdue
                                </span>
                              )}
                              <span className="text-[10px] text-slate-400 font-semibold">
                                {c.spaceType || 'Private'} Space
                              </span>
                            </div>
                          </td>
                          <td className="px-4 py-3 max-w-xs">
                            <div className="flex items-center space-x-1.5">
                              <p className="font-bold text-slate-900">{c.category}</p>
                              {c.photoUrl && (
                                <button 
                                  type="button" 
                                  onClick={() => setLightboxImage(c.photoUrl)}
                                  className="text-blue-600 hover:text-blue-800 p-0.5"
                                  title="View attached photo"
                                >
                                  <ImageIcon className="w-3.5 h-3.5" />
                                </button>
                              )}
                            </div>
                            <p className="text-slate-500 line-clamp-1">{c.description}</p>
                          </td>
                          <td className="px-4 py-3">
                            <span className="font-bold text-slate-900">Unit {c.unitNumber || "N/A"}</span>
                          </td>
                          <td className="px-4 py-3">
                            <div className="flex flex-col items-start gap-0.5">
                              <span className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                                c.priority === 'Urgent' ? 'bg-red-100 text-red-700' :
                                c.priority === 'High' ? 'bg-orange-100 text-orange-700' :
                                c.priority === 'Medium' ? 'bg-blue-100 text-blue-700' :
                                'bg-slate-100 text-slate-700'
                              }`}>
                                {c.priority || 'Low'}
                              </span>
                              <span className="text-[9px] text-slate-400 font-medium">
                                {getSlaDescription(c.priority)}
                              </span>
                            </div>
                          </td>
                          <td className="px-4 py-3 text-slate-600">
                            {c.assignedStaffName ? (
                              <div>
                                <p className="font-bold text-slate-900">{c.assignedStaffName}</p>
                                <p className="text-[10px] text-slate-400">{c.assignedStaffPhone}</p>
                              </div>
                            ) : (
                              <span className="text-slate-400 italic">Unassigned</span>
                            )}
                          </td>
                          <td className="px-4 py-3">
                            <p className="text-slate-900 font-semibold">{getOpenForText(c.createdAt)}</p>
                            <p className="text-[10px] text-slate-400">{format(new Date(c.createdAt), "MMM d, yyyy")}</p>
                          </td>
                          <td className="px-4 py-3 text-right">
                            <div className="flex items-center justify-end space-x-1.5">
                              <button
                                onClick={() => setSelectedComplaintForHistory(c)}
                                className="inline-flex items-center px-2.5 py-1 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-md text-xs font-bold transition shadow-2xs"
                                title="View chronological state transitions, notes, and time logs"
                              >
                                <History className="w-3.5 h-3.5 mr-1 text-slate-500" />
                                Timeline
                              </button>
                              <button
                                onClick={() => {
                                  setSelectedComplaint(c);
                                  setUpdateStatus(c.status);
                                  setUpdatePriority(c.priority || "Low");
                                  setAssignedStaffId(c.assignedStaffId || "");
                                }}
                                className="px-3 py-1 bg-slate-900 hover:bg-blue-600 text-white rounded-md text-xs font-bold transition shadow-2xs"
                              >
                                Manage
                              </button>
                            </div>
                          </td>
                        </tr>
                      ))}
                      {filteredComplaints.length === 0 && (
                        <tr>
                          <td colSpan={7} className="px-4 py-12 text-center text-slate-400">
                            No complaints found matching current filters for this society.
                          </td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
              </div>

              {/* Complaints Pagination */}
              {complaints.length >= complaintsLimit && (
                <div className="text-center pt-2">
                  <button
                    onClick={() => setComplaintsLimit(prev => prev + 15)}
                    className="px-4 py-2 bg-white border border-slate-300 hover:bg-slate-50 text-slate-700 rounded-xl text-xs font-bold shadow-2xs transition"
                  >
                    Load More Complaints
                  </button>
                </div>
              )}
            </div>
          ) : activeTab === "notices" ? (
            <div className="space-y-6">
              <div className="flex justify-between items-center">
                <div>
                  <h3 className="text-lg font-bold text-slate-900">Society Notices & Announcements</h3>
                  <p className="text-xs text-slate-500">Post announcements scoped strictly to {currentSociety?.name}.</p>
                </div>
                <button
                  onClick={() => setShowNoticeForm(!showNoticeForm)}
                  className="inline-flex items-center px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold rounded-lg shadow-xs transition"
                >
                  <Plus className="w-4 h-4 mr-1.5" /> Post Announcement
                </button>
              </div>

              {showNoticeForm && (
                <div className="bg-white p-6 rounded-xl border border-slate-200 shadow-sm animate-in fade-in">
                  <form onSubmit={handlePostNotice} className="space-y-4">
                    <h4 className="text-sm font-bold text-slate-900">New Broadcast</h4>
                    <div>
                      <label className="block text-xs font-bold uppercase tracking-wider text-slate-700 mb-1">Notice Title</label>
                      <input
                        type="text"
                        required
                        placeholder="e.g. Elevator Maintenance Scheduled"
                        value={newNotice.title}
                        onChange={(e) => setNewNotice({ ...newNotice, title: e.target.value })}
                        className="w-full px-3 py-2 text-xs rounded-lg border border-slate-300 focus:outline-hidden focus:ring-1 focus:ring-blue-500"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-bold uppercase tracking-wider text-slate-700 mb-1">Notice Content</label>
                      <textarea
                        rows={3}
                        required
                        placeholder="Provide details about the announcement..."
                        value={newNotice.content}
                        onChange={(e) => setNewNotice({ ...newNotice, content: e.target.value })}
                        className="w-full px-3 py-2 text-xs rounded-lg border border-slate-300 focus:outline-hidden focus:ring-1 focus:ring-blue-500"
                      />
                    </div>

                    <div>
                      <label className="block text-xs font-bold uppercase tracking-wider text-slate-700 mb-1">
                        Notice Image (Optional)
                      </label>
                      {newNotice.imageUrl ? (
                        <div className="relative inline-block mt-2">
                          <img 
                            src={newNotice.imageUrl} 
                            alt="Notice Preview" 
                            className="w-32 h-24 object-cover rounded-xl border border-slate-300 shadow-xs cursor-pointer"
                            onClick={() => setLightboxImage(newNotice.imageUrl)}
                          />
                          <button
                            type="button"
                            onClick={() => setNewNotice({ ...newNotice, imageUrl: "" })}
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
                            onChange={handleNoticeImageChange}
                            className="text-xs text-slate-500 file:mr-3 file:py-1.5 file:px-3 file:rounded-lg file:border-0 file:text-xs file:font-semibold file:bg-blue-50 file:text-blue-700 hover:file:bg-blue-100 cursor-pointer"
                          />
                          {uploadingNoticeImage && (
                            <div className="w-full bg-slate-100 rounded-full h-2 overflow-hidden">
                              <div className="bg-blue-600 h-2 transition-all duration-300" style={{ width: `${uploadNoticeProgress}%` }} />
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                    <div className="flex items-center space-x-2">
                      <input
                        type="checkbox"
                        id="isImportant"
                        checked={newNotice.isImportant}
                        onChange={(e) => setNewNotice({ ...newNotice, isImportant: e.target.checked })}
                        className="rounded text-blue-600"
                      />
                      <label htmlFor="isImportant" className="text-xs font-bold text-slate-700">Mark as High Importance</label>
                    </div>
                    <div className="flex justify-end space-x-2 pt-2">
                      <button
                        type="button"
                        onClick={() => setShowNoticeForm(false)}
                        className="px-4 py-2 text-xs font-bold text-slate-600 hover:text-slate-800"
                      >
                        Cancel
                      </button>
                      <button
                        type="submit"
                        className="px-5 py-2 bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold rounded-lg shadow-xs"
                      >
                        Publish Notice
                      </button>
                    </div>
                  </form>
                </div>
              )}

              {/* Notice Grid */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {notices.map(notice => (
                  <div key={notice.id} className="bg-white p-5 rounded-xl border border-slate-200 shadow-2xs relative overflow-hidden">
                    {notice.isImportant && (
                      <div className="absolute top-0 right-0 bg-red-600 text-white text-[10px] font-black uppercase tracking-wider px-3 py-0.5 rounded-bl-lg">
                        Important
                      </div>
                    )}
                    <h4 className="font-bold text-slate-900 text-sm mb-1">{notice.title}</h4>
                    {notice.imageUrl && (
                      <div className="my-2">
                        <img 
                          src={notice.imageUrl} 
                          alt="Notice" 
                          onClick={() => setLightboxImage(notice.imageUrl)}
                          className="w-full h-36 object-cover rounded-lg border border-slate-200 cursor-pointer hover:opacity-95 transition"
                        />
                      </div>
                    )}
                    <p className="text-xs text-slate-600 mb-3 whitespace-pre-line">{notice.content}</p>
                    <p className="text-[10px] text-slate-400 font-semibold">
                      Published {format(new Date(notice.createdAt), "MMMM d, yyyy 'at' h:mm a")}
                    </p>
                  </div>
                ))}
                {notices.length === 0 && (
                  <div className="col-span-full py-12 text-center text-slate-400 border border-dashed border-slate-300 rounded-xl bg-white">
                    No notices published for this society yet.
                  </div>
                )}
              </div>

              {/* Notices Pagination */}
              {notices.length >= noticesLimit && (
                <div className="text-center pt-2">
                  <button
                    onClick={() => setNoticesLimit(prev => prev + 10)}
                    className="px-4 py-2 bg-white border border-slate-300 hover:bg-slate-50 text-slate-700 rounded-xl text-xs font-bold shadow-2xs transition"
                  >
                    Load More Notices
                  </button>
                </div>
              )}
            </div>
          ) : activeTab === "directory" ? (
            <div className="space-y-6">
              {/* Directory Sub-tabs */}
              <div className="flex border-b border-slate-200 gap-4">
                <button
                  onClick={() => setDirectorySubTab("residents")}
                  className={`pb-2.5 text-xs font-bold transition-all border-b-2 ${directorySubTab === "residents" ? "border-blue-600 text-blue-600" : "border-transparent text-slate-500 hover:text-slate-800"}`}
                >
                  Residents ({usersList.filter(u => u.role === 'resident' && u.status === 'approved').length})
                </button>
                <button
                  onClick={() => setDirectorySubTab("approvals")}
                  className={`pb-2.5 text-xs font-bold transition-all border-b-2 relative ${directorySubTab === "approvals" ? "border-blue-600 text-blue-600" : "border-transparent text-slate-500 hover:text-slate-800"}`}
                >
                  Pending Approvals ({usersList.filter(u => (u.status === 'pending' || u.status === 'invited') && u.role === 'resident').length + householdRequests.filter(r => r.status === 'pending' && r.type === 'removal').length})
                </button>
                <button
                  onClick={() => setDirectorySubTab("staff")}
                  className={`pb-2.5 text-xs font-bold transition-all border-b-2 ${directorySubTab === "staff" ? "border-blue-600 text-blue-600" : "border-transparent text-slate-500 hover:text-slate-800"}`}
                >
                  Maintenance Staff ({staffList.length})
                </button>
              </div>

              {directorySubTab === "residents" ? (
                <div className="bg-white rounded-xl border border-slate-200 overflow-hidden shadow-2xs">
                  <div className="p-4 bg-slate-50 border-b border-slate-200 flex justify-between items-center">
                    <h4 className="text-xs font-bold uppercase tracking-wider text-slate-700">Resident Directory</h4>
                    <span className="text-xs text-slate-500 font-semibold">{currentSociety?.name}</span>
                  </div>
                  <div className="overflow-x-auto">
                    <table className="min-w-full divide-y divide-slate-100 text-left text-xs">
                      <thead className="bg-slate-50 text-slate-500 font-bold uppercase tracking-wider">
                        <tr>
                          <th className="px-4 py-3">Resident</th>
                          <th className="px-4 py-3">Unit Number</th>
                          <th className="px-4 py-3">Resident Type</th>
                          <th className="px-4 py-3">Contact</th>
                          <th className="px-4 py-3">Joined Date</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100 font-medium text-slate-800">
                        {usersList.filter(u => u.role === 'resident' && u.status === 'approved').map(res => (
                          <tr key={res.id} className="hover:bg-slate-50/80">
                            <td className="px-4 py-3 font-bold text-slate-900">{res.name}</td>
                            <td className="px-4 py-3 font-bold text-blue-600">Unit {res.unitNumber}</td>
                            <td className="px-4 py-3">
                              <span className="px-2 py-0.5 rounded-md text-[10px] font-bold bg-slate-100 text-slate-700">
                                {res.residentType === 'household' ? 'Household Member' : 'Primary Resident'}
                              </span>
                            </td>
                            <td className="px-4 py-3 text-slate-600">{res.email}</td>
                            <td className="px-4 py-3 text-slate-400">{format(new Date(res.createdAt), "MMM d, yyyy")}</td>
                          </tr>
                        ))}
                        {usersList.filter(u => u.role === 'resident' && u.status === 'approved').length === 0 && (
                          <tr>
                            <td colSpan={5} className="px-4 py-8 text-center text-slate-400">
                              No approved residents in this society yet.
                            </td>
                          </tr>
                        )}
                      </tbody>
                    </table>
                  </div>
                </div>
              ) : directorySubTab === "approvals" ? (
                <div className="space-y-6">
                  <div>
                    <h4 className="text-xs font-bold uppercase tracking-wider text-slate-700 mb-3">
                      Pending Household Members & Registrations ({usersList.filter(u => (u.status === 'pending' || u.status === 'invited') && u.role === 'resident').length})
                    </h4>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      {usersList.filter(u => (u.status === 'pending' || u.status === 'invited') && u.role === 'resident').map(pendingUser => (
                        <div key={pendingUser.id} className="bg-white p-4 rounded-xl border border-slate-200 shadow-2xs flex justify-between items-center">
                          <div>
                            <div className="flex items-center space-x-2">
                              <p className="font-bold text-slate-900 text-xs">{pendingUser.name}</p>
                              {pendingUser.status === 'invited' ? (
                                <span className="inline-flex items-center px-1.5 py-0.5 bg-amber-50 text-amber-800 text-[10px] font-bold rounded border border-amber-200">
                                  <Hourglass className="w-2.5 h-2.5 mr-0.5 text-amber-600" /> Invited Member
                                </span>
                              ) : (
                                <span className="inline-flex items-center px-1.5 py-0.5 bg-blue-50 text-blue-800 text-[10px] font-bold rounded border border-blue-200">
                                  New Registration
                                </span>
                              )}
                            </div>
                            <p className="text-[11px] text-slate-500">{pendingUser.email}</p>
                            <p className="text-[11px] font-bold text-blue-600 mt-1">
                              Unit {pendingUser.unitNumber} {pendingUser.invitedByName ? `• Invited by ${pendingUser.invitedByName}` : ''}
                            </p>
                          </div>
                          <div className="flex items-center gap-2">
                            <button
                              onClick={() => handleRejectUser(pendingUser.id || "")}
                              className="px-2.5 py-1.5 bg-slate-100 hover:bg-red-50 text-slate-700 hover:text-red-700 border border-slate-300 hover:border-red-200 rounded-lg text-xs font-bold transition"
                            >
                              Reject
                            </button>
                            <button
                              onClick={() => handleApproveUser(pendingUser.id || "")}
                              className="px-3 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg text-xs font-bold shadow-2xs transition inline-flex items-center"
                            >
                              <Check className="w-3.5 h-3.5 mr-1" /> Approve
                            </button>
                          </div>
                        </div>
                      ))}
                      {usersList.filter(u => (u.status === 'pending' || u.status === 'invited') && u.role === 'resident').length === 0 && (
                        <div className="col-span-full py-6 text-center text-slate-400 border border-dashed border-slate-200 rounded-xl bg-white text-xs">
                          No pending household registrations or member invitations.
                        </div>
                      )}
                    </div>
                  </div>

                  <div>
                    <h4 className="text-xs font-bold uppercase tracking-wider text-slate-700 mb-3">
                      Household Member Removal Requests ({householdRequests.filter(r => r.status === 'pending' && r.type === 'removal').length})
                    </h4>
                    <div className="space-y-2">
                      {householdRequests.filter(r => r.status === 'pending' && r.type === 'removal').map(req => (
                        <div key={req.id} className="bg-white p-4 rounded-xl border border-slate-200 shadow-2xs flex justify-between items-center">
                          <div>
                            <p className="font-bold text-slate-900 text-xs">Removal Request for {req.targetUserName}</p>
                            <p className="text-[11px] text-slate-500">Requested by {req.requestedByName} for Unit {req.unitNumber}</p>
                          </div>
                          <div className="flex gap-2">
                            <button
                              onClick={() => handleRejectRemovalRequest(req.id || "")}
                              className="px-3 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-lg text-xs font-bold border border-slate-300"
                            >
                              Reject
                            </button>
                            <button
                              onClick={() => handleApproveRemovalRequest(req.id || "", req.targetUserId || "")}
                              className="px-3 py-1.5 bg-red-600 hover:bg-red-700 text-white rounded-lg text-xs font-bold shadow-2xs"
                            >
                              Approve Removal
                            </button>
                          </div>
                        </div>
                      ))}
                      {householdRequests.filter(r => r.status === 'pending' && r.type === 'removal').length === 0 && (
                        <div className="py-6 text-center text-slate-400 border border-dashed border-slate-200 rounded-xl bg-white text-xs">
                          No pending removal requests.
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              ) : (
                <div className="space-y-4">
                  <div className="flex justify-between items-center">
                    <h4 className="text-xs font-bold uppercase tracking-wider text-slate-700">Dedicated Maintenance Staff</h4>
                    <button
                      onClick={() => setShowAddStaff(!showAddStaff)}
                      className="px-3 py-1.5 bg-blue-600 text-white text-xs font-bold rounded-lg shadow-2xs hover:bg-blue-700"
                    >
                      <Plus className="w-3.5 h-3.5 inline mr-1" /> Add Staff Member
                    </button>
                  </div>

                  {showAddStaff && (
                    <form onSubmit={handleAddStaff} className="bg-white p-4 rounded-xl border border-slate-200 shadow-2xs space-y-3">
                      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                        <input
                          type="text"
                          required
                          placeholder="Staff Name"
                          value={newStaff.name}
                          onChange={(e) => setNewStaff({ ...newStaff, name: e.target.value })}
                          className="px-3 py-1.5 text-xs rounded-lg border border-slate-300"
                        />
                        <select
                          value={newStaff.profession}
                          onChange={(e) => setNewStaff({ ...newStaff, profession: e.target.value })}
                          className="px-3 py-1.5 text-xs rounded-lg border border-slate-300"
                        >
                          <option>Plumbing</option>
                          <option>Electrical</option>
                          <option>Carpentry</option>
                          <option>Cleaning</option>
                          <option>Security</option>
                          <option>Other</option>
                        </select>
                        <input
                          type="tel"
                          required
                          placeholder="Phone Number"
                          value={newStaff.phone}
                          onChange={(e) => setNewStaff({ ...newStaff, phone: e.target.value })}
                          className="px-3 py-1.5 text-xs rounded-lg border border-slate-300"
                        />
                        <input
                          type="email"
                          required
                          placeholder="Email Address"
                          value={newStaff.email}
                          onChange={(e) => setNewStaff({ ...newStaff, email: e.target.value })}
                          className="px-3 py-1.5 text-xs rounded-lg border border-slate-300"
                        />
                      </div>
                      <div className="flex justify-end gap-2">
                        <button type="button" onClick={() => setShowAddStaff(false)} className="px-3 py-1 text-xs text-slate-500">Cancel</button>
                        <button type="submit" className="px-4 py-1.5 bg-blue-600 text-white rounded-lg text-xs font-bold">Save Staff</button>
                      </div>
                    </form>
                  )}

                  <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                    {staffList.map(staff => (
                      <div key={staff.id} className="bg-white p-4 rounded-xl border border-slate-200 shadow-2xs">
                        <div className="flex justify-between items-start">
                          <h5 className="font-bold text-slate-900 text-xs">{staff.name}</h5>
                          <span className="px-2 py-0.5 bg-blue-50 text-blue-700 text-[10px] font-bold rounded">{staff.profession}</span>
                        </div>
                        <p className="text-[11px] text-slate-500 mt-2">📞 {staff.phone}</p>
                        <p className="text-[11px] text-slate-500">✉️ {staff.email}</p>
                        <p className="text-[11px] text-indigo-600 mt-1 font-medium">🕒 {staff.workingHours || "9:00 AM - 5:00 PM"}</p>
                      </div>
                    ))}
                    {staffList.length === 0 && (
                      <div className="col-span-full py-8 text-center text-slate-400 border border-dashed border-slate-200 rounded-xl bg-white text-xs">
                        No maintenance staff added for this society yet.
                      </div>
                    )}
                  </div>
                </div>
              )}
            </div>
          ) : activeTab === "settings" ? (
            /* Settings Tab */
            <div className="bg-white rounded-2xl shadow-xs border border-slate-200 overflow-hidden max-w-3xl mx-auto">
              <div className="p-6 border-b border-slate-200 bg-slate-50 flex justify-between items-center">
                <div>
                  <h3 className="text-base font-bold text-slate-900">Society & Building Configuration</h3>
                  <p className="text-xs text-slate-500 mt-0.5">Edit parameters for the active society: <strong>{currentSociety?.name}</strong></p>
                </div>
                <button
                  type="button"
                  onClick={() => {
                    setIsCreatingNewSociety(true);
                    setShowOnboardingModal(true);
                  }}
                  className="px-3 py-1.5 bg-slate-900 hover:bg-slate-800 text-white rounded-lg text-xs font-bold shadow-2xs transition"
                >
                  + Add Another Society
                </button>
              </div>

              <form onSubmit={handleSaveSettings} className="p-6 space-y-5">
                <div>
                  <label className="block text-xs font-bold uppercase tracking-wider text-slate-700 mb-1">
                    Society / Apartment Name
                  </label>
                  <input
                    type="text"
                    required
                    value={settingsForm.name}
                    onChange={(e) => setSettingsForm({ ...settingsForm, name: e.target.value })}
                    className="w-full px-3.5 py-2.5 text-xs font-semibold rounded-lg border border-slate-300 focus:outline-hidden focus:ring-1 focus:ring-blue-500"
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold uppercase tracking-wider text-slate-700 mb-1">
                    Physical Address
                  </label>
                  <input
                    type="text"
                    required
                    value={settingsForm.address}
                    onChange={(e) => setSettingsForm({ ...settingsForm, address: e.target.value })}
                    className="w-full px-3.5 py-2.5 text-xs rounded-lg border border-slate-300 focus:outline-hidden focus:ring-1 focus:ring-blue-500"
                  />
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs font-bold uppercase tracking-wider text-slate-700 mb-1">
                      Number of Floors
                    </label>
                    <input
                      type="number"
                      required
                      min="1"
                      value={settingsForm.numberOfFloors}
                      onChange={(e) => setSettingsForm({ ...settingsForm, numberOfFloors: parseInt(e.target.value) || 1 })}
                      className="w-full px-3.5 py-2 text-xs font-bold rounded-lg border border-slate-300 focus:outline-hidden focus:ring-1 focus:ring-blue-500"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-bold uppercase tracking-wider text-slate-700 mb-1">
                      Units per Floor
                    </label>
                    <input
                      type="number"
                      required
                      min="1"
                      value={settingsForm.unitsPerFloor}
                      onChange={(e) => setSettingsForm({ ...settingsForm, unitsPerFloor: parseInt(e.target.value) || 1 })}
                      className="w-full px-3.5 py-2 text-xs font-bold rounded-lg border border-slate-300 focus:outline-hidden focus:ring-1 focus:ring-blue-500"
                    />
                  </div>
                </div>

                <div className="p-4 bg-slate-50 border border-slate-200 rounded-xl space-y-2">
                  <div className="flex justify-between items-center">
                    <label className="block text-xs font-bold uppercase tracking-wider text-slate-700">
                      Generated Unit List ({settingsForm.generatedUnits.length} Total Units)
                    </label>
                    <button
                      type="button"
                      onClick={() => {
                        const units: string[] = [];
                        for (let i = 1; i <= settingsForm.numberOfFloors; i++) {
                          for (let j = 1; j <= settingsForm.unitsPerFloor; j++) {
                            units.push(`${i}${String(j).padStart(2, '0')}`);
                          }
                        }
                        setSettingsForm({ ...settingsForm, generatedUnits: units });
                      }}
                      className="text-xs text-blue-600 hover:text-blue-800 font-bold"
                    >
                      Regenerate Matrix
                    </button>
                  </div>
                  <textarea
                    rows={3}
                    value={settingsForm.generatedUnits.join(", ")}
                    onChange={(e) => {
                      const val = e.target.value;
                      const arr = val.split(",").map(s => s.trim()).filter(s => s.length > 0);
                      setSettingsForm({ ...settingsForm, generatedUnits: arr });
                    }}
                    className="w-full px-3 py-2 text-xs rounded-lg border border-slate-300 font-mono"
                    placeholder="101, 102, 103..."
                  />
                </div>

                <div className="pt-2 flex justify-end">
                  <button
                    type="submit"
                    disabled={isSavingSettings}
                    className="px-6 py-2.5 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-xs font-bold shadow-xs transition"
                  >
                    {isSavingSettings ? "Saving Settings..." : "Save Society Settings"}
                  </button>
                </div>
              </form>
            </div>
          ) : activeTab === "logs" ? (
            <div className="space-y-6 animate-in fade-in duration-200">
              {/* Header & CSV Export */}
              <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
                <div>
                  <div className="flex items-center space-x-2">
                    <Clock className="w-5 h-5 text-blue-600" />
                    <h3 className="text-lg font-bold text-slate-900">Audit & Time Logs Timeline</h3>
                  </div>
                  <p className="text-xs text-slate-500 mt-0.5">
                    Immutable chronological record of membership changes, complaint status shifts, priority adjustments, notices, and system events for {currentSociety?.name}.
                  </p>
                </div>
                <button
                  onClick={exportAuditLogsCSV}
                  disabled={filteredAuditLogs.length === 0}
                  className="inline-flex items-center px-4 py-2 bg-slate-900 hover:bg-blue-600 disabled:opacity-50 text-white text-xs font-bold rounded-lg shadow-xs transition"
                >
                  <Download className="w-4 h-4 mr-1.5" /> Export Audit CSV
                </button>
              </div>

              {/* Log Category Metrics */}
              <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
                <div className="bg-white p-3.5 rounded-xl border border-slate-200 shadow-2xs">
                  <p className="text-[11px] font-bold text-slate-500 uppercase tracking-wider">Total Records</p>
                  <p className="text-xl font-black text-slate-900 mt-0.5">{auditLogs.length}</p>
                </div>
                <div className="bg-white p-3.5 rounded-xl border border-slate-200 shadow-2xs">
                  <p className="text-[11px] font-bold text-indigo-600 uppercase tracking-wider">Membership</p>
                  <p className="text-xl font-black text-indigo-600 mt-0.5">
                    {auditLogs.filter(l => l.category === 'membership').length}
                  </p>
                </div>
                <div className="bg-white p-3.5 rounded-xl border border-slate-200 shadow-2xs">
                  <p className="text-[11px] font-bold text-blue-600 uppercase tracking-wider">Complaints</p>
                  <p className="text-xl font-black text-blue-600 mt-0.5">
                    {auditLogs.filter(l => l.category === 'complaint').length}
                  </p>
                </div>
                <div className="bg-white p-3.5 rounded-xl border border-slate-200 shadow-2xs">
                  <p className="text-[11px] font-bold text-purple-600 uppercase tracking-wider">Notices</p>
                  <p className="text-xl font-black text-purple-600 mt-0.5">
                    {auditLogs.filter(l => l.category === 'notice').length}
                  </p>
                </div>
                <div className="bg-white p-3.5 rounded-xl border border-slate-200 shadow-2xs col-span-2 sm:col-span-1">
                  <p className="text-[11px] font-bold text-emerald-600 uppercase tracking-wider">System / Staff</p>
                  <p className="text-xl font-black text-emerald-600 mt-0.5">
                    {auditLogs.filter(l => l.category === 'system' || !l.category).length}
                  </p>
                </div>
              </div>

              {/* Search & Category Filter Toolbar */}
              <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-2xs flex flex-col md:flex-row items-stretch md:items-center justify-between gap-3">
                {/* Search Bar */}
                <div className="relative flex-1">
                  <Search className="w-4 h-4 text-slate-400 absolute left-3 top-2.5 pointer-events-none" />
                  <input
                    type="text"
                    value={logSearchQuery}
                    onChange={(e) => setLogSearchQuery(e.target.value)}
                    placeholder="Search logs by action, description, actor, or unit..."
                    className="w-full pl-9 pr-3 py-2 text-xs rounded-lg border border-slate-300 focus:outline-hidden focus:ring-1 focus:ring-blue-500 font-medium"
                  />
                  {logSearchQuery && (
                    <button
                      onClick={() => setLogSearchQuery("")}
                      className="absolute right-2.5 top-2 text-xs text-slate-400 hover:text-slate-600 font-bold"
                    >
                      Clear
                    </button>
                  )}
                </div>

                {/* Category Pills */}
                <div className="flex flex-wrap items-center gap-1.5">
                  {(["All", "membership", "complaint", "notice", "system"] as const).map(cat => {
                    const isActive = logCategoryFilter === cat;
                    return (
                      <button
                        key={cat}
                        onClick={() => setLogCategoryFilter(cat)}
                        className={`px-3 py-1.5 rounded-lg text-xs font-bold capitalize transition shadow-2xs ${
                          isActive
                            ? "bg-blue-600 text-white shadow-xs"
                            : "bg-slate-100 text-slate-700 hover:bg-slate-200"
                        }`}
                      >
                        {cat === "All" ? "All Events" : cat}
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Logs List Table */}
              <div className="bg-white rounded-xl border border-slate-200 shadow-2xs overflow-hidden">
                <div className="p-4 bg-slate-50 border-b border-slate-200 flex justify-between items-center">
                  <h4 className="text-xs font-bold uppercase tracking-wider text-slate-700">
                    Activity & Audit Events ({filteredAuditLogs.length} Records)
                  </h4>
                  <span className="text-xs text-slate-500 font-semibold">{currentSociety?.name}</span>
                </div>

                <div className="divide-y divide-slate-100">
                  {filteredAuditLogs.map(log => {
                    const d = new Date(log.timestamp);
                    const formattedDate = format(d, "MMM d, yyyy 'at' h:mm:ss a");
                    
                    const catBg = 
                      log.category === 'membership' ? 'bg-indigo-100 text-indigo-800' :
                      log.category === 'complaint' ? 'bg-blue-100 text-blue-800' :
                      log.category === 'notice' ? 'bg-purple-100 text-purple-800' :
                      'bg-emerald-100 text-emerald-800';

                    return (
                      <div key={log.id} className="p-4 hover:bg-slate-50/80 transition-colors space-y-2">
                        <div className="flex flex-wrap items-center justify-between gap-2">
                          <div className="flex items-center space-x-2">
                            <span className={`px-2 py-0.5 rounded text-[10px] font-black uppercase tracking-wider ${catBg}`}>
                              {log.category || 'Event'}
                            </span>
                            <h5 className="font-bold text-xs text-slate-900">{log.action}</h5>
                            {log.unitNumber && (
                              <span className="px-2 py-0.2 bg-slate-100 text-slate-700 border border-slate-200 rounded text-[10px] font-bold">
                                Unit {log.unitNumber}
                              </span>
                            )}
                          </div>
                          
                          <div className="flex items-center space-x-2 text-[11px] text-slate-500 font-semibold">
                            <Clock className="w-3.5 h-3.5 text-slate-400" />
                            <span>{formattedDate}</span>
                          </div>
                        </div>

                        <p className="text-xs text-slate-700 whitespace-pre-line leading-relaxed">
                          {log.description}
                        </p>

                        <div className="flex flex-wrap items-center gap-3 pt-1 text-[10px] text-slate-500 font-medium">
                          {log.actorName && (
                            <span className="inline-flex items-center">
                              <span className="font-bold text-slate-700 mr-1">Actor:</span> 
                              {log.actorName} ({log.actorRole || 'user'})
                            </span>
                          )}
                          {log.targetId && (
                            <span className="inline-flex items-center">
                              <span className="font-bold text-slate-700 mr-1">Target ID:</span> 
                              <code className="bg-slate-100 px-1.5 py-0.5 rounded text-slate-800 font-mono text-[9px]">
                                {log.targetId}
                              </code>
                            </span>
                          )}
                          {log.details && (
                            <div className="flex flex-wrap items-center gap-1 mt-1">
                              {log.details.previousStatus && log.details.newStatus && (
                                <span className="px-1.5 py-0.5 bg-blue-50 text-blue-700 border border-blue-200 rounded">
                                  Status: {log.details.previousStatus} → {log.details.newStatus}
                                </span>
                              )}
                              {log.details.previousPriority && log.details.newPriority && (
                                <span className="px-1.5 py-0.5 bg-orange-50 text-orange-700 border border-orange-200 rounded">
                                  Priority: {log.details.previousPriority} → {log.details.newPriority}
                                </span>
                              )}
                              {log.details.assignedStaffName && log.details.assignedStaffName !== "None" && (
                                <span className="px-1.5 py-0.5 bg-emerald-50 text-emerald-700 border border-emerald-200 rounded">
                                  Staff: {log.details.assignedStaffName}
                                </span>
                              )}
                            </div>
                          )}
                        </div>
                      </div>
                    );
                  })}

                  {filteredAuditLogs.length === 0 && (
                    <div className="p-12 text-center text-slate-400 space-y-2">
                      <Clock className="w-8 h-8 text-slate-300 mx-auto" />
                      <p className="text-xs font-semibold">No audit logs found matching the selected filters.</p>
                    </div>
                  )}
                </div>
              </div>
            </div>
          ) : null}
        </main>
      </div>

      {/* Complaint History & Time Logs Timeline Modal */}
      <ComplaintHistoryModal
        complaint={selectedComplaintForHistory}
        onClose={() => setSelectedComplaintForHistory(null)}
      />

      {/* Complaint Management Modal */}
      {selectedComplaint && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-2xl max-w-lg w-full p-6 space-y-4 border border-slate-200">
            <h3 className="text-base font-bold text-slate-900">Manage Complaint #{selectedComplaint.id?.slice(-6)}</h3>
            <div className="p-3 bg-slate-50 rounded-lg border border-slate-200 text-xs">
              <p className="font-bold text-slate-900">{selectedComplaint.category} (Unit {selectedComplaint.unitNumber})</p>
              <p className="text-slate-600 mt-1">{selectedComplaint.description}</p>
              {selectedComplaint.photoUrl && (
                <div className="mt-2.5">
                  <p className="text-[10px] font-bold uppercase text-slate-400 mb-1">Attached Photo</p>
                  <img 
                    src={selectedComplaint.photoUrl} 
                    alt="Attachment" 
                    onClick={() => setLightboxImage(selectedComplaint.photoUrl)}
                    className="w-24 h-24 object-cover rounded-xl border border-slate-300 cursor-pointer hover:opacity-90 transition shadow-2xs"
                  />
                </div>
              )}
            </div>

            <form onSubmit={handleUpdateComplaint} className="space-y-3">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">Status</label>
                  <select
                    value={updateStatus}
                    onChange={(e) => setUpdateStatus(e.target.value as any)}
                    className="w-full text-xs border border-slate-300 rounded-lg p-2 font-semibold"
                  >
                    <option value="Open">Open</option>
                    <option value="In Progress">In Progress</option>
                    <option value="Pending Resident Approval">Pending Resident Approval</option>
                    <option value="Resolved">Resolved</option>
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">Priority & SLA</label>
                  <select
                    value={updatePriority}
                    onChange={(e) => setUpdatePriority(e.target.value as any)}
                    className="w-full text-xs border border-slate-300 rounded-lg p-2 font-semibold"
                  >
                    <option value="Urgent">Urgent (10 Hours SLA)</option>
                    <option value="High">High (1 Day / 24h SLA)</option>
                    <option value="Medium">Medium (2 Days / 48h SLA)</option>
                    <option value="Low">Low (3 Days / 72h SLA)</option>
                  </select>
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">Assign Staff</label>
                <select
                  value={assignedStaffId}
                  onChange={(e) => setAssignedStaffId(e.target.value)}
                  className="w-full text-xs border border-slate-300 rounded-lg p-2"
                >
                  <option value="">No Staff Assigned</option>
                  {staffList.map(s => (
                    <option key={s.id} value={s.id}>{s.name} ({s.profession})</option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">Internal Note / Resident Message</label>
                <textarea
                  rows={2}
                  value={updateNote}
                  onChange={(e) => setUpdateNote(e.target.value)}
                  placeholder="e.g. Plumber dispatched, arrival at 3:00 PM."
                  className="w-full text-xs border border-slate-300 rounded-lg p-2"
                />
              </div>

              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setSelectedComplaint(null)}
                  className="px-4 py-2 text-xs font-bold text-slate-600"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-5 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-xs font-bold shadow-xs"
                >
                  Update Complaint
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Society Onboarding Modal */}
      <SocietyOnboardingModal
        isOpen={showOnboardingModal}
        existingSociety={isCreatingNewSociety ? null : currentSociety}
        isDismissable={societies.length > 0}
        onClose={() => {
          setShowOnboardingModal(false);
          setIsCreatingNewSociety(false);
        }}
        onSocietyCreated={(newId) => {
          setSelectedSocietyId(newId);
          setShowOnboardingModal(false);
          setIsCreatingNewSociety(false);
        }}
      />

      {/* Lightbox Modal */}
      <ImageLightboxModal
        imageUrl={lightboxImage}
        onClose={() => setLightboxImage(null)}
      />
    </div>
  );
}
