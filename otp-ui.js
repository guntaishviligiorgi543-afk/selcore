"use strict";
window.SelcoreOtpUI = (() => {
  function mount(
    root,
    { challenge, onVerify, onResend, onCancel, now = Date.now },
  ) {
    const doc = root.ownerDocument;
    let busy = false,
      destroyed = false;
    root.replaceChildren();
    root.hidden = false;
    root.classList.add("accountFlow", "selcoreOtp");
    const create = (tag, text) => {
      const node = doc.createElement(tag);
      if (text) node.textContent = text;
      return node;
    };
    const form = create("form"),
      fieldset = create("fieldset"),
      legend = create("legend", "Enter your 8-digit verification code"),
      hint = create("p"),
      digits = create("div"),
      message = create("p"),
      countdown = create("p"),
      verify = create("button", "Verify code"),
      resend = create("button", "Resend code"),
      cancel = create("button", "Cancel");
    digits.className = "selcoreOtpDigits";
    const purpose = challenge.purpose.replaceAll("_", " ");
    hint.textContent = `Check your email for the ${purpose} code${challenge.destination ? " sent to " + challenge.destination : ""}.`;
    hint.id = "selcoreOtpHint";
    message.setAttribute("role", "status");
    message.setAttribute("aria-live", "polite");
    countdown.setAttribute("role", "timer");
    countdown.setAttribute("aria-live", "off");
    const inputs = Array.from({ length: 8 }, (_, i) => {
      const input = create("input");
      input.type = "text";
      input.inputMode = "numeric";
      input.maxLength = 1;
      input.pattern = "[0-9]";
      input.required = true;
      input.autocomplete = i === 0 ? "one-time-code" : "off";
      input.autocapitalize = "none";
      input.spellcheck = false;
      input.setAttribute("aria-label", `Verification code digit ${i + 1} of 8`);
      input.setAttribute("aria-describedby", hint.id);
      input.addEventListener("input", () => {
        const value = input.value.replace(/\D/g, "");
        if (value.length > 1) fill(value, i);
        else {
          input.value = value;
          if (value && i < 7) inputs[i + 1].focus();
        }
      });
      input.addEventListener("keydown", (event) => {
        if (event.key === "Backspace" && !input.value && i > 0) {
          event.preventDefault();
          inputs[i - 1].value = "";
          inputs[i - 1].focus();
        }
        if (event.key === "ArrowLeft" && i > 0) {
          event.preventDefault();
          inputs[i - 1].focus();
        }
        if (event.key === "ArrowRight" && i < 7) {
          event.preventDefault();
          inputs[i + 1].focus();
        }
      });
      input.addEventListener("paste", (event) => {
        event.preventDefault();
        fill(event.clipboardData?.getData("text") || "", i);
      });
      digits.append(input);
      return input;
    });
    function fill(value, start) {
      const code = value.replace(/\D/g, "").slice(0, 8 - start);
      [...code].forEach((digit, i) => {
        inputs[start + i].value = digit;
      });
      inputs[Math.min(7, start + code.length)].focus();
    }
    verify.type = "submit";
    resend.type = cancel.type = "button";
    fieldset.append(legend, hint, digits);
    form.append(fieldset, message, countdown, verify, resend, cancel);
    root.append(form);
    function tick() {
      const expiry = Math.max(
        0,
        Math.ceil((Date.parse(challenge.expiresAt) - now()) / 1000),
      );
      const cooldown = Math.max(
        0,
        Math.ceil((Date.parse(challenge.resendAt) - now()) / 1000),
      );
      countdown.textContent = expiry
        ? `Code expires in ${Math.floor(expiry / 60)}:${String(expiry % 60).padStart(2, "0")}.`
        : "This code has expired. Request a new code.";
      verify.disabled = busy || expiry === 0;
      resend.disabled = busy || cooldown > 0;
      cancel.disabled = busy;
      resend.textContent = cooldown ? `Resend in ${cooldown}s` : "Resend code";
      for (const input of inputs) input.disabled = busy;
    }
    async function run(action) {
      if (busy || destroyed) return;
      busy = true;
      form.setAttribute("aria-busy", "true");
      message.textContent = "Please wait…";
      tick();
      try {
        await action();
        if (!destroyed) message.textContent = "Verification completed.";
      } catch (e) {
        if (!destroyed) message.textContent = e.message || "Please try again.";
      } finally {
        busy = false;
        form.removeAttribute("aria-busy");
        if (!destroyed) tick();
      }
    }
    form.addEventListener("submit", (event) => {
      event.preventDefault();
      if (form.checkValidity() && !verify.disabled)
        void run(() => onVerify(inputs.map((i) => i.value).join("")));
      else form.reportValidity();
    });
    resend.addEventListener("click", () => {
      if (!resend.disabled) void run(onResend);
    });
    cancel.addEventListener("click", () => {
      if (!cancel.disabled) void run(onCancel);
    });
    const timer = setInterval(tick, 1000);
    tick();
    inputs[0].focus();
    return {
      tick,
      destroy() {
        destroyed = true;
        clearInterval(timer);
        root.replaceChildren();
        root.hidden = true;
      },
    };
  }
  return Object.freeze({ mount });
})();
