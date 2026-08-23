import { Complaint } from "../types";
import { format, formatDistanceStrict } from "date-fns";
import { X, Clock, CheckCircle2, AlertCircle, Wrench, ShieldAlert, ArrowRight, UserCheck } from "lucide-react";
import { getSlaStatus } from "../lib/complaintUtils";

interface ComplaintHistoryModalProps {
  complaint: Complaint | null;
  onClose: () => void;
}

export default function ComplaintHistoryModal({ complaint, onClose }: ComplaintHistoryModalProps) {
  if (!complaint) return null;

  const sla = getSlaStatus(complaint);
  const historyList = complaint.history || [];

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs animate-in fade-in duration-200">
      <div className="bg-white w-full max-w-2xl rounded-2xl shadow-2xl border border-slate-200 overflow-hidden flex flex-col max-h-[90vh]">
        {/* Modal Header */}
        <div className="px-6 py-4 border-b border-slate-200 bg-slate-50 flex items-center justify-between">
          <div>
            <div className="flex items-center space-x-2">
              <span className="px-2.5 py-0.5 rounded-md text-[10px] font-black uppercase tracking-wider bg-slate-900 text-white">
                Ticket #{complaint.id?.slice(0, 6) || "LOG"}
              </span>
              <span className={`px-2 py-0.5 rounded-md text-[10px] font-bold ${
                complaint.priority === 'Urgent' ? 'bg-red-100 text-red-700' :
                complaint.priority === 'High' ? 'bg-orange-100 text-orange-700' :
                complaint.priority === 'Medium' ? 'bg-blue-100 text-blue-700' :
                'bg-slate-100 text-slate-700'
              }`}>
                {complaint.priority} Priority
              </span>
              {sla.isOverdue && (
                <span className="inline-flex items-center px-2 py-0.5 rounded-md text-[10px] font-black bg-red-600 text-white">
                  <ShieldAlert className="w-3 h-3 mr-1" />
                  Overdue SLA
                </span>
              )}
            </div>
            <h3 className="text-base font-bold text-slate-900 mt-1">
              {complaint.category} • Unit {complaint.unitNumber || "N/A"}
            </h3>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-200 transition"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Modal Body */}
        <div className="p-6 overflow-y-auto space-y-6">
          {/* Summary Details */}
          <div className="p-4 bg-slate-50 border border-slate-200 rounded-xl space-y-2 text-xs">
            <div className="flex justify-between items-start">
              <div>
                <p className="text-slate-500 font-semibold uppercase text-[10px] tracking-wider">Description</p>
                <p className="text-slate-800 font-medium mt-0.5">{complaint.description}</p>
              </div>
              {complaint.photoUrl && (
                <img
                  src={complaint.photoUrl}
                  alt="Attachment"
                  className="w-14 h-14 object-cover rounded-lg border border-slate-300 ml-4 shrink-0 shadow-2xs"
                />
              )}
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 pt-2 border-t border-slate-200 text-[11px]">
              <div>
                <span className="text-slate-400 block font-semibold">Space Type</span>
                <span className="font-bold text-slate-800">{complaint.spaceType || "Private"}</span>
              </div>
              <div>
                <span className="text-slate-400 block font-semibold">Current Status</span>
                <span className="font-bold text-blue-600">{complaint.status}</span>
              </div>
              <div>
                <span className="text-slate-400 block font-semibold">SLA Target</span>
                <span className="font-bold text-slate-800">{sla.slaLabel}</span>
              </div>
              <div>
                <span className="text-slate-400 block font-semibold">Logged On</span>
                <span className="font-bold text-slate-800">
                  {format(new Date(complaint.createdAt), "MMM d, yyyy h:mm a")}
                </span>
              </div>
            </div>
          </div>

          {/* Chronological State Change & In-Progress Time Logs */}
          <div>
            <h4 className="text-xs font-black uppercase tracking-wider text-slate-700 mb-3 flex items-center">
              <Clock className="w-4 h-4 mr-1.5 text-blue-600" />
              State Change & Progress Time Logs
            </h4>

            <div className="relative pl-6 space-y-6 before:absolute before:left-2.5 before:top-2 before:bottom-2 before:w-0.5 before:bg-slate-200">
              {historyList.map((entry, idx) => {
                const entryDate = new Date(entry.timestamp);
                const isFirst = idx === 0;
                const isLast = idx === historyList.length - 1;

                let icon = <Clock className="w-3.5 h-3.5 text-blue-600" />;
                let dotBg = "bg-blue-100 border-blue-500";
                if (entry.status === 'Resolved') {
                  icon = <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />;
                  dotBg = "bg-emerald-100 border-emerald-500";
                } else if (entry.status === 'In Progress') {
                  icon = <Wrench className="w-3.5 h-3.5 text-blue-600" />;
                  dotBg = "bg-blue-100 border-blue-600";
                } else if (entry.status === 'Pending Resident Approval') {
                  icon = <UserCheck className="w-3.5 h-3.5 text-purple-600" />;
                  dotBg = "bg-purple-100 border-purple-500";
                }

                return (
                  <div key={idx} className="relative group">
                    {/* Timeline Node Dot */}
                    <div className={`absolute -left-6 top-0.5 w-5 h-5 rounded-full border-2 flex items-center justify-center bg-white shadow-2xs ${dotBg}`}>
                      {icon}
                    </div>

                    <div className="bg-white p-3.5 rounded-xl border border-slate-200 shadow-2xs space-y-1 group-hover:border-slate-300 transition">
                      <div className="flex flex-wrap justify-between items-start gap-1">
                        <div className="flex items-center space-x-2">
                          <span className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase ${
                            entry.status === 'Open' ? 'bg-amber-50 text-amber-800 border border-amber-200' :
                            entry.status === 'In Progress' ? 'bg-blue-50 text-blue-800 border border-blue-200' :
                            entry.status === 'Pending Resident Approval' ? 'bg-purple-50 text-purple-800 border border-purple-200' :
                            'bg-emerald-50 text-emerald-800 border border-emerald-200'
                          }`}>
                            {entry.status}
                          </span>
                          <span className="text-xs font-bold text-slate-800">
                            By {entry.actorName || "System Actor"}
                          </span>
                        </div>
                        <div className="text-right">
                          <span className="text-[11px] font-bold text-slate-700 block">
                            {format(entryDate, "MMM d, yyyy 'at' h:mm:ss a")}
                          </span>
                          <span className="text-[10px] text-slate-400">
                            {formatDistanceStrict(entryDate, new Date(), { addSuffix: true })}
                          </span>
                        </div>
                      </div>

                      {entry.note && (
                        <p className="text-xs text-slate-600 mt-1 pl-2 border-l-2 border-slate-200 italic">
                          "{entry.note}"
                        </p>
                      )}

                      {/* Duration from ticket inception */}
                      {!isFirst && (
                        <div className="text-[10px] text-slate-400 font-semibold pt-1 flex items-center">
                          <ArrowRight className="w-3 h-3 mr-1 text-slate-400" />
                          Transitioned after {formatDistanceStrict(new Date(complaint.createdAt), entryDate)} from initial submission
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>

        {/* Modal Footer */}
        <div className="px-6 py-3 border-t border-slate-200 bg-slate-50 flex justify-end">
          <button
            onClick={onClose}
            className="px-4 py-2 bg-slate-900 hover:bg-slate-800 text-white rounded-xl text-xs font-bold shadow-xs transition"
          >
            Close Time Logs
          </button>
        </div>
      </div>
    </div>
  );
}
