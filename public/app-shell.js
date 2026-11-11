const appPages = {
  "/chat": { label: "Chat với Lụa", icon: "🤖" },
  "/quiz": { label: "Quiz AI & lộ trình học", icon: "🏆" },
  "/mini-game": { label: "Phòng chơi", icon: "🎮" },
  "/elevenlabs-test": { label: "Voice Lab", icon: "🎙️" },
};

const appPage = appPages[window.location.pathname.replace(/\/+$/, "") || "/"];
if (appPage && !document.querySelector("#auth-form")) {
  const shell = document.createElement("div");
  shell.className = "app-shell";
  const sidebar = document.createElement("aside");
  sidebar.className = "app-sidebar";
  sidebar.setAttribute("aria-label", "Điều hướng chính");
  sidebar.innerHTML = `
    <a class="app-brand" href="/" aria-label="Học Mà Chơi, trang chủ">
      <img class="app-brand-icon" data-player-avatar src="/images/ai-knight.png" alt="Avatar của bạn">
      <span>AI Study Mentor<small>Học thông minh · vui mỗi ngày</small></span>
    </a>
    <nav class="app-nav">
      <a href="/"><span aria-hidden="true">🏠</span>Dashboard</a>
      <section class="avatar-picker" data-avatar-picker>
        <button type="button" class="avatar-picker-trigger" data-avatar-open>Chọn avatar cho bạn</button>
      </section>
      <a href="/chat?style=normal" data-app-path="/chat"><span aria-hidden="true">🤖</span>Chat với Lụa</a>
      <a href="/quiz#saved-roadmaps" data-app-path="/quiz" data-app-section="saved-roadmaps"><span aria-hidden="true">📖</span>Lộ trình học</a>
      <a href="/quiz" data-app-path="/quiz"><span aria-hidden="true">🏆</span>Quiz AI</a>
      <a href="/mini-game" data-app-path="/mini-game"><span aria-hidden="true">🎮</span>Phòng chơi</a>
      <a href="/elevenlabs-test" data-app-path="/elevenlabs-test"><span aria-hidden="true">🎙️</span>Voice Lab</a>
    </nav>
    <div class="app-sidebar-mentor">
      <img src="/images/lua-fox.png" alt="Lụa, gia sư AI">
      <span><strong>Lụa luôn ở đây</strong><small>Cùng bạn học mỗi ngày</small></span>
    </div>`;
  const workspace = document.createElement("div");
  workspace.className = "app-workspace";
  const topbar = document.createElement("header");
  topbar.className = "app-topbar site-header";
  const pageTitle = document.createElement("div");
  pageTitle.className = "app-page-title";
  pageTitle.innerHTML = `<span aria-hidden="true">${appPage.icon}</span><strong>${appPage.label}</strong>`;
  topbar.append(pageTitle);
  const content = document.createElement("div");
  content.className = "app-page-content";

  const musicToggle = document.querySelector("#music-toggle");
  if (musicToggle) topbar.append(musicToggle);

  const activeSection = window.location.hash === "#saved-roadmaps" ? "saved-roadmaps" : "";
  let activeLinkSet = false;
  for (const link of sidebar.querySelectorAll("[data-app-path]")) {
    if (!activeLinkSet
      && link.dataset.appPath === window.location.pathname.replace(/\/+$/, "")
      && (link.dataset.appSection || "") === activeSection) {
      link.setAttribute("aria-current", "page");
      activeLinkSet = true;
    }
  }

  const legacyHeaders = [
    document.querySelector(".chat-header"),
    document.querySelector(".lab-header"),
    document.querySelector("header:has(.quiz-brand)"),
  ];
  legacyHeaders.filter(Boolean).forEach((header) => header.remove());

  while (document.body.firstChild) content.append(document.body.firstChild);
  workspace.append(topbar, content);
  shell.append(sidebar, workspace);
  document.body.replaceChildren(shell);
  document.body.classList.add("app-page");
}
