const content = document.querySelector("#game-content");
const leaderboardList = document.querySelector("#leaderboard-list");
const liveStatus = document.querySelector("#game-live-status");
const query = new URLSearchParams(window.location.search);
let topics = [];
let roomCode = "";
let pollTimer = null;
let countdownTimer = null;
let pollInFlight = false;
let lastRenderKey = "";
let currentAudio = null;
let activeMusicPhase = "";
let victoryPlayed = false;
let activeGameTrackStarted = false;
let musicMuted = sessionStorage.getItem("minigame-music-muted") === "true";

function node(tag, className, text) {
  const element = document.createElement(tag);
  if (className) element.className = className;
  if (text !== undefined) element.textContent = text;
  return element;
}

function setError(text) {
  const error = document.querySelector(".game-error");
  if (error) error.textContent = text;
  else liveStatus.textContent = text;
}

function syncMusicToggle() {
  const button = document.querySelector("#music-toggle");
  if (!button) return;
  button.textContent = musicMuted ? "🔇 Tắt nhạc" : "🔊 Nhạc";
  button.setAttribute("aria-pressed", String(musicMuted));
  if (currentAudio) currentAudio.volume = musicMuted ? 0 : 0.28;
}

document.querySelector("#music-toggle")?.addEventListener("click", () => {
  musicMuted = !musicMuted;
  sessionStorage.setItem("minigame-music-muted", String(musicMuted));
  syncMusicToggle();
});

