const https = require('https');
const http = require('http');
const { URL } = require('url');

/**
 * Send alert via webhook (supports WeChat Work, DingTalk, Feishu, generic)
 */
async function sendWebhook(config, { subject, message, level }) {
  const webhookUrl = config.webhook_url;
  if (!webhookUrl) {
    return { success: false, error: 'Webhook URL not configured' };
  }

  let body;

  // Auto-detect webhook type and format message
  if (webhookUrl.includes('qyapi.weixin.qq.com')) {
    // WeChat Work (企业微信)
    body = JSON.stringify({
      msgtype: 'markdown',
      markdown: {
        content: `### ${getLevelEmoji(level)} ${subject}\n${message}\n> BIND SERVER MANAGER | ${new Date().toLocaleString('zh-CN')}`,
      },
    });
  } else if (webhookUrl.includes('oapi.dingtalk.com')) {
    // DingTalk (钉钉)
    body = JSON.stringify({
      msgtype: 'markdown',
      markdown: {
        title: `${getLevelEmoji(level)} ${subject}`,
        text: `### ${getLevelEmoji(level)} ${subject}\n${message}\n\n---\nBIND SERVER MANAGER | ${new Date().toLocaleString('zh-CN')}`,
      },
    });
  } else if (webhookUrl.includes('open.feishu.cn')) {
    // Feishu (飞书)
    body = JSON.stringify({
      msg_type: 'text',
      content: {
        text: `${getLevelEmoji(level)} ${subject}\n${message}\n\nBIND SERVER MANAGER | ${new Date().toLocaleString('zh-CN')}`,
      },
    });
  } else {
    // Generic webhook (JSON)
    body = JSON.stringify({
      title: subject,
      message,
      level,
      timestamp: new Date().toISOString(),
      source: 'BIND SERVER MANAGER',
    });
  }

  return new Promise((resolve) => {
    try {
      const url = new URL(webhookUrl);
      const isHttps = url.protocol === 'https:';
      const client = isHttps ? https : http;

      const req = client.request({
        hostname: url.hostname,
        port: url.port || (isHttps ? 443 : 80),
        path: url.pathname + url.search,
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Content-Length': Buffer.byteLength(body),
        },
        timeout: 10000,
      }, (res) => {
        let data = '';
        res.on('data', chunk => data += chunk);
        res.on('end', () => {
          if (res.statusCode >= 200 && res.statusCode < 300) {
            resolve({ success: true });
          } else {
            resolve({ success: false, error: `HTTP ${res.statusCode}: ${data.substring(0, 200)}` });
          }
        });
      });

      req.on('error', (err) => resolve({ success: false, error: err.message }));
      req.on('timeout', () => { req.destroy(); resolve({ success: false, error: 'Request timeout' }); });
      req.write(body);
      req.end();
    } catch (err) {
      resolve({ success: false, error: err.message });
    }
  });
}

/**
 * Test webhook configuration
 */
async function testWebhook(config) {
  return sendWebhook(config, {
    subject: '告警测试',
    message: '这是一条测试告警消息。如果您收到此消息，说明 Webhook 告警配置正确。',
    level: 'info',
  });
}

function getLevelEmoji(level) {
  const map = { critical: '🔴', warning: '🟡', info: '🔵' };
  return map[level] || '⚠️';
}

module.exports = { sendWebhook, testWebhook };
