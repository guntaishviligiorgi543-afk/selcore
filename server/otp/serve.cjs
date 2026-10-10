"use strict";
// LOCAL PREPARATION. Refuses the public hosted Auth URL; cutover requires approval.
const http = require("node:http"),
  { Pool } = require("pg");
const { requireActivationApproval, listenOptions } = require("./runtime.cjs");
const { secrets } = require("./crypto.cjs"),
  { Store } = require("./store.cjs"),
  { Gateway } = require("./gateway.cjs"),
  { nativeAuth } = require("./native.cjs"),
  { smtpMail } = require("./mail.cjs"),
  { handler } = require("./http.cjs");
async function start() {
  // Must run before examining credentials, contacting services, or listening.
  requireActivationApproval();
  const env = process.env;
  const listen = listenOptions(env);
  const native = nativeAuth({
    origin: env.SELCORE_PRIVATE_SUPABASE_ORIGIN,
    publishableKey: env.SELCORE_PRIVATE_PUBLISHABLE_KEY,
    administrativeKey: env.SELCORE_PRIVATE_ADMIN_KEY,
  });
  const secret = secrets({
    hmacKey: Buffer.from(env.SELCORE_OTP_HMAC_KEY || "", "base64"),
    encryptionKey: Buffer.from(env.SELCORE_OTP_ENCRYPTION_KEY || "", "base64"),
  });
  if (!env.SELCORE_OTP_DATABASE_URL)
    throw Error("Dedicated server database credentials are required.");
  const databaseUrl = new URL(env.SELCORE_OTP_DATABASE_URL);
  const localDatabase = ["localhost", "127.0.0.1", "[::1]"].includes(
    databaseUrl.hostname,
  );
  if (!localDatabase)
    for (const option of [
      "ssl",
      "sslmode",
      "sslcert",
      "sslkey",
      "sslrootcert",
      "uselibpqcompat",
    ])
      databaseUrl.searchParams.delete(option);
  const pool = new Pool({
    connectionString: databaseUrl.href,
    max: 5,
    ...(localDatabase ? {} : { ssl: { rejectUnauthorized: true } }),
  });
  const role = (
    await pool.query(
      "select pg_has_role(current_user,'selcore_otp_worker','usage') as worker,current_user,rolsuper,rolbypassrls,rolcreaterole,rolcreatedb from pg_roles where rolname=current_user",
    )
  ).rows[0];
  if (
    !role.worker ||
    role.rolsuper ||
    role.rolbypassrls ||
    role.rolcreaterole ||
    role.rolcreatedb ||
    ["postgres", "service_role", "supabase_admin"].includes(role.current_user)
  )
    throw Error("Use a dedicated least-privileged OTP worker login.");
  const mail = smtpMail({
    user: env.SELCORE_SMTP_USER,
    password: env.SELCORE_SMTP_PASSWORD,
    from: env.SELCORE_SMTP_FROM,
    port: Number(env.SELCORE_SMTP_PORT || 465),
  });
  const gateway = new Gateway({
    store: new Store(pool),
    secrets: secret,
    native,
    mail,
  });
  const server = http.createServer(
    handler(gateway, {
      origin: env.SELCORE_GATEWAY_ORIGIN,
      allowLocalHttp: env.SELCORE_LOCAL_HTTP === "true",
    }),
  );
  server.headersTimeout = 10000;
  server.requestTimeout = 30000;
  server.timeout = 30000;
  server.listen(listen.port, listen.host, () =>
    process.stdout.write("Selcore private authentication gateway started.\n"),
  );
  const stop = () => {
    server.close();
    mail.close();
    void pool.end();
  };
  process.on("SIGINT", stop);
  process.on("SIGTERM", stop);
}
start().catch(() => {
  process.stderr.write(
    "Gateway startup refused. OTP is disabled in this build; activation and private infrastructure require separate approval.\n",
  );
  process.exit(1);
});