async function request(url, options = {}) {
  const response = await fetch(url, {
    credentials: "same-origin",
    cache: "no-store",
    ...options,
    headers: {
      ...(options.body ? { "Content-Type": "application/json" } : {}),
      ...options.headers,
    },
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.error || "Không thể hoàn tất yêu cầu.");
  return data;
}

function playGameMusic(src, loop = true) {
  if (activeMusicPhase === src && !currentAudio?.paused) return;
  if (currentAudio) {
    currentAudio.pause();
    currentAudio.currentTime = 0;
  }
  activeMusicPhase = src;
  currentAudio = new Audio(src);
  currentAudio.loop = loop;
  currentAudio.preload = "auto";
  currentAudio.volume = musicMuted ? 0 : 0.28;
  currentAudio.play().catch(() => {
    liveStatus.textContent = "Nhấn một nút trong phòng để bật nhạc.";
  });
}

function playLobbyMusic() {
  playGameMusic("/audio/nhac_truocgaame.mp3", true);
}

function playNextGameMusic() {
  const tracks = [
    "/audio/nhac_trongchsgame1.mp3",
    "/audio/nhac_trongchoigame2.mp3",
  ];
  let nextIndex = Number(sessionStorage.getItem("minigame-next-track-index") || "0");
  if (!Number.isInteger(nextIndex) || nextIndex < 0 || nextIndex > 1) nextIndex = 0;
  const chosen = tracks[nextIndex];
  sessionStorage.setItem("minigame-next-track-index", String(nextIndex === 0 ? 1 : 0));
  playGameMusic(chosen, true);
}

function playVictoryMusic() {
  if (victoryPlayed) return;
  victoryPlayed = true;
  playGameMusic("/audio/vitory.mp3", false);
}

function stopGameMusic() {
  activeMusicPhase = "";
  if (currentAudio) {
    currentAudio.pause();
    currentAudio.currentTime = 0;
  }
}

function stopRoomPolling() {
  if (pollTimer) window.clearInterval(pollTimer);
  if (countdownTimer) window.clearInterval(countdownTimer);
  pollTimer = null;
  countdownTimer = null;
  pollInFlight = false;
}

function renderLeaderboard(entries) {
  leaderboardList.replaceChildren();
  if (!entries.length) {
    leaderboardList.append(node("li", "leaderboard-empty", "Chưa có kết quả. Hãy tạo phòng và giành những điểm đầu tiên!"));
    return;
  }
  entries.forEach((entry, index) => {
    const item = node("li", "leaderboard-entry");
    const rank = node("span", "leaderboard-rank", ["🥇", "🥈", "🥉"][index] || String(index + 1));
    const info = node("span", "leaderboard-name", entry.username);
    info.append(node("small", "leaderboard-meta", `${entry.wins} thắng · ${entry.gamesPlayed} ván · ${entry.correctAnswers} câu đúng`));
    item.append(rank, info, node("strong", "leaderboard-score", `${entry.totalPoints} điểm`));
    leaderboardList.append(item);
  });
}

async function loadLeaderboard() {
  try {
    const data = await request("/api/minigame/leaderboard");
    renderLeaderboard(data.entries);
  } catch (error) {
    leaderboardList.replaceChildren(node("li", "leaderboard-empty", `${error.message} Hãy tải lại trang để thử lại.`));
  }
}

async function loadTopics() {
  topics = await request("/api/minigame/topics");
}

function createSetupField(labelText, control) {
  const label = node("label", "setup-field", labelText);
  label.append(control);
  return label;
}

function renderSetup() {
  stopRoomPolling();
  stopGameMusic();
  lastRenderKey = "";
  content.replaceChildren();

  const heading = node("h2", "setup-heading", "Vào cuộc chơi");
  const copy = node("p", "setup-copy", "Tạo phòng mới hoặc nhập mã bạn bè gửi cho bạn. Tối đa 6 người cùng chơi.");
  const accountHint = node("p", "game-hint", "Mỗi người cần tài khoản riêng và phải mở đúng cùng địa chỉ máy chủ của trò chơi. Hai tab cùng trình duyệt dùng chung tài khoản; nếu dùng chung máy, mở cửa sổ ẩn danh cho người thứ hai. Khi chơi từ thiết bị khác, hãy dùng địa chỉ IP hoặc tên miền của máy chủ, không dùng localhost.");
  const form = node("form", "setup-form");
  const topicSelect = node("select");
  topicSelect.name = "topicId";
  topicSelect.required = true;
  topics.forEach((topic) => {
    const option = node("option", "", topic.title);
    option.value = topic.id;
    option.textContent = `${topic.title} · ${topic.availableQuestions} câu`;
    topicSelect.append(option);
  });
  const modeSelect = node("select");
  modeSelect.name = "mode";
  modeSelect.append(
    new Option("Quiz trắc nghiệm", "quiz"),
    new Option("Đuổi hình bắt chữ 1v1", "picture"),
    new Option("Vượt Chướng Ngại Vật · AI theo chủ đề", "obstacle"),
  );
  const countSelect = node("select");
  countSelect.name = "questionCount";
  countSelect.required = true;
  [5, 10, 15].forEach((count) => {
    const option = node("option", "", `${count} câu hỏi`);
    option.value = String(count);
    countSelect.append(option);
  });
  form.append(
    createSetupField("Chế độ chơi", modeSelect),
    createSetupField("Chọn chủ đề", topicSelect),
    createSetupField("Số câu trong ván", countSelect),
  );
  modeSelect.addEventListener("change", () => {
    const isPictureMode = modeSelect.value === "picture";
    const isObstacleMode = modeSelect.value === "obstacle";
    topicSelect.querySelectorAll("option").forEach((option) => {
      option.disabled = isPictureMode && option.value === "geography";
    });
    if (isPictureMode && topicSelect.value === "geography") {
      topicSelect.value = topicSelect.querySelector("option:not(:disabled)")?.value || "";
    }
    countSelect.disabled = isPictureMode || isObstacleMode;
    countSelect.value = isPictureMode || isObstacleMode ? "5" : countSelect.value;
  });
  const createButton = node("button", "primary-action", "✨ Tạo phòng");
  createButton.type = "submit";
  form.append(createButton);
  const divider = node("div", "setup-divider", "hoặc tham gia phòng có sẵn");
  const joinForm = node("form", "join-form");
  const codeInput = node("input", "room-code-input");
  codeInput.type = "text";
  codeInput.name = "roomCode";
  codeInput.placeholder = "Mã phòng";
  codeInput.maxLength = 6;
  codeInput.pattern = "[A-Za-z0-9]{6}";
  codeInput.autocomplete = "off";
  codeInput.required = true;
  codeInput.setAttribute("aria-label", "Mã phòng gồm 6 ký tự");
  codeInput.addEventListener("input", () => { codeInput.value = codeInput.value.toUpperCase(); });
  const joinButton = node("button", "secondary-action", "Vào phòng");
  joinButton.type = "submit";
  joinForm.append(codeInput, joinButton);
  content.append(heading, copy, accountHint, form, divider, joinForm, node("p", "game-error"));

  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    createButton.disabled = true;
    const originalButtonText = createButton.textContent;
    createButton.textContent = modeSelect.value === "picture"
      ? "✨ Đang tạo phòng..."
      : modeSelect.value === "obstacle"
        ? "✨ AI đang tạo chướng ngại vật..."
      : `✨ AI đang tạo ${countSelect.value} câu (~10–16 giây)...`;
    setError("");
    try {
      const room = await request("/api/minigame/rooms", {
        method: "POST",
        body: JSON.stringify({ topicId: topicSelect.value, questionCount: Number(countSelect.value), mode: modeSelect.value }),
      });
      enterRoom(room.code);
    } catch (error) {
      setError(error.message);
    } finally {
      createButton.disabled = false;
      createButton.textContent = originalButtonText;
    }
  });

  joinForm.addEventListener("submit", async (event) => {
    event.preventDefault();
    joinButton.disabled = true;
    setError("");
    try {
      await request(`/api/minigame/rooms/${encodeURIComponent(codeInput.value)}/join`, {
        method: "POST",
        body: "{}",
      });
      enterRoom(codeInput.value);
    } catch (error) {
      setError(error.message);
      joinButton.disabled = false;
    }
  });
}

