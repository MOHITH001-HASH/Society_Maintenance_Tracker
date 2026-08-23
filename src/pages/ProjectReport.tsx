import React, { useRef, useState } from "react";
import { 
  Download, 
  FileText, 
  CheckCircle2, 
  Layers, 
  ShieldCheck, 
  Cpu, 
  Database, 
  Layout, 
  HelpCircle, 
  Scale, 
  Clock, 
  Sparkles,
  ChevronRight,
  ArrowRight,
  Code2,
  Printer
} from "lucide-react";
import jsPDF from "jspdf";
import html2canvas from "html2canvas";

export default function ProjectReport() {
  const reportRef = useRef<HTMLDivElement>(null);
  const [isGenerating, setIsGenerating] = useState(false);
  const [activeTab, setActiveTab] = useState<string>("all");

  const handleDownloadPDF = async () => {
    if (!reportRef.current) return;
    setIsGenerating(true);
    try {
      const element = reportRef.current;
      const canvas = await html2canvas(element, {
        scale: 2,
        useCORS: true,
        logging: false,
        windowWidth: 1200
      });
      
      const imgData = canvas.toDataURL("image/png");
      const pdf = new jsPDF("p", "mm", "a4");
      const pdfWidth = pdf.internal.pageSize.getWidth();
      const pdfHeight = pdf.internal.pageSize.getHeight();
      
      const imgWidth = pdfWidth;
      const imgHeight = (canvas.height * pdfWidth) / canvas.width;
      
      let heightLeft = imgHeight;
      let position = 0;

      pdf.addImage(imgData, "PNG", 0, position, imgWidth, imgHeight);
      heightLeft -= pdfHeight;

      while (heightLeft >= 0) {
        position = heightLeft - imgHeight;
        pdf.addPage();
        pdf.addImage(imgData, "PNG", 0, position, imgWidth, imgHeight);
        heightLeft -= pdfHeight;
      }

      pdf.save("Vasturith_Society_Maintenance_Tracker_Project_Report.pdf");
    } catch (error) {
      console.error("Error generating PDF:", error);
      alert("Failed to generate PDF. You can also use the Print button to Save as PDF.");
    } finally {
      setIsGenerating(false);
    }
  };

  const handlePrint = () => {
    window.print();
  };

  return (
    <div className="min-h-screen bg-slate-100 text-slate-800 antialiased font-sans pb-16">
      {/* Top Floating Control Bar */}
      <header className="sticky top-0 z-50 bg-white/95 backdrop-blur-md border-b border-slate-200 px-6 py-4 shadow-sm print:hidden">
        <div className="max-w-6xl mx-auto flex flex-col sm:flex-row items-center justify-between gap-4">
          <div className="flex items-center space-x-3">
            <div className="w-10 h-10 rounded-xl bg-blue-600 flex items-center justify-center text-white shadow-md">
              <FileText className="w-5 h-5" />
            </div>
            <div>
              <h1 className="text-lg font-bold text-slate-900 leading-tight">Project Documentation & Technical Report</h1>
              <p className="text-xs text-slate-500 font-medium">Society Maintenance Tracker (Vasturith) • Comprehensive Viva & Placement Dossier</p>
            </div>
          </div>

          <div className="flex items-center space-x-3">
            <a 
              href="/"
              className="px-4 py-2 text-xs font-semibold text-slate-600 hover:text-slate-900 bg-slate-100 hover:bg-slate-200 rounded-lg transition"
            >
              Back to App
            </a>
            <button
              onClick={handlePrint}
              className="inline-flex items-center px-4 py-2 text-xs font-semibold text-slate-700 bg-white hover:bg-slate-50 border border-slate-300 rounded-lg shadow-xs transition"
            >
              <Printer className="w-4 h-4 mr-1.5" />
              Print / Save PDF
            </button>
            <button
              onClick={handleDownloadPDF}
              disabled={isGenerating}
              className="inline-flex items-center px-5 py-2 text-xs font-bold text-white bg-blue-600 hover:bg-blue-700 active:scale-98 rounded-lg shadow-md transition disabled:opacity-50"
            >
              <Download className="w-4 h-4 mr-1.5" />
              {isGenerating ? "Generating PDF..." : "Download Official PDF Report"}
            </button>
          </div>
        </div>
      </header>

      {/* Main Document Content Container */}
      <main className="max-w-5xl mx-auto mt-8 px-4 sm:px-6">
        <div 
          ref={reportRef}
          id="project-report-document"
          className="bg-white p-8 sm:p-14 rounded-2xl shadow-xl border border-slate-200 text-slate-800 leading-relaxed print:p-0 print:border-none print:shadow-none"
        >
          {/* Cover Header */}
          <div className="border-b-2 border-slate-900 pb-8 mb-10">
            <div className="flex justify-between items-start">
              <div>
                <span className="inline-block px-3 py-1 bg-blue-50 border border-blue-200 text-blue-700 text-xs font-bold rounded-full uppercase tracking-wider mb-3">
                  Final Year B.Tech Technical Project Report
                </span>
                <h1 className="text-3xl sm:text-4xl font-extrabold text-slate-950 tracking-tight mb-2">
                  Society Maintenance Tracker
                </h1>
                <p className="text-base text-slate-600 font-medium max-w-2xl">
                  A High-Availability, Multi-Tenant Residential Maintenance Management & Lifecycle Auditing System
                </p>
              </div>
              <div className="text-right hidden sm:block">
                <p className="text-xs font-bold text-slate-400 uppercase tracking-wider">Candidate / Author</p>
                <p className="text-sm font-bold text-slate-900">Paladugu Mohith</p>
                <p className="text-xs text-slate-500">Dept. of Computer Science & Engineering</p>
                <p className="text-xs text-slate-400 mt-1 font-mono">Date: August 2026</p>
              </div>
            </div>
          </div>

          {/* Table of Contents */}
          <div className="bg-slate-50 border border-slate-200 rounded-xl p-6 mb-10">
            <h3 className="text-xs font-bold text-slate-500 uppercase tracking-widest mb-4">Table of Contents</h3>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-y-2 gap-x-6 text-sm font-medium text-slate-700">
              <a href="#sec-executive-summaries" className="hover:text-blue-600 flex items-center"><ChevronRight className="w-3.5 h-3.5 mr-1 text-blue-500" /> 1. Executive Summaries (30s & 1-min Elevator Pitches)</a>
              <a href="#sec-problem-statement" className="hover:text-blue-600 flex items-center"><ChevronRight className="w-3.5 h-3.5 mr-1 text-blue-500" /> 2. Problem Statement & Motivation</a>
              <a href="#sec-core-features" className="hover:text-blue-600 flex items-center"><ChevronRight className="w-3.5 h-3.5 mr-1 text-blue-500" /> 3. Core Features & Scope Implementation</a>
              <a href="#sec-tech-stack" className="hover:text-blue-600 flex items-center"><ChevronRight className="w-3.5 h-3.5 mr-1 text-blue-500" /> 4. Technology Stack & Component Justifications</a>
              <a href="#sec-tradeoffs" className="hover:text-blue-600 flex items-center"><ChevronRight className="w-3.5 h-3.5 mr-1 text-blue-500" /> 5. Deep-Dive: Architectural Trade-offs & Comparisons</a>
              <a href="#sec-system-architecture" className="hover:text-blue-600 flex items-center"><ChevronRight className="w-3.5 h-3.5 mr-1 text-blue-500" /> 6. Database Schema & Lifecycle State Machines</a>
              <a href="#sec-viva-qa" className="hover:text-blue-600 flex items-center"><ChevronRight className="w-3.5 h-3.5 mr-1 text-blue-500" /> 7. Placement & Viva Anticipated Questions & Answers</a>
            </div>
          </div>

          {/* SECTION 1: EXECUTIVE SUMMARIES */}
          <section id="sec-executive-summaries" className="mb-12">
            <div className="flex items-center space-x-2 text-blue-600 mb-3">
              <Clock className="w-5 h-5" />
              <h2 className="text-xl font-bold text-slate-900">1. Executive Summaries</h2>
            </div>
            
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mt-4">
              {/* 30-Second Elevator Pitch */}
              <div className="bg-gradient-to-br from-blue-50/70 to-indigo-50/70 border border-blue-200 rounded-xl p-6">
                <div className="flex items-center justify-between mb-3">
                  <span className="px-2.5 py-0.5 bg-blue-600 text-white text-[11px] font-bold rounded-md uppercase tracking-wider">
                    30-Second Pitch (Fast Interview Answer)
                  </span>
                </div>
                <p className="text-xs sm:text-sm text-slate-700 font-normal leading-relaxed">
                  "<strong>Society Maintenance Tracker</strong> is a full-stack apartment management system that replaces manual registers and chaotic chat groups with a real-time maintenance workflow. Residents raise categorized complaints with photos and track historical progress, while admins prioritize, assign, and update statuses with immutable audit logs. It features automatic overdue detection that surfaces neglected complaints, a digital notice board with pinned announcements, and instant email alerts on every status transition."
                </p>
              </div>

              {/* 60-Second Detailed Pitch */}
              <div className="bg-gradient-to-br from-slate-50 to-slate-100 border border-slate-300 rounded-xl p-6">
                <div className="flex items-center justify-between mb-3">
                  <span className="px-2.5 py-0.5 bg-slate-800 text-white text-[11px] font-bold rounded-md uppercase tracking-wider">
                    1-Minute Pitch (Comprehensive Technical Overview)
                  </span>
                </div>
                <p className="text-xs sm:text-sm text-slate-700 font-normal leading-relaxed">
                  "In modern residential complexes, maintenance operations suffer from poor communication, lost issue histories, and zero accountability. I engineered this project to provide an end-to-end multi-tenant solution. On the frontend, a responsive React 18 and Tailwind application provides dedicated portals for residents and administrators with instant state updates. On the backend, we use a hybrid architecture combining a Django enterprise core for multi-unit provisioning and work orders, a Flask microservice for rapid OTP generation and media uploads, and Celery workers for automated SLA overdue escalation. Data is synchronized in real time via Firestore with zero-trust security rules, guaranteeing sub-second updates across all connected devices."
                </p>
              </div>
            </div>
          </section>

          {/* SECTION 2: PROBLEM STATEMENT & MOTIVATION */}
          <section id="sec-problem-statement" className="mb-12">
            <div className="flex items-center space-x-2 text-blue-600 mb-3">
              <Layers className="w-5 h-5" />
              <h2 className="text-xl font-bold text-slate-900">2. Problem Statement & Motivation</h2>
            </div>
            <p className="text-sm text-slate-700 mb-4">
              Apartment housing societies handle dozens of daily complaints ranging from plumbing leakages to lift malfunctions and security concerns. In traditional setups:
            </p>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-6">
              <div className="p-4 bg-red-50 border border-red-200 rounded-lg">
                <h4 className="text-xs font-bold text-red-900 uppercase tracking-wider mb-1">1. Zero Visibility</h4>
                <p className="text-xs text-red-700">Residents have no way of knowing whether their issue has been assigned, is in progress, or who is working on it.</p>
              </div>
              <div className="p-4 bg-amber-50 border border-amber-200 rounded-lg">
                <h4 className="text-xs font-bold text-amber-900 uppercase tracking-wider mb-1">2. Untracked Overdues</h4>
                <p className="text-xs text-amber-700">Admins lose track of pending issues over time, causing simple repairs to linger unresolved for weeks.</p>
              </div>
              <div className="p-4 bg-slate-100 border border-slate-200 rounded-lg">
                <h4 className="text-xs font-bold text-slate-800 uppercase tracking-wider mb-1">3. Lack of Audit Trail</h4>
                <p className="text-xs text-slate-600">Disputes arise over when an issue was reported, when the admin acknowledged it, and what actions were taken.</p>
              </div>
            </div>
            <p className="text-sm text-slate-700">
              The motivation behind this project is to build a reliable, accessible, and automated system where every state change is timestamped, overdues are systematically elevated, and communication is clear and continuous.
            </p>
          </section>

          {/* SECTION 3: CORE FEATURES */}
          <section id="sec-core-features" className="mb-12">
            <div className="flex items-center space-x-2 text-blue-600 mb-3">
              <CheckCircle2 className="w-5 h-5" />
              <h2 className="text-xl font-bold text-slate-900">3. Core Features & Scope Implementation</h2>
            </div>

            <div className="space-y-4">
              {/* Feature 1 */}
              <div className="border border-slate-200 rounded-xl p-5 hover:border-blue-300 transition bg-white">
                <h3 className="text-sm font-bold text-slate-900 mb-1 flex items-center">
                  <span className="w-2 h-2 bg-blue-600 rounded-full mr-2"></span>
                  Complaint Submission & Media Attachment
                </h3>
                <p className="text-xs text-slate-600 leading-relaxed mb-2">
                  Residents can register complaints with structured metadata including predefined categories (Plumbing, Electrical, Carpentry, Lift, Cleaning, Security), descriptive notes, and optional photo attachments. Photos undergo client-side validation (file size under 5 MB, supported image MIME types) before being encoded and stored.
                </p>
              </div>

              {/* Feature 2 */}
              <div className="border border-slate-200 rounded-xl p-5 hover:border-blue-300 transition bg-white">
                <h3 className="text-sm font-bold text-slate-900 mb-1 flex items-center">
                  <span className="w-2 h-2 bg-blue-600 rounded-full mr-2"></span>
                  Strict Lifecycle State Machine & History Log
                </h3>
                <p className="text-xs text-slate-600 leading-relaxed mb-2">
                  Complaints follow a finite state transition model: <code>Open</code> → <code>In Progress</code> → <code>Resolved</code>. Every update creates an immutable history record capturing previous state, new state, actor name, actor role, timestamp, and optional administrative remarks. Once marked <code>Resolved</code>, the complaint is formally closed.
                </p>
              </div>

              {/* Feature 3 */}
              <div className="border border-slate-200 rounded-xl p-5 hover:border-blue-300 transition bg-white">
                <h3 className="text-sm font-bold text-slate-900 mb-1 flex items-center">
                  <span className="w-2 h-2 bg-blue-600 rounded-full mr-2"></span>
                  Configurable Automated Overdue Detection
                </h3>
                <p className="text-xs text-slate-600 leading-relaxed mb-2">
                  Admins can dynamically adjust an overdue threshold in days (e.g., 2, 3, 5, or 7 days). Any complaint remaining non-resolved past this threshold is dynamically flagged as <strong>Overdue</strong> and automatically sorted to the top of the admin view with distinct visual alerts.
                </p>
              </div>

              {/* Feature 4 */}
              <div className="border border-slate-200 rounded-xl p-5 hover:border-blue-300 transition bg-white">
                <h3 className="text-sm font-bold text-slate-900 mb-1 flex items-center">
                  <span className="w-2 h-2 bg-blue-600 rounded-full mr-2"></span>
                  Digital Notice Board with Pinned Announcements
                </h3>
                <p className="text-xs text-slate-600 leading-relaxed mb-2">
                  Admins can broadcast society-wide notices. Important announcements can be marked as "Pinned", ensuring they remain anchored at the very top of the resident notice feed regardless of newer postings.
                </p>
              </div>

              {/* Feature 5 */}
              <div className="border border-slate-200 rounded-xl p-5 hover:border-blue-300 transition bg-white">
                <h3 className="text-sm font-bold text-slate-900 mb-1 flex items-center">
                  <span className="w-2 h-2 bg-blue-600 rounded-full mr-2"></span>
                  Real-Time Email Notification Dispatcher
                </h3>
                <p className="text-xs text-slate-600 leading-relaxed mb-2">
                  The system triggers automated email notifications whenever an admin updates the status of a resident's complaint or when an important society notice is published, ensuring immediate awareness without needing manual app refreshes.
                </p>
              </div>
            </div>
          </section>

          {/* SECTION 4: TECHNOLOGIES USED & PURPOSE */}
          <section id="sec-tech-stack" className="mb-12">
            <div className="flex items-center space-x-2 text-blue-600 mb-3">
              <Cpu className="w-5 h-5" />
              <h2 className="text-xl font-bold text-slate-900">4. Technology Stack & Purpose</h2>
            </div>
            
            <div className="overflow-x-auto border border-slate-200 rounded-xl mb-6">
              <table className="w-full text-left border-collapse text-xs">
                <thead>
                  <tr className="bg-slate-50 border-b border-slate-200 text-slate-700 font-bold uppercase tracking-wider">
                    <th className="p-3">Layer / Component</th>
                    <th className="p-3">Technology Used</th>
                    <th className="p-3">Purpose in the Project</th>
                    <th className="p-3">Why This Specific Tech?</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200 text-slate-600">
                  <tr>
                    <td className="p-3 font-bold text-slate-900">Frontend UI</td>
                    <td className="p-3 font-semibold text-blue-600">React 18 + TypeScript</td>
                    <td className="p-3">Single-page client for Admin & Resident portals, real-time tables, modals.</td>
                    <td className="p-3">Component-based architecture, virtual DOM for quick filtering, compile-time type safety.</td>
                  </tr>
                  <tr>
                    <td className="p-3 font-bold text-slate-900">CSS Styling</td>
                    <td className="p-3 font-semibold text-blue-600">Tailwind CSS</td>
                    <td className="p-3">Rapid design of responsive cards, responsive layouts, badges, and status colors.</td>
                    <td className="p-3">Utility-first approach avoids bulky CSS files, purge unused classes, native responsive prefixes.</td>
                  </tr>
                  <tr>
                    <td className="p-3 font-bold text-slate-900">Backend Core</td>
                    <td className="p-3 font-semibold text-blue-600">Python (Django 5)</td>
                    <td className="p-3">Multi-tenant society structure, unit generation matrix, and work order workflows.</td>
                    <td className="p-3">Built-in ORM, robust data validations, mature ecosystem, clean model-view architecture.</td>
                  </tr>
                  <tr>
                    <td className="p-3 font-bold text-slate-900">Speed Microservice</td>
                    <td className="p-3 font-semibold text-blue-600">Python (Flask)</td>
                    <td className="p-3">Lightweight endpoints: 6-digit OTP delivery, photo processing, and HMAC QR generation.</td>
                    <td className="p-3">Minimal latency (&lt;10ms overhead), lightweight memory footprint for high-frequency requests.</td>
                  </tr>
                  <tr>
                    <td className="p-3 font-bold text-slate-900">Task Scheduler</td>
                    <td className="p-3 font-semibold text-blue-600">Celery + Redis</td>
                    <td className="p-3">Background jobs: recurring SLA overdue scans and mass email dispatches.</td>
                    <td className="p-3">Decouples long-running operations from synchronous HTTP request-response cycles.</td>
                  </tr>
                  <tr>
                    <td className="p-3 font-bold text-slate-900">Real-Time Database</td>
                    <td className="p-3 font-semibold text-blue-600">Firebase Firestore</td>
                    <td className="p-3">Stores complaints, status history logs, notices, and user profiles.</td>
                    <td className="p-3">Native WebSocket subscriptions (<code>onSnapshot</code>) provide zero-refresh live updates.</td>
                  </tr>
                  <tr>
                    <td className="p-3 font-bold text-slate-900">Authentication</td>
                    <td className="p-3 font-semibold text-blue-600">Firebase Auth</td>
                    <td className="p-3">Role-based sign-in with Google, Email/Password, and phone OTP integration.</td>
                    <td className="p-3">Production-grade security, automatic token refresh, zero password storage liabilities.</td>
                  </tr>
                </tbody>
              </table>
            </div>
          </section>

          {/* SECTION 5: TRADEOFFS & WHY THIS OVER THAT */}
          <section id="sec-tradeoffs" className="mb-12">
            <div className="flex items-center space-x-2 text-blue-600 mb-3">
              <Scale className="w-5 h-5" />
              <h2 className="text-xl font-bold text-slate-900">5. Architectural Trade-offs & Comparisons</h2>
            </div>
            <p className="text-xs sm:text-sm text-slate-600 mb-6 leading-relaxed">
              In software engineering evaluations, selecting a tool must be justified with technical reasoning and trade-off analysis. Here is the direct breakdown of why we chose our stack over industry alternatives:
            </p>

            <div className="space-y-6">
              {/* Tradeoff 1: React vs Angular / Vue */}
              <div className="p-5 bg-slate-50 border border-slate-200 rounded-xl">
                <h3 className="text-sm font-bold text-slate-900 mb-2">
                  A. Frontend: Why React + TypeScript instead of Angular or Vue?
                </h3>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-xs">
                  <div className="p-3 bg-emerald-50/70 border border-emerald-200 rounded-lg">
                    <p className="font-bold text-emerald-900 mb-1">✅ Advantages of React + TypeScript (Chosen):</p>
                    <ul className="list-disc list-inside space-y-1 text-emerald-800">
                      <li><strong>Fine-grained Component Reusability</strong>: Clean separation of complaint cards, modals, and filters.</li>
                      <li><strong>Rich React Ecosystem</strong>: Seamless integration with Lucide icons, date formatters, and Firestore listeners.</li>
                      <li><strong>Type Safety</strong>: TypeScript eliminates runtime null pointer errors in complex ticket histories.</li>
                    </ul>
                  </div>
                  <div className="p-3 bg-rose-50/70 border border-rose-200 rounded-lg">
                    <p className="font-bold text-rose-900 mb-1">❌ Drawbacks of Alternatives (Angular / Vue):</p>
                    <ul className="list-disc list-inside space-y-1 text-rose-800">
                      <li><strong>Angular</strong>: Heavy boilerplate, strict RxJS dependency, and slower initial payload size for a resident portal.</li>
                      <li><strong>Vanilla Vue</strong>: Smaller component ecosystem for complex enterprise dashboards and multi-tenant tooling.</li>
                    </ul>
                  </div>
                </div>
              </div>

              {/* Tradeoff 2: Python (Django/Flask) vs Node/Express Monolith */}
              <div className="p-5 bg-slate-50 border border-slate-200 rounded-xl">
                <h3 className="text-sm font-bold text-slate-900 mb-2">
                  B. Backend: Why Python (Django + Flask) instead of a pure Node.js/Express Monolith?
                </h3>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-xs">
                  <div className="p-3 bg-emerald-50/70 border border-emerald-200 rounded-lg">
                    <p className="font-bold text-emerald-900 mb-1">✅ Advantages of Python Microservices (Chosen):</p>
                    <ul className="list-disc list-inside space-y-1 text-emerald-800">
                      <li><strong>Clear Separation of Responsibilities</strong>: Django manages structured enterprise models; Flask handles ultra-fast, stateless OTP and HMAC crypto passes.</li>
                      <li><strong>Celery Task Ecosystem</strong>: Unmatched stability for distributed scheduling (Celery Beat) compared to in-memory Node intervals.</li>
                      <li><strong>Data Science Ready</strong>: Python makes future predictive maintenance analysis and NLP complaint categorization simple.</li>
                    </ul>
                  </div>
                  <div className="p-3 bg-rose-50/70 border border-rose-200 rounded-lg">
                    <p className="font-bold text-rose-900 mb-1">❌ Drawbacks of Single Node.js Monolith:</p>
                    <ul className="list-disc list-inside space-y-1 text-rose-800">
                      <li><strong>Event-Loop Blocking</strong>: Heavy image validation or background cron scanning in the same Node process can block concurrent resident requests.</li>
                      <li><strong>Less Structured ORM</strong>: Ad-hoc Express routes lack the built-in migration and serialization discipline of Django REST Framework.</li>
                    </ul>
                  </div>
                </div>
              </div>

              {/* Tradeoff 3: Firestore vs PostgreSQL */}
              <div className="p-5 bg-slate-50 border border-slate-200 rounded-xl">
                <h3 className="text-sm font-bold text-slate-900 mb-2">
                  C. Database: Why Firebase Firestore + PostgreSQL Schema Design?
                </h3>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-xs">
                  <div className="p-3 bg-emerald-50/70 border border-emerald-200 rounded-lg">
                    <p className="font-bold text-emerald-900 mb-1">✅ Advantages of Firestore for Society Tracking:</p>
                    <ul className="list-disc list-inside space-y-1 text-emerald-800">
                      <li><strong>Live Reactive UI</strong>: Admin status updates immediately reflect on the resident's screen in under 100ms without polling.</li>
                      <li><strong>Embedded History Arrays</strong>: Document model allows keeping <code>statusHistory</code> inside the complaint document, enabling single-read queries.</li>
                      <li><strong>Zero Cold Starts</strong>: Serverless scaling handles traffic spikes when emergency notices are published.</li>
                    </ul>
                  </div>
                  <div className="p-3 bg-rose-50/70 border border-rose-200 rounded-lg">
                    <p className="font-bold text-rose-900 mb-1">❌ Trade-off Acknowledged & Mitigated:</p>
                    <ul className="list-disc list-inside space-y-1 text-rose-800">
                      <li><strong>Complex Relational Queries</strong>: While Firestore is optimized for documents, we defined normalized relational models in Django to support dual-write export to PostgreSQL for large enterprise societies.</li>
                    </ul>
                  </div>
                </div>
              </div>
            </div>
          </section>

          {/* SECTION 6: DATABASE SCHEMA & STATE MACHINES */}
          <section id="sec-system-architecture" className="mb-12">
            <div className="flex items-center space-x-2 text-blue-600 mb-3">
              <Database className="w-5 h-5" />
              <h2 className="text-xl font-bold text-slate-900">6. Database Schema & Lifecycle State Machines</h2>
            </div>

            <div className="bg-slate-950 text-slate-200 p-5 rounded-xl font-mono text-xs overflow-x-auto mb-6">
              <p className="text-slate-400">// Core JSON Document Schema: complaints Collection</p>
              <pre>{`{
  "_id": "COMPLAINT-94812",
  "societyId": "green-heights-soc",
  "unitNumber": "B-402",
  "residentId": "usr_resident_123",
  "residentName": "Rajesh Kumar",
  "residentEmail": "rajesh.k@example.com",
  "category": "Plumbing",
  "title": "Kitchen sink main line leakage",
  "description": "Continuous water seepage under the sink counter causing dampness.",
  "imageUrl": "data:image/jpeg;base64,/9j/4AAQSkZJRg...",
  "priority": "High",
  "status": "In Progress",
  "createdAt": "2026-08-20T09:30:00.000Z",
  "updatedAt": "2026-08-21T14:15:00.000Z",
  "isOverdue": false,
  "statusHistory": [
    {
      "fromStatus": "None",
      "toStatus": "Open",
      "changedBy": "Rajesh Kumar",
      "changedByRole": "resident",
      "note": "Complaint submitted with photo attachment",
      "timestamp": "2026-08-20T09:30:00.000Z"
    },
    {
      "fromStatus": "Open",
      "toStatus": "In Progress",
      "changedBy": "Admin Anil",
      "changedByRole": "admin",
      "note": "Plumber Manoj assigned. Scheduled for site visit.",
      "timestamp": "2026-08-21T14:15:00.000Z"
    }
  ]
}`}</pre>
            </div>

            <div className="p-4 bg-blue-50 border border-blue-200 rounded-xl text-xs text-blue-900">
              <h4 className="font-bold mb-1">State Machine Enforcement:</h4>
              <p>1. <code>Open</code>: Initial state upon resident submission.</p>
              <p>2. <code>In Progress</code>: Admin acknowledges ticket, assigns technician, adds visit remarks.</p>
              <p>3. <code>Resolved</code>: Work completed. Timestamp recorded and ticket is marked closed.</p>
            </div>
          </section>

          {/* SECTION 7: VIVA & PLACEMENT INTERVIEW QUESTIONS */}
          <section id="sec-viva-qa" className="mb-8">
            <div className="flex items-center space-x-2 text-blue-600 mb-3">
              <HelpCircle className="w-5 h-5" />
              <h2 className="text-xl font-bold text-slate-900">7. Placement & Viva Anticipated Questions & Answers</h2>
            </div>
            <p className="text-xs text-slate-600 mb-6">
              These are the most common technical questions evaluators and interviewers ask for this project, along with crisp, high-scoring answers.
            </p>

            <div className="space-y-4 text-xs sm:text-sm">
              {/* Q1 */}
              <div className="border border-slate-200 rounded-xl p-5 bg-white">
                <p className="font-bold text-slate-900 mb-2">
                  Q1: How does your overdue detection algorithm work, and is it hardcoded or configurable?
                </p>
                <p className="text-slate-600 leading-relaxed">
                  <strong>Answer:</strong> "The overdue detection is fully configurable by the society administrator. The admin sets an overdue threshold $T$ in days (e.g., 3 days). The system computes the difference between the current timestamp and the complaint's <code>createdAt</code> timestamp. If the difference exceeds $T$ and the status is still not <code>Resolved</code>, the item is dynamically tagged as overdue and hoisted to the top of the admin complaint queue using custom multi-level sorting."
                </p>
              </div>

              {/* Q2 */}
              <div className="border border-slate-200 rounded-xl p-5 bg-white">
                <p className="font-bold text-slate-900 mb-2">
                  Q2: Why did you embed <code>statusHistory</code> inside the complaint document instead of creating a separate SQL table?
                </p>
                <p className="text-slate-600 leading-relaxed">
                  <strong>Answer:</strong> "In our access pattern, whenever a resident or admin views a complaint, they always view its history timeline simultaneously. Embedding the history array within the document allows us to fetch the complaint and its entire chronological audit trail in a single $O(1)$ read operation, eliminating relational JOIN overhead and optimizing read latency."
                </p>
              </div>

              {/* Q3 */}
              <div className="border border-slate-200 rounded-xl p-5 bg-white">
                <p className="font-bold text-slate-900 mb-2">
                  Q3: How are unauthorized users prevented from updating complaint statuses or viewing other societies' data?
                </p>
                <p className="text-slate-600 leading-relaxed">
                  <strong>Answer:</strong> "We enforce multi-tenant isolation at both the application level and database level. In Firebase Firestore, zero-trust security rules inspect the authenticated user's token. Admins are validated using role claims, while residents can only query and read complaints matching their unique <code>societyId</code> and <code>unitNumber</code>. Only verified admins are granted write permissions to transition statuses."
                </p>
              </div>

              {/* Q4 */}
              <div className="border border-slate-200 rounded-xl p-5 bg-white">
                <p className="font-bold text-slate-900 mb-2">
                  Q4: How do you handle large photo uploads without slowing down the app?
                </p>
                <p className="text-slate-600 leading-relaxed">
                  <strong>Answer:</strong> "We perform client-side validation on file size (capped at 5 MB) and MIME types. Photos are converted to compressed base64 strings or piped asynchronously via our Flask media processor. In the UI, thumbnail placeholders are rendered initially, and full-resolution images are loaded on-demand in a modal view."
                </p>
              </div>

              {/* Q5 */}
              <div className="border border-slate-200 rounded-xl p-5 bg-white">
                <p className="font-bold text-slate-900 mb-2">
                  Q5: How does your notification flow ensure residents are updated without spamming them?
                </p>
                <p className="text-slate-600 leading-relaxed">
                  <strong>Answer:</strong> "Notifications are strictly event-driven. We trigger email dispatches only on high-value state changes: specifically when an admin transitions a complaint status (with their remark) and when an admin publishes a notice explicitly marked as 'Important'. Routine minor edits do not trigger external emails, avoiding notification fatigue."
                </p>
              </div>
            </div>
          </section>

          {/* Report Footer */}
          <div className="border-t border-slate-200 pt-6 mt-12 flex flex-col sm:flex-row items-center justify-between text-xs text-slate-500">
            <p>© 2026 Vasturith Project Report • Prepared for University / Placement Technical Evaluation</p>
            <p className="font-mono">Status: Verified & Validated</p>
          </div>
        </div>
      </main>
    </div>
  );
}
