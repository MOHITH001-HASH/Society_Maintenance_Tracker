// Client for the Python API compatibility endpoints.

export interface AnalyticsResponse {
  societyId: string;
  computedAt: string;
  engine: string;
  latencyMs: number;
  status: string;
}

export interface VisitorPassPayload {
  societyId: string;
  unitNumber: string;
  visitorName: string;
  visitorPhone: string;
  purpose: string;
  hostName: string;
}

export interface VisitorPassResult {
  passId: string;
  qrPayload: string;
  expiresAt: string;
  passCode: string;
}

export const PythonGatewayService = {
  // 1. Fetch Aggregated High-Performance Analytics (Powered by Analytics Engine)
  async getSocietyAnalytics(societyId: string): Promise<AnalyticsResponse | null> {
    try {
      const res = await fetch(`/api/analytics/society/${encodeURIComponent(societyId)}`);
      if (!res.ok) return null;
      return await res.json();
    } catch (e) {
      console.warn("Python Gateway Analytics unavailable:", e);
      return null;
    }
  },

  // 2. High-Throughput Security Audit Ingestion (Fast Ingestion Microservice)
  async recordSecurityEvent(payload: {
    societyId: string;
    unitNumber?: string;
    category: string;
    action: string;
    description: string;
    actorId?: string;
    actorName?: string;
    actorRole?: string;
  }): Promise<boolean> {
    try {
      const res = await fetch('/api/security/audit', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
      return res.ok;
    } catch (e) {
      console.warn("Audit stream ingestion fallback:", e);
      return false;
    }
  },

  // 3. Fast Visitor Gate-Pass & QR Generation (Flask Microservice)
  async generateVisitorPass(payload: VisitorPassPayload): Promise<VisitorPassResult | null> {
    try {
      const res = await fetch('/api/visitors/pass', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
      if (!res.ok) return null;
      return await res.json();
    } catch (e) {
      console.error("Failed to generate visitor pass:", e);
      return null;
    }
  },

  // 4. SLA & work-order compatibility endpoint (not a persisted workflow).
  async checkSlaEscalations(societyId: string): Promise<{ checkedCount: number; escalatedCount: number }> {
    try {
      const res = await fetch(`/api/workflows/sla/check/${encodeURIComponent(societyId)}`, {
        method: 'POST'
      });
      if (!res.ok) return { checkedCount: 0, escalatedCount: 0 };
      return await res.json();
    } catch (e) {
      console.warn("SLA escalation trigger fallback:", e);
      return { checkedCount: 0, escalatedCount: 0 };
    }
  }
};
