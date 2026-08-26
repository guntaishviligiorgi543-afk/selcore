"use strict";
const toSignBtn = document.querySelector(".toSign");
const userHeroSec = document.querySelector(".userHeroSec");
const userSec2 = document.querySelector(".userSec2");
const signUpBtn = document.querySelector(".signUp");
const signInBtn = document.querySelector(".signIn");
const signUpForm = document.querySelector(".signUpForm");
const signInForm = document.querySelector(".signInForm");
const toggleButtons = document.querySelectorAll(".togglePassword");

//to sign sections
toSignBtn.addEventListener("click", () => {
  userHeroSec.style.display = "none";
  userSec2.style.display = "flex";
});

// switch forms
signUpBtn.addEventListener("click", () => {
  signUpForm.classList.remove("hidden");
  signInForm.classList.add("hidden");
});

signInBtn.addEventListener("click", () => {
  signUpForm.classList.add("hidden");
  signInForm.classList.remove("hidden");
});
//see pasword

toggleButtons.forEach((button) => {
  button.classList.add("closed");

  button.addEventListener("click", () => {
    const input = button.previousElementSibling;

    if (input.type === "password") {
      input.type = "text";
      button.classList.remove("closed");
    } else {
      input.type = "password";
      button.classList.add("closed");
    }
  });
});
