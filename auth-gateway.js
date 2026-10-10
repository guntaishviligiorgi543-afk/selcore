"use strict";
window.SelcoreAuthGateway = (() => {
  // OFF until private Auth ingress, database gates and real-flow tests are approved.
  // This flag selects the adapter; all security decisions live on the server.
  const enabled = false;
  function create() {
    let state = { status: "loading", user: null, recovery: false, message: "" };
    let pendingPassword = null;
    let generation = 0;
    const snapshot = () => structuredClone(state);
    const publish = () =>
      document.dispatchEvent(new CustomEvent("selcore:auth-change"));
    async function request(path, body) {
      const response = await fetch("/api/auth/" + path, {
        method: body === undefined ? "GET" : "POST",
        credentials: "same-origin",
        cache: "no-store",
        redirect: "error",
        headers:
          body === undefined ? {} : { "Content-Type": "application/json" },
        ...(body === undefined ? {} : { body: JSON.stringify(body) }),
        signal: AbortSignal.timeout(20000),
      });
      const data = await response.json();
      if (!response.ok)
        throw new Error(
          data.message || "Authentication is temporarily unavailable.",
        );
      return data;
    }
    async function update(path, body, notify = () => true) {
      const current = ++generation;
      const data = await request(path, body);
      if (current === generation) {
        state = data;
        if (notify(data)) publish();
      }
      return data;
    }
    const validEmail = (value) =>
      typeof value === "string" &&
      /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value.trim()) &&
      value.length <= 254;
    function validatePassword(value, confirm) {
      if (typeof value !== "string" || value.length < 8 || value.length > 128)
        throw Error("Use a password with 8 to 128 characters.");
      if (value !== confirm) throw Error("Passwords must match.");
    }
    async function refresh() {
      try {
        await update("state");
      } catch {
        state = {
          status: "error",
          user: null,
          recovery: false,
          message:
            "Authentication could not be verified. Please retry before using your account.",
        };
        publish();
      }
    }
    const ready = refresh();
    const api = {
      ready,
      snapshot,
      refresh,
      validEmail,
      validatePassword,
      register: (body) => update("register", body),
      login: (email, password) => update("login", { email, password }),
      logout: () => {
        pendingPassword = null;
        return update("logout", {});
      },
      resend: () => update("resend", {}),
      recover: (email) => update("recover", { email }),
      stepup: () => update("stepup", {}),
      changeEmail: (email) => update("email/request", { email }),
      cancelOtp: () => {
        pendingPassword = null;
        return update("cancel", {});
      },
      async updatePassword(value, confirm) {
        validatePassword(value, confirm);
        if (state.recovery)
          return update("password/commit", { password: value, confirm });
        pendingPassword = value;
        try {
          return await update("password/request", { password: value, confirm });
        } catch (e) {
          pendingPassword = null;
          throw e;
        }
      },
      async verifyOtp(code) {
        const challengeId = state.otp?.id;
        const data = await update(
          "verify",
          { id: challengeId, code },
          (result) => !result.passwordAuthorized,
        );
        if (data.passwordAuthorized) {
          try {
            if (pendingPassword === null)
              throw Error("Restart the password change in this tab.");
            const value = pendingPassword;
            pendingPassword = null;
            return await update("password/commit", {
              authorization: challengeId,
              password: value,
              confirm: value,
            });
          } catch (error) {
            pendingPassword = null;
            state = {
              ...data,
              message:
                error.message + " Restart the password change before retrying.",
            };
            publish();
            throw error;
          }
        }
        return data;
      },
      getProfile: () => request("profile"),
      saveProfile: (name) => request("profile", { name }),
      google: () => {
        throw Error(
          "Google requires the private gateway callback to be configured and verified before cutover.",
        );
      },
    };
    window.addEventListener("pagehide", () => {
      pendingPassword = null;
    });
    window.addEventListener("pageshow", (event) => {
      if (event.persisted) void refresh();
    });
    return Object.freeze(api);
  }
  return Object.freeze({ enabled, create });
})();