function enterRoom(code) {
  roomCode = code.toUpperCase();
  victoryPlayed = false;
  activeGameTrackStarted = false;
  playLobbyMusic();
  query.set("room", roomCode);
  window.history.replaceState(null, "", `${window.location.pathname}?${query}`);
  lastRenderKey = "";
  startRoomPolling();
}

function renderPlayerList(players) {
  const list = node("ul", "player-list");
  players.forEach((player) => {
    const item = node("li", "player-row");
    const identity = node("span", "player-identity");
    identity.append(node("span", "player-avatar", player.isHost ? "👑" : "🦊"));
    const name = node("span", "player-name", player.username);
    name.append(node("small", "player-tag", `${player.isHost ? "Người tạo phòng · " : ""}${player.rulesAcknowledged ? "Đã hiểu luật ✓" : "Chưa đọc luật"}`));
    identity.append(name);
    item.append(identity, node("span", "leaderboard-score", "● Đang ở đây"));
    list.append(item);
  });
  return list;
}

function renderLobby(snapshot) {
  const heading = node("h2", "setup-heading", "Phòng chờ");
  const codeLabel = node("span", "room-code-label", "MÃ PHÒNG");
  codeLabel.append(node("strong", "room-code", snapshot.code));
  const copyCodeButton = node("button", "room-copy", "Sao chép mã");
  copyCodeButton.type = "button";
  const copyInviteButton = node("button", "room-copy", "Sao chép liên kết");
  copyInviteButton.type = "button";
  const copyActions = node("div", "room-copy-actions");
  copyActions.append(copyCodeButton, copyInviteButton);
  const copyStatus = node("span", "room-copy-status");
  const codeRow = node("div", "room-code-row");
  codeRow.append(codeLabel, copyActions);
  const info = node("p", "room-info", snapshot.mode === "obstacle"
    ? `${snapshot.topic} · 4 hàng ngang + ô trung tâm · tối đa 6 người`
    : `${snapshot.topic} · ${snapshot.questionCount} câu hỏi · tối đa 6 người`);
  const reviewWarning = snapshot.questionReview?.warning
    ? node("p", "game-hint", snapshot.questionReview.status === "unavailable"
      ? "Groq chưa rà soát được bộ câu hỏi. Hãy kiểm tra nội dung trong lúc chơi."
      : "Groq có cảnh báo về bộ câu hỏi; kết quả rà soát có thể chưa chính xác. Hãy kiểm tra nội dung khi chơi.")
    : null;
  const playersHeading = node("h3", "answer-label", `Người chơi (${snapshot.players.length}/6)`);
  const players = renderPlayerList(snapshot.players);
  const rules = node("section", "rules-panel");
  rules.append(node("h3", "rules-title", "LUẬT CHƠI – CẢ NHÓM CẦN ĐỒNG Ý"));
  const ruleItems = snapshot.mode === "obstacle"
    ? [
      "Cả phòng cùng trả lời lần lượt 4 hàng ngang, độ khó tăng dần, rồi đến câu hỏi ô trung tâm.",
      "Mỗi hàng có 15 giây. Mỗi đáp án đúng sẽ mở thêm một phần bức ảnh.",
      "Mỗi câu chỉ gửi được một đáp án; điểm được tính theo độ chính xác và tốc độ.",
      "Ô trung tâm xuất hiện ở câu cuối; hãy dựa vào các gợi ý và phần ảnh đã mở.",
      "Người có tổng điểm cao nhất sau 5 câu là người chiến thắng.",
    ]
    : [
      "Mỗi người trả lời 5, 10 hoặc 15 câu theo chủ đề của phòng.",
      "Mỗi câu có 15 giây; trả lời trước sẽ nhận nhiều điểm hơn khi đúng.",
      "Chỉ câu trả lời đúng mới cộng điểm theo tốc độ.",
      "Không thể thay đổi đáp án sau khi đã gửi.",
      "Người có tổng điểm cao nhất sau tất cả câu là người chiến thắng.",
    ];
  const rulesList = node("ul", "rules-list");
  ruleItems.forEach((text) => rulesList.append(node("li", "rules-item", text)));
  rules.append(rulesList);
  const ackButton = node("button", snapshot.you.rulesAcknowledged ? "secondary-action" : "primary-action", snapshot.you.rulesAcknowledged ? "✓ Tôi đã hiểu luật" : "Tôi đã đọc và hiểu luật");
  ackButton.type = "button";
  ackButton.disabled = snapshot.you.rulesAcknowledged;
  ackButton.addEventListener("click", async () => {
    ackButton.disabled = true;
    try {
      await request(`/api/minigame/rooms/${roomCode}/rules/acknowledge`, { method: "POST", body: "{}" });
      await pollRoom();
    } catch (error) {
      ackButton.disabled = false;
      setError(error.message);
    }
  });
  rules.append(ackButton);
  const actions = node("div", "final-actions");
  if (snapshot.isHost) {
    const allAcknowledged = snapshot.players.every((player) => player.rulesAcknowledged);
    const startButton = node("button", "primary-action", snapshot.players.length < 2 ? "Đợi bạn bè vào phòng..." : !allAcknowledged ? "Chờ tất cả xác nhận luật chơi" : "🚀 Bắt đầu ngay");
    startButton.type = "button";
    startButton.disabled = snapshot.players.length < 2 || !allAcknowledged;
    startButton.addEventListener("click", async () => {
      startButton.disabled = true;
      try {
        await request(`/api/minigame/rooms/${roomCode}/start`, { method: "POST", body: "{}" });
        liveStatus.textContent = "Ván chơi bắt đầu!";
        await pollRoom();
      } catch (error) {
        setError(error.message);
        startButton.disabled = false;
      }
    });
    actions.append(startButton);
  } else {
    actions.append(node("p", "game-hint", "Đã vào phòng! Chờ chủ phòng bấm “Bắt đầu ngay”."));
  }
  const leaveButton = node("button", "leave-button", "Rời phòng");
  leaveButton.type = "button";
  leaveButton.addEventListener("click", leaveRoom);
  actions.append(leaveButton);
  const error = node("p", "game-error");
  const hint = node("p", "game-hint", "Gửi mã phòng cho bạn bè. Mỗi người cần đăng nhập tài khoản riêng trên trình duyệt hoặc thiết bị riêng; hai tab cùng trình duyệt sẽ dùng chung tài khoản đang đăng nhập.");
  content.replaceChildren(
    heading,
    codeRow,
    copyStatus,
    info,
    ...(reviewWarning ? [reviewWarning] : []),
    playersHeading,
    players,
    rules,
    actions,
    error,
    hint,
  );
  async function copyRoomText(text, successLabel, button) {
    let clipboardError;
    try {
      if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(text);
      } else {
        throw new Error("Clipboard API chưa được trình duyệt hỗ trợ.");
      }
    } catch (error) {
      clipboardError = error;
      const temporaryInput = node("textarea");
      temporaryInput.value = text;
      temporaryInput.setAttribute("readonly", "");
      temporaryInput.style.position = "fixed";
      temporaryInput.style.opacity = "0";
      document.body.append(temporaryInput);
      let copied = false;
      try {
        temporaryInput.select();
        copied = document.execCommand("copy");
      } catch {
        copied = false;
      } finally {
        temporaryInput.remove();
      }
      if (!copied) {
        const reason = clipboardError.message || "Trình duyệt chặn quyền sao chép.";
        copyStatus.textContent = `${reason} Bạn có thể chọn và sao chép mã ${snapshot.code} ở trên.`;
        return;
      }
    }
    button.textContent = "Đã sao chép!";
    copyStatus.textContent = successLabel;
    window.setTimeout(() => {
      if (button.isConnected) button.textContent = button === copyCodeButton ? "Sao chép mã" : "Sao chép liên kết";
    }, 1800);
  }
  copyCodeButton.addEventListener("click", () => {
    copyRoomText(snapshot.code, `Mã ${snapshot.code} đã được sao chép.`, copyCodeButton);
  });
  copyInviteButton.addEventListener("click", () => {
    const inviteUrl = `${window.location.origin}${window.location.pathname}?room=${snapshot.code}`;
    copyRoomText(inviteUrl, "Liên kết mời đã được sao chép.", copyInviteButton);
  });
}

