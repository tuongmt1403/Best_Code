const avatarPicker = document.querySelector("[data-avatar-picker]");
if (avatarPicker) {
  const openButton = avatarPicker.querySelector("[data-avatar-open]");
  const avatarSources = {
    fox: "/images/lua-fox.png",
    knight: "/images/ai-knight.png",
  };
  let selectedAvatarId = "fox";
  let isSaving = false;

  const pickerDialog = document.createElement("dialog");
  pickerDialog.className = "avatar-picker-dialog";
  pickerDialog.setAttribute("aria-labelledby", "avatar-picker-title");
  pickerDialog.innerHTML = `
    <div class="avatar-picker-content">
      <header class="avatar-picker-heading">
        <div>
          <h2 id="avatar-picker-title">Avatar phòng chơi</h2>
          <p>Chọn nhân vật đại diện cho bạn trong phòng thi đấu.</p>
        </div>
        <span class="avatar-picker-current" data-avatar-current></span>
      </header>
      <div class="avatar-picker-options">
        <button type="button" class="avatar-choice" data-avatar-choice="fox" aria-pressed="false" aria-label="Chọn avatar Cáo Lụa">
          <span class="avatar-choice-check" aria-hidden="true">✓</span>
          <span class="avatar-choice-image"><img src="/images/lua-fox.png" alt=""></span>
          <strong>Cáo</strong><small data-avatar-choice-status></small>
        </button>
        <button type="button" class="avatar-choice" data-avatar-choice="knight" aria-pressed="false" aria-label="Chọn avatar Hiệp sĩ AI">
          <span class="avatar-choice-check" aria-hidden="true">✓</span>
          <span class="avatar-choice-image"><img src="/images/ai-knight.png" alt=""></span>
          <strong>Hiệp sĩ</strong><small data-avatar-choice-status></small>
        </button>
      </div>
      <p class="avatar-picker-status" data-avatar-status role="status" aria-live="polite"></p>
      <button type="button" class="avatar-picker-close" data-avatar-close>Đóng</button>
    </div>`;
  document.body.append(pickerDialog);
  const status = pickerDialog.querySelector("[data-avatar-status]");
  const currentLabel = pickerDialog.querySelector("[data-avatar-current]");
  const buttons = [...pickerDialog.querySelectorAll("[data-avatar-choice]")];
  let statusMessage = "";

  const dialog = document.createElement("dialog");
  dialog.className = "avatar-confirm-dialog";
  dialog.setAttribute("aria-labelledby", "avatar-confirm-title");
  const dialogContent = document.createElement("div");
  dialogContent.className = "avatar-confirm-content";
  const dialogTitle = document.createElement("h2");
  dialogTitle.id = "avatar-confirm-title";
  dialogTitle.textContent = "Xác nhận đổi avatar";
  const preview = document.createElement("img");
  preview.className = "avatar-confirm-preview";
  preview.alt = "";
  const dialogMessage = document.createElement("p");
  dialogMessage.className = "avatar-confirm-message";
  dialogMessage.textContent = "Bạn có chắc muốn đổi sang avatar này không?";
  const dialogActions = document.createElement("div");
  dialogActions.className = "avatar-confirm-actions";
  const cancelButton = document.createElement("button");
  cancelButton.type = "button";
  cancelButton.className = "avatar-confirm-cancel";
  cancelButton.textContent = "Để sau";
  const confirmButton = document.createElement("button");
  confirmButton.type = "button";
  confirmButton.className = "avatar-confirm-submit";
  confirmButton.textContent = "Xác nhận đổi";
  dialogActions.append(cancelButton, confirmButton);
  dialogContent.append(dialogTitle, preview, dialogMessage, dialogActions);
  dialog.append(dialogContent);
  document.body.append(dialog);

  function updateStatus() {
    if (!status) return;
    if (isSaving) {
      status.textContent = "Đang lưu avatar…";
    } else {
      status.textContent = statusMessage;
    }
    buttons.forEach((button) => { button.disabled = isSaving; });
  }

  function showAvatar(avatarId) {
    selectedAvatarId = avatarSources[avatarId] ? avatarId : "fox";
    const currentName = selectedAvatarId === "knight" ? "Hiệp sĩ" : "Cáo";
    currentLabel.textContent = `Đang dùng: ${currentName}`;
    for (const button of buttons) {
      const selected = button.dataset.avatarChoice === selectedAvatarId;
      button.setAttribute("aria-pressed", String(selected));
      button.classList.toggle("selected", selected);
      button.querySelector("[data-avatar-choice-status]").textContent = selected ? "Đang dùng" : "Chọn avatar này";
    }
    document.querySelectorAll("[data-player-avatar]").forEach((image) => {
      image.src = avatarSources[selectedAvatarId];
      image.dataset.avatarId = selectedAvatarId;
      image.alt = `Avatar của bạn: ${selectedAvatarId === "knight" ? "Hiệp sĩ" : "Cáo Lụa"}`;
    });
    localStorage.setItem("player-avatar", selectedAvatarId);
    updateStatus();
  }

  async function loadAvatar() {
    const response = await fetch("/api/player-avatar", { credentials: "same-origin", cache: "no-store" });
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || "Không tải được avatar.");
    showAvatar(data.avatarId);
  }

  async function saveAvatar(avatarId) {
    isSaving = true;
    updateStatus();
    if (status) status.textContent = "Đang lưu avatar…";
    confirmButton.disabled = true;
    cancelButton.disabled = true;
    try {
      const response = await fetch("/api/player-avatar", {
        method: "PUT",
        credentials: "same-origin",
        cache: "no-store",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ avatarId }),
      });
      const data = await response.json();
      if (!response.ok) {
        if (data.avatarId) showAvatar(data.avatarId);
        throw new Error(data.error || "Không lưu được avatar.");
      }
      showAvatar(data.avatarId);
      statusMessage = "";
      dialog.close();
      pickerDialog.close();
      document.dispatchEvent(new CustomEvent("player-avatar-changed", {
        detail: { avatarId: data.avatarId },
      }));
    } catch (error) {
      statusMessage = error.message;
      dialog.close();
    } finally {
      isSaving = false;
      confirmButton.disabled = false;
      cancelButton.disabled = false;
      updateStatus();
    }
  }

  buttons.forEach((button) => {
    button.addEventListener("click", () => {
      const avatarId = button.dataset.avatarChoice;
      if (avatarId === selectedAvatarId) return;
      preview.src = avatarSources[avatarId];
      preview.alt = `Avatar mới: ${avatarId === "knight" ? "Hiệp sĩ" : "Cáo Lụa"}`;
      dialog.showModal();
      confirmButton.onclick = () => saveAvatar(avatarId);
    });
  });

  cancelButton.addEventListener("click", () => dialog.close());
  openButton.addEventListener("click", () => pickerDialog.showModal());
  pickerDialog.querySelector("[data-avatar-close]").addEventListener("click", () => pickerDialog.close());
  dialog.addEventListener("click", (event) => {
    if (event.target === dialog) dialog.close();
  });
  pickerDialog.addEventListener("click", (event) => {
    if (event.target === pickerDialog) pickerDialog.close();
  });

  updateStatus();
  loadAvatar().catch((error) => {
    statusMessage = error.message;
    updateStatus();
  });
}
