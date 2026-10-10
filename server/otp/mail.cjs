"use strict";
const nodemailer = require("nodemailer");
function smtpMail(
  { user, password, from, port = 465 },
  factory = nodemailer.createTransport,
) {
  if (
    !user ||
    !password ||
    !/^[^\s@<>\r\n]+@[^\s@<>\r\n]+$/.test(from || "") ||
    ![465, 587].includes(port)
  )
    throw Error(
      "A verified Resend SMTP sender and server-only credentials are required.",
    );
  const transport = factory({
    host: "smtp.resend.com",
    port,
    secure: port === 465,
    requireTLS: true,
    ignoreTLS: false,
    tls: { minVersion: "TLSv1.2", rejectUnauthorized: true },
    auth: { user, pass: password },
    logger: false,
    debug: false,
    connectionTimeout: 15000,
    socketTimeout: 15000,
  });
  return {
    async send(to, code, purpose) {
      if (!/^[0-9]{8}$/.test(code) || /[\r\n<>]/.test(to))
        throw Error("Invalid OTP delivery request.");
      await transport.sendMail({
        from,
        to,
        subject: "Selcore verification code",
        text: `Your Selcore ${purpose.replaceAll("_", " ")} code is ${code}. It expires in 10 minutes. Do not share this code. If you did not request it, ignore this message.`,
      });
    },
    close: () => transport.close(),
  };
}
module.exports = { smtpMail };