function renderPictureQuestion(snapshot) {
  const q = snapshot.pictureQuestion;
  const ownName = snapshot.you.username;
  const top = node("div", "round-topline");
  top.append(node("span", "round-counter", `CÂU ${q.number} / ${q.total}`));
  const timer = node("span", "timer-pill", `${Math.ceil(q.buzzTimeLeftMs / 1000)} giây`);
  top.append(timer);

  const image = node("img", "picture-game-image");
  image.src = q.image;
  image.alt = "Ảnh gợi ý cho câu đuổi hình bắt chữ";
  image.loading = "eager";

  const hint = node("p", "picture-game-hint", `Gợi ý: ${q.hint}`);
  const slots = node("div", "picture-answer-slots");
  const chosen = [];
  for (let index = 0; index < q.slots; index += 1) slots.append(node("span", "picture-answer-slot", ""));

  const letterGrid = node("div", "picture-letter-grid");
  const isOwner = q.buzzOwnerName === ownName;
  q.letters.forEach((letter, index) => {
    const button = node("button", "picture-letter-button", letter);
    button.type = "button";
    button.disabled = !isOwner;
    button.dataset.index = String(index);
    button.addEventListener("click", () => {
      if (chosen.length >= q.slots) return;
      chosen.push(letter);
      button.disabled = true;
      [...slots.children].forEach((slot, slotIndex) => { slot.textContent = chosen[slotIndex] || ""; });
    });
    letterGrid.append(button);
  });

  const buzzButton = node("button", "picture-buzz-button", q.buzzOwnerName ? `🔔 ${q.buzzOwnerName} đang trả lời` : "🔔 BẤM CHUÔNG GIÀNH QUYỀN");
  buzzButton.type = "button";
  buzzButton.disabled = !q.canBuzz;
  buzzButton.addEventListener("click", async () => {
    buzzButton.disabled = true;
    try {
      await request(`/api/minigame/rooms/${roomCode}/buzz`, { method: "POST", body: "{}" });
      await pollRoom();
    } catch (error) {
      setError(error.message);
      await pollRoom();
    }
  });

  const actions = node("div", "picture-game-actions");
  const clearButton = node("button", "secondary-action", "Xóa chữ");
  clearButton.type = "button";
  clearButton.disabled = !isOwner;
  clearButton.addEventListener("click", () => {
    chosen.length = 0;
    [...slots.children].forEach((slot) => { slot.textContent = ""; });
    [...letterGrid.children].forEach((button) => { button.disabled = !isOwner; });
  });
  const submitButton = node("button", "primary-action", "Gửi đáp án");
  submitButton.type = "button";
  submitButton.disabled = !isOwner;
  submitButton.addEventListener("click", async () => {
    if (chosen.length !== q.slots) {
      setError(`Hãy chọn đủ ${q.slots} chữ cái.`);
      return;
    }
    submitButton.disabled = true;
    try {
      await request(`/api/minigame/rooms/${roomCode}/picture-answer`, {
        method: "POST",
        body: JSON.stringify({ answer: chosen.join("") }),
      });
      liveStatus.textContent = "Đã gửi đáp án Đuổi hình bắt chữ.";
      await pollRoom();
    } catch (error) {
      setError(error.message);
      await pollRoom();
    }
  });
  actions.append(clearButton, submitButton);

  const status = node("p", "picture-game-status", isOwner ? "Bạn đang có quyền trả lời trong 10 giây!" : q.buzzOwnerName ? `${q.buzzOwnerName} đang trả lời…` : "Bấm chuông để giành quyền trả lời trước!");
  const error = node("p", "game-error");
  content.replaceChildren(top, image, hint, status, slots, letterGrid, buzzButton, actions, error);
}

