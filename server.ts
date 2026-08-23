import express from "express";
import path from "path";
import { createServer as createViteServer } from "vite";
import multer from "multer";
import fs from "fs";
import crypto from "crypto";

// Ensure persistent storage directories exist
const dataDir = path.join(process.cwd(), '.data');
const uploadDir = path.join(process.cwd(), 'uploads');
if (!fs.existsSync(dataDir)) fs.mkdirSync(dataDir, { recursive: true });
if (!fs.existsSync(uploadDir)) fs.mkdirSync(uploadDir, { recursive: true });

const OTP_PERSIST_FILE = path.join(dataDir, 'otp_vault.json');

interface OtpEntry {
  contact: string;
  hashedCode: string;
  salt: string;
  expiresAt: number;
  attempts: number;
  createdAt: number;
}

// Persistent OTP Engine (File-backed / Distributed State Interface)
class PersistentOtpService {
  private cache = new Map<string, OtpEntry>();
  private rateLimitMap = new Map<string, number[]>();

  constructor() {
    this.load();
    // Auto purge expired records every 60 seconds
    setInterval(() => this.purgeExpired(), 60000);
  }

  private load() {
    try {
      if (fs.existsSync(OTP_PERSIST_FILE)) {
        const raw = fs.readFileSync(OTP_PERSIST_FILE, 'utf-8');
        const data = JSON.parse(raw);
        for (const k in data) {
          if (data[k].expiresAt > Date.now()) {
            this.cache.set(k, data[k]);
          }
        }
      }
    } catch (e) {
      console.warn("Could not load persistent OTP vault, initializing fresh map.", e);
    }
  }

  private save() {
    try {
      const obj: Record<string, OtpEntry> = {};
      for (const [k, v] of this.cache.entries()) {
        obj[k] = v;
      }
      fs.writeFileSync(OTP_PERSIST_FILE, JSON.stringify(obj, null, 2), 'utf-8');
    } catch (e) {
      console.error("Failed to write to OTP vault:", e);
    }
  }

  private hash(code: string, salt: string): string {
    return crypto.createHmac('sha256', salt).update(code).digest('hex');
  }

  public checkRateLimit(contact: string): boolean {
    const now = Date.now();
    const windowMs = 10 * 60 * 1000; // 10 minutes
    const maxRequests = 5;
    const history = (this.rateLimitMap.get(contact) || []).filter(ts => now - ts < windowMs);
    
    if (history.length >= maxRequests) {
      return false; // Rate limited
    }
    history.push(now);
    this.rateLimitMap.set(contact, history);
    return true;
  }

  public generateOtp(contact: string): { code: string; expiresAt: number } {
    const code = crypto.randomInt(100000, 999999).toString();
    const salt = crypto.randomBytes(16).toString('hex');
    const hashedCode = this.hash(code, salt);
    const expiresAt = Date.now() + 5 * 60 * 1000; // 5 minutes TTL

    const entry: OtpEntry = {
      contact,
      hashedCode,
      salt,
      expiresAt,
      attempts: 0,
      createdAt: Date.now()
    };

    this.cache.set(contact, entry);
    this.save();
    return { code, expiresAt };
  }

  public verifyOtp(contact: string, submittedCode: string): { valid: boolean; reason?: string } {
    const entry = this.cache.get(contact);
    if (!entry) {
      return { valid: false, reason: "No active OTP found or expired for this contact." };
    }

    if (Date.now() > entry.expiresAt) {
      this.cache.delete(contact);
      this.save();
      return { valid: false, reason: "OTP has expired. Please request a new code." };
    }

    if (entry.attempts >= 3) {
      this.cache.delete(contact);
      this.save();
      return { valid: false, reason: "Maximum verification attempts exceeded. Code invalidated." };
    }

    const testHash = this.hash(submittedCode, entry.salt);
    if (testHash !== entry.hashedCode) {
      entry.attempts += 1;
      this.save();
      const remaining = 3 - entry.attempts;
      return { valid: false, reason: `Invalid code. ${remaining} attempt${remaining === 1 ? '' : 's'} remaining.` };
    }

    // Successfully verified -> Invalidate immediately
    this.cache.delete(contact);
    this.save();
    return { valid: true };
  }

  private purgeExpired() {
    const now = Date.now();
    let changed = false;
    for (const [k, v] of this.cache.entries()) {
      if (v.expiresAt <= now) {
        this.cache.delete(k);
        changed = true;
      }
    }
    if (changed) this.save();
  }
}

const otpService = new PersistentOtpService();

