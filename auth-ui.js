"use strict";
(() => {
  const auth = window.SelcoreAuth;
  const header = document.querySelector("header");
  if (!auth || !header) return;
  const oldLink = header.querySelector('a[href="user.html"]');
  const mount = document.createElement("span");
  mount.className = "authNavigation";
  mount.setAttribute("aria-label", "Account");
  if (oldLink) oldLink.replaceWith(mount);
  else {
    mount.setAttribute("data-standalone", "");
    if (header.querySelector(".burger")) mount.setAttribute("data-burger", "");
    header.append(mount);
  }
  const toggle = document.createElement("button");
  toggle.type = "button";
  toggle.className = "authNavigationToggle";
  toggle.setAttribute("aria-label", "Account menu");
  toggle.setAttribute("aria-expanded", "false");
  toggle.setAttribute("aria-controls", "authNavigationMenu");
  let icon = oldLink?.querySelector("svg")?.cloneNode(true);
  if (!icon) {
    icon = document.createElementNS("http://www.w3.org/2000/svg", "svg");
    icon.setAttribute("width", "2em");
    icon.setAttribute("height", "2em");
    icon.setAttribute("viewBox", "0 0 24 24");
    const path = document.createElementNS("http://www.w3.org/2000/svg", "path");
    path.setAttribute("fill", "none");
    path.setAttribute("stroke", "currentColor");
    path.setAttribute(
      "d",
      "M8 7a4 4 0 1 1 8 0a4 4 0 0 1-8 0m0 6a5 5 0 0 0-5 5a3 3 0 0 0 3 3h12a3 3 0 0 0 3-3a5 5 0 0 0-5-5z",
    );
    icon.append(path);
  }
  icon.setAttribute("aria-hidden", "true");
  toggle.append(icon);
  const menu = document.createElement("div");
  menu.id = "authNavigationMenu";
  menu.className = "authNavigationMenu";
  menu.hidden = true;
  mount.append(toggle, menu);
  function close() {
    menu.hidden = true;
    toggle.setAttribute("aria-expanded", "false");
  }
  toggle.addEventListener("click", () => {
    if (!menu.hidden) return close();
    const rect = toggle.getBoundingClientRect();
    const width = Math.min(200, window.innerWidth - 32);
    menu.style.left =
      Math.max(
        16,
        Math.min(rect.right - width, window.innerWidth - width - 16),
      ) + "px";
    menu.style.top = rect.bottom + 12 + "px";
    menu.hidden = false;
    toggle.setAttribute("aria-expanded", "true");
  });
  document.addEventListener("click", (event) => {
    if (!mount.contains(event.target)) close();
  });
  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape" && !menu.hidden) {
      close();
      toggle.focus();
    }
  });
  window.addEventListener("resize", close);
  window.addEventListener("scroll", close, { passive: true });
  function render() {
    const state = auth.snapshot();
    close();
    menu.replaceChildren();
    mount.hidden = !oldLink && state.status === "ready" && !state.user;
    toggle.setAttribute("aria-busy", String(state.status === "loading"));
    if (state.status === "loading") {
      const status = document.createElement("p");
      status.textContent = "Checking account…";
      menu.append(status);
      return;
    }
    if (state.status === "error") {
      const retry = document.createElement("button");
      retry.textContent = "Retry account";
      retry.type = "button";
      retry.addEventListener("click", () => {
        void auth.refresh();
      });
      menu.append(retry);
      return;
    }
    const link = (text, href) => {
      const item = document.createElement("a");
      item.textContent = text;
      item.href = href;
      return item;
    };
    if (!state.user)
      menu.append(
        link("Sign In", "user.html?view=signin"),
        link("Sign Up", "user.html?view=signup"),
      );
    else {
      const logout = document.createElement("button");
      logout.type = "button";
      logout.textContent = "Logout";
      logout.addEventListener("click", async () => {
        logout.disabled = true;
        try {
          await auth.logout();
        } catch {
          logout.textContent = "Logout failed. Retry";
          logout.disabled = false;
        }
      });
      menu.append(link("My Account", "user.html?view=account"), logout);
    }
  }
  document.addEventListener("selcore:auth-change", render);
  render();
})();