function renderObstacleBoard(snapshot) {
  const board = node("section", "obstacle-board");
  board.setAttribute("aria-label", "Bảng hình ảnh của Vượt Chướng Ngại Vật");
  const heading = node("div", "obstacle-board-heading");
  heading.append(
    node("span", "obstacle-kicker", "VƯỢT CHƯỚNG NGẠI VẬT"),
    node("strong", "obstacle-keyword-length", `${snapshot.obstacle.keywordLength} ký tự`),
  );
  const rows = node("div", "obstacle-clue-grid");
  snapshot.obstacle.revealedRows.forEach((revealed, index) => {
    const row = node("div", `obstacle-clue-row${revealed ? " revealed" : ""}`);
    row.setAttribute("aria-label", revealed ? `Hàng ngang ${index + 1}: ${snapshot.obstacle.revealedAnswers[index]}` : `Hàng ngang ${index + 1} chưa mở`);
    row.append(
      node("span", "obstacle-tile-label", String(index + 1)),
      node("strong", "obstacle-clue-answer", revealed ? snapshot.obstacle.revealedAnswers[index] : "Chưa mở"),
    );
    rows.append(row);
  });
  const answer = node("div", "obstacle-keyword");
  for (let index = 0; index < snapshot.obstacle.keywordLength; index += 1) {
    answer.append(node("span", "obstacle-letter", snapshot.obstacle.keyword?.[index] || (snapshot.obstacle.centralQuestion ? "?" : "•")));
  }
  const note = node("p", "obstacle-board-note",
    snapshot.obstacle.keyword
      ? `${snapshot.obstacle.logic} · Từ khóa: ${snapshot.obstacle.keyword}`
      : snapshot.obstacle.centralQuestion
        ? "Ô trung tâm: chọn từ khóa liên kết các đáp án hàng ngang."
        : "Trả lời đúng để mở đáp án hàng ngang và tìm mối liên hệ chung.");
  board.append(heading, rows, answer, note);
  return board;
}

