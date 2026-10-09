"use strict";
// Isolated browser-harness fixtures only. Never included by application pages.
(() => {
  const key = "selcore-test-session",
    listeners = new Set();
  const state = (window.__authFixture = {
    calls: {},
    profileMissing: false,
    profileDenied: false,
    userError: false,
  });
  const idA = "11111111-1111-4111-8111-111111111111",
    idB = "22222222-2222-4222-8222-222222222222";
  const account = (email) => ({
    id: email.startsWith("second") ? idB : idA,
    email,
    email_confirmed_at: email.startsWith("unverified")
      ? null
      : "2026-10-08T00:00:00Z",
    created_at: "2026-10-01T00:00:00Z",
    is_anonymous: false,
    user_metadata: { full_name: "Test Customer" },
  });
  const session = () => JSON.parse(localStorage.getItem(key) || "null");
  const emit = (event) => listeners.forEach((fn) => fn(event, session()));
  const call = (name) => (state.calls[name] = (state.calls[name] || 0) + 1);
  const okay = (data) => ({ data, error: null });
  const delay = () => new Promise((resolve) => setTimeout(resolve, 10));
  const set = (customer) => {
    localStorage.setItem(
      key,
      JSON.stringify({
        user: customer,
        access_token: "local-test-token",
        expires_at: 9999999999,
      }),
    );
  };
  const api = {
    onAuthStateChange: (fn) => {
      listeners.add(fn);
      return {
        data: { subscription: { unsubscribe: () => listeners.delete(fn) } },
      };
    },
    getSession: async () => okay({ session: session() }),
    getUser: async () =>
      state.userError
        ? { data: { user: null }, error: { code: "network" } }
        : okay({ user: session()?.user || null }),
    signUp: async (input) => {
      call("signUp");
      await delay();
      return input.email.startsWith("existing")
        ? { data: {}, error: { code: "user_already_exists" } }
        : okay({ user: account(input.email), session: null });
    },
    signInWithPassword: async (input) => {
      call("login");
      await delay();
      if (input.password !== "SafeTest123")
        return { data: {}, error: { code: "invalid_credentials" } };
      const customer = account(input.email);
      if (!customer.email_confirmed_at)
        return { data: {}, error: { code: "email_not_confirmed" } };
      set(customer);
      emit("SIGNED_IN");
      return okay({ user: customer, session: session() });
    },
    signOut: async () => {
      call("logout");
      localStorage.removeItem(key);
      emit("SIGNED_OUT");
      return okay({});
    },
    resend: async () => {
      call("resend");
      await delay();
      return okay({});
    },
    resetPasswordForEmail: async () => {
      call("recovery");
      await delay();
      return okay({});
    },
    updateUser: async () => {
      call("updatePassword");
      await delay();
      return okay({ user: session()?.user });
    },
    signInWithOAuth: async () => {
      call("google");
      return okay({ url: "http://127.0.0.1/mock-google" });
    },
    exchangeCodeForSession: async (code) => {
      call("exchange");
      if (code === "expired")
        return { data: {}, error: { code: "otp_expired" } };
      set(account("customer@example.invalid"));
      emit(code === "recovery" ? "PASSWORD_RECOVERY" : "SIGNED_IN");
      return okay({
        session: session(),
        redirectType: code === "recovery" ? "recovery" : null,
      });
    },
  };
  window.SelcoreSupabase.auth = api;
  const nativeFrom = window.SelcoreSupabase.from.bind(window.SelcoreSupabase);
  const profiles = new Map();
  state.dropProfile = () => profiles.delete(session()?.user?.id);
  window.SelcoreSupabase.from = (table) => {
    if (table !== "profiles") return nativeFrom(table);
    let owner = null,
      mode = "select",
      payload = null;
    const query = {
      select: () => query,
      eq: (column, value) => {
        state.lastProfileFilter = { column, value };
        owner = value;
        return query;
      },
      insert: (value) => {
        mode = "insert";
        payload = value;
        owner = value.id;
        return query;
      },
      update: (value) => {
        mode = "update";
        payload = value;
        return query;
      },
      maybeSingle: () => run(),
      single: () => run(),
    };
    async function run() {
      call("profile");
      await delay();
      const customer = session()?.user;
      if (state.profileDenied || !customer || owner !== customer.id)
        return { data: null, error: { code: "42501" } };
      if (!profiles.has(owner) && !state.profileMissing)
        profiles.set(owner, {
          id: owner,
          full_name: "Test Customer",
          avatar_url: null,
          created_at: customer.created_at,
          updated_at: customer.created_at,
        });
      if (mode === "insert" && profiles.has(owner))
        return { data: null, error: { code: "23505" } };
      if (mode === "insert") call("profileInsert");
      if (mode === "insert")
        profiles.set(owner, {
          ...payload,
          created_at: customer.created_at,
          updated_at: customer.created_at,
        });
      if (mode === "update" && profiles.has(owner))
        profiles.set(owner, { ...profiles.get(owner), ...payload });
      return okay(profiles.get(owner) || null);
    }
    return query;
  };
})();
