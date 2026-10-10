"use strict";
// SOURCE GATE: environment variables cannot enable this unapproved build.
// Changing this constant requires a separately reviewed activation/cutover.
const serviceEnabled = false;
function requireActivationApproval() {
  if (!serviceEnabled) throw Error("OTP startup is disabled in this build.");
}
function listenOptions(env = process.env) {
  const railwayPort = env.PORT;
  const value = String(railwayPort ?? env.SELCORE_GATEWAY_PORT ?? 8081);
  if (!/^[1-9][0-9]{0,4}$/.test(value) || Number(value) > 65535)
    throw Error("A valid TCP port is required.");
  return {
    port: Number(value),
    host: railwayPort === undefined ? "127.0.0.1" : "0.0.0.0",
  };
}
module.exports = Object.freeze({
  serviceEnabled,
  requireActivationApproval,
  listenOptions,
});