function renderQuestion(snapshot) {
  const question = snapshot.currentQuestion;
  const top = node("div", "round-topline");
  top.append(node("span", "round-counter", `CÂU ${question.number} / ${question.total}`));
  const timer = node("span", "timer-pill", `${Math.ceil(question.timeLeftMs / 1000)} giây`);
  if (question.timeLeftMs <= 5_000) timer.classList.add("urgent");
  top.append(timer);
  const prompt = node("div", "question-box");
  prompt.append(node("p", "question-prompt", question.prompt), node("p", "question-text", question.question));
  const title = node("p", "answer-label", "Chọn đáp án đúng");
  const grid = node("div", "answer-grid");
  question.options.forEach((option, index) => {
    const button = node("button", "option-button");
    button.type = "button";
    button.disabled = snapshot.hasAnswered;
    button.append(node("span", "option-number", String(index + 1)), node("span", "", option));
    button.addEventListener("click", async () => {
      button.disabled = true;
      [...grid.querySelectorAll("button")].forEach((candidate) => { candidate.disabled = true; });
      waiting.textContent = "Đã gửi đáp án! Chờ các bạn còn lại nhé…";
      try {
        await request(`/api/minigame/rooms/${roomCode}/answer`, {
          method: "POST",
          body: JSON.stringify({ optionIndex: index }),
        });
        liveStatus.textContent = "Đã nhận câu trả lời của bạn.";
        await pollRoom();
      } catch (error) {
        setError(error.message);
        await pollRoom();
      }
    });
    grid.append(button);
  });
  const waiting = node("p", "answer-waiting", snapshot.hasAnswered ? "Đã gửi đáp án! Chờ các bạn còn lại nhé…" : "");
  const scoreRows = node("ul", "round-score-list");
  snapshot.players.forEach((player) => {
    const item = node("li", "round-score-row");
    item.append(node("span", "", player.username), node("strong", "", `${player.score} điểm`));
    scoreRows.append(item);
  });
  content.replaceChildren(
    ...(snapshot.mode === "obstacle" ? [renderObstacleBoard(snapshot)] : []),
    top,
    prompt,
    title,
    grid,
    waiting,
    scoreRows,
  );
  if (countdownTimer) window.clearInterval(countdownTimer);
  const deadline = question.deadline;
  countdownTimer = window.setInterval(() => {
    const seconds = Math.max(0, Math.ceil((deadline - Date.now()) / 1000));
    timer.textContent = `${seconds} giây`;
    timer.classList.toggle("urgent", seconds <= 5);
  }, 200);
}

