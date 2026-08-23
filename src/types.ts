export type UnitOccupancyStatus = "occupied" | "unoccupied" | "rented";

export interface UnitDetail {
  status: UnitOccupancyStatus;
  occupancyType?: "owner" | "tenant" | "vacant";
  notes?: string;
  updatedAt?: string;
}

export interface Society {
  id: string;
  name: string;
  buildingName?: string;
  address: string;
  numberOfFloors: number;
  unitsPerFloor?: number;
  totalApartments: number;
  generatedUnits: string[];
  unitStatuses?: Record<string, UnitOccupancyStatus>;
  unitDetails?: Record<string, UnitDetail>;
  adminId?: string;
  adminEmail?: string;
  isSetupComplete: boolean;
  createdAt: string;
  updatedAt?: string;
}

export interface User {
  id?: string;
  email: string;
  phone?: string;
  photoURL?: string;
  role: "resident" | "admin";
  name: string;
  createdAt: string;
  societyId?: string;
  unitNumber?: string;
  residentType?: "primary" | "household";
  status?: "pending" | "invited" | "verified" | "approved" | "rejected" | "removed";
  invitedBy?: string;
  invitedByName?: string;
}

export interface SocietySettings {
  buildingName: string;
  address: string;
  numberOfFloors: number;
  unitsPerFloor?: number;
  totalApartments: number;
  generatedUnits?: string[];
  isSetupComplete?: boolean;
}

export interface HouseholdRequest {
  id?: string;
  societyId?: string;
  unitNumber: string;
  targetUserId?: string;
  targetUserName: string;
  targetUserEmail?: string;
  type: "addition" | "removal";
  status: "pending" | "approved" | "rejected";
  requestedBy: string;
  requestedByName: string;
  createdAt: string;
}

export interface AuditLog {
  id?: string;
  societyId?: string;
  action: string;
  category?: "membership" | "complaint" | "notice" | "system" | "security" | "unit_management";
  description: string;
  actorId?: string;
  actorName?: string;
  actorRole?: string;
  targetId?: string;
  unitNumber?: string;
  timestamp: string;
  details?: Record<string, any>;
}

export interface ComplaintHistory {
  status: string;
  timestamp: string;
  actorId: string;
  actorName: string;
  note: string;
}

export interface Complaint {
  id?: string;
  societyId?: string;
  residentId: string;
  residentName?: string;
  unitNumber?: string;
  category: string;
  description: string;
  photoUrl?: string;
  status: "Open" | "In Progress" | "Pending Resident Approval" | "Resolved";
  priority: "Low" | "Medium" | "High" | "Urgent";
  spaceType?: "Private" | "Public";
  preferredVisitTime?: string;
  assignedStaffId?: string;
  assignedStaffName?: string;
  assignedStaffPhone?: string;
  assignedStaffWorkingHours?: string;
  history: ComplaintHistory[];
  createdAt: string;
  updatedAt: string;
}

export interface Staff {
  id?: string;
  societyId?: string;
  name: string;
  profession: string;
  phone: string;
  email: string;
  workingHours?: string;
  createdAt: string;
}

export interface Notice {
  id?: string;
  societyId?: string;
  title: string;
  content: string;
  isImportant: boolean;
  imageUrl?: string;
  createdAt: string;
  authorId: string;
}
