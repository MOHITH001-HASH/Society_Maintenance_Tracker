import { differenceInDays, differenceInHours } from "date-fns";
import { Complaint } from "../types";

export interface SlaInfo {
  isOverdue: boolean;
  hoursElapsed: number;
  slaHours: number;
  remainingHours: number;
  slaLabel: string;
  targetText: string;
}

/**
 * Returns SLA threshold in hours based on priority:
 * - Urgent: > 10 hours
 * - High: > 24 hours (1 day)
 * - Medium: > 48 hours (2 days)
 * - Low: > 72 hours (3 days)
 */
export function getSlaThresholdHours(priority?: string): number {
  if (priority === "Urgent") return 10;
  if (priority === "High") return 24; // 1 day
  if (priority === "Medium") return 48; // 2 days
  return 72; // Low (3 days) or default
}

export function getSlaDescription(priority?: string): string {
  if (priority === "Urgent") return "10 Hours SLA";
  if (priority === "High") return "1 Day (24h) SLA";
  if (priority === "Medium") return "2 Days (48h) SLA";
  return "3 Days (72h) SLA";
}

export function checkIsOverdue(complaint: Complaint): boolean {
  if (complaint.status === "Resolved") return false;
  const hours = differenceInHours(new Date(), new Date(complaint.createdAt));
  const threshold = getSlaThresholdHours(complaint.priority);
  return hours > threshold;
}

export function getSlaStatus(complaint: Complaint): SlaInfo {
  const hoursElapsed = differenceInHours(new Date(), new Date(complaint.createdAt));
  const slaHours = getSlaThresholdHours(complaint.priority);
  const isOverdue = complaint.status !== "Resolved" && hoursElapsed > slaHours;
  const remainingHours = Math.max(0, slaHours - hoursElapsed);

  let targetText = "Within 3 days";
  if (complaint.priority === "Urgent") targetText = "Within 10 hours";
  else if (complaint.priority === "High") targetText = "Within 1 day";
  else if (complaint.priority === "Medium") targetText = "Within 2 days";

  return {
    isOverdue,
    hoursElapsed,
    slaHours,
    remainingHours,
    slaLabel: getSlaDescription(complaint.priority),
    targetText
  };
}

export function getOpenForText(createdAt: string): string {
  const days = differenceInDays(new Date(), new Date(createdAt));
  const hours = differenceInHours(new Date(), new Date(createdAt));
  
  if (days > 0) {
    return `${days} day${days > 1 ? 's' : ''} ago`;
  }
  if (hours > 0) {
    return `${hours} hour${hours !== 1 ? 's' : ''} ago`;
  }
  return "Just now";
}