function renderRoundResult(snapshot, username) {
  const result = snapshot.roundResult;
  const ownResult = result.players.find((player) => player.username === username);
  const reaction = result.reactions.find((item) => item.target === username);
  const heading = node("h2", "", ownResult?.correct ? "Tuyệt vời, chính xác rồi!" : "Lượt này chưa sao nhé!");
  const emoji = node("div", "result-emoji", ownResult?.correct ? "🎉" : "🦊");
  const copy = node("p", "result-copy",
    ownResult?.correct
      ? `Bạn ghi ${ownResult.points} điểm ở lượt này. Cứ giữ nhịp thật tốt nhé!`
      : "Cùng xem đáp án rồi chuẩn bị cho câu tiếp theo nhé.");
  const answer = node("div", "answer-reveal",
    `Đáp án đúng: ${result.correctAnswer} — ${result.explanation}`);
  const rows = node("ul", "round-score-list");
  result.players.forEach((player) => {
    const item = node("li", "round-score-row");
    item.append(node("span", "", `${player.username} · ${player.response}`), node("strong", "", `+${player.points}`));
    rows.append(item);
  });
  const reactionBox = reaction
    ? node("p", "playful-reaction", `😄 ${reaction.by} cổ vũ ${reaction.target}: “${reaction.text}”`)
    : node("p", "playful-reaction", ownResult?.correct ? "✨ Bạn vừa ghi điểm! Cùng cổ vũ cả phòng nhé." : "🦊 Cố lên, ván sau mình gỡ nhé!");
  const progress = node("p", "result-progress", `Đang chuẩn bị câu ${Math.min(result.number + 1, snapshot.questionCount)}…`);
  content.replaceChildren(node("section", "round-result"));
  if (snapshot.mode === "obstacle") {
    content.firstChild.append(renderObstacleBoard(snapshot));
  }
  content.firstChild.append(emoji, heading, copy, answer, rows, reactionBox, progress);
}

function renderFinalResult(snapshot) {
  const result = snapshot.finalResult;
  const firstPlace = result.players.filter((player) => player.outcome === "win" || player.outcome === "draw");
  const playersWhoLost = result.players.filter((player) => player.outcome === "loss");
  const headingText = firstPlace.length > 1 ? "Một ván hòa thật sít sao!" : "Chúc mừng người chiến thắng!";
  const heading = node("h2", "", headingText);
  const copy = node("p", "result-copy", `Hoàn thành ${snapshot.questionCount} câu ${snapshot.topic}. Cảm ơn cả nhóm đã chơi thật vui!`);
  const scene = node("div", "podium-scene");
  const winnersArea = node("section", "podium-winners");
  winnersArea.setAttribute("aria-label", firstPlace.length > 1 ? "Những người đồng chiến thắng trên bục" : "Người chiến thắng trên bục");
  firstPlace.forEach((player) => {
    const winner = node("article", "podium-winner");
    const character = node("div", "winner-character");
    const fox = node("img", "winner-fox");
    fox.src = "/images/lua-fox.png";
    fox.alt = `${player.username} vui mừng trên bục chiến thắng`;
    const trophy = node("span", "winner-trophy", "🏆");
    trophy.setAttribute("role", "img");
    trophy.setAttribute("aria-label", "Cúp chiến thắng Lụa đang nâng");
    character.append(fox, trophy);
    const step = node("div", "podium-step");
    step.append(
      node("span", "podium-place", firstPlace.length > 1 ? "ĐỒNG HẠNG NHẤT" : "HẠNG NHẤT"),
      node("strong", "podium-player-name", player.username),
      node("span", "podium-player-score", `${player.score} điểm · ${player.correctAnswers} câu đúng`),
      node("span", "podium-number", "1"),
    );
    winner.append(character, step);
    winnersArea.append(winner);
  });
  scene.append(winnersArea);
  if (playersWhoLost.length) {
    const losersArea = node("section", "podium-losers");
    losersArea.setAttribute("aria-label", "Những người chơi sẽ gỡ điểm ở ván sau");
    losersArea.append(node("h3", "podium-losers-heading", "Các bạn cùng hẹn gỡ ở ván sau nhé!"));
    const losers = node("div", "podium-loser-list");
    playersWhoLost.forEach((player) => {
      const loser = node("article", "podium-loser");
      const fox = node("img", "loser-fox");
      fox.src = "/images/lua-fox-sad.png";
      fox.alt = `${player.username} tiếc nuối sau ván chơi`;
      const details = node("span", "loser-details");
      details.append(
        node("strong", "loser-name", player.username),
        node("small", "loser-score", `${player.score} điểm · ${player.correctAnswers} câu đúng`),
      );
      loser.append(fox, details);
      losers.append(loser);
    });
    losersArea.append(losers);
    scene.append(losersArea);
  } else {
    scene.append(node("p", "podium-draw-note", "Cả nhóm đều lên bục — chơi hay quá!"));
  }

  const standings = node("details", "final-standings");
  standings.append(node("summary", "", "Xem bảng điểm chi tiết"));
  const rows = node("ol", "final-score-list");
  result.players.forEach((player, index) => {
    const item = node("li", "final-score-row");
    item.append(
      node("span", "final-rank", `#${index + 1}`),
      node("span", "", `${player.username} · ${player.correctAnswers} câu đúng`),
      node("strong", `final-outcome${player.outcome === "draw" ? " draw" : ""}`,
        `${player.score} điểm${player.outcome === "draw" ? " · Hòa" : player.outcome === "win" ? " · Thắng" : ""}`),
    );
    rows.append(item);
  });
  standings.append(rows);
  const backButton = node("button", "primary-action", "← Về chọn phòng");
  backButton.type = "button";
  backButton.addEventListener("click", async () => {
    await leaveRoom();
  });
  const section = node("section", "final-result");
  section.append(heading, copy, scene, standings, node("div", "final-actions"));
  section.querySelector(".final-actions").append(backButton);
  content.replaceChildren(section);
}

