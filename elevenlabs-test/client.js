const textInput = document.querySelector("#test-text");
const charCount = document.querySelector("#char-count");
const voiceSelect = document.querySelector("#voice-select");
const modelSelect = document.querySelector("#model-select");
const generateButton = document.querySelector("#generate-button");
const statusElement = document.querySelector("#lab-status");
const apiStatus = document.querySelector("#api-status");
const player = document.querySelector("#voice-player");
const visualizer = document.querySelector(".visualizer");

function updateCount() {
  charCount.textContent = `${textInput.value.length} / 5000 ký tự`;
}
textInput.addEventListener("input", updateCount);
updateCount();

async function loadStatus() {
  try {
    const response = await fetch("/api/elevenlabs/status");
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || "Không đọc được trạng thái API.");
    apiStatus.className = `status-badge ${data.configured ? "ready" : "missing"}`;
    apiStatus.textContent = data.configured ? "API ElevenLabs đã cấu hình" : "Thiếu ELEVENLABS_API_KEY";
    if (data.modelId) modelSelect.value = data.modelId;
    if (!data.configured) {
      statusElement.textContent = "Thêm ELEVENLABS_API_KEY vào .env rồi khởi động lại máy chủ để test.";
    }
  } catch (error) {
    apiStatus.className = "status-badge missing";
    apiStatus.textContent = "Không kiểm tra được API";
    statusElement.textContent = error.message;
  }
}

async function loadVoices() {
  try {
    const response = await fetch("/api/elevenlabs/voices");
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || "Không tải được danh sách giọng.");
    voiceSelect.replaceChildren();
    for (const voice of data.voices) {
      const option = new Option(voice.name || voice.voice_id, voice.voice_id);
      voiceSelect.add(option);
    }
  } catch (error) {
    voiceSelect.replaceChildren(new Option("Chưa tải được giọng; dùng giọng mặc định", "Xb7hH8MSUJpSbSDYk0k2"));
  }
}

async function generateSpeech() {
  const text = textInput.value.trim();
  if (!text) {
    statusElement.textContent = "Hãy nhập nội dung cần đọc.";
    textInput.focus();
    return;
  }
  generateButton.disabled = true;
  statusElement.textContent = "Đang gửi yêu cầu tới ElevenLabs...";
  try {
    const response = await fetch("/api/elevenlabs/speak", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text, voiceId: voiceSelect.value, modelId: modelSelect.value }),
    });
    if (!response.ok) {
      const data = await response.json().catch(() => ({}));
      throw new Error(data.error || `ElevenLabs trả HTTP ${response.status}`);
    }
    if (player.src?.startsWith("blob:")) URL.revokeObjectURL(player.src);
    player.src = URL.createObjectURL(await response.blob());
    await player.play();
    statusElement.textContent = "Đã tạo và phát giọng ElevenLabs thành công.";
  } catch (error) {
    statusElement.textContent = error.message;
  } finally {
    generateButton.disabled = false;
  }
}

generateButton.addEventListener("click", generateSpeech);
player.addEventListener("play", () => visualizer.classList.add("playing"));
player.addEventListener("pause", () => visualizer.classList.remove("playing"));
player.addEventListener("ended", () => visualizer.classList.remove("playing"));
document.querySelectorAll(".sample-button").forEach((button) => {
  button.addEventListener("click", () => {
    textInput.value = button.dataset.text;
    updateCount();
    textInput.focus();
  });
});
loadStatus();
loadVoices();
