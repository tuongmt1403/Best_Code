const form = document.querySelector("#auth-form");
const loginTab = document.querySelector("#login-tab");
const registerTab = document.querySelector("#register-tab");
const usernameField = document.querySelector("#username-field");
const emailField = document.querySelector("#email-field");
const identityField = document.querySelector("#identity").closest(".form-field");
const usernameInput = document.querySelector("#username");
const emailInput = document.querySelector("#email");
const identityInput = document.querySelector("#identity");
const passwordInput = document.querySelector("#password");
const submitButton = document.querySelector("#submit-auth");
const message = document.querySelector("#auth-message");
const oauthNote = document.querySelector("#oauth-note");
const rememberInput = document.querySelector("#remember");
const oauthButtons = [...document.querySelectorAll(".oauth-button")];
let mode = "login";

function showMessage(text, kind = "error") {
  message.textContent = text;
  message.classList.toggle("success", kind === "success");
}

function setMode(nextMode) {
  mode = nextMode;
  const registering = mode === "register";
  loginTab.classList.toggle("active", !registering);
  registerTab.classList.toggle("active", registering);
  loginTab.setAttribute("aria-selected", String(!registering));
  registerTab.setAttribute("aria-selected", String(registering));
  usernameField.hidden = !registering;
  emailField.hidden = !registering;
  identityField.hidden = registering;
  usernameInput.required = registering;
  emailInput.required = registering;
  identityInput.required = !registering;
  passwordInput.autocomplete = registering ? "new-password" : "current-password";
  rememberInput.closest("label").hidden = registering;
  submitButton.innerHTML = registering
    ? '<span aria-hidden="true">▶</span> Tạo tài khoản & bắt đầu'
    : '<span aria-hidden="true">▶</span> Bắt đầu hành trình';
  showMessage("");
}

loginTab.addEventListener("click", () => setMode("login"));
registerTab.addEventListener("click", () => setMode("register"));

document.querySelector("#toggle-password").addEventListener("click", (event) => {
  const button = event.currentTarget;
  const visible = passwordInput.type === "text";
  passwordInput.type = visible ? "password" : "text";
  button.setAttribute("aria-pressed", String(!visible));
  button.setAttribute("aria-label", visible ? "Hiện mật khẩu" : "Ẩn mật khẩu");
});

async function loadAuthStatus() {
  try {
    const response = await fetch("/api/auth/status", { cache: "no-store", credentials: "same-origin" });
    if (!response.ok) throw new Error("Không kiểm tra được trạng thái tài khoản.");
    const status = await response.json();
    if (status.authenticated) {
      window.location.replace("/");
      return;
    }
    for (const button of oauthButtons) {
      const configured = Boolean(status.providers?.[button.dataset.provider]);
      button.disabled = !configured;
      button.title = configured ? "" : "Chưa cấu hình OAuth Client ID và Secret.";
    }
    const available = oauthButtons
      .filter((button) => !button.disabled)
      .map((button) => button.dataset.provider === "google" ? "Google" : "GitHub");
    oauthNote.textContent = available.length
      ? `Đã bật đăng nhập ${available.join(" và ")}.`
      : "Đăng nhập Google/GitHub cần cấu hình OAuth Client ID và Secret trong `.env`.";
  } catch (error) {
    showMessage(`${error.message} Hãy tải lại trang hoặc kiểm tra máy chủ.`);
  }
}

oauthButtons.forEach((button) => {
  button.addEventListener("click", () => {
    window.location.assign(`/api/auth/oauth/${encodeURIComponent(button.dataset.provider)}`);
  });
});

form.addEventListener("submit", async (event) => {
  event.preventDefault();
  showMessage("");
  const password = passwordInput.value;
  if (password.length < 8 || password.length > 128) {
    showMessage("Mật khẩu cần dài từ 8 đến 128 ký tự.");
    passwordInput.focus();
    return;
  }
  if (mode === "register") {
    const username = usernameInput.value.trim();
    if (!/^[A-Za-z0-9._-]{3,30}$/.test(username)) {
      showMessage("Tên người dùng cần 3–30 ký tự: chữ, số, dấu chấm, gạch dưới hoặc gạch ngang.");
      usernameInput.focus();
      return;
    }
    if (!emailInput.validity.valid) {
      showMessage("Vui lòng nhập địa chỉ email hợp lệ.");
      emailInput.focus();
      return;
    }
  } else if (!identityInput.value.trim()) {
    showMessage("Vui lòng nhập email hoặc tên người dùng.");
    identityInput.focus();
    return;
  }

  submitButton.disabled = true;
  form.setAttribute("aria-busy", "true");
  submitButton.textContent = mode === "register" ? "Đang tạo tài khoản..." : "Đang đăng nhập...";
  try {
    const response = await fetch(`/api/auth/${mode}`, {
      method: "POST",
      credentials: "same-origin",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(mode === "register"
        ? {
          username: usernameInput.value.trim(),
          email: emailInput.value.trim(),
          password,
          remember: true,
        }
        : {
          identity: identityInput.value.trim(),
          password,
          remember: rememberInput.checked,
        }),
    });
    const responseText = await response.text();
    let data;
    try {
      data = responseText ? JSON.parse(responseText) : {};
    } catch {
      throw new Error(
        `Máy chủ trả về trang không đúng định dạng (HTTP ${response.status}). Hãy tải lại trang và thử lại.`,
      );
    }
    if (!response.ok) throw new Error(data.error || "Không thể hoàn tất yêu cầu.");
    showMessage(mode === "register" ? "Tạo tài khoản thành công. Đang vào trang chính..." : "Đăng nhập thành công. Đang chuyển trang...", "success");
    window.location.assign(data.redirect || "/");
  } catch (error) {
    showMessage(error.message);
  } finally {
    submitButton.disabled = false;
    form.removeAttribute("aria-busy");
    submitButton.innerHTML = mode === "register"
      ? '<span aria-hidden="true">▶</span> Tạo tài khoản & bắt đầu'
      : '<span aria-hidden="true">▶</span> Bắt đầu hành trình';
  }
});

const errorCode = new URLSearchParams(window.location.search).get("error");
const oauthErrors = {
  provider: "Nhà cung cấp đăng nhập không hợp lệ.",
  "google-not-configured": "Google chưa được cấu hình. Hãy thêm GOOGLE_CLIENT_ID và GOOGLE_CLIENT_SECRET vào `.env`.",
  "github-not-configured": "GitHub chưa được cấu hình. Hãy thêm GITHUB_CLIENT_ID và GITHUB_CLIENT_SECRET vào `.env`.",
  oauth: "Đăng nhập OAuth chưa hoàn tất. Hãy thử lại hoặc kiểm tra cấu hình nhà cung cấp.",
};
if (errorCode) showMessage(oauthErrors[errorCode] || oauthErrors.oauth);

loadAuthStatus();