function renderRoom(snapshot) {
  const username = snapshot.you.username;
  const question = snapshot.currentQuestion;
  const key = JSON.stringify({
    phase: snapshot.phase,
    players: snapshot.players.map(({ username: name, score, hasAnswered, correctAnswers }) => [name, score, hasAnswered, correctAnswers]),
    question: question && [question.number, question.prompt, question.question, question.options, Math.ceil(question.timeLeftMs / 1000)],
    picture: snapshot.pictureQuestion && [snapshot.pictureQuestion.number, snapshot.pictureQuestion.buzzOwnerName, snapshot.pictureQuestion.buzzTimeLeftMs, snapshot.pictureQuestion.canBuzz],
    obstacle: snapshot.obstacle,
    result: snapshot.roundResult,
    final: snapshot.finalResult,
  });
  if (key === lastRenderKey && snapshot.phase === "playing") return;
  lastRenderKey = key;
  if (snapshot.phase === "lobby") {
    playLobbyMusic();
    renderLobby(snapshot);
  } else if (snapshot.phase === "playing") {
    if (!activeGameTrackStarted) {
      playNextGameMusic();
      activeGameTrackStarted = true;
    }
    if (snapshot.mode === "picture") renderPictureQuestion(snapshot);
    else renderQuestion(snapshot);
  } else if (snapshot.phase === "roundResult") {
    renderRoundResult(snapshot, username);
  } else if (snapshot.phase === "finished") {
    if (snapshot.finalResult?.players?.some((player) => player.outcome === "win")) playVictoryMusic();
    renderFinalResult(snapshot);
    loadLeaderboard();
    stopRoomPolling();
  }
}

async function pollRoom() {
  if (!roomCode || pollInFlight) return;
  pollInFlight = true;
  try {
    const snapshot = await request(`/api/minigame/rooms/${encodeURIComponent(roomCode)}`);
    renderRoom(snapshot);
  } catch (error) {
    if (error.message.includes("Phòng không còn hoạt động") || error.message.includes("hết hạn")) {
      stopRoomPolling();
      liveStatus.textContent = error.message;
      window.history.replaceState(null, "", window.location.pathname);
      roomCode = "";
      renderSetup();
    } else {
      liveStatus.textContent = `${error.message} Đang thử kết nối lại…`;
    }
  } finally {
    pollInFlight = false;
  }
}

function startRoomPolling() {
  stopRoomPolling();
  pollRoom();
  pollTimer = window.setInterval(pollRoom, 700);
}

async function leaveRoom() {
  if (roomCode) {
    try {
      await request(`/api/minigame/rooms/${encodeURIComponent(roomCode)}/leave`, {
        method: "POST",
        body: "{}",
      });
    } catch (error) {
      setError(error.message);
      return;
    }
  }
  stopRoomPolling();
  roomCode = "";
  query.delete("room");
  window.history.replaceState(null, "", window.location.pathname);
  liveStatus.textContent = "";
  renderSetup();
}

async function initialize() {
  try {
    await Promise.all([loadTopics(), loadLeaderboard()]);
    renderSetup();
    const inviteCode = query.get("room");
    if (inviteCode) {
      await request(`/api/minigame/rooms/${encodeURIComponent(inviteCode)}/join`, {
        method: "POST",
        body: "{}",
      });
      enterRoom(inviteCode);
    }
  } catch (error) {
    content.replaceChildren(node("p", "game-error", `${error.message} Hãy tải lại trang để thử lại.`));
  }
}

syncMusicToggle();
initialize();
