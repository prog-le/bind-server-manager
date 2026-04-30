const express = require('express');
const cors = require('cors');
const rateLimit = require('express-rate-limit');
const path = require('path');
const { config } = require('./config');
const { initDB } = require('./db');
const authRoutes = require('./routes/auth');
const zoneRoutes = require('./routes/zones');
const recordRoutes = require('./routes/records');
const settingsRoutes = require('./routes/settings');
const logRoutes = require('./routes/logs');
const backupRoutes = require('./routes/backups');
const batchRoutes = require('./routes/batch');
const auditRoutes = require('./routes/audit');
const monitorRoutes = require('./routes/monitor');
const dnsLogRoutes = require('./routes/dns-logs');
const alertRoutes = require('./routes/alerts');
const auditMiddleware = require('./middleware/audit');
const alertManager = require('./services/alerts/alertManager');
const dnsLogService = require('./services/dnsLog');
const backupScheduler = require('./services/backupScheduler');

const app = express();

// CORS — restrict to known origins
const allowedOrigins = (process.env.CORS_ORIGINS || 'http://localhost:5173,http://localhost:3000').split(',');
app.use(cors({
  origin: (origin, callback) => {
    if (!origin || allowedOrigins.includes(origin)) {
      callback(null, true);
    } else {
      callback(new Error('Not allowed by CORS'));
    }
  },
}));
app.use(express.json());

// Rate limiting
const loginLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 5,
  message: { error: '登录尝试过多，请稍后再试' },
  standardHeaders: true,
  legacyHeaders: false,
});

const recordLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 30,
  message: { error: '请求过多，请稍后再试' },
  standardHeaders: true,
  legacyHeaders: false,
});

app.use('/api/auth/login', loginLimiter);

// API Routes — audit middleware on write routes
app.use('/api/auth', authRoutes);
app.use('/api/zones', auditMiddleware, zoneRoutes);
app.use('/api/zones', recordLimiter, auditMiddleware, recordRoutes);
app.use('/api/zones', recordLimiter, auditMiddleware, batchRoutes);
app.use('/api/settings', auditMiddleware, settingsRoutes);
app.use('/api/logs', logRoutes);
app.use('/api/backups', auditMiddleware, backupRoutes);
app.use('/api/audit', auditRoutes);
app.use('/api/monitor', monitorRoutes);
app.use('/api/dns-logs', dnsLogRoutes);
app.use('/api/alerts', alertRoutes);

// Health check
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// Serve static files in production
const clientDist = path.join(__dirname, '..', '..', 'client', 'dist');
app.use(express.static(clientDist));
app.get('{*path}', (req, res) => {
  res.sendFile(path.join(clientDist, 'index.html'));
});

// Error handling
app.use((err, req, res, next) => {
  console.error('Unhandled error:', err);
  res.status(500).json({ error: '服务器内部错误' });
});

// Initialize database and start server
async function start() {
  try {
    await initDB();
    console.log('Database initialized');

    // Start DNS query log watcher
    dnsLogService.startLogWatcher();
    // Cleanup old DNS logs daily
    setInterval(() => dnsLogService.cleanupOldLogs(), 24 * 60 * 60 * 1000);

    // Start alert checker
    alertManager.startAlertChecker();

    // Start backup scheduler
    backupScheduler.startScheduler();

    app.listen(config.port, config.host, () => {
      console.log(`BIND SERVER MANAGER API running on http://${config.host}:${config.port}`);
      console.log(`Database: ${config.dbPath}`);
    });
  } catch (err) {
    console.error('Failed to start server:', err);
    process.exit(1);
  }
}

start();
