const nodemailer = require('nodemailer');

function getSmtpConfig() {
  const host = process.env.SMTP_HOST || '';
  const port = Number(process.env.SMTP_PORT || 465);
  const user = process.env.SMTP_USER || '';
  const pass = process.env.SMTP_PASS || '';
  const from = process.env.SMTP_FROM || user || 'noreply@kadiwamart.com';
  const secure = process.env.SMTP_SECURE
    ? String(process.env.SMTP_SECURE).toLowerCase() === 'true'
    : port === 465;

  return { host, port, user, pass, from, secure, configured: !!(host && user && pass) };
}

let transporterPromise = null;

async function getTransporter() {
  const cfg = getSmtpConfig();
  if (!cfg.configured) return null;
  if (!transporterPromise) {
    transporterPromise = Promise.resolve(
      nodemailer.createTransport({
        host: cfg.host,
        port: cfg.port,
        secure: cfg.secure,
        auth: { user: cfg.user, pass: cfg.pass }
      })
    );
  }
  return transporterPromise;
}

async function sendRegistrationOtpEmail({ to, otp, fullName }) {
  const cfg = getSmtpConfig();
  const subject = 'Kadiwa Mart email verification code';
  const text = [
    `Hi ${fullName || 'there'},`,
    '',
    `Your Kadiwa Mart verification code is: ${otp}`,
    '',
    'This code expires in 10 minutes.',
    'If you did not create an account, you can ignore this email.'
  ].join('\n');

  const html = `
    <div style="font-family:Arial,sans-serif;line-height:1.5;color:#243024">
      <h2 style="color:#355e2a;margin:0 0 12px">Verify your email</h2>
      <p>Hi ${fullName || 'there'},</p>
      <p>Your Kadiwa Mart verification code is:</p>
      <p style="font-size:28px;letter-spacing:6px;font-weight:700;color:#4E7D32">${otp}</p>
      <p>This code expires in <strong>10 minutes</strong>.</p>
      <p style="color:#6a7b60;font-size:13px">If you did not create an account, ignore this email.</p>
    </div>
  `;

  const transporter = await getTransporter();
  if (!transporter) {
    console.warn('[Email] SMTP not configured. OTP for', to, '=>', otp);
    return { sent: false, reason: 'SMTP not configured' };
  }

  try {
    await transporter.sendMail({
      from: cfg.from,
      to,
      subject,
      text,
      html
    });
    return { sent: true };
  } catch (error) {
    // Do not fail registration if SMTP misconfigured — OTP is still stored.
    console.error('[Email] Failed to send OTP email:', error.message);
    console.warn('[Email] OTP for', to, '=>', otp);
    return { sent: false, reason: error.message || 'SMTP send failed' };
  }
}

function escapeHtml(value) {
  return String(value || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

async function sendNotificationEmail({ to, subject, message, recipientName, actionUrl }) {
  if (!to) return { sent: false, reason: 'Recipient email missing' };

  const cfg = getSmtpConfig();
  const transporter = await getTransporter();
  if (!transporter) {
    console.warn('[Email] SMTP not configured. Notification not sent to', to);
    return { sent: false, reason: 'SMTP not configured' };
  }

  const safeSubject = String(subject || 'Kadiwa Mart notification').slice(0, 180);
  const safeMessage = String(message || '').slice(0, 5000);
  const safeName = escapeHtml(recipientName || 'there');
  const safeUrl = actionUrl ? escapeHtml(actionUrl) : '';
  const htmlMessage = escapeHtml(safeMessage).replace(/\n/g, '<br>');
  const action = safeUrl
    ? `<p style="margin:22px 0"><a href="${safeUrl}" style="display:inline-block;padding:11px 18px;border-radius:8px;background:#4E7D32;color:#fff;text-decoration:none;font-weight:700">Open Kadiwa Mart</a></p>`
    : '';

  try {
    await transporter.sendMail({
      from: cfg.from,
      to,
      subject: safeSubject,
      text: [
        `Hi ${recipientName || 'there'},`,
        '',
        safeMessage,
        '',
        actionUrl || '',
        'Kadiwa Mart'
      ].filter(Boolean).join('\n'),
      html: `
        <div style="font-family:Arial,sans-serif;line-height:1.6;color:#243024;max-width:620px;margin:auto">
          <h2 style="color:#355e2a;margin:0 0 12px">${escapeHtml(safeSubject)}</h2>
          <p>Hi ${safeName},</p>
          <p>${htmlMessage}</p>
          ${action}
          <p style="color:#6a7b60;font-size:13px;margin-top:24px">This is an automated notification from Kadiwa Mart.</p>
        </div>
      `
    });
    return { sent: true };
  } catch (error) {
    console.error('[Email] Failed to send notification email:', error.message);
    return { sent: false, reason: error.message || 'SMTP send failed' };
  }
}

async function sendPasswordResetOtpEmail({ to, otp, fullName }) {
  const cfg = getSmtpConfig();
  const subject = 'Kadiwa Mart password reset code';
  const text = [
    `Hi ${fullName || 'there'},`,
    '',
    `Your Kadiwa Mart password reset code is: ${otp}`,
    '',
    'This code expires in 15 minutes.',
    'If you did not request a password reset, you can ignore this email.'
  ].join('\n');

  const html = `
    <div style="font-family:Arial,sans-serif;line-height:1.5;color:#243024">
      <h2 style="color:#355e2a;margin:0 0 12px">Reset your password</h2>
      <p>Hi ${escapeHtml(fullName || 'there')},</p>
      <p>Your Kadiwa Mart password reset code is:</p>
      <p style="font-size:28px;letter-spacing:6px;font-weight:700;color:#4E7D32">${escapeHtml(otp)}</p>
      <p>This code expires in <strong>15 minutes</strong>.</p>
      <p style="color:#6a7b60;font-size:13px">If you did not request this, ignore this email.</p>
    </div>
  `;

  const transporter = await getTransporter();
  if (!transporter) {
    console.warn('[Email] SMTP not configured. Password reset OTP for', to, '=>', otp);
    return { sent: false, reason: 'SMTP not configured' };
  }

  try {
    await transporter.sendMail({
      from: cfg.from,
      to,
      subject,
      text,
      html
    });
    return { sent: true };
  } catch (error) {
    console.error('[Email] Failed to send password reset OTP:', error.message);
    console.warn('[Email] Password reset OTP for', to, '=>', otp);
    return { sent: false, reason: error.message || 'SMTP send failed' };
  }
}

module.exports = {
  getSmtpConfig,
  sendRegistrationOtpEmail,
  sendPasswordResetOtpEmail,
  sendNotificationEmail
};
