const { query, queryOne, run } = require('../../db');
const { sendEmail } = require('./emailChannel');
const { sendWebhook } = require('./webhookChannel');
const monitorService = require('../monitor');

const CHECK_INTERVAL = 60 * 1000; // Check every minute
let checkTimer = null;

// Predefined alert condition types
const CONDITION_TYPES = {
  BIND_DOWN: 'bind_down',
  HIGH_CPU: 'high_cpu',
  HIGH_MEMORY: 'high_memory',
  CONFIG_ERROR: 'config_error',
};

/**
 * Check all enabled alert rules
 */
async function checkAlerts() {
  const rules = query('SELECT * FROM alert_rules WHERE enabled = 1');
  const settings = getAlertSettings();

  for (const rule of rules) {
    try {
      const params = JSON.parse(rule.condition_params || '{}');
      const channels = JSON.parse(rule.channels || '[]');
      let triggered = false;
      let message = '';

      switch (rule.condition_type) {
        case CONDITION_TYPES.BIND_DOWN: {
          const status = monitorService.getStatus();
          if (!status.running) {
            triggered = true;
            message = `BIND 服务已停止运行。\nPID: ${status.pid || 'N/A'}\n最后检查: ${status.timestamp}`;
          }
          break;
        }
        case CONDITION_TYPES.HIGH_CPU: {
          const status = monitorService.getStatus();
          const threshold = params.threshold || 80;
          if (status.running && status.cpu?.percent > threshold) {
            triggered = true;
            message = `BIND 进程 CPU 使用率过高：${status.cpu.percent}%（阈值：${threshold}%）\nPID: ${status.pid}`;
          }
          break;
        }
        case CONDITION_TYPES.HIGH_MEMORY: {
          const status = monitorService.getStatus();
          const thresholdMB = params.threshold_mb || 1024;
          const rssMB = (status.memory?.rss || 0) / 1024 / 1024;
          if (status.running && rssMB > thresholdMB) {
            triggered = true;
            message = `BIND 进程内存使用过高：${rssMB.toFixed(1)} MB（阈值：${thresholdMB} MB）\nPID: ${status.pid}`;
          }
          break;
        }
        case CONDITION_TYPES.CONFIG_ERROR: {
          const bindService = require('../bind');
          const { configPath } = bindService.getPaths();
          const result = bindService.checkConfig(configPath);
          if (!result.success) {
            triggered = true;
            message = `BIND 配置文件存在语法错误：\n${result.error}`;
          }
          break;
        }
      }

      if (triggered) {
        // Check cooldown (don't re-alert within 30 minutes for same rule)
        const recentAlert = queryOne(
          'SELECT id FROM alert_history WHERE rule_id = ? AND created_at > datetime("now", "-30 minutes")',
          [rule.id]
        );
        if (recentAlert) continue;

        await sendAlert(rule, channels, message, settings);
      }
    } catch (err) {
      console.error(`Alert rule check failed (${rule.name}):`, err.message);
    }
  }
}

/**
 * Send alert through configured channels
 */
async function sendAlert(rule, channels, message, settings) {
  for (const channel of channels) {
    const historyEntry = run(
      'INSERT INTO alert_history (rule_id, rule_name, level, message, channel, status) VALUES (?, ?, ?, ?, ?, ?)',
      [rule.id, rule.name, 'warning', message, channel, 'sending']
    );

    let result;
    try {
      if (channel === 'email' && settings.email) {
        result = await sendEmail(settings.email, { subject: rule.name, message, level: 'warning' });
      } else if (channel === 'webhook' && settings.webhook) {
        result = await sendWebhook(settings.webhook, { subject: rule.name, message, level: 'warning' });
      } else {
        result = { success: false, error: `Channel "${channel}" not configured` };
      }
    } catch (err) {
      result = { success: false, error: err.message };
    }

    run(
      'UPDATE alert_history SET status = ?, sent_at = datetime("now") WHERE id = ?',
      [result.success ? 'sent' : 'failed', historyEntry.lastInsertRowid]
    );
  }
}

/**
 * Get alert settings from database
 */
function getAlertSettings() {
  const settings = {};
  const rows = query("SELECT key, value FROM settings WHERE key LIKE 'alert_%'");
  for (const row of rows) {
    settings[row.key.replace('alert_', '')] = row.value;
  }
  // Parse JSON values
  if (settings.email) {
    try { settings.email = JSON.parse(settings.email); } catch {}
  }
  if (settings.webhook) {
    try { settings.webhook = JSON.parse(settings.webhook); } catch {}
  }
  return settings;
}

/**
 * Save alert settings to database
 */
function saveAlertSettings(type, config) {
  run("INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)", [`alert_${type}`, JSON.stringify(config)]);
}

/**
 * Start alert checking timer
 */
function startAlertChecker() {
  if (checkTimer) return;
  checkTimer = setInterval(checkAlerts, CHECK_INTERVAL);
  console.log('Alert checker started (interval: 60s)');
}

/**
 * Stop alert checking timer
 */
function stopAlertChecker() {
  if (checkTimer) {
    clearInterval(checkTimer);
    checkTimer = null;
  }
}

module.exports = {
  checkAlerts,
  startAlertChecker,
  stopAlertChecker,
  getAlertSettings,
  saveAlertSettings,
  CONDITION_TYPES,
};
