"use strict";
window.SelcoreAuth = (() => {
  const client = window.SelcoreSupabase;
  let user = null,
    status = "loading",
    recovery = false,
    message = "",
    generation = 0;
  let settingsPromise = null;
  const UUID =
    /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  const recoveryKey = "selcore-recovery-ffznkypurnocabqyxpps";
  function recoveryOwner() {
    try {
      return window.sessionStorage?.getItem(recoveryKey) || null;
    } catch {
      return null;
    }
  }
  function rememberRecovery(owner) {
    try {
      if (owner) window.sessionStorage?.setItem(recoveryKey, owner);
      else window.sessionStorage?.removeItem(recoveryKey);
    } catch {
      // This tab-local UI marker is optional; authorization still requires getUser().
    }
  }
  const snapshot = () => ({
    status,
    user: user ? { ...user } : null,
    recovery,
    message,
  });
  function publish() {
    document.dispatchEvent(new CustomEvent("selcore:auth-change"));
  }
  function safeError(error) {
    const code = error?.code;
    if (code === "email_not_confirmed")
      return "Please verify your email before signing in.";
    if (code === "invalid_credentials")
      return "Email or password is incorrect.";
    if (code === "same_password") return "Choose a different password.";
    if (code === "weak_password")
      return "Choose a stronger password with at least 8 characters.";
    if (
      ["otp_expired", "otp_disabled", "invalid_token", "invalid_otp"].includes(
        code,
      )
    )
      return "This code is invalid or expired. Request a new code.";
    if (
      ["over_email_send_rate_limit", "over_request_rate_limit"].includes(code)
    )
      return "Too many attempts. Please wait before trying again.";
    return "We could not complete this request. Please try again.";
  }
  function checked(result) {
    if (result.error) throw new Error(safeError(result.error));
    return result.data;
  }
  function validEmail(email) {
    return (
      typeof email === "string" &&
      /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) &&
      email.length <= 254
    );
  }
  function validatePassword(password, confirm) {
    if (
      typeof password !== "string" ||
      password.length < 8 ||
      password.length > 128
    )
      throw new Error("Use a password with 8 to 128 characters.");
    if (password !== confirm) throw new Error("Passwords must match.");
  }
  function validateName(name) {
    const length =
      typeof name === "string" ? Array.from(name.trim()).length : 0;
    if (length < 2 || length > 100)
      throw new Error("Enter your full name (2 to 100 characters).");
  }
  function profileName(value) {
    const name =
      typeof value === "string"
        ? Array.from(value.trim()).slice(0, 100).join("")
        : "";
    return Array.from(name).length >= 2 ? name : "Customer";
  }
  function redirectUrl() {
    const url = new URL("user.html", window.location.href);
    if (
      url.protocol !== "https:" &&
      !(
        url.protocol === "http:" &&
        ["localhost", "127.0.0.1"].includes(url.hostname)
      )
    )
      throw new Error("Sign-in requires HTTPS or a local development server.");
    return url.href;
  }
  function settings() {
    if (!settingsPromise)
      settingsPromise = fetch(`${client.supabaseUrl}/auth/v1/settings`, {
        headers: { apikey: client.supabaseKey },
        redirect: "error",
        signal: AbortSignal.timeout(15000),
      })
        .then((response) => {
          if (!response.ok)
            throw new Error(
              "Authentication settings are temporarily unavailable.",
            );
          return response.json();
        })
        .catch((error) => {
          settingsPromise = null;
          throw error;
        });
    return settingsPromise;
  }
  async function refresh() {
    const current = ++generation;
    const previousStatus = status;
    try {
      if (!client)
        throw new Error("Authentication is temporarily unavailable.");
      const session = checked(await client.auth.getSession()).session;
      const account = session
        ? checked(await client.auth.getUser()).user
        : null;
      if (current !== generation) return;
      if (
        account &&
        (!UUID.test(account.id) ||
          !account.email_confirmed_at ||
          account.is_anonymous)
      ) {
        await client.auth.signOut({ scope: "local" });
        throw new Error("Please verify your email before signing in.");
      }
      user = account;
      status = "ready";
      if (user) {
        if (recovery) rememberRecovery(user.id);
        else recovery = recoveryOwner() === user.id;
        if (!recovery) rememberRecovery(null);
      } else {
        recovery = false;
        rememberRecovery(null);
      }
      if (previousStatus === "error") message = "";
    } catch (error) {
      if (current !== generation) return;
      user = null;
      status = "error";
      message =
        "Authentication could not be verified. Please retry before using your account.";
    }
    publish();
  }
  function requireUser() {
    if (status !== "ready" || !user?.email_confirmed_at)
      throw new Error("Sign in with a verified email to use your account.");
    return user;
  }
  const listener = client?.auth.onAuthStateChange((event) => {
    if (event === "PASSWORD_RECOVERY") recovery = true;
    if (event === "SIGNED_OUT") {
      ++generation;
      user = null;
      recovery = false;
      rememberRecovery(null);
      status = "ready";
      publish();
    } else if (event !== "INITIAL_SESSION")
      setTimeout(() => {
        void refresh();
      }, 0);
  });
  async function initialize() {
    const url = new URL(window.location.href);
    const fragment = new URLSearchParams(url.hash.slice(1));
    const code = url.searchParams.get("code");
    const callbackError =
      url.searchParams.has("error") ||
      fragment.has("error") ||
      fragment.has("access_token") ||
      fragment.has("refresh_token") ||
      url.searchParams.has("token_hash");
    if (code || callbackError) {
      for (const key of [
        "code",
        "error",
        "error_code",
        "error_description",
        "type",
        "token_hash",
      ])
        url.searchParams.delete(key);
      url.hash = "";
      history.replaceState(null, "", url.pathname + url.search);
      try {
        if (!client || callbackError) throw new Error("Invalid callback");
        const data = checked(await client.auth.exchangeCodeForSession(code));
        if (data.redirectType === "recovery") {
          await client.auth.signOut({ scope: "local" });
          throw new Error("Recovery links are not used");
        }
        message = "Email verification or sign-in completed.";
      } catch {
        message =
          "This verification link is invalid or expired. For a password reset, request a new email code.";
      }
    }
    await refresh();
  }
  const ready = initialize();
  async function register({ name, email, password, confirm }) {
    validateName(name);
    if (!validEmail(email)) throw new Error("Enter a valid email address.");
    validatePassword(password, confirm);
    const configuration = await settings();
    if (
      configuration.disable_signup ||
      !configuration.external?.email ||
      configuration.mailer_autoconfirm !== false
    )
      throw new Error(
        "Email registration is not configured for verified accounts. Please try again later.",
      );
    const result = await client.auth.signUp({
      email: email.trim(),
      password,
      options: {
        data: { full_name: name.trim() },
      },
    });
    if (
      result.error &&
      !["user_already_exists", "email_exists"].includes(result.error.code)
    )
      throw new Error(safeError(result.error));
    if (result.data?.session) {
      await client.auth.signOut({ scope: "local" });
      throw new Error(
        "Email verification is required before using your account.",
      );
    }
    return "If this address can be registered, check your email for an 8-digit verification code. Existing customers can sign in or reset their password.";
  }
  async function login(email, password) {
    if (!validEmail(email) || !password)
      throw new Error("Enter your email and password.");
    checked(
      await client.auth.signInWithPassword({ email: email.trim(), password }),
    );
    recovery = false;
    rememberRecovery(null);
    message = "";
    await refresh();
    requireUser();
  }
  async function logout() {
    checked(await client.auth.signOut({ scope: "local" }));
    ++generation;
    user = null;
    recovery = false;
    rememberRecovery(null);
    status = "ready";
    message = "You have signed out.";
    publish();
  }
  async function resend(email) {
    if (!validEmail(email)) throw new Error("Enter a valid email address.");
    checked(
      await client.auth.resend({
        type: "signup",
        email: email.trim(),
      }),
    );
    return "If verification is available for this address, a new code has been requested.";
  }
  async function verifyRegistrationOtp(email, token) {
    if (!validEmail(email)) throw new Error("Request a new verification code.");
    if (typeof token !== "string" || !/^\d{8}$/.test(token))
      throw new Error("Enter the 8-digit code from your email.");
    const data = checked(
      await client.auth.verifyOtp({
        email: email.trim(),
        token,
        type: "email",
      }),
    );
    const account = checked(await client.auth.getUser()).user;
    if (
      !data.session ||
      !account ||
      account.id !== data.user?.id ||
      !account.email_confirmed_at
    ) {
      await client.auth.signOut({ scope: "local" });
      throw new Error("This verification session is no longer valid. Request a new code.");
    }
    recovery = false;
    rememberRecovery(null);
    await refresh();
    requireUser();
  }
  async function recover(email) {
    if (!validEmail(email)) throw new Error("Enter a valid email address.");
    checked(await client.auth.resetPasswordForEmail(email.trim()));
    return "If an account exists, a recovery code has been requested.";
  }
  async function verifyRecoveryOtp(email, token) {
    if (!validEmail(email)) throw new Error("Request a new recovery code.");
    if (typeof token !== "string" || !/^\d{8}$/.test(token))
      throw new Error("Enter the 8-digit code from your email.");
    const data = checked(
      await client.auth.verifyOtp({
        email: email.trim(),
        token,
        type: "recovery",
      }),
    );
    const account = checked(await client.auth.getUser()).user;
    if (!data.session || !account || account.id !== data.user?.id) {
      await client.auth.signOut({ scope: "local" });
      throw new Error("This recovery session is no longer valid. Request a new code.");
    }
    recovery = true;
    rememberRecovery(account.id);
    await refresh();
    if (!recovery || user?.id !== account.id)
      throw new Error("This recovery session is no longer valid. Request a new code.");
  }
  async function updatePassword(password, confirm, currentPassword) {
    const account = requireUser();
    validatePassword(password, confirm);
    const attributes = { password };
    if (recovery) {
      const session = checked(await client.auth.getSession()).session;
      const verified = checked(await client.auth.getUser()).user;
      if (
        !session ||
        !verified ||
        verified.id !== account.id ||
        recoveryOwner() !== account.id
      )
        throw new Error("This recovery session is no longer valid. Request a new code.");
    } else {
      if (typeof currentPassword !== "string" || !currentPassword)
        throw new Error("Enter your current password.");
      // Native password authentication also covers sessions whose update endpoint
      // exempts current-password checks (for example email OTP sessions).
      const authenticated = checked(await client.auth.signInWithPassword({
        email: account.email,
        password: currentPassword,
      }));
      if (authenticated.user?.id !== account.id)
        throw new Error("Please sign in again before changing your password.");
      attributes.current_password = currentPassword;
    }
    checked(await client.auth.updateUser(attributes));
    if (recovery) checked(await client.auth.signOut({ scope: "local" }));
    if (recovery) user = null;
    recovery = false;
    rememberRecovery(null);
    message = "";
    publish();
  }
  async function google() {
    const configuration = await settings();
    if (!configuration.external?.google)
      throw new Error(
        "Google sign-in is not configured yet. Please use email sign-in.",
      );
    checked(
      await client.auth.signInWithOAuth({
        provider: "google",
        options: { redirectTo: redirectUrl() },
      }),
    );
  }
  async function changeEmail(email) {
    const account = requireUser();
    if (recovery) throw new Error("Finish password recovery before changing your email.");
    email = email.trim();
    if (!validEmail(email)) throw new Error("Enter a valid email address.");
    if (email.toLowerCase() === account.email.toLowerCase())
      throw new Error("Choose a different email address.");
    checked(await client.auth.updateUser({ email }, { emailRedirectTo: redirectUrl() }));
    await refresh();
    return "Verification requested. Follow the instructions sent to your current and new email addresses. Your email stays unchanged until Supabase confirms the change.";
  }
  async function verifyEmailChange(email, token) {
    const account = requireUser();
    if (recovery) throw new Error("Finish password recovery before changing your email.");
    if (![account.email, account.new_email].includes(email.trim()))
      throw new Error("Select an address belonging to your pending email change.");
    if (!validEmail(email) || !/^\d{8}$/.test(token))
      throw new Error("Enter the 8-digit code sent to the selected address.");
    // The first secure confirmation can succeed without returning a user/session.
    const data = checked(await client.auth.verifyOtp({ email: email.trim(), token, type: "email_change" }));
    if (data.user && data.user.id !== account.id) {
      await logout();
      throw new Error("Your account changed. Sign in again.");
    }
    await refresh();
  }
  async function resendEmailChange(email) {
    const account = requireUser();
    if (recovery || email.trim() !== account.email || !account.new_email)
      throw new Error("Request an email change from your account first.");
    if (!validEmail(email)) throw new Error("Enter a valid email address.");
    checked(await client.auth.resend({ type: "email_change", email: email.trim(), options: { emailRedirectTo: redirectUrl() } }));
  }
  async function getProfile(attempt = 0) {
    const account = requireUser();
    let response = await client
      .from("profiles")
      .select("id,full_name,avatar_url,created_at,updated_at")
      .eq("id", account.id)
      .maybeSingle();
    if (response.error)
      throw new Error("Your profile is unavailable. Please try again later.");
    if (!response.data) {
      response = await client
        .from("profiles")
        .insert({
          id: account.id,
          full_name: profileName(account.user_metadata?.full_name),
        })
        .select("id,full_name,avatar_url,created_at,updated_at")
        .single();
      if (response.error?.code === "23505" && attempt < 1)
        return getProfile(attempt + 1);
    }
    if (response.error || response.data?.id !== account.id)
      throw new Error("Your profile could not be loaded.");
    if (user?.id !== account.id)
      throw new Error("Your account changed. Please try again.");
    return response.data;
  }
  async function saveProfile(name) {
    validateName(name);
    const account = requireUser();
    const response = await client
      .from("profiles")
      .update({ full_name: name.trim() })
      .eq("id", account.id)
      .select("id,full_name,avatar_url,created_at,updated_at")
      .single();
    if (
      response.error ||
      response.data?.id !== account.id ||
      user?.id !== account.id
    )
      throw new Error("Your profile could not be saved. Please try again.");
    return response.data;
  }
  window.addEventListener("pagehide", (event) => {
    if (!event.persisted) listener?.data.subscription.unsubscribe();
  });
  window.addEventListener("pageshow", (event) => {
    if (event.persisted) {
      ++generation;
      user = null;
      status = "loading";
      publish();
      void refresh();
    }
  });
  return Object.freeze({
    ready,
    snapshot,
    refresh,
    register,
    login,
    logout,
    resend,
    verifyRegistrationOtp,
    recover,
    verifyRecoveryOtp,
    updatePassword,
    google,
    changeEmail,
    verifyEmailChange,
    resendEmailChange,
    getProfile,
    saveProfile,
    validEmail,
    validatePassword,
  });
})();
