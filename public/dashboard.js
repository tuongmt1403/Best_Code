const dashboardSearch = document.querySelector(".dashboard-search");
const searchCards = [...document.querySelectorAll("[data-search-card]")];
const emptySearchState = document.querySelector(".dashboard-empty");
const dashboardLogout = document.querySelector(".dashboard-logout");
const dashboardMessage = document.querySelector(".dashboard-message");
const dashboardDataError = document.querySelector("#dashboard-data-error");
const friendStatus = document.querySelector("#friend-status");

async function dashboardRequest(url, options = {}) {
  const response = await fetch(url, {
    credentials: "same-origin",
    cache: "no-store",
    ...options,
    headers: {
      ...(options.body ? { "Content-Type": "application/json" } : {}),
      ...options.headers,
    },
  });
  const data = await response.json().catch(() => null);
  if (!response.ok) throw new Error(data?.error || `Không thể hoàn tất yêu cầu (${response.status}).`);
  if (!data) throw new Error("Máy chủ trả về dữ liệu không hợp lệ.");
  return data;
}

function formatNumber(value) {
  return Number(value || 0).toLocaleString("vi-VN");
}

function reportDashboardError(error) {
  if (dashboardDataError) dashboardDataError.textContent = error.message;
}

function svgElement(name, attributes = {}) {
  const element = document.createElementNS("http://www.w3.org/2000/svg", name);
  for (const [key, value] of Object.entries(attributes)) element.setAttribute(key, String(value));
  return element;
}

function renderKnowledgeChart(points) {
  const chart = document.querySelector("#knowledge-chart");
  const empty = document.querySelector("#chart-empty");
  if (!chart || !empty) return;
  chart.replaceChildren();
  const values = points.map((point) => point.correctAnswers);
  if (!values.some((value) => value > 0)) {
    chart.hidden = true;
    empty.hidden = false;
    return;
  }
  chart.hidden = false;
  empty.hidden = true;
  const left = 28;
  const right = 405;
  const top = 14;
  const bottom = 112;
  const maxValue = Math.max(1, ...values);
  for (let index = 0; index < 3; index += 1) {
    const y = top + (bottom - top) * index / 2;
    chart.append(svgElement("line", { x1: left, y1: y, x2: right, y2: y, class: "chart-grid" }));
    chart.append(svgElement("text", { x: 2, y: y + 3 }));
    chart.lastElementChild.textContent = Math.ceil(maxValue * (2 - index) / 2).toString();
  }
  const coordinates = values.map((value, index) => {
    const x = left + (right - left) * index / Math.max(1, values.length - 1);
    const y = bottom - (bottom - top) * value / maxValue;
    return { x, y };
  });
  chart.append(svgElement("polyline", {
    points: coordinates.map(({ x, y }) => `${x},${y}`).join(" "),
    class: "chart-line",
  }));
  coordinates.forEach(({ x, y }, index) => {
    chart.append(svgElement("circle", { cx: x, cy: y, r: 4, class: "chart-point" }));
    const date = new Date(`${points[index].date}T12:00:00+07:00`);
    const label = new Intl.DateTimeFormat("vi-VN", { weekday: "short", timeZone: "Asia/Ho_Chi_Minh" })
      .format(date).replace(/\.$/, "");
    const text = svgElement("text", { x, y: 137, "text-anchor": "middle" });
    text.textContent = label;
    chart.append(text);
  });
}

function renderWeek(points) {
  const container = document.querySelector("#week-days");
  const summary = document.querySelector("#week-summary");
  if (!container || !summary) return;
  container.replaceChildren();
  let answered = 0;
  points.forEach((point) => {
    answered += point.questionsAnswered;
    const date = new Date(`${point.date}T12:00:00+07:00`);
    const day = new Intl.DateTimeFormat("vi-VN", { weekday: "short", timeZone: "Asia/Ho_Chi_Minh" })
      .format(date).replace(/\.$/, "");
    const item = document.createElement("div");
    item.className = `week-day${point.questionsAnswered > 0 ? " active" : ""}`;
    item.title = `${day}: ${point.questionsAnswered} câu đã trả lời`;
    const label = document.createElement("span");
    label.className = "week-day-label";
    label.textContent = day;
    const mark = document.createElement("span");
    mark.className = "week-day-mark";
    mark.textContent = point.questionsAnswered > 0 ? "✓" : "·";
    item.append(label, mark);
    container.append(item);
  });
  summary.textContent = answered
    ? `Bạn đã trả lời ${formatNumber(answered)} câu trong 7 ngày qua.`
    : "Hãy chơi một ván để bắt đầu ghi nhận tiến độ.";
}