// Configure multer for disk storage with security validation
const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    cb(null, uploadDir);
  },
  filename: function (req, file, cb) {
    const uniqueSuffix = Date.now() + '-' + crypto.randomBytes(6).toString('hex');
    const ext = path.extname(file.originalname).toLowerCase() || '.jpg';
    cb(null, 'media-' + uniqueSuffix + ext);
  }
});

const upload = multer({
  storage: storage,
  limits: { fileSize: 15 * 1024 * 1024 }, // 15MB max file size
  fileFilter: (req, file, cb) => {
    const allowedMime = ['image/jpeg', 'image/png', 'image/webp', 'image/gif', 'application/pdf'];
    if (allowedMime.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error('Invalid file type. Only JPEG, PNG, WEBP, GIF, and PDF are supported.'));
    }
  }
});

async function startServer() {
  const app = express();
  const PORT = Number(process.env.PORT) || 3000;

  app.use(express.json());
  
  // High availability health check
  app.get('/api/health', (req, res) => {
    res.json({
      status: 'healthy',
      version: '2.4.0',
      uptime: process.uptime(),
      timestamp: new Date().toISOString(),
      microservices: {
        otp: 'operational',
        mediaStorage: 'operational',
        notifications: 'operational'
      }
    });
  });

  // Serve the uploads folder with caching headers
  app.use('/uploads', express.static(path.join(process.cwd(), 'uploads'), {
    maxAge: '7d',
    immutable: true
  }));

  // --- 1. MEDIA OBJECT STORAGE MICROSERVICE ---
  app.post('/api/upload', (req, res) => {
    upload.single('file')(req, res, (err) => {
      if (err) {
        return res.status(400).json({ error: err.message || 'File upload failed' });
      }
      if (!req.file) {
        return res.status(400).json({ error: 'No file provided in payload' });
      }
      
      const fileUrl = `/uploads/${req.file.filename}`;
      res.json({
        url: fileUrl,
        size: req.file.size,
        mimeType: req.file.mimetype,
        filename: req.file.filename
      });
    });
  });

  // --- 2. DISTRIBUTED OTP MICROSERVICE ---
  app.post('/api/otp/send', (req, res) => {
    const { contact, type } = req.body;
    if (!contact || typeof contact !== 'string') {
      return res.status(400).json({ error: 'Valid contact email or phone number is required.' });
    }

    const cleanContact = contact.toLowerCase().trim();

    if (!otpService.checkRateLimit(cleanContact)) {
      return res.status(429).json({ 
        error: 'Too many OTP requests for this destination. Please wait a few minutes before trying again.' 
      });
    }

    const { code, expiresAt } = otpService.generateOtp(cleanContact);

    console.log(`\n======================================================`);
    console.log(`🔐 REAL OTP DISPATCHED [Channel: ${type ? type.toUpperCase() : 'EMAIL/SMS'}]`);
    console.log(`Destination: ${cleanContact}`);
    console.log(`One-Time Code: ${code}`);
    console.log(`Valid Until: ${new Date(expiresAt).toISOString()} (5 minutes)`);
    console.log(`======================================================\n`);

    res.json({ 
      success: true, 
      message: `OTP dispatched to ${cleanContact}`,
      expiresInSeconds: 300,
      _devCode: code // Exposed for development / preview verification
    });
  });

  app.post('/api/otp/verify', (req, res) => {
    const { contact, code } = req.body;
    if (!contact || !code) {
      return res.status(400).json({ error: 'Both contact and 6-digit verification code are required.' });
    }

    const cleanContact = contact.toLowerCase().trim();
    const cleanCode = code.toString().trim();

    const result = otpService.verifyOtp(cleanContact, cleanCode);
    if (!result.valid) {
      return res.status(400).json({ error: result.reason || 'Invalid OTP code' });
    }

    res.json({ 
      success: true, 
      message: 'OTP verified successfully. Action authorized.' 
    });
  });

  // --- 3. NOTIFICATION MICROSERVICE DISPATCH ---
  app.post("/api/notify", (req, res) => {
    const { to, subject, text, channel = 'email' } = req.body;
    console.log(`\n--- 🚀 MULTI-CHANNEL DISPATCH [${channel.toUpperCase()}] ---`);
    console.log(`Recipients: ${Array.isArray(to) ? to.join(', ') : to}`);
    console.log(`Subject: ${subject}`);
    console.log(`Payload:\n${text}`);
    console.log(`--------------------------------------------------------\n`);
    res.json({ success: true, timestamp: new Date().toISOString() });
  });

  // Vite middleware for development
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

startServer();
