const nodemailer = require('nodemailer');

let transporter = null;

/**
 * Initialize email transporter
 */
function initTransporter(config) {
  transporter = nodemailer.createTransport({
    host: config.smtp_host,
    port: config.smtp_port || 587,
    secure: config.smtp_secure || false,
    auth: {
      user: config.smtp_user,
      pass: config.smtp_pass,
    },
  });
}

/**
 * Send alert email
 */
async function sendEmail(config, { subject, message, level }) {
  if (!transporter) {
    initTransporter(config);
  }

  const levelEmoji = { critical: '🔴', warning: '🟡', info: '🔵' };

  try {
    await transporter.sendMail({
      from: config.smtp_from || config.smtp_user,
      to: config.alert_to,
      subject: `${levelEmoji[level] || '⚠️'} [BIND Manager] ${subject}`,
      html: `
        <div style="font-family: sans-serif; padding: 20px;">
          <h2 style="color: ${level === 'critical' ? '#dc2626' : level === 'warning' ? '#d97706' : '#2563eb'};">
            ${levelEmoji[level] || '⚠️'} ${subject}
          </h2>
          <pre style="background: #f3f4f6; padding: 15px; border-radius: 8px; white-space: pre-wrap;">${message}</pre>
          <p style="color: #6b7280; font-size: 12px; margin-top: 20px;">
            BIND SERVER MANAGER | ${new Date().toLocaleString('zh-CN')}
          </p>
        </div>
      `,
    });
    return { success: true };
  } catch (err) {
    return { success: false, error: err.message };
  }
}

/**
 * Test email configuration
 */
async function testEmail(config) {
  return sendEmail(config, {
    subject: '告警测试',
    message: '这是一条测试告警邮件。如果您收到此邮件，说明邮件告警配置正确。',
    level: 'info',
  });
}

module.exports = { sendEmail, testEmail };
