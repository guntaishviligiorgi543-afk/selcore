"use strict";
const crypto = require("node:crypto");
function secrets({ hmacKey, encryptionKey }) {
  if (
    !Buffer.isBuffer(hmacKey) ||
    hmacKey.length < 32 ||
    !Buffer.isBuffer(encryptionKey) ||
    encryptionKey.length !== 32 ||
    crypto.timingSafeEqual(hmacKey.subarray(0, 32), encryptionKey)
  )
    throw Error("Independent server HMAC and encryption keys are required.");
  const digest = (...parts) =>
    crypto
      .createHmac("sha256", hmacKey)
      .update(JSON.stringify(parts))
      .digest("hex");
  function seal(value) {
    const iv = crypto.randomBytes(12);
    const cipher = crypto.createCipheriv("aes-256-gcm", encryptionKey, iv);
    cipher.setAAD(Buffer.from("selcore-otp-v1"));
    const bytes = Buffer.concat([
      cipher.update(JSON.stringify(value), "utf8"),
      cipher.final(),
    ]);
    return Buffer.concat([iv, cipher.getAuthTag(), bytes]).toString(
      "base64url",
    );
  }
  function open(value) {
    const bytes = Buffer.from(value, "base64url");
    if (bytes.length < 29) throw Error("Invalid encrypted server state.");
    const decipher = crypto.createDecipheriv(
      "aes-256-gcm",
      encryptionKey,
      bytes.subarray(0, 12),
    );
    decipher.setAAD(Buffer.from("selcore-otp-v1"));
    decipher.setAuthTag(bytes.subarray(12, 28));
    return JSON.parse(
      Buffer.concat([
        decipher.update(bytes.subarray(28)),
        decipher.final(),
      ]).toString("utf8"),
    );
  }
  return Object.freeze({ digest, seal, open });
}
const code = () => crypto.randomInt(0, 100000000).toString().padStart(8, "0");
const handle = () => crypto.randomBytes(32).toString("base64url");
module.exports = { secrets, code, handle, id: crypto.randomUUID };
