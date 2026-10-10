"use strict";
// A dedicated, least-privileged database login must inherit selcore_otp_worker.
// No public RPC or customer JWT can execute these private functions.
class Store {
  constructor(database) {
    this.database = database;
  }
  async call(name, values) {
    const allowed = new Set([
      "issue",
      "prepare",
      "verify",
      "consume",
      "approve",
      "status",
      "session_save",
      "session_read",
      "session_delete",
      "cancel",
      "revoke",
      "revoke_user",
      "rate",
    ]);
    if (!allowed.has(name)) throw Error("Unknown OTP operation.");
    const sql = `select private.selcore_otp_${name}(${values.map((_, i) => "$" + (i + 1)).join(",")}) as result`;
    return (await this.database.query(sql, values)).rows[0].result;
  }
}
module.exports = { Store };
