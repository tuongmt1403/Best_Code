if (!document.body.classList.contains("auth-page")) {
  const header = document.querySelector(".site-header, .chat-header, body > header");
  const badge = document.createElement("aside");
  badge.className = "auth-session-badge";
  if (!header) badge.classList.add("floating");
  badge.setAttribute("aria-label", "Tài khoản đang đăng nhập");
  badge.hidden = true;
  (header || document.body).append(badge);

  fetch("/api/auth/status", { cache: "no-store", credentials: "same-origin" })
    .then(async (response) => {
      if (response.status === 401) {
        window.location.replace("/dangKy_dangNhap/");
        return null;
      }
      if (!response.ok) throw new Error("Không thể kiểm tra phiên đăng nhập.");
      return response.json();
    })
    .then((status) => {
      if (!status || !status.authenticated) {
        window.location.replace("/dangKy_dangNhap/");
        return;
      }
      const name = document.createElement("span");
      name.textContent = `👤 ${status.user.username}`;
      const logout = document.createElement("button");
      logout.type = "button";
      logout.textContent = "Đăng xuất";
      logout.addEventListener("click", async () => {
        logout.disabled = true;
        try {
          const response = await fetch("/api/auth/logout", {
            method: "POST",
            credentials: "same-origin",
            headers: { "Content-Type": "application/json" },
            body: "{}",
          });
          if (!response.ok) throw new Error("Chưa đăng xuất được. Vui lòng thử lại.");
          window.location.assign("/dangKy_dangNhap/");
        } catch (error) {
          logout.disabled = false;
          logout.title = error.message;
        }
      });
      badge.append(name, logout);
      badge.hidden = false;
    })
    .catch((error) => {
      badge.textContent = error.message;
      badge.hidden = false;
    });
}
