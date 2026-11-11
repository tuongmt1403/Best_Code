const dashboardSearch = document.querySelector(".dashboard-search");
const searchCards = [...document.querySelectorAll("[data-search-card]")];
const emptySearchState = document.querySelector(".dashboard-empty");
const dashboardLogout = document.querySelector(".dashboard-logout");
const dashboardMessage = document.querySelector(".dashboard-message");

function normalizeDashboardText(value) {
  return value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLocaleLowerCase("vi");
}

dashboardSearch?.addEventListener("input", () => {
  const query = normalizeDashboardText(dashboardSearch.value.trim());
  let visibleCount = 0;
  for (const card of searchCards) {
    const matches = !query || normalizeDashboardText(card.textContent || "").includes(query);
    card.hidden = !matches;
    if (matches) visibleCount += 1;
  }
  if (emptySearchState) emptySearchState.hidden = visibleCount > 0;
});

dashboardLogout?.addEventListener("click", async () => {
  dashboardLogout.disabled = true;
  if (dashboardMessage) dashboardMessage.textContent = "";
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
    dashboardLogout.disabled = false;
    if (dashboardMessage) dashboardMessage.textContent = error.message;
  }
});
