const nodemailer = require('nodemailer');
const config = require('../config');

let transporter = null;
if (config.email.provider === 'smtp' && config.email.smtp.host) {
  transporter = nodemailer.createTransport({
    host: config.email.smtp.host, port: config.email.smtp.port, secure: config.email.smtp.port === 465,
    auth: config.email.smtp.user ? { user: config.email.smtp.user, pass: config.email.smtp.pass } : undefined,
  });
}

async function enviar({ to, subject, text, html }) {
  if (!transporter) { console.log(`[EMAIL] a ${to} | ${subject}\n${text}`); return; }
  await transporter.sendMail({ from: config.email.from, to, subject, text, html: html || `<pre style="font-family:sans-serif">${text}</pre>` });
}

module.exports = { enviar };
