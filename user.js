"use strict";
(() => {
  const hero = document.querySelector(".userHeroSec");
  const section = document.querySelector(".userSec2");
  const signup = document.querySelector(".signUpForm");
  const signin = document.querySelector(".signInForm");
  document.querySelector(".toSign")?.addEventListener("click", () => {
    if (hero) hero.style.display = "none";
    if (section) section.style.display = "flex";
  });
  document.querySelector(".signUp")?.addEventListener("click", () => {
    signup?.classList.remove("hidden");
    signin?.classList.add("hidden");
  });
  document.querySelector(".signIn")?.addEventListener("click", () => {
    signup?.classList.add("hidden");
    signin?.classList.remove("hidden");
  });
  document.querySelectorAll(".togglePassword").forEach((button) => {
    button.classList.add("closed");
    button.setAttribute("aria-label", "Show password");
    button.addEventListener("click", () => {
      const input = button.previousElementSibling;
      if (!input || (input.type !== "password" && input.type !== "text"))
        return;
      input.type = input.type === "password" ? "text" : "password";
      button.classList.toggle("closed", input.type === "password");
      button.setAttribute(
        "aria-label",
        input.type === "password" ? "Show password" : "Hide password",
      );
    });
  });
  const password = document.querySelector("#signupPassword");
  const confirmation = document.querySelector("#confirmPassword");
  if (password && confirmation) {
    const validate = () =>
      confirmation.setCustomValidity(
        confirmation.value && confirmation.value !== password.value
          ? "Passwords must match."
          : "",
      );
    password.addEventListener("input", validate);
    confirmation.addEventListener("input", validate);
  }
})();
