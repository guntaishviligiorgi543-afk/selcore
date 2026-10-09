"use strict";
// Executes real PostgreSQL in memory. No remote connection or credential is used.
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const { PGlite } = require("@electric-sql/pglite");
const root = path.resolve(__dirname, "../..");
const deployedSnapshot = process.argv.includes("--deployed-snapshot");
const migration = fs.readFileSync(
  path.join(
    root,
    deployedSnapshot
      ? "docs/phase43-production-profiles.sql"
      : "supabase/migrations/20261008000000_selcore_customer_profiles.sql",
  ),
  "utf8",
);
const results = [];
function check(name, actual, expected) {
  assert.deepEqual(actual, expected, name);
  results.push({ name, passed: true });
}
const ids = Array.from(
  { length: 30 },
  (_, i) => `00000000-0000-4000-8000-${String(i + 1).padStart(12, "0")}`,
);
const setup = `
  create role audit_admin superuser;
  create role supabase_auth_admin nologin;
  create role anon nologin nobypassrls;
  create role authenticated nologin nobypassrls;
  create schema auth; create schema storage;
  grant usage on schema public, auth to anon, authenticated;
  create table auth.users (
    id uuid primary key, email_confirmed_at timestamptz,
    raw_user_meta_data jsonb, created_at timestamptz,
    is_anonymous boolean not null default false
  );
  alter table auth.users enable row level security;
  create function auth.uid() returns uuid language sql stable
    set search_path = '' as $$
    select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid
  $$;
  alter table auth.users owner to supabase_auth_admin;
  alter function auth.uid() owner to supabase_auth_admin;
  grant usage on schema auth to postgres,supabase_auth_admin;
  grant select,insert,update,delete,references,trigger on auth.users to postgres;
  create table public.categories (id integer primary key, label text);
  create table public.brands (id integer primary key, label text);
  create table public.products (id integer primary key, price numeric);
  create table public.product_images (id integer primary key, product_id integer);
  create table storage.buckets (id text primary key, public boolean);
  create table storage.objects (id integer primary key, bucket_id text, name text);
  insert into public.categories select i, 'Category ' || i from generate_series(1,4) i;
  insert into public.brands select i, 'Brand ' || i from generate_series(1,17) i;
  insert into public.products select i, i*10 from generate_series(1,24) i;
  insert into public.product_images select i,i from generate_series(1,24) i;
  insert into storage.buckets values ('product-images',true);
  insert into storage.objects select i,'product-images',i || '.png' from generate_series(1,24) i;
  alter table public.categories enable row level security;
  alter table public.brands enable row level security;
  alter table public.products enable row level security;
  alter table public.product_images enable row level security;
  alter table storage.buckets enable row level security;
  alter table storage.objects enable row level security;
  create policy catalogue_read on public.products for select to anon,authenticated using (true);
  grant select on public.categories,public.brands,public.products,public.product_images to anon,authenticated;
  set session authorization audit_admin;
  set role postgres;
`;
async function snapshot(db) {
  const relations = [
    "categories",
    "brands",
    "products",
    "product_images",
    "buckets",
    "objects",
  ];
  const rows = {};
  for (const name of relations) {
    const schema = ["buckets", "objects"].includes(name) ? "storage" : "public";
    rows[`${schema}.${name}`] = (
      await db.query(`select * from ${schema}.${name} order by id`)
    ).rows;
  }
  const structure = await db.query(`
    select c.relname,c.relrowsecurity,c.relacl::text,
      (select json_agg(row(a.attname,a.atttypid,a.attnotnull) order by a.attnum)
       from pg_attribute a where a.attrelid=c.oid and a.attnum>0) as columns,
      (select json_agg(pg_get_constraintdef(k.oid) order by k.conname)
       from pg_constraint k where k.conrelid=c.oid) as constraints,
      (select json_agg(row(p.polname,p.polcmd,p.polroles::text,pg_get_expr(p.polqual,p.polrelid)) order by p.polname)
       from pg_policy p where p.polrelid=c.oid) as policies
    from pg_class c join pg_namespace n on n.oid=c.relnamespace
    where (n.nspname='public' and c.relname in ('categories','brands','products','product_images'))
       or (n.nspname='storage' and c.relname in ('buckets','objects'))
    order by n.nspname,c.relname
  `);
  return { rows, structure: structure.rows };
}
async function denied(db, name, sql, params = [], code = "42501") {
  let caught;
  try {
    if (sql === migration) await db.exec(sql);
    else await db.query(sql, params);
  } catch (error) {
    caught = error.code;
  }
  check(name, caught, code);
}
async function role(db, name, id = "") {
  await db.exec("reset role");
  await db.exec(`set role ${name}`);
  await db.query("select set_config('request.jwt.claim.sub',$1,false)", [id]);
}
async function sqlTests() {
  const db = new PGlite();
  await db.exec(setup);
  const version = (await db.query("select version() as version")).rows[0]
    .version;
  const insertUser = async (
    id,
    metadata,
    verified = true,
    anonymous = false,
    date = "2026-10-01T00:00:00Z",
  ) => {
    await role(db, "supabase_auth_admin");
    const response = await db.query(
      "insert into auth.users values ($1,$2,$3,$4,$5)",
      [id, verified ? "2026-10-01T00:00:00Z" : null, metadata, date, anonymous],
    );
    await role(db, "postgres");
    return response;
  };
  check(
    "Exact migration executes as postgres owner",
    (await db.query("select current_user as owner")).rows,
    [{ owner: "postgres" }],
  );
  await insertUser(ids[0], { full_name: " Existing Customer " });
  await insertUser(ids[1], { full_name: "OAuth Customer" });
  await insertUser(
    ids[2],
    { full_name: "Unverified Customer", verified: true },
    false,
  );
  await insertUser(ids[3], { full_name: "Anonymous Customer" }, true, true);
  await insertUser(ids[4], null, true, false, null);
  const baseline = await snapshot(db);
  await db.exec(migration);
  check(
    "Migration executes and backfills every existing Auth user",
    (await db.query("select count(*)::int as n from public.profiles")).rows[0]
      .n,
    5,
  );
  check(
    "Profiles RLS enabled",
    (
      await db.query(
        "select relrowsecurity from pg_class where oid='public.profiles'::regclass",
      )
    ).rows[0].relrowsecurity,
    true,
  );
  check(
    "Existing names trimmed without overwriting Auth",
    (
      await db.query("select full_name from public.profiles where id=$1", [
        ids[0],
      ])
    ).rows[0].full_name,
    "Existing Customer",
  );
  check(
    "Nullable Auth creation date backfills safely",
    (
      await db.query(
        "select created_at is not null as valid from public.profiles where id=$1",
        [ids[4]],
      )
    ).rows[0].valid,
    true,
  );
  check(
    "Profile FK uses UUID Auth ID with delete cascade",
    (
      await db.query(
        "select confdeltype,confrelid::regclass::text as target from pg_constraint where conrelid='public.profiles'::regclass and contype='f'",
      )
    ).rows,
    [{ confdeltype: "c", target: "auth.users" }],
  );
  const funcs = (
    await db.query(
      "select p.proname,p.prosecdef,p.proconfig,pg_get_userbyid(p.proowner) as owner from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='private' order by p.proname",
    )
  ).rows;
  check(
    "All private functions use postgres ownership and empty search_path",
    funcs.every(
      (f) => f.owner === "postgres" && f.proconfig.includes('search_path=""'),
    ),
    true,
  );
  check(
    "Only verification/new-profile helpers are SECURITY DEFINER",
    funcs.filter((f) => f.prosecdef).map((f) => f.proname),
    ["selcore_new_profile", "selcore_verified_customer"],
  );
  await role(db, "authenticated", ids[0]);
  check(
    "Verified owner SELECT",
    (await db.query("select id from public.profiles")).rows,
    [{ id: ids[0] }],
  );
  check(
    "Foreign profile SELECT returns no rows",
    (await db.query("select id from public.profiles where id=$1", [ids[1]]))
      .rows,
    [],
  );
  check(
    "Owner UPDATE permitted fields",
    (
      await db.query(
        "update public.profiles set full_name='Updated Customer',avatar_url='https://example.invalid/avatar.png' where id=$1 returning full_name,updated_at>=created_at as timestamp_ok",
        [ids[0]],
      )
    ).rows,
    [{ full_name: "Updated Customer", timestamp_ok: true }],
  );
  check(
    "Foreign UPDATE affects zero rows",
    (
      await db.query(
        "update public.profiles set full_name='Attacker' where id=$1 returning id",
        [ids[1]],
      )
    ).rows,
    [],
  );
  await denied(
    db,
    "ID UPDATE denied by column grants",
    "update public.profiles set id=$1 where id=$2",
    [ids[1], ids[0]],
  );
  await denied(
    db,
    "created_at UPDATE denied",
    "update public.profiles set created_at=now()",
  );
  await denied(
    db,
    "updated_at UPDATE denied",
    "update public.profiles set updated_at=now()",
  );
  await denied(db, "Customer DELETE denied", "delete from public.profiles");
  await denied(db, "Customer TRUNCATE denied", "truncate public.profiles");
  await denied(
    db,
    "Foreign INSERT denied by RLS",
    "insert into public.profiles(id,full_name) values($1,'Foreign Name')",
    [ids[1]],
  );
  await denied(
    db,
    "Customer cannot INSERT trusted timestamps",
    "insert into public.profiles(id,full_name,created_at) values($1,'Own Name',now())",
    [ids[0]],
  );
  await denied(
    db,
    "Customer cannot call metadata helper",
    "select private.selcore_profile_name('{}'::jsonb)",
  );
  await denied(
    db,
    "Customer cannot call signup helper",
    "select private.selcore_new_profile()",
  );
  await denied(
    db,
    "Customer cannot call timestamp helper",
    "select private.selcore_profile_timestamp()",
  );
  check(
    "Verification helper exposes only own verification boolean",
    (await db.query("select private.selcore_verified_customer() as verified"))
      .rows[0].verified,
    true,
  );
  await denied(
    db,
    "Blank names rejected",
    "update public.profiles set full_name=E'\\t\\n'",
    [],
    "23514",
  );
  await role(db, "postgres");
  await db.query("delete from public.profiles where id=$1", [ids[0]]);
  await role(db, "authenticated", ids[0]);
  check(
    "Missing-profile owner INSERT fallback succeeds",
    (
      await db.query(
        "insert into public.profiles(id,full_name) values($1,'Fallback Customer') returning id",
        [ids[0]],
      )
    ).rows,
    [{ id: ids[0] }],
  );
  await denied(
    db,
    "Duplicate fallback fails with unique violation",
    "insert into public.profiles(id,full_name) values($1,'Overwrite')",
    [ids[0]],
    "23505",
  );
  await denied(
    db,
    "One-character name rejected",
    "update public.profiles set full_name='X'",
    [],
    "23514",
  );
  await denied(
    db,
    "Oversized name rejected",
    "update public.profiles set full_name=repeat('X',101)",
    [],
    "23514",
  );
  await denied(
    db,
    "Insecure avatar URL rejected",
    "update public.profiles set avatar_url='javascript:alert(1)'",
    [],
    "23514",
  );
  await denied(
    db,
    "Empty HTTPS avatar host rejected",
    "update public.profiles set avatar_url='https://'",
    [],
    "23514",
  );
  await role(db, "authenticated", ids[1]);
  check(
    "OAuth verified owner SELECT",
    (await db.query("select full_name from public.profiles")).rows,
    [{ full_name: "OAuth Customer" }],
  );
  await role(db, "authenticated", ids[2]);
  check(
    "Unverified SELECT denied even with forged metadata flag",
    (await db.query("select * from public.profiles")).rows,
    [],
  );
  check(
    "Unverified UPDATE denied",
    (
      await db.query(
        "update public.profiles set full_name='Bypass' returning id",
      )
    ).rows,
    [],
  );
  await denied(
    db,
    "Unverified INSERT denied",
    "insert into public.profiles(id,full_name) values($1,'Bypass')",
    [ids[2]],
  );
  await role(db, "authenticated", ids[3]);
  check(
    "Supabase anonymous Auth user denied",
    (await db.query("select * from public.profiles")).rows,
    [],
  );
  await role(db, "anon");
  for (const [verb, sql] of [
    ["SELECT", "select * from public.profiles"],
    [
      "INSERT",
      `insert into public.profiles(id,full_name) values('${ids[0]}','Bypass')`,
    ],
    ["UPDATE", "update public.profiles set full_name='Bypass'"],
    ["DELETE", "delete from public.profiles"],
  ])
    await denied(db, `Anonymous ${verb} denied`, sql);
  await denied(
    db,
    "Anonymous cannot call verification helper",
    "select private.selcore_verified_customer()",
  );
  await role(db, "postgres");
  await db.query("update auth.users set email_confirmed_at=now() where id=$1", [
    ids[2],
  ]);
  await role(db, "authenticated", ids[2]);
  check(
    "Email confirmation grants existing owner access without profile resync",
    (await db.query("select full_name from public.profiles")).rows,
    [{ full_name: "Unverified Customer" }],
  );
  await role(db, "postgres");
  const metadata = [
    null,
    {},
    { full_name: null },
    { full_name: { role: "admin" } },
    { full_name: ["Admin"] },
    { full_name: 123 },
    { full_name: " \t\n\u00a0\ufeff" },
    { full_name: "X" },
    { full_name: "  New Customer  ", role: "admin", id: ids[0] },
    { full_name: "😀".repeat(110) },
    { full_name: "<script>alert('x')</script>" },
  ];
  for (let i = 0; i < metadata.length; i++) {
    await insertUser(ids[5 + i], metadata[i]);
    const expected =
      i < 8
        ? "Customer"
        : i === 8
          ? "New Customer"
          : i === 9
            ? "😀".repeat(100)
            : metadata[i].full_name;
    check(
      `Signup trigger safely handles metadata case ${i + 1}`,
      (
        await db.query("select full_name from public.profiles where id=$1", [
          ids[5 + i],
        ])
      ).rows[0].full_name,
      expected,
    );
  }
  // Test the exact signup function's ON CONFLICT branch with an isolated UPDATE trigger.
  await db.exec(
    "create trigger audit_duplicate after update on auth.users for each row execute function private.selcore_new_profile()",
  );
  await db.query("update auth.users set raw_user_meta_data=$1 where id=$2", [
    { full_name: "Do Not Overwrite" },
    ids[0],
  ]);
  check(
    "Duplicate trigger preserves existing customer profile",
    (
      await db.query("select full_name from public.profiles where id=$1", [
        ids[0],
      ])
    ).rows[0].full_name,
    "Fallback Customer",
  );
  await db.exec("drop trigger audit_duplicate on auth.users");
  await denied(
    db,
    "Reapplying migration fails explicitly",
    migration,
    [],
    "P0001",
  );
  await db.exec("rollback");
  check(
    "Failed reapplication preserves profile",
    (
      await db.query("select full_name from public.profiles where id=$1", [
        ids[0],
      ])
    ).rows[0].full_name,
    "Fallback Customer",
  );
  check(
    "Catalogue rows/schema/policies/grants and Storage remain unchanged",
    await snapshot(db),
    baseline,
  );
  await insertUser(ids[20], { full_name: "Delete Cascade" });
  await db.query("delete from auth.users where id=$1", [ids[20]]);
  check(
    "Auth deletion cascades only associated profile",
    (await db.query("select * from public.profiles where id=$1", [ids[20]]))
      .rows,
    [],
  );
  await db.close();
  // PGlite disallows ALTER ROLE. Use a distinct NOSUPERUSER owner to test
  // production-like privileges; substitute only the role name, never SQL logic.
  const leastPrivilege = new PGlite();
  await leastPrivilege.exec(setup);
  await leastPrivilege.exec(
    "create role audit_migration_owner nosuperuser bypassrls; grant create,usage on schema public to audit_migration_owner; grant usage on schema auth to audit_migration_owner; grant select,references,trigger on auth.users to audit_migration_owner",
  );
  const databaseName = (
    await leastPrivilege.query("select current_database() as name")
  ).rows[0].name;
  await leastPrivilege.exec(
    `grant create on database "${databaseName.replaceAll('"', '""')}" to audit_migration_owner`,
  );
  await role(leastPrivilege, "audit_migration_owner");
  check(
    "Supplemental owner is NOSUPERUSER with BYPASSRLS",
    (
      await leastPrivilege.query(
        "select rolsuper,rolbypassrls from pg_roles where rolname=current_user",
      )
    ).rows,
    [{ rolsuper: false, rolbypassrls: true }],
  );
  await leastPrivilege.exec(
    migration
      .replaceAll("'postgres'", "'audit_migration_owner'")
      .replace("authorization postgres", "authorization audit_migration_owner"),
  );
  check(
    "Supplemental non-superuser migration enables RLS",
    (
      await leastPrivilege.query(
        "select relrowsecurity from pg_class where oid='public.profiles'::regclass",
      )
    ).rows[0].relrowsecurity,
    true,
  );
  await role(leastPrivilege, "supabase_auth_admin");
  await leastPrivilege.query(
    "insert into auth.users(id,email_confirmed_at,raw_user_meta_data) values($1,now(),$2)",
    [ids[0], { full_name: "Provider Signup" }],
  );
  await role(leastPrivilege, "authenticated", ids[0]);
  check(
    "Auth-provider signup works with non-superuser definer owner",
    (await leastPrivilege.query("select full_name from public.profiles")).rows,
    [{ full_name: "Provider Signup" }],
  );
  await leastPrivilege.close();
  for (const collision of [
    "create table public.profiles(existing_data text); insert into public.profiles values('preserved')",
    "create schema private; create table private.existing_data(value text); insert into private.existing_data values('preserved')",
  ]) {
    const incompatible = new PGlite();
    await incompatible.exec(setup + collision);
    await denied(
      incompatible,
      "Incompatible existing schema fails explicitly",
      migration,
      [],
      "P0001",
    );
    await incompatible.exec("rollback");
    const table = collision.startsWith("create table")
      ? "public.profiles"
      : "private.existing_data";
    check(
      "Incompatible-schema failure preserves existing data",
      (await incompatible.query(`select * from ${table}`)).rows.length,
      1,
    );
    await incompatible.close();
  }
  return version;
}
async function frontendTests() {
  const account = {
    id: ids[0],
    email_confirmed_at: "2026-10-01",
    is_anonymous: false,
    user_metadata: {},
  };
  let inserted = null,
    updated = null;
  const client = {
    auth: {
      onAuthStateChange: () => ({
        data: { subscription: { unsubscribe() {} } },
      }),
      getSession: async () => ({ data: { session: { user: account } } }),
      getUser: async () => ({ data: { user: account } }),
    },
    from: () => {
      const query = {
        select: () => query,
        eq: () => query,
        maybeSingle: async () => ({ data: null }),
        insert: (value) => {
          inserted = value;
          return query;
        },
        update: (value) => {
          updated = value;
          return query;
        },
        single: async () => ({
          data: { id: account.id, ...(updated || inserted) },
        }),
      };
      return query;
    },
  };
  const window = {
    SelcoreSupabase: client,
    location: { href: "http://127.0.0.1:8080/user.html" },
    addEventListener() {},
  };
  vm.runInNewContext(
    fs.readFileSync(path.join(root, "auth-service.js"), "utf8"),
    {
      window,
      document: { dispatchEvent() {} },
      CustomEvent: class {},
      URL,
      URLSearchParams,
      setTimeout,
      history: { replaceState() {} },
    },
  );
  await window.SelcoreAuth.ready;
  for (const value of [
    undefined,
    null,
    {},
    ["admin"],
    123,
    " \t\n\u00a0\ufeff",
    "X",
    "  Real Name  ",
    "😀".repeat(110),
  ]) {
    account.user_metadata = { full_name: value };
    inserted = null;
    updated = null;
    const profile = await window.SelcoreAuth.getProfile();
    const expected =
      typeof value !== "string" || Array.from(value.trim()).length < 2
        ? "Customer"
        : Array.from(value.trim()).slice(0, 100).join("");
    check(
      "Frontend missing-profile normalization agrees with SQL",
      profile.full_name,
      expected,
    );
    check(
      "Frontend fallback inserts only authenticated ID/name",
      Object.keys(inserted).sort(),
      ["full_name", "id"],
    );
    check(
      "Frontend fallback preserves authenticated UUID",
      inserted.id,
      account.id,
    );
  }
  const name = "😀".repeat(100);
  await window.SelcoreAuth.saveProfile(name);
  check(
    "Frontend accepts 100 Unicode characters matching SQL",
    updated.full_name,
    name,
  );
  check("Frontend updates only full_name", Object.keys(updated), ["full_name"]);
  await assert.rejects(window.SelcoreAuth.saveProfile(name + "😀"), /2 to 100/);
  results.push({
    name: "Frontend rejects over-100 Unicode characters",
    passed: true,
  });
}
(async () => {
  const version = await sqlTests();
  await frontendTests();
  const report = {
    date: new Date().toISOString(),
    runtime: version,
    migrationSource: deployedSnapshot
      ? "Read-only snapshot of deployed 20261009140454; executed only in isolated in-memory PostgreSQL"
      : "Local review draft; isolated PostgreSQL only",
    productionDatabase: "Not modified; read-only audit only",
    limitations:
      "In-memory PostgreSQL 18.3 with minimal Auth fixtures; production is 17.11. Not a live GoTrue/PostgREST/email/OAuth integration test.",
    passed: results.length,
    failed: 0,
    results,
  };
  fs.writeFileSync(
    path.join(
      root,
      deployedSnapshot
        ? "docs/phase43-sql-results.json"
        : "docs/phase4-migration-test-results.json",
    ),
    JSON.stringify(report, null, 2) + "\n",
  );
  console.log(
    JSON.stringify({ runtime: version, passed: results.length, failed: 0 }),
  );
})().catch((error) => {
  console.error("Isolated profile audit failed:", error.message);
  process.exit(1);
});
