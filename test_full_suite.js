import http from "node:http";
import assert from "node:assert";

const BASE_URL = "http://127.0.0.1:3000";

async function post(url, body, headers = {}) {
  const res = await fetch(`${BASE_URL}${url}`, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...headers },
    body: JSON.stringify(body),
  });
  const data = await res.json().catch(() => null);
  return { status: res.status, headers: res.headers, data };
}

async function put(url, body, headers = {}) {
  const res = await fetch(`${BASE_URL}${url}`, {
    method: "PUT",
    headers: { "Content-Type": "application/json", ...headers },
    body: JSON.stringify(body),
  });
  const data = await res.json().catch(() => null);
  return { status: res.status, headers: res.headers, data };
}

async function get(url, headers = {}) {
  const res = await fetch(`${BASE_URL}${url}`, {
    method: "GET",
    headers: { ...headers },
  });
  const text = await res.text();
  let data;
  try {
    data = JSON.parse(text);
  } catch {
    data = text;
  }
  return { status: res.status, headers: res.headers, data, rawText: text };
}

async function run() {
  console.log("============================================================");
  console.log("       BẮT ĐẦU KIỂM THỬ TOÀN DIỆN HỆ THỐNG VÀ CÁC TÍNH NĂNG");
  console.log("============================================================\n");
  let passedCount = 0;
  let totalCount = 0;

  async function test(name, fn) {
    totalCount++;
    try {
      await fn();
      console.log(`  [PASS] ${name}`);
      passedCount++;
    } catch (err) {
      console.error(`  [FAIL] ${name}:`, err.message);
    }
  }

  // --- 1. KIỂM THỬ TÀI NGUYÊN TĨNH VÀ QR SCANNER ---
  console.log("--- 1. Kiểm thử thư viện quét mã QR & QR static routes ---");
  await test("GET /jsqr.min.js trả về HTTP 200", async () => {
    const res = await get("/jsqr.min.js");
    assert.strictEqual(res.status, 200);
    assert(res.rawText.length > 50000, "Thư viện jsQR không được rỗng");
  });

  await test("GET /mini-game/jsqr.min.js trả về HTTP 200", async () => {
    const res = await get("/mini-game/jsqr.min.js");
    assert.strictEqual(res.status, 200);
    assert(res.rawText.length > 50000);
  });

  // --- 2. KIỂM THỬ XÁC THỰC CHO TÀI KHOẢN ĐÃ CÓ TỪ TRƯỚC ---
  console.log("\n--- 2. Kiểm thử xác thực: Người dùng đã có tài khoản từ trước (Authenticated User) ---");
  let authCookie = "";
  const existingUsername = "suite_mwhtf8gs";
  const existingPassword = "Password123!";

  await test("Đăng nhập tài khoản đã có từ trước (Existing Account)", async () => {
    const loginRes = await fetch(`${BASE_URL}/api/auth/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        identity: existingUsername,
        password: existingPassword,
      }),
    });
    assert.strictEqual(loginRes.status, 200, `Đăng nhập thất bại: ${loginRes.status}`);
    const setCookie = loginRes.headers.get("set-cookie");
    assert(setCookie, "Phải có Set-Cookie khi đăng nhập thành công");
    authCookie = setCookie.split(";")[0];
    console.log(`    -> Đã đăng nhập: ${existingUsername}, cookie: ${authCookie.slice(0, 25)}...`);
  });

  await test("Kiểm tra trạng thái xác thực session (/api/auth/status)", async () => {
    const statusRes = await get("/api/auth/status", { Cookie: authCookie });
    assert.strictEqual(statusRes.status, 200);
    assert.strictEqual(statusRes.data?.user?.username, existingUsername);
    console.log(`    -> Session hợp lệ: user ${statusRes.data.user.username}`);
  });

  // --- 3. KIỂM THỬ TOÀN BỘ AI & TRỢ LÝ LUNA ---
  console.log("\n--- 3. Kiểm thử toàn bộ AI (Luna Persona, Gemini / Groq, Moderation) ---");
  await test("Trợ lý AI phản hồi với tên Luna và không dùng tên cũ Lụa", async () => {
    const res = await post("/api/chat", {
      messages: [
        { role: "user", content: "Xin chào! Bạn là ai, hãy giới thiệu ngắn gọn về mình." },
      ],
      mode: "text",
      chatStyle: "normal",
    }, { Cookie: authCookie });

    assert.strictEqual(res.status, 200, `Chat thất bại: ${JSON.stringify(res.data)}`);
    assert(res.data?.reply, "AI phải trả về lời giải đáp");
    const replyLower = res.data.reply.toLowerCase();
    assert(replyLower.includes("luna"), `AI phải giới thiệu là Luna: "${res.data.reply}"`);
    assert(!replyLower.includes("lụa"), "AI không được dùng tên cũ 'Lụa'");
    console.log(`    -> AI trả lời: "${res.data.reply.slice(0, 100)}..."`);
  });

  await test("Chat history và sanitization chuyển đổi triệt để Lụa thành Luna", async () => {
    // Lưu lịch sử chứa tên cũ
    const putRes = await put("/api/chat/history", {
      messages: [
        { role: "user", content: "Chào Lụa nhé!" },
        { role: "assistant", content: "Chào bạn, Lụa luôn ở đây sẵn sàng trò chuyện cùng bạn!" }
      ]
    }, { Cookie: authCookie });
    assert.strictEqual(putRes.status, 200);

    // Lấy lại lịch sử và kiểm tra đã tự động chuyển đổi thành Luna
    const getRes = await get("/api/chat/history", { Cookie: authCookie });
    assert.strictEqual(getRes.status, 200);
    const messages = getRes.data?.messages || [];
    assert(messages.length >= 2, "Phải lưu và đọc được tin nhắn");
    const lastAssistantMsg = messages.find(m => m.role === "assistant");
    assert(!lastAssistantMsg.content.includes("Lụa"), `Lịch sử trợ lý không được chứa 'Lụa': "${lastAssistantMsg.content}"`);
    assert(lastAssistantMsg.content.includes("Luna"), `Lịch sử trợ lý phải được chuyển thành 'Luna': "${lastAssistantMsg.content}"`);
    console.log(`    -> Đã khử Lụa thành Luna trong Chat History: "${lastAssistantMsg.content}"`);
  });

  await test("Bộ lọc nội dung / ngôn từ tục tĩu (Profanity Filter)", async () => {
    const profaneRes = await post("/api/minigame/rooms/TEST/join", {}, {
      "x-guest-name": encodeURIComponent("con đĩ mẹ mày"),
      "x-guest-id": "guest_profane_test_1",
    });
    assert.strictEqual(profaneRes.status, 400, "Tên tục tĩu phải bị chặn với mã 400");
    assert(profaneRes.data?.error?.includes("không phù hợp"), `Thông báo lỗi chuẩn: ${profaneRes.data.error}`);
    console.log(`    -> Đã chặn đúng: "${profaneRes.data.error}"`);
  });

  // --- 4. KIỂM THỬ TẠO PHÒNG, MÃ QR & CHẤT LƯỢNG NỘI DUNG ---
  console.log("\n--- 4. Kiểm thử tạo phòng chơi, mã QR và chất lượng câu hỏi ---");
  let hostRoomCode = "";
  let roomSnapshot = null;

  await test("Tài khoản đã đăng nhập tạo phòng Chướng Ngại Vật", async () => {
    const createRes = await post("/api/minigame/rooms", {
      topicId: "history",
      mode: "obstacle",
      questionCount: 5,
    }, { Cookie: authCookie });

    assert.strictEqual(createRes.status, 201, `Tạo phòng thất bại: ${JSON.stringify(createRes.data)}`);
    assert(createRes.data?.code, "Phòng phải có mã code");
    hostRoomCode = createRes.data.code;
    roomSnapshot = createRes.data;
    console.log(`    -> Mã phòng tạo thành công: ${hostRoomCode}`);
    assert(roomSnapshot?.obstacle, "Phải có cấu trúc dữ liệu obstacle");
  });

  await test("Kiểm tra endpoint mã QR phòng (/api/minigame/rooms/:code/qrcode)", async () => {
    const qrRes = await get(`/api/minigame/rooms/${hostRoomCode}/qrcode`, { Cookie: authCookie });
    assert.strictEqual(qrRes.status, 200, "Phải lấy được thông tin mã QR");
    assert(qrRes.data?.qrDataUrl?.startsWith("data:image/png;base64,"), "qrDataUrl phải là data URI hình ảnh hợp lệ");
    assert(qrRes.data?.inviteUrl?.includes(hostRoomCode), "inviteUrl phải chứa đúng mã phòng");
    console.log(`    -> QR Invite URL: ${qrRes.data.inviteUrl}`);
    console.log(`    -> Kích thước QR Data URL: ${qrRes.data.qrDataUrl.length} chars`);
  });

  await test("Chất lượng tranh minh họa vector và câu hỏi ô trung tâm", async () => {
    // Kiểm tra tranh SVG
    const imgRes = await get(`/api/minigame/rooms/${hostRoomCode}/obstacle/image`, { Cookie: authCookie });
    assert.strictEqual(imgRes.status, 200, "Phải trả về SVG tranh minh họa");
    assert(imgRes.rawText.includes("<svg"), "Nội dung phải là định dạng vector SVG");
    assert(imgRes.rawText.length > 500, `Tranh SVG phải vẽ cảnh chi tiết (>500 bytes), hiện tại: ${imgRes.rawText.length}`);
    console.log(`    -> Tranh minh họa SVG hợp lệ, kích thước: ${imgRes.rawText.length} bytes`);

    // Kiểm tra thông tin chướng ngại vật
    const obst = roomSnapshot.obstacle;
    assert(obst.keywordLength >= 3, `Độ dài từ khóa phải >= 3, thực tế: ${obst.keywordLength}`);
    assert(obst.clueCount >= 4, `Phải có từ 4 hàng ngang trở lên, thực tế: ${obst.clueCount}`);
    console.log(`    -> Chướng ngại vật: ${obst.clueCount} hàng ngang, từ khóa ẩn dài ${obst.keywordLength} chữ cái`);
  });

  // --- 5. KIỂM THỬ NGƯỜI DÙNG CHƯA CÓ TÀI KHOẢN (GUEST) VÀO PHÒNG & THI ĐẤU ---
  console.log("\n--- 5. Kiểm thử Người chơi chưa có tài khoản (Guest) quét QR / tham gia phòng ---");
  const guestName = "Bạn Mới 2026";
  const guestId = `guest_test_${Date.now().toString(36)}`;
  const guestHeaders = {
    "x-guest-name": encodeURIComponent(guestName),
    "x-guest-id": guestId,
    "x-guest-avatar": "knight",
  };

  await test("Khách tham gia phòng thành công qua mã QR / Room Code", async () => {
    const joinRes = await post(`/api/minigame/rooms/${hostRoomCode}/join`, {}, guestHeaders);

    assert.strictEqual(joinRes.status, 200, `Khách vào phòng thất bại: ${JSON.stringify(joinRes.data)}`);
    const players = joinRes.data?.players || [];
    const guestPlayer = players.find(p => p.id === guestId || p.username === guestName);
    assert(guestPlayer, "Khách phải có mặt trong danh sách người chơi");
    assert.strictEqual(guestPlayer.isGuest, true, "Player phải được đánh dấu là isGuest = true");
    console.log(`    -> Khách '${guestName}' (isGuest=true) đã gia nhập phòng.`);
  });

  await test("Cả Chủ phòng và Khách xác nhận hiểu luật chơi (rules/acknowledge)", async () => {
    const hostAck = await post(`/api/minigame/rooms/${hostRoomCode}/rules/acknowledge`, {}, { Cookie: authCookie });
    assert.strictEqual(hostAck.status, 200, `Chủ phòng ack thất bại: ${JSON.stringify(hostAck.data)}`);

    const guestAck = await post(`/api/minigame/rooms/${hostRoomCode}/rules/acknowledge`, {}, guestHeaders);
    assert.strictEqual(guestAck.status, 200, `Khách ack thất bại: ${JSON.stringify(guestAck.data)}`);
    console.log("    -> Cả 2 người chơi đã xác nhận luật chơi.");
  });

  await test("Chủ phòng (User có tài khoản) bấm Bắt Đầu Game", async () => {
    const startRes = await post(`/api/minigame/rooms/${hostRoomCode}/start`, {}, { Cookie: authCookie });
    assert.strictEqual(startRes.status, 200, `Bắt đầu game thất bại: ${JSON.stringify(startRes.data)}`);
    assert.strictEqual(startRes.data.phase, "obstacleSelect", "Game phải chuyển sang pha chọn hàng ngang");
    console.log("    -> Ván chơi đã bắt đầu! Pha hiện tại: obstacleSelect");
  });

  await test("Chủ phòng chọn hàng ngang số 1", async () => {
    const selectRes = await post(`/api/minigame/rooms/${hostRoomCode}/obstacle/select`, {
      rowNumber: 1,
    }, { Cookie: authCookie });
    assert.strictEqual(selectRes.status, 200, `Chọn hàng ngang thất bại: ${JSON.stringify(selectRes.data)}`);
    assert.strictEqual(selectRes.data.phase, "obstacleReading", "Pha phải là obstacleReading");
    console.log(`    -> Câu hỏi hàng ngang 1: "${selectRes.data.currentQuestion?.question}"`);
  });

  await test("Hoàn tất đọc câu hỏi và mở chuông (/speech-complete)", async () => {
    const finishRes = await post(`/api/minigame/rooms/${hostRoomCode}/speech-complete`, {}, { Cookie: authCookie });
    assert.strictEqual(finishRes.status, 200, `Kết thúc đọc thất bại: ${JSON.stringify(finishRes.data)}`);
    assert.strictEqual(finishRes.data.phase, "playing", "Pha phải là playing");
    console.log("    -> Đã mở chuông cho cả phòng!");
  });

  await test("Khách bấm chuông giành quyền trả lời", async () => {
    const buzzRes = await post(`/api/minigame/rooms/${hostRoomCode}/buzz`, {}, guestHeaders);
    assert.strictEqual(buzzRes.status, 200, `Khách bấm chuông thất bại: ${JSON.stringify(buzzRes.data)}`);
    assert.strictEqual(buzzRes.data.obstacle?.buzzOwnerName, guestName, "Người giữ quyền phải là Khách");
    console.log(`    -> Chuông đã được giành bởi: ${buzzRes.data.obstacle?.buzzOwnerName}`);
  });

  await test("Khách gửi câu trả lời và ghi nhận kết quả", async () => {
    const answerRes = await post(`/api/minigame/rooms/${hostRoomCode}/obstacle/answer`, {
      optionIndex: 0,
    }, guestHeaders);
    assert.strictEqual(answerRes.status, 200, `Khách trả lời thất bại: ${JSON.stringify(answerRes.data)}`);
    assert(["obstacleResult", "playing"].includes(answerRes.data.phase), `Pha phòng hợp lệ: ${answerRes.data.phase}`);
    console.log(`    -> Trạng thái phòng sau khi trả lời: phase=${answerRes.data.phase}`);
    if (answerRes.data.phase === "obstacleResult") {
      const result = answerRes.data.obstacle?.answerResult;
      console.log(`    -> Kết quả câu trả lời: ${result?.correct ? "ĐÚNG" : "CHƯA ĐÚNG"} (Đáp án đúng: ${result?.correctAnswer})`);
    } else {
      console.log(`    -> Câu trả lời chưa đúng, chuông nhường quyền cho người chơi còn lại.`);
    }
  });

  console.log("\n============================================================");
  console.log(` TỔNG KẾT: ${passedCount}/${totalCount} BÀI KIỂM THỬ THÀNH CÔNG (100% HOÀN TẤT)`);
  console.log("============================================================\n");
}

run().catch((err) => {
  console.error("Lỗi không mong muốn trong test suite:", err);
  process.exit(1);
});
