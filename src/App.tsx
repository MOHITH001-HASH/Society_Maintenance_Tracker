/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { BrowserRouter as Router, Routes, Route, Navigate } from "react-router-dom";
import { AuthProvider, useAuth } from "./contexts/AuthContext";
import Login from "./pages/Login";
import AdminDashboard from "./pages/AdminDashboard";
import ResidentDashboard from "./pages/ResidentDashboard";
import { ReactNode } from "react";
import { auth } from "./lib/firebase";
import { signOut } from "firebase/auth";
import { Clock, RefreshCw, LogOut, ShieldAlert } from "lucide-react";

function PrivateRoute({ children, role }: { children: ReactNode; role?: "admin" | "resident" }) {
  const { user, userProfile, loading, signOut } = useAuth();
  
  if (loading) return <div className="min-h-screen flex items-center justify-center bg-slate-50 text-xs text-slate-500 font-bold">Loading Society Portal...</div>;
  if (!user || !userProfile) return <Navigate to="/login" replace />;
  
  if (role && userProfile.role !== role) {
    return <Navigate to={userProfile.role === "admin" ? "/admin" : "/"} replace />;
  }

  if (role === "resident" && (userProfile?.status === "pending" || userProfile?.status === "invited")) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-100 p-4">
        <div className="bg-white p-8 rounded-2xl shadow-xl max-w-md w-full text-center border border-amber-200">
          <div className="w-16 h-16 bg-amber-50 rounded-2xl flex items-center justify-center mx-auto mb-4 border border-amber-200 shadow-2xs">
            <Clock className="w-8 h-8 text-amber-600 animate-pulse" />
          </div>
          <h2 className="text-xl font-bold text-slate-900 mb-1.5">Household Approval Pending</h2>
          <div className="inline-block px-3 py-1 bg-amber-50 text-amber-800 rounded-lg text-xs font-bold border border-amber-200 mb-4">
            Unit {userProfile.unitNumber || "Assigned Unit"} • {userProfile.status === 'invited' ? 'Invited Member' : 'Pending Registration'}
          </div>
          <p className="text-xs text-slate-600 leading-relaxed mb-6">
            Your household account has been registered and is currently awaiting verification and approval from your society administrator. Once approved, you will have immediate access to submit and track maintenance requests, view notices, access the household directory, and manage your profile.
          </p>
          <div className="flex flex-col sm:flex-row gap-2 justify-center">
            <button 
              onClick={() => window.location.reload()} 
              className="inline-flex items-center justify-center px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-xs font-bold shadow-xs transition cursor-pointer"
            >
              <RefreshCw className="w-3.5 h-3.5 mr-1.5" /> Refresh Status
            </button>
            <button 
              onClick={() => signOut()} 
              className="inline-flex items-center justify-center px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl text-xs font-bold border border-slate-300 transition cursor-pointer"
            >
              <LogOut className="w-3.5 h-3.5 mr-1.5" /> Sign Out
            </button>
          </div>
        </div>
      </div>
    );
  }
  
  return <>{children}</>;
}

export default function App() {
  return (
    <AuthProvider>
      <Router>
        <Routes>
          <Route path="/login" element={<Login />} />
          <Route 
            path="/admin" 
            element={
              <PrivateRoute role="admin">
                <AdminDashboard />
              </PrivateRoute>
            } 
          />
          <Route 
            path="/" 
            element={
              <PrivateRoute role="resident">
                <ResidentDashboard />
              </PrivateRoute>
            } 
          />
        </Routes>
      </Router>
    </AuthProvider>
  );
}
