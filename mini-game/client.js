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
let socialData = { friends: [], incoming: [], outgoing: [] };
let invitedFriendIds = new Set();
let invitePollTimer = null;
let olympiaSpeechKey = "";
let olympiaAudio = null;
let olympiaAudioUrl = "";
let olympiaRecognition = null;
let speechRevealTimer = null;
const speechRevealProgress = new Map();

function node(tag, className, text) {
  const element = document.createElement(tag);
  if (className) element.className = className;
  if (text !== undefined) element.textContent = text;
  return element;
}

function avatarImage(avatarId) {
  return avatarId === "knight" ? "/images/ai-knight.png" : "/images/lua-fox.png";
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

async function loadSocialData() {
  socialData = await request("/api/minigame/friends");
  return socialData;
}

async function pollGameInvites() {
  const container = document.querySelector("#game-invitations");
  if (!container) return;
  const { invites } = await request("/api/minigame/invites");
  container.replaceChildren();
  container.hidden = invites.length === 0;
  if (!invites.length) return;
  const heading = node("h2", "game-invitations-heading", "🎮 Lời mời chơi từ bạn bè");
  container.append(heading);
  invites.forEach((invite) => {
    const card = node("article", "game-invitation");
    const details = node("p", "game-invitation-copy", `${invite.invitedByUsername} mời bạn chơi: ${invite.topic}`);
    const actions = node("div", "game-invitation-actions");
    const accept = node("button", "primary-action", "Vào chơi ngay");
    accept.type = "button";
    accept.addEventListener("click", async () => {
      accept.disabled = true;
      try {
        const room = await request(`/api/minigame/invites/${encodeURIComponent(invite.id)}/accept`, {
          method: "POST",
          body: "{}",
        });
        enterRoom(room.code);
      } catch (error) {
        accept.disabled = false;
        setError(error.message);
        await pollGameInvites();
      }
    });
    const decline = node("button", "secondary-action", "Từ chối");
    decline.type = "button";
    decline.addEventListener("click", async () => {
      decline.disabled = true;
      try {
        await request(`/api/minigame/invites/${encodeURIComponent(invite.id)}`, { method: "DELETE" });
        await pollGameInvites();
      } catch (error) {
        decline.disabled = false;
        setError(error.message);
      }
    });
    actions.append(accept, decline);
    card.append(details, actions);
    container.append(card);
  });
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
    info.append(node("small", "leaderboard-meta", `${entry.rank.icon} ${entry.rank.name} · ${entry.wins} thắng · ${entry.gamesPlayed} ván · ${entry.correctAnswers} câu đúng`));
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
  document.querySelector(".game-columns")?.classList.remove("obstacle-mode-active");
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
    new Option("Vượt Chướng Ngại Vật · tranh + hàng ngang + ô trung tâm", "obstacle"),
    new Option("Olympia · câu mở đầu + chuông (không có bảng tranh)", "olympia"),
  );
  const countSelect = node("select");
  countSelect.name = "questionCount";
  countSelect.required = true;
  [5, 10, 15].forEach((count) => {
    const option = node("option", "", `${count} câu hỏi`);
    option.value = String(count);
    countSelect.append(option);
  });
  const countField = createSetupField("Số câu trong ván", countSelect);
  form.append(
    createSetupField("Chế độ chơi", modeSelect),
    createSetupField("Chọn chủ đề", topicSelect),
    countField,
  );
  modeSelect.addEventListener("change", () => {
    const isPictureMode = modeSelect.value === "picture";
    const isObstacleMode = modeSelect.value === "obstacle";
    const isOlympiaMode = modeSelect.value === "olympia";
    countField.firstChild.textContent = isObstacleMode ? "Số hàng ngang" : "Số câu trong ván";
    countSelect.querySelectorAll("option").forEach((option) => {
      const count = Number(option.value);
      option.textContent = isObstacleMode
        ? `${count} hàng ngang + 1 ô trung tâm`
        : `${count} câu hỏi`;
    });
    topicSelect.querySelectorAll("option").forEach((option) => {
      option.disabled = isPictureMode && option.value === "geography";
    });
    if (isPictureMode && topicSelect.value === "geography") {
      topicSelect.value = topicSelect.querySelector("option:not(:disabled)")?.value || "";
    }
    countSelect.disabled = isPictureMode;
    countSelect.value = isPictureMode ? "5" : countSelect.value;
    topicSelect.title = isOlympiaMode ? "Mỗi câu Olympia có hình minh họa theo chủ đề." : "";
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
        ? "✨ AI đang tạo câu hỏi và tự vẽ tranh..."
        : modeSelect.value === "olympia"
          ? "✨ AI đang tạo câu hỏi Olympia..."
      : modeSelect.value === "quiz"
        ? "✨ Ollama đang tạo câu hỏi..."
        : `✨ AI đang tạo ${countSelect.value} câu...`;
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
  stopOlympiaVoice();
  olympiaSpeechKey = "";
  roomCode = code.toUpperCase();
  invitedFriendIds = new Set();
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
    const avatar = node("img", "player-avatar");
    avatar.src = avatarImage(player.avatarId);
    avatar.alt = `${player.username} đã chọn avatar`;
    identity.append(avatar);
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
  const info = node("p", "room-info", snapshot.mode === "olympia"
    ? `${snapshot.topic} · 1 câu mở đầu 25 giây + ${snapshot.questionCount} câu nhánh giành chuông · tối đa 6 người`
    : snapshot.mode === "obstacle"
    ? `${snapshot.topic} · ${snapshot.questionCount} hàng ngang + ô trung tâm · AI vẽ tranh riêng · không tính giờ/điểm`
    : `${snapshot.topic} · ${snapshot.questionCount} câu hỏi · tối đa 6 người`);
  const reviewWarning = snapshot.questionReview?.warning
    ? node("p", "game-hint", snapshot.questionReview.status === "unavailable"
      ? "Groq chưa rà soát được bộ câu hỏi. Hãy kiểm tra nội dung trong lúc chơi."
      : "Groq có cảnh báo về bộ câu hỏi; kết quả rà soát có thể chưa chính xác. Hãy kiểm tra nội dung khi chơi.")
    : null;
  const playersHeading = node("h3", "answer-label", `Người chơi (${snapshot.players.length}/6)`);
  const players = renderPlayerList(snapshot.players);
  const friendInvitePanel = node("section", "friend-invite-panel");
  friendInvitePanel.append(node("h3", "answer-label", "Mời bạn bè trực tiếp"));
  if (!snapshot.isHost) {
    friendInvitePanel.append(node("p", "game-hint", "Chỉ chủ phòng có thể gửi lời mời trực tiếp."));
  } else if (socialData.friends.length === 0) {
    friendInvitePanel.append(node("p", "game-hint", "Chưa có bạn bè để mời. Kết bạn từ trang chính hoặc tiếp tục chia sẻ mã phòng."));
  } else {
    const friendList = node("div", "friend-invite-list");
    const invitedStatus = node("p", "friend-invite-status");
    socialData.friends.forEach((friend) => {
      const row = node("div", "friend-invite-row");
      row.append(node("span", "", friend.username));
      const inviteButton = node("button", "secondary-action", invitedFriendIds.has(friend.userId) ? "Đã mời" : "Mời vào phòng");
      inviteButton.type = "button";
      inviteButton.disabled = invitedFriendIds.has(friend.userId) || snapshot.players.some((player) => player.username === friend.username);
      inviteButton.addEventListener("click", async () => {
        inviteButton.disabled = true;
        try {
          await request(`/api/minigame/friends/${encodeURIComponent(friend.userId)}/invites`, {
            method: "POST",
            body: JSON.stringify({ roomCode: snapshot.code }),
          });
          invitedFriendIds.add(friend.userId);
          inviteButton.textContent = "Đã mời";
          invitedStatus.textContent = `Đã gửi lời mời cho ${friend.username}.`;
        } catch (error) {
          invitedStatus.textContent = error.message;
          inviteButton.disabled = false;
        }
      });
      row.append(inviteButton);
      friendList.append(row);
    });
    friendInvitePanel.append(friendList, invitedStatus);
  }
  const rules = node("section", "rules-panel");
  rules.append(node("h3", "rules-title", "LUẬT CHƠI – CẢ NHÓM CẦN ĐỒNG Ý"));
  const ruleItems = snapshot.mode === "olympia"
    ? [
      "AI đọc câu hỏi mở bao quát cùng hình minh họa; cả phòng có 25 giây suy nghĩ.",
      "Mỗi câu nhánh được AI đọc; đọc xong sẽ đếm ngược 3 giây ở giữa màn hình rồi mới mở chuông.",
      "Chỉ người bấm chuông trước mới được nhập câu trả lời hoặc dùng micro để nói.",
      "Trả lời sai hoặc hết 10 giây sẽ mất lượt câu đó; người khác được bấm chuông.",
      "Trả lời đúng được 100 điểm; hết 30 giây hoặc mọi người đã mất lượt thì xem đáp án.",
    ]
    : snapshot.mode === "obstacle"
    ? [
      `AI tạo ${snapshot.obstacle.clueCount} hàng ngang, thêm một câu hỏi ô trung tâm và tự vẽ tranh gợi ý riêng.`,
      "Cả nhóm lần lượt chọn hàng ngang; AI đọc câu hỏi và chữ hiện dần theo giọng đọc.",
      "Bấm chuông để nhận lượt trả lời. Trả lời sai thì nhường lượt cho người khác; không giới hạn thời gian.",
      "Trả lời đúng hàng nào thì mở mảnh ghép cùng số. Không cộng điểm và không thưởng tốc độ.",
      `Sau khi hoàn thành tất cả hàng ngang, cả nhóm mở ô trung tâm số ${snapshot.obstacle.clueCount + 1} để nhận gợi ý cuối cùng.`,
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
    friendInvitePanel,
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

function selectObstacleRow(rowNumber) {
  return request(`/api/minigame/rooms/${encodeURIComponent(roomCode)}/obstacle/select`, {
    method: "POST",
    body: JSON.stringify({ rowNumber }),
  });
}

function renderObstaclePuzzle(snapshot, canChoose) {
  const obstacle = snapshot.obstacle;
  const panel = node("section", "obstacle-puzzle-panel");
  panel.setAttribute("aria-label", "Bức tranh Vượt Chướng Ngại Vật");
  const heading = node("div", "obstacle-board-heading");
  heading.append(
    node("span", "obstacle-kicker", "BỨC TRANH GỢI Ý"),
    node("strong", "obstacle-keyword-length", `${obstacle.keywordLength} chữ cái`),
  );
  const board = node("div", "obstacle-picture-board");
  const image = node("img", "obstacle-ai-image");
  image.src = obstacle.image;
  image.alt = "Tranh minh họa do AI tạo, đang được che bởi các mảnh ghép";
  image.loading = "eager";
  board.append(image);
  const pieceGrid = node("div", "obstacle-piece-grid");
  const columns = Math.ceil(Math.sqrt(obstacle.clueCount));
  const remainder = obstacle.clueCount % columns;
  pieceGrid.style.gridTemplateColumns = `repeat(${columns}, minmax(0, 1fr))`;
  pieceGrid.style.gridTemplateRows = `repeat(${Math.ceil(obstacle.clueCount / columns)}, minmax(0, 1fr))`;
  obstacle.revealedRows.forEach((revealed, index) => {
    const piece = node("button", `obstacle-piece${revealed ? " opened" : ""}${obstacle.completedRows[index] && !revealed ? " closed" : ""}`, String(index + 1));
    piece.type = "button";
    if (remainder && index === obstacle.clueCount - 1) {
      piece.style.gridColumn = `span ${columns - remainder + 1}`;
    }
    piece.disabled = !canChoose || obstacle.completedRows[index];
    piece.setAttribute("aria-label", `Chọn hàng ngang ${index + 1}`);
    piece.addEventListener("click", async () => {
      piece.disabled = true;
      try {
        await selectObstacleRow(index + 1);
        await pollRoom();
      } catch (error) {
        setError(error.message);
        await pollRoom();
      }
    });
    pieceGrid.append(piece);
  });
  board.append(pieceGrid);
  const centerNumber = obstacle.clueCount + 1;
  const center = node("button", `obstacle-piece-center${obstacle.centerRevealed ? " opened" : ""}${obstacle.centerResolved && !obstacle.centerRevealed ? " closed" : ""}`, String(centerNumber));
  center.type = "button";
  center.disabled = !canChoose || !obstacle.canSelectCenter;
  center.setAttribute("aria-label", `Chọn ô trung tâm số ${centerNumber}`);
  center.addEventListener("click", async () => {
    center.disabled = true;
    try {
      await selectObstacleRow(centerNumber);
      await pollRoom();
    } catch (error) {
      setError(error.message);
      await pollRoom();
    }
  });
  board.append(center);

  const keyword = node("div", "obstacle-keyword", obstacle.keyword
    ? `TỪ KHÓA: ${obstacle.keyword}`
    : `ẨN SỐ · ${obstacle.keywordLength} CHỮ CÁI`);
  const rowList = node("div", "obstacle-row-list");
  obstacle.completedRows.forEach((completed, index) => {
    const row = node("button", `obstacle-row-status${obstacle.revealedRows[index] ? " revealed" : completed ? " closed" : ""}`);
    row.type = "button";
    row.disabled = !canChoose || completed;
    row.append(
      node("span", "obstacle-tile-label", String(index + 1)),
      node("span", "", `Hàng ngang ${index + 1}`),
      node("strong", "", obstacle.revealedRows[index]
        ? obstacle.revealedAnswers[index]
        : completed ? "Đã khép lại" : "Chưa mở"),
    );
    row.addEventListener("click", async () => {
      row.disabled = true;
      try {
        await selectObstacleRow(index + 1);
        await pollRoom();
      } catch (error) {
        setError(error.message);
        await pollRoom();
      }
    });
    rowList.append(row);
  });
  panel.append(heading, board, keyword, rowList);
  return panel;
}

function renderObstacleQuestion(snapshot) {
  const obstacle = snapshot.obstacle;
  const question = snapshot.currentQuestion;
  const area = node("section", "obstacle-question-area");
  if (!question) {
    area.append(
      node("h2", "obstacle-question-title", "Chọn hàng ngang để bắt đầu"),
      node("p", "obstacle-question-help", obstacle.canSelectCenter
        ? "Bốn hàng ngang đã hoàn tất. Cùng mở ô đỏ số 5 để nhận gợi ý cuối."
        : "Chọn một ô số 1–4 trên tranh hoặc danh sách để nghe câu hỏi."),
    );
    return area;
  }

  area.append(
    node("p", "obstacle-question-number", obstacle.centralQuestion ? "Ô TRUNG TÂM · GỢI Ý CUỐI" : `HÀNG NGANG ${question.number}`),
    node("h2", "obstacle-question-title", question.prompt),
  );
  const speechKey = `${snapshot.code}:obstacle:${question.number}`;
  area.append(renderOlympiaCaption(question.question, speechKey));

  const buzz = node("button", "obstacle-buzz-button");
  buzz.type = "button";
  buzz.disabled = snapshot.phase !== "playing" || !obstacle.canBuzz;
  buzz.textContent = snapshot.phase === "obstacleReading"
    ? "🔔 CHUÔNG SẼ MỞ SAU KHI AI ĐỌC XONG"
    : obstacle.buzzOwnerName
      ? `🔔 ${obstacle.buzzOwnerName} ĐANG GIỮ LƯỢT`
      : obstacle.hasLostTurn
        ? "🔔 BẠN ĐÃ THỬ CÂU NÀY"
        : "🔔 BẤM CHUÔNG GIÀNH QUYỀN TRẢ LỜI";
  buzz.addEventListener("click", async () => {
    buzz.disabled = true;
    try {
      await request(`/api/minigame/rooms/${encodeURIComponent(roomCode)}/buzz`, { method: "POST", body: "{}" });
      await pollRoom();
    } catch (error) {
      setError(error.message);
      await pollRoom();
    }
  });
  area.append(buzz);

  if (snapshot.phase === "obstacleReading") {
    area.append(node("p", "olympia-reading-status", "AI đang đọc câu hỏi…"));
    speakAiQuestion(snapshot, question.question, speechKey);
  } else if (snapshot.phase === "playing") {
    const status = node("p", "obstacle-turn-status", obstacle.buzzOwnerName
      ? `${obstacle.buzzOwnerName} đang có lượt trả lời.`
      : obstacle.hasLostTurn ? "Bạn đã thử câu này rồi; hãy nhường lượt cho người khác."
        : "Không giới hạn thời gian. Bấm chuông khi bạn muốn nhận lượt.");
    area.append(status);
    if (obstacle.canAnswer) {
      const choices = node("div", "obstacle-answer-options");
      if (!obstacle.centralQuestion) {
        question.options.forEach((option, index) => {
          const answerButton = node("button", "option-button", `${String.fromCharCode(65 + index)}. ${option}`);
          answerButton.type = "button";
          answerButton.addEventListener("click", async () => {
            answerButton.disabled = true;
            try {
              await request(`/api/minigame/rooms/${encodeURIComponent(roomCode)}/obstacle/answer`, {
                method: "POST",
                body: JSON.stringify({ optionIndex: index }),
              });
              await pollRoom();
            } catch (error) {
              setError(error.message);
              await pollRoom();
            }
          });
          choices.append(answerButton);
        });
      }
      const form = node("form", "obstacle-answer-form");
      const input = node("input", "olympia-answer-input");
      input.type = "text";
      input.maxLength = 300;
      input.placeholder = obstacle.centralQuestion ? "Nhập từ khóa ẩn (có thể không dấu)…" : "Hoặc nhập câu trả lời ngắn…";
      input.setAttribute("aria-label", "Câu trả lời ngắn");
      const submit = node("button", "primary-action", "Gửi câu trả lời");
      submit.type = "submit";
      form.append(input, submit);
      form.addEventListener("submit", async (event) => {
        event.preventDefault();
        if (!input.value.trim()) {
          setError("Hãy chọn một đáp án hoặc nhập câu trả lời.");
          input.focus();
          return;
        }
        submit.disabled = true;
        try {
          await request(`/api/minigame/rooms/${encodeURIComponent(roomCode)}/obstacle/answer`, {
            method: "POST",
            body: JSON.stringify({ answer: input.value.trim() }),
          });
          await pollRoom();
        } catch (error) {
          setError(error.message);
          await pollRoom();
        }
      });
      if (!obstacle.centralQuestion) area.append(choices);
      area.append(form);
    }
  }
  return area;
}

function renderObstacleGame(snapshot) {
  stopGameMusic();
  const game = node("section", "obstacle-game");
  const layout = node("div", "obstacle-game-layout");
  const canChoose = snapshot.phase === "obstacleSelect";
  layout.append(renderObstaclePuzzle(snapshot, canChoose), renderObstacleQuestion(snapshot));
  game.append(layout);

  if (snapshot.phase === "obstacleResult") {
    const result = snapshot.obstacle.answerResult;
    const panel = node("section", "obstacle-result-panel");
    panel.append(
      node("h2", "obstacle-result-heading", result.correct ? "Mảnh ghép đã mở!" : "Hàng ngang đã khép lại"),
      node("p", "obstacle-result-copy", result.correct ? "Cả nhóm đã trả lời đúng." : "Cả nhóm đã thử lượt này. Cùng xem đáp án rồi chọn câu tiếp nhé."),
      node("p", "obstacle-result-answer", `Đáp án: ${result.correctAnswer}`),
      node("p", "obstacle-result-explanation", result.explanation),
    );
    const next = node("button", "primary-action", "Tiếp tục chọn câu");
    next.type = "button";
    next.addEventListener("click", async () => {
      next.disabled = true;
      try {
        await request(`/api/minigame/rooms/${encodeURIComponent(roomCode)}/obstacle/continue`, { method: "POST", body: "{}" });
        await pollRoom();
      } catch (error) {
        setError(error.message);
        await pollRoom();
      }
    });
    panel.append(next);
    game.append(panel);
  }
  game.append(node("p", "game-error"));
  content.replaceChildren(game);
}

function renderObstacleFinal(snapshot) {
  const result = snapshot.obstacle;
  const section = node("section", "obstacle-final");
  section.append(
    renderObstaclePuzzle(snapshot, false),
    node("h2", "obstacle-result-heading", result.finalOutcome === "solved" ? "Cả nhóm đã giải được ẩn số!" : "Cùng xem đáp án của ô trung tâm"),
    node("p", "obstacle-result-answer", `Từ khóa: ${result.keyword}`),
    node("p", "obstacle-result-explanation", result.logic),
  );
  const back = node("button", "primary-action", "← Về chọn phòng");
  back.type = "button";
  back.addEventListener("click", () => { void leaveRoom(); });
  section.append(back);
  content.replaceChildren(section);
}

function stopOlympiaVoice() {
  if (speechRevealTimer) window.clearInterval(speechRevealTimer);
  speechRevealTimer = null;
  if (olympiaAudio) {
    olympiaAudio.pause();
    olympiaAudio.src = "";
    olympiaAudio = null;
  }
  if (olympiaAudioUrl) {
    URL.revokeObjectURL(olympiaAudioUrl);
    olympiaAudioUrl = "";
  }
  if (olympiaRecognition) {
    olympiaRecognition.abort();
    olympiaRecognition = null;
  }
  window.speechSynthesis?.cancel();
}

async function finishOlympiaSpeech(code, speechKey) {
  try {
    await request(`/api/minigame/rooms/${encodeURIComponent(code)}/speech-complete`, {
      method: "POST",
      body: "{}",
    });
    await pollRoom();
  } catch (error) {
    if (olympiaSpeechKey === speechKey) setError(error.message);
  }
}

function revealQuestionText(speechKey, text, progress) {
  const characters = Array.from(text);
  const count = Math.max(0, Math.min(characters.length, Math.ceil(characters.length * progress)));
  speechRevealProgress.set(speechKey, characters.slice(0, count).join(""));
  const captionText = [...document.querySelectorAll(".olympia-caption-text")]
    .find((element) => element.dataset.speechKey === speechKey);
  if (captionText) captionText.textContent = speechRevealProgress.get(speechKey);
}

function speakAiQuestion(snapshot, text, speechKey) {
  if (olympiaSpeechKey === speechKey) return;
  if (speechRevealTimer) window.clearInterval(speechRevealTimer);
  speechRevealTimer = null;
  olympiaSpeechKey = speechKey;
  speechRevealProgress.set(speechKey, "");
  while (speechRevealProgress.size > 40) {
    speechRevealProgress.delete(speechRevealProgress.keys().next().value);
  }
  liveStatus.textContent = "AI đang đọc câu hỏi cho cả phòng…";
  const finish = () => {
    if (olympiaSpeechKey !== speechKey) return;
    revealQuestionText(speechKey, text, 1);
    if (!snapshot.isHost) return;
    void finishOlympiaSpeech(snapshot.code, speechKey);
  };
  const speakWithBrowserVoice = () => {
    if (olympiaSpeechKey !== speechKey) return;
    if (!window.speechSynthesis || typeof SpeechSynthesisUtterance !== "function") {
      liveStatus.textContent = "Không hỗ trợ phát giọng ở trình duyệt này; câu hỏi sẽ mở sau giây lát.";
      let progress = 0;
      speechRevealTimer = window.setInterval(() => {
        progress = Math.min(1, progress + 0.1);
        revealQuestionText(speechKey, text, progress);
        if (progress === 1) {
          window.clearInterval(speechRevealTimer);
          speechRevealTimer = null;
          finish();
        }
      }, 100);
      return;
    }
    const utterance = new SpeechSynthesisUtterance(text);
    utterance.lang = "vi-VN";
    utterance.rate = 0.94;
    utterance.onboundary = (event) => {
      if (event.charIndex >= 0) {
        const remaining = text.slice(event.charIndex);
        const spokenWordLength = remaining.match(/^\S*/)?.[0].length || 0;
        revealQuestionText(speechKey, text, (event.charIndex + spokenWordLength) / Math.max(1, text.length));
      }
    };
    utterance.onend = finish;
    utterance.onerror = finish;
    window.speechSynthesis.speak(utterance);
  };
  fetch("/api/elevenlabs/speak", {
    method: "POST",
    credentials: "same-origin",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ text }),
  }).then(async (response) => {
    if (olympiaSpeechKey !== speechKey) return;
    if (!response.ok) throw new Error("ElevenLabs chưa sẵn sàng.");
    olympiaAudioUrl = URL.createObjectURL(await response.blob());
    const audio = new Audio(olympiaAudioUrl);
    olympiaAudio = audio;
    audio.ontimeupdate = () => {
      if (Number.isFinite(audio.duration) && audio.duration > 0) {
        revealQuestionText(speechKey, text, audio.currentTime / audio.duration);
      }
    };
    audio.onended = finish;
    audio.onerror = speakWithBrowserVoice;
    await audio.play();
  }).catch(speakWithBrowserVoice);
}

function renderOlympiaCaption(text, speechKey = "") {
  const caption = node("section", "olympia-caption");
  caption.setAttribute("role", "region");
  caption.setAttribute("aria-label", "Chữ câu hỏi đang được AI đọc");
  caption.setAttribute("aria-live", "polite");
  caption.setAttribute("aria-atomic", "true");
  const captionText = node("p", "olympia-caption-text", speechKey
    ? speechRevealProgress.get(speechKey) || ""
    : text);
  if (speechKey) captionText.dataset.speechKey = speechKey;
  caption.append(
    node("span", "olympia-caption-label", "CÂU HỎI HIỂN THỊ"),
    captionText,
  );
  return caption;
}

function renderOlympia(snapshot) {
  stopGameMusic();
  if (countdownTimer) window.clearInterval(countdownTimer);
  countdownTimer = null;
  const state = snapshot.olympia;
  const stage = node("section", "olympia-stage");
  const header = node("div", "olympia-header");
  header.append(
    node("span", "obstacle-kicker", "ĐƯỜNG LÊN ĐỈNH OLYMPIA"),
    node("span", "olympia-question-count", snapshot.phase === "introReading" || snapshot.phase === "intro"
      ? "CÂU HỎI MỞ ĐẦU"
      : `CÂU ${snapshot.currentQuestion?.number || 1} / ${snapshot.questionCount}`),
  );
  const image = node("img", "olympia-image");
  image.src = state.image;
  image.alt = `Hình minh họa ${snapshot.topic}`;
  image.loading = "eager";
  stage.append(header, image);

  if (snapshot.phase === "introReading" || snapshot.phase === "intro") {
    stage.append(node("h2", "olympia-prompt", "Câu hỏi mở bao quát"));
    stage.append(renderOlympiaCaption(state.introQuestion));
    const reading = snapshot.phase === "introReading";
    const timer = node("div", reading ? "olympia-reading-status" : "olympia-intro-timer",
      reading ? (snapshot.isHost ? "AI đang đọc câu hỏi…" : "Người tạo phòng đang phát câu hỏi…")
        : `${Math.ceil(state.introTimeLeftMs / 1000)} giây để suy nghĩ`);
    stage.append(timer);
    if (!reading) {
      const deadline = Date.now() + state.introTimeLeftMs;
      countdownTimer = window.setInterval(() => {
        const seconds = Math.max(0, Math.ceil((deadline - Date.now()) / 1000));
        timer.textContent = `${seconds} giây để suy nghĩ`;
      }, 150);
    } else {
      const speechKey = `${snapshot.code}:intro`;
      speakAiQuestion(snapshot, state.introQuestion, speechKey);
    }
  } else if (snapshot.currentQuestion) {
    const question = snapshot.currentQuestion;
    stage.append(node("h2", "olympia-prompt", question.prompt));
    stage.append(renderOlympiaCaption(question.question));
    const reading = snapshot.phase === "questionReading";
    if (reading) {
      stage.append(node("p", "olympia-reading-status",
        snapshot.isHost ? "AI đang đọc câu hỏi nhánh…" : "Người tạo phòng đang phát câu hỏi nhánh…"));
      speakAiQuestion(snapshot, `${question.prompt}. ${question.question}`, `${snapshot.code}:question:${question.number}`);
    } else if (snapshot.phase === "countdown") {
      const overlay = node("div", "olympia-countdown-overlay");
      overlay.setAttribute("role", "status");
      overlay.setAttribute("aria-live", "assertive");
      const seconds = Math.max(1, Math.ceil(state.countdownTimeLeftMs / 1000));
      overlay.append(node("span", "olympia-countdown-label", "CHUẨN BỊ BẤM CHUÔNG"), node("strong", "olympia-countdown-number", String(seconds)));
      stage.append(overlay);
    } else {
      const timer = node("div", "olympia-round-timer", `${Math.ceil(question.timeLeftMs / 1000)} giây còn lại`);
      stage.append(timer);
      const deadline = question.deadline;
      const ownerDeadline = Date.now() + state.answerTimeLeftMs;
      const owner = state.buzzOwnerName;
      const status = node("p", "olympia-turn-status", owner
        ? `${owner} đang có quyền trả lời · ${Math.ceil(state.answerTimeLeftMs / 1000)} giây`
        : state.hasLostTurn ? "Bạn đã mất lượt câu này. Hãy cổ vũ người chơi khác!"
          : "Chỉ người bấm chuông trước mới được trả lời.");
      stage.append(status);
      countdownTimer = window.setInterval(() => {
        const seconds = Math.max(0, Math.ceil((deadline - Date.now()) / 1000));
        timer.textContent = `${seconds} giây còn lại`;
        timer.classList.toggle("urgent", seconds <= 5);
        if (owner) status.textContent = `${owner} đang có quyền trả lời · ${Math.max(0, Math.ceil((ownerDeadline - Date.now()) / 1000))} giây`;
      }, 150);

      const buzzButton = node("button", "olympia-buzz-button", owner
        ? `🔔 ${owner} đang trả lời`
        : state.canBuzz ? "🔔 BẤM CHUÔNG GIÀNH QUYỀN"
          : "🔔 CHUÔNG ĐANG KHÓA");
      buzzButton.type = "button";
      buzzButton.disabled = !state.canBuzz;
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
      stage.append(buzzButton);

      if (state.canAnswer) {
        const form = node("form", "olympia-answer-form");
        const answer = node("input", "olympia-answer-input");
        answer.type = "text";
        answer.name = "answer";
        answer.maxLength = 300;
        answer.autocomplete = "off";
        answer.placeholder = "Nhập câu trả lời hoặc bấm micro để nói…";
        answer.setAttribute("aria-label", "Câu trả lời của bạn");
        const submit = node("button", "primary-action", "Gửi câu trả lời");
        submit.type = "submit";
        const recognitionConstructor = window.SpeechRecognition || window.webkitSpeechRecognition;
        const voiceButton = node("button", "olympia-voice-button", recognitionConstructor ? "🎙️ Trả lời bằng giọng nói" : "🎙️ Trình duyệt chưa hỗ trợ nhận giọng nói");
        voiceButton.type = "button";
        voiceButton.disabled = !recognitionConstructor;
        voiceButton.addEventListener("click", () => {
          if (!recognitionConstructor) return;
          const recognition = new recognitionConstructor();
          olympiaRecognition = recognition;
          recognition.lang = "vi-VN";
          recognition.interimResults = false;
          recognition.maxAlternatives = 1;
          voiceButton.disabled = true;
          voiceButton.textContent = "Đang nghe…";
          recognition.onresult = (event) => {
            answer.value = event.results[0][0].transcript;
            answer.focus();
          };
          recognition.onerror = () => setError("Không nhận được giọng nói; bạn có thể nhập câu trả lời bằng chữ.");
          recognition.onend = () => {
            olympiaRecognition = null;
            voiceButton.disabled = false;
            voiceButton.textContent = "🎙️ Trả lời bằng giọng nói";
          };
          try {
            recognition.start();
          } catch {
            olympiaRecognition = null;
            voiceButton.disabled = false;
            voiceButton.textContent = "🎙️ Trả lời bằng giọng nói";
            setError("Không thể bật micro; hãy nhập câu trả lời bằng chữ.");
          }
        });
        form.append(answer, voiceButton, submit);
        form.addEventListener("submit", async (event) => {
          event.preventDefault();
          if (!answer.value.trim()) {
            setError("Hãy nhập hoặc đọc câu trả lời trước khi gửi.");
            answer.focus();
            return;
          }
          submit.disabled = true;
          try {
            await request(`/api/minigame/rooms/${roomCode}/olympia-answer`, {
              method: "POST",
              body: JSON.stringify({ answer: answer.value.trim() }),
            });
            await pollRoom();
          } catch (error) {
            setError(error.message);
            await pollRoom();
          }
        });
        stage.append(form);
      }
    }
  }
  stage.append(node("p", "game-error"));
  content.replaceChildren(stage);
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
    const playerAvatar = snapshot.players.find((item) => item.username === player.username)?.avatarId;
    fox.src = avatarImage(playerAvatar);
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
      fox.src = avatarImage(snapshot.players.find((item) => item.username === player.username)?.avatarId);
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
    mode: snapshot.mode,
    phase: snapshot.phase,
    players: snapshot.players.map(({ username: name, score, hasAnswered, correctAnswers }) => [name, score, hasAnswered, correctAnswers]),
    question: question && [question.number, question.prompt, question.question, question.options, question.image,
      snapshot.mode === "olympia" ? null : Math.ceil(question.timeLeftMs / 1000)],
    picture: snapshot.pictureQuestion && [snapshot.pictureQuestion.number, snapshot.pictureQuestion.buzzOwnerName, snapshot.pictureQuestion.buzzTimeLeftMs, snapshot.pictureQuestion.canBuzz],
    olympia: snapshot.olympia && [
      Math.ceil(snapshot.olympia.introTimeLeftMs / 1000),
      Math.ceil(snapshot.olympia.countdownTimeLeftMs / 1000),
      snapshot.olympia.buzzOwnerName,
      snapshot.olympia.canBuzz,
      snapshot.olympia.canAnswer,
      snapshot.olympia.hasLostTurn,
    ],
    obstacle: snapshot.obstacle,
    result: snapshot.roundResult,
    final: snapshot.finalResult,
  });
  const activeOlympiaPhase = snapshot.mode === "olympia"
    && !["lobby", "roundResult", "finished"].includes(snapshot.phase);
  const activeObstaclePhase = snapshot.mode === "obstacle" && snapshot.phase !== "lobby";
  const speakingQuestion = activeOlympiaPhase
    || (snapshot.mode === "obstacle" && snapshot.phase === "obstacleReading");
  document.querySelector(".game-columns")?.classList.toggle("obstacle-mode-active", activeObstaclePhase);
  if (key === lastRenderKey && (snapshot.phase === "playing" || activeOlympiaPhase || activeObstaclePhase)) return;
  lastRenderKey = key;
  if (!speakingQuestion) stopOlympiaVoice();
  if (snapshot.phase === "lobby") {
    playLobbyMusic();
    renderLobby(snapshot);
  } else if (snapshot.mode === "obstacle" && snapshot.phase === "finished") {
    stopOlympiaVoice();
    renderObstacleFinal(snapshot);
    stopRoomPolling();
  } else if (snapshot.mode === "obstacle") {
    renderObstacleGame(snapshot);
  } else if (activeOlympiaPhase) {
    renderOlympia(snapshot);
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
    stopOlympiaVoice();
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
  stopOlympiaVoice();
  olympiaSpeechKey = "";
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
    await Promise.all([loadTopics(), loadLeaderboard(), loadSocialData()]);
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
  await pollGameInvites().catch((error) => { liveStatus.textContent = error.message; });
  if (!invitePollTimer) {
    invitePollTimer = window.setInterval(() => {
      pollGameInvites().catch((error) => { liveStatus.textContent = error.message; });
    }, 5000);
  }
}

syncMusicToggle();
initialize();