async function loadProgress() {
  const data = await dashboardRequest("/api/minigame/progress");
  const name = document.querySelector("[data-player-name]");
  const xp = document.querySelector("#total-xp");
  const questions = document.querySelector("#total-questions");
  const today = document.querySelector("#today-questions");
  const correctToday = document.querySelector("#today-correct");
  const streak = document.querySelector("#streak-count");
  const streakCopy = document.querySelector("#streak-copy");
  const streakProgress = document.querySelector("#streak-progress");
  const rank = document.querySelector("#current-rank");
  const rankProgressCopy = document.querySelector("#rank-progress-copy");
  const rankProgress = document.querySelector("#rank-progress");
  if (name) name.textContent = data.username;
  if (xp) xp.textContent = `${formatNumber(data.totalPoints)} XP`;
  if (questions) questions.textContent = formatNumber(data.totalAnswered);
  if (today) today.textContent = formatNumber(data.questionsToday);
  if (correctToday) correctToday.textContent = `${formatNumber(data.correctToday)} câu đúng hôm nay`;
  if (streak) streak.textContent = `${formatNumber(data.streakDays)} ngày`;
  if (streakCopy) streakCopy.textContent = data.streakDays
    ? "Tuyệt vời! Hãy tiếp tục duy trì nhé."
    : "Hoàn thành một câu hỏi hôm nay để bắt đầu chuỗi.";
  if (streakProgress) streakProgress.style.width = `${Math.min(100, data.streakDays / 7 * 100)}%`;
  const streakTrack = document.querySelector(".streak-track");
  if (streakTrack) streakTrack.setAttribute("aria-valuenow", String(Math.min(7, data.streakDays)));
  if (rank) rank.textContent = `${data.rank.icon} ${data.rank.name}`;
  if (rankProgressCopy) {
    rankProgressCopy.textContent = data.rank.nextRank
      ? `Còn ${formatNumber(data.rank.pointsToNext)} XP để lên ${data.rank.nextRank.name}`
      : "Bạn đã đạt cấp bậc cao nhất!";
  }
  if (rankProgress) rankProgress.style.width = `${data.rank.progressPercent}%`;
  const rankTrack = document.querySelector(".rank-track");
  if (rankTrack) rankTrack.setAttribute("aria-valuenow", String(data.rank.progressPercent));
  const historyNote = document.querySelector("#question-history-note");
  if (historyNote) historyNote.textContent = data.historicalBaseline;
  renderWeek(data.chart);
  renderKnowledgeChart(data.chart);
  return data;
}

async function loadDashboardLeaderboard() {
  const list = document.querySelector("#dashboard-leaderboard");
  if (!list) return;
  const data = await dashboardRequest("/api/minigame/leaderboard");
  list.replaceChildren();
  if (!data.entries.length) {
    const empty = document.createElement("li");
    empty.className = "rank-row empty";
    empty.textContent = "Chưa có ván chơi được ghi nhận.";
    list.append(empty);
    return;
  }
  data.entries.slice(0, 4).forEach((entry) => {
    const row = document.createElement("li");
    row.className = "rank-row";
    if (entry.username === document.querySelector("[data-player-name]")?.textContent) row.classList.add("current");
    const medal = document.createElement("span");
    medal.textContent = entry.rank.icon;
    const username = document.createElement("span");
    username.className = "rank-row-name";
    username.textContent = `${entry.position}. ${entry.username} · ${entry.rank.name}`;
    const points = document.createElement("span");
    points.className = "rank-row-points";
    points.textContent = `${formatNumber(entry.totalPoints)} XP`;
    row.append(medal, username, points);
    list.append(row);
  });
}

function addFriendActionButton(label, action) {
  const button = document.createElement("button");
  button.type = "button";
  button.textContent = label;
  button.addEventListener("click", action);
  return button;
}

