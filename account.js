"use strict";
(() => {
  const auth = window.SelcoreAuth,
    store = window.Selcore;
  if (!auth || !store) return;
  const q = (s) => document.querySelector(s),
    hero = q(".userHeroSec"),
    section = q(".userSec2"),
    signup = q(".signUpForm"),
    signin = q(".signInForm");
  const emailPanel = q("#emailPanel"),
    recoveryPanel = q("#recoveryPanel"),
    dashboard = q("#accountDashboard");
  let emailMode = "recovery",
    working = false,
    profileOwner = null,
    profileVersion = 0;
  function showForms(mode = "signin") {
    hero.style.display = "none";
    section.style.display = "flex";
    emailPanel.hidden = true;
    signup.classList.toggle("hidden", mode === "signin");
    signin.classList.toggle("hidden", mode !== "signin");
  }
  q(".toSign").addEventListener("click", () => showForms("signup"));
  q(".signUp").addEventListener("click", () => showForms("signup"));
  q(".signIn").addEventListener("click", () => showForms("signin"));
  q("#backToSignin").addEventListener("click", () => showForms("signin"));
  for (const [pid, cid] of [
    ["newPassword", "newPasswordConfirm"],
    ["recoveryPassword", "recoveryConfirm"],
  ]) {
    const password = q("#" + pid),
      confirm = q("#" + cid);
    const validate = () =>
      confirm.setCustomValidity(
        confirm.value && confirm.value !== password.value
          ? "Passwords must match."
          : "",
      );
    password.addEventListener("input", validate);
    confirm.addEventListener("input", validate);
  }
  function bindForm(selector, action, success = "") {
    const form = q(selector);
    store.showMessage(form, "");
    form.addEventListener("submit", async (event) => {
      event.preventDefault();
      if (working || !form.checkValidity()) {
        form.reportValidity();
        return;
      }
      working = true;
      const submit = form.querySelector('button[type="submit"]'),
        label = submit.textContent;
      submit.disabled = true;
      submit.textContent = "Please wait…";
      form.setAttribute("aria-busy", "true");
      store.showMessage(form, "Please wait…");
      try {
        const result = await action();
        store.showMessage(form, typeof result === "string" ? result : success);
      } catch (error) {
        store.showMessage(form, error.message || "Please try again.");
      } finally {
        form
          .querySelectorAll('input[type="password"], .passwordBox input')
          .forEach((input) => {
            input.value = "";
            input.type = "password";
            input.setCustomValidity("");
          });
        form.querySelectorAll(".togglePassword").forEach((button) => {
          button.classList.add("closed");
          button.setAttribute("aria-label", "Show password");
        });
        working = false;
        submit.disabled = false;
        submit.textContent = label;
        form.removeAttribute("aria-busy");
        if (selector === "#emailActionForm") updateCooldown();
      }
    });
  }
  bindForm("#signupForm", () => {
    if (!q("#terms").checked)
      throw new Error("Please agree to the Terms & Conditions.");
    return auth.register({
      name: q("#signupName").value,
      email: q("#signupEmail").value,
      password: q("#signupPassword").value,
      confirm: q("#confirmPassword").value,
    });
  });
  bindForm(
    "#signinForm",
    () => auth.login(q("#signinEmail").value, q("#signinPassword").value),
    "You have signed in.",
  );
  bindForm(
    "#changePasswordForm",
    () =>
      auth.updatePassword(
        q("#newPassword").value,
        q("#newPasswordConfirm").value,
      ),
    "Your password has been updated.",
  );
  bindForm(
    "#recoveryPasswordForm",
    () =>
      auth.updatePassword(
        q("#recoveryPassword").value,
        q("#recoveryConfirm").value,
      ),
    "Your password has been updated.",
  );
  bindForm(
    "#profileForm",
    async () => {
      const profile = await auth.saveProfile(q("#profileName").value);
      q("#accountWelcome").textContent = "Welcome, " + profile.full_name;
    },
    "Your profile has been saved.",
  );
  if (window.SelcoreAuthGateway?.enabled) {
    q("#emailChangeForm").hidden = false;
    bindForm("#emailChangeForm", () => auth.changeEmail(q("#newEmail").value));
  }
  const emailCooldowns = new Map();
  const cooldownKey = () => "selcore-" + emailMode + "-next";
  function nextAllowed() {
    try {
      return Math.max(
        Number(sessionStorage.getItem(cooldownKey())) || 0,
        emailCooldowns.get(cooldownKey()) || 0,
      );
    } catch {
      return emailCooldowns.get(cooldownKey()) || 0;
    }
  }
  function updateCooldown() {
    const button = q('#emailActionForm button[type="submit"]'),
      seconds = Math.max(0, Math.ceil((nextAllowed() - Date.now()) / 1000));
    button.disabled =
      seconds > 0 || q("#emailActionForm").hasAttribute("aria-busy");
    button.textContent =
      seconds > 0 ? "Try again in " + seconds + "s" : "Send email";
  }
  bindForm("#emailActionForm", () => {
    const email = q("#actionEmail").value;
    if (!auth.validEmail(email))
      throw new Error("Enter a valid email address.");
    if (nextAllowed() > Date.now())
      throw new Error("Please wait before requesting another email.");
    const next = Date.now() + 60000;
    emailCooldowns.set(cooldownKey(), next);
    try {
      sessionStorage.setItem(cooldownKey(), String(next));
    } catch {
      /* Server enforces rate limits. */
    }
    return emailMode === "verification"
      ? auth.resend(email)
      : auth.recover(email);
  });
  const timer = setInterval(updateCooldown, 1000);
  window.addEventListener("pagehide", (event) => {
    if (!event.persisted) clearInterval(timer);
  });
  function showEmail(mode) {
    emailMode = mode;
    hero.style.display = "none";
    section.style.display = "none";
    emailPanel.hidden = false;
    q("#emailPanelTitle").textContent =
      mode === "verification" ? "Resend verification" : "Password recovery";
    q("#actionEmail").value =
      auth.snapshot().user?.email ||
      q("#signinEmail").value ||
      q("#signupEmail").value;
    updateCooldown();
  }
  q("#showResend").addEventListener("click", () => showEmail("verification"));
  q("#showForgot").addEventListener("click", () => showEmail("recovery"));
  q("#accountRecovery").addEventListener("click", () => showEmail("recovery"));
  q(".googleSignIn").addEventListener("click", async (event) => {
    if (working) return;
    working = true;
    event.currentTarget.disabled = true;
    try {
      await auth.google();
    } catch (error) {
      q("#authStateStatus").textContent = error.message;
    } finally {
      working = false;
      q(".googleSignIn").disabled = false;
    }
  });
  q("#accountLogout").addEventListener("click", async (event) => {
    const button = event.currentTarget;
    button.disabled = true;
    try {
      await auth.logout();
    } catch {
      q("#authStateStatus").textContent = "Sign-out failed. Please retry.";
    } finally {
      button.disabled = false;
    }
  });
  async function loadProfile() {
    const account = auth.snapshot().user;
    if (!account) return;
    const version = ++profileVersion;
    q("#profileForm button").disabled = true;
    q("#accountProfileStatus").textContent = "Loading profile…";
    q("#retryProfile").hidden = true;
    try {
      const profile = await auth.getProfile();
      if (version !== profileVersion || auth.snapshot().user?.id !== account.id)
        return;
      q("#profileName").value = profile.full_name;
      q("#accountWelcome").textContent = "Welcome, " + profile.full_name;
      q("#accountProfileStatus").textContent = "Your email is verified.";
      q("#profileForm button").disabled = false;
    } catch {
      if (version !== profileVersion || auth.snapshot().user?.id !== account.id)
        return;
      q("#accountProfileStatus").textContent =
        "Profile editing is temporarily unavailable. Your sign-in is still valid.";
      q("#retryProfile").hidden = false;
    }
  }
  q("#retryProfile").addEventListener("click", loadProfile);
  function renderSaved() {
    for (const [mount, items, cart] of [
      [q("#accountFavorites"), store.getFavorites(), false],
      [q("#accountCart"), store.getCart(), true],
    ]) {
      mount.replaceChildren();
      if (store.catalogueState(mount)) continue;
      if (!items.length)
        mount.append(
          store.create(
            "p",
            "",
            cart
              ? "Your account cart is empty."
              : "No favorites saved for this account.",
          ),
        );
      for (const item of items) {
        const row = store.create("div", "accountProduct"),
          link = store.create("a", "", item.name);
        link.href = "product.html?id=" + item.id;
        row.append(
          store.image(item),
          link,
          store.create("span", "", store.effectivePrice(item) + " ₾"),
        );
        const button = (text, fn) => {
          const node = store.create("button", "", text);
          node.type = "button";
          node.addEventListener("click", fn);
          row.append(node);
        };
        if (cart) {
          row.append(store.create("span", "", "Quantity: " + item.quantity));
          button("−", () => store.changeQuantity(item.id, -1));
          button("+", () => store.changeQuantity(item.id, 1));
          button("Remove", () => store.removeCart(item.id));
        } else {
          button(
            store.isInCart(item.id) ? "Remove from cart" : "Add to cart",
            () => store.toggleCart(item.id),
          );
          button("Remove favorite", () => store.removeFavorite(item.id));
        }
        mount.append(row);
      }
    }
  }
  function renderAuth() {
    const state = auth.snapshot();
    q("main").classList.toggle("authInitializing", state.status === "loading");
    q("#authStateStatus").textContent =
      state.status === "loading" ? "Checking account…" : state.message;
    dashboard.hidden = !state.user;
    recoveryPanel.hidden = !state.user || !state.recovery;
    if (state.status === "loading") return;
    if (state.user) {
      hero.style.display = "none";
      section.style.display = "none";
      emailPanel.hidden = true;
      dashboard.hidden = state.recovery;
      q("#accountEmail").textContent = state.user.email;
      q("#accountCreated").textContent =
        "Registered: " + new Date(state.user.created_at).toLocaleDateString();
      if (profileOwner !== state.user.id) {
        profileOwner = state.user.id;
        void loadProfile();
      }
      renderSaved();
    } else {
      ++profileVersion;
      profileOwner = null;
      q("#profileName").value = "";
      q("#accountEmail").textContent = "";
      q("#accountWelcome").textContent = "My account";
      q("#accountFavorites").replaceChildren();
      q("#accountCart").replaceChildren();
      const url = new URL(location.href),
        view = url.searchParams.get("view");
      if (["account", "signin", "signup"].includes(view)) {
        if (view === "account") {
          url.searchParams.set("view", "signin");
          history.replaceState(null, "", url.pathname + url.search);
        }
        showForms(view === "signup" ? "signup" : "signin");
      } else {
        hero.style.display = "flex";
        section.style.display = "none";
      }
    }
  }
  document.addEventListener("selcore:auth-change", renderAuth);
  if (window.SelcoreAuthGateway?.enabled) {
    let otpMount = null;
    const otpPanel = q("#otpPanel");
    function renderOtp() {
      otpMount?.destroy();
      otpMount = null;
      const state = auth.snapshot();
      if (state.otp) {
        hero.style.display = "none";
        section.style.display = "none";
        emailPanel.hidden = recoveryPanel.hidden = dashboard.hidden = true;
        otpMount = window.SelcoreOtpUI.mount(otpPanel, {
          challenge: state.otp,
          onVerify: (value) => auth.verifyOtp(value),
          onResend: () => auth.resend(),
          onCancel: () => auth.cancelOtp(),
        });
      } else if (state.needsVerification) {
        otpPanel.hidden = false;
        const prompt = document.createElement("p");
        prompt.textContent =
          "Verify your email to continue using your account.";
        const button = document.createElement("button");
        button.type = "button";
        button.textContent = "Send verification code";
        button.addEventListener("click", async () => {
          button.disabled = true;
          try {
            await auth.stepup();
          } catch (error) {
            prompt.textContent = error.message;
            button.disabled = false;
          }
        });
        otpPanel.replaceChildren(prompt, button);
        hero.style.display = section.style.display = "none";
      } else {
        otpPanel.replaceChildren();
        otpPanel.hidden = true;
      }
    }
    document.addEventListener("selcore:auth-change", renderOtp);
    void auth.ready.then(renderOtp);
    window.addEventListener("pagehide", () => otpMount?.destroy());
  }
  for (const event of ["cart", "favorites", "catalogue"])
    document.addEventListener("selcore:" + event + "-change", () => {
      if (auth.snapshot().user) renderSaved();
    });
  renderAuth();
})();