async function loadFriends() {
  const friendList = document.querySelector("#friend-list");
  const requestPanel = document.querySelector("#friend-requests");
  if (!friendList || !requestPanel) return;
  const data = await dashboardRequest("/api/minigame/friends");
  friendList.replaceChildren();
  if (!data.friends.length) {
    const empty = document.createElement("li");
    empty.className = "friend-row empty";
    empty.textContent = "Chưa có bạn bè. Gửi lời mời bằng tên người dùng.";
    friendList.append(empty);
  }
  data.friends.forEach((friend) => {
    const row = document.createElement("li");
    row.className = "friend-row";
    const name = document.createElement("span");
    name.className = "friend-name";
    name.textContent = `👤 ${friend.username}`;
    const play = document.createElement("a");
    play.className = "friend-action";
    play.href = "/mini-game";
    play.textContent = "Mời chơi";
    play.setAttribute("aria-label", `Mở phòng chơi để mời ${friend.username}`);
    row.append(name, play);
    friendList.append(row);
  });
  requestPanel.replaceChildren();
  if (data.incoming.length) {
    const title = document.createElement("p");
    title.className = "friend-section-label";
    title.textContent = "Lời mời kết bạn";
    const requests = document.createElement("ul");
    requests.className = "request-list";
    data.incoming.forEach((request) => {
      const row = document.createElement("li");
      row.className = "request-row";
      const name = document.createElement("span");
      name.className = "friend-name";
      name.textContent = request.username;
      const accept = addFriendActionButton("Chấp nhận", async () => {
        accept.disabled = true;
        try {
          await dashboardRequest(`/api/minigame/friends/requests/${encodeURIComponent(request.id)}/accept`, { method: "POST", body: "{}" });
          await loadFriends();
        } catch (error) {
          if (friendStatus) friendStatus.textContent = error.message;
          accept.disabled = false;
        }
      });
      const ignore = addFriendActionButton("Bỏ qua", async () => {
        ignore.disabled = true;
        try {
          await dashboardRequest(`/api/minigame/friends/requests/${encodeURIComponent(request.id)}`, { method: "DELETE" });
          await loadFriends();
        } catch (error) {
          if (friendStatus) friendStatus.textContent = error.message;
          ignore.disabled = false;
        }
      });
      row.append(name, accept, ignore);
      requests.append(row);
    });
    requestPanel.append(title, requests);
  }
  if (data.outgoing.length) {
    const title = document.createElement("p");
    title.className = "friend-section-label";
    title.textContent = "Đang chờ phản hồi";
    const requests = document.createElement("ul");
    requests.className = "request-list";
    data.outgoing.forEach((request) => {
      const row = document.createElement("li");
      row.className = "request-row";
      const name = document.createElement("span");
      name.className = "friend-name";
      name.textContent = request.username;
      const cancel = addFriendActionButton("Đã gửi", async () => {
        cancel.disabled = true;
        try {
          await dashboardRequest(`/api/minigame/friends/requests/${encodeURIComponent(request.id)}`, { method: "DELETE" });
          await loadFriends();
        } catch (error) {
          if (friendStatus) friendStatus.textContent = error.message;
          cancel.disabled = false;
        }
      });
      row.append(name, cancel);
      requests.append(row);
    });
    requestPanel.append(title, requests);
  }
}

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

document.querySelector("#friend-add-form")?.addEventListener("submit", async (event) => {
  event.preventDefault();
  const form = event.currentTarget;
  const input = form.elements.namedItem("username");
  const button = form.querySelector("button");
  if (!(input instanceof HTMLInputElement) || !button) return;
  button.disabled = true;
  if (friendStatus) friendStatus.textContent = "";
  try {
    const data = await dashboardRequest("/api/minigame/friends/requests", {
      method: "POST",
      body: JSON.stringify({ username: input.value.trim() }),
    });
    if (friendStatus) friendStatus.textContent = `Đã gửi lời mời kết bạn tới ${data.username}.`;
    input.value = "";
    await loadFriends();
  } catch (error) {
    if (friendStatus) friendStatus.textContent = error.message;
  } finally {
    button.disabled = false;
  }
});

void loadProgress().catch(reportDashboardError);
void loadDashboardLeaderboard().catch(reportDashboardError);
void loadFriends().catch(reportDashboardError);

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
