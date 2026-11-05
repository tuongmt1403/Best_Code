# Tài khoản Học Mà Chơi

Tài khoản email/mật khẩu được lưu trên máy chủ trong SQLite tại `.data/accounts.sqlite`.
Để sao lưu nhất quán, hãy dừng ứng dụng trước khi sao lưu toàn bộ thư mục `.data`; không chia sẻ
thư mục này công khai.

## Chạy ứng dụng

1. Tạo `.env` từ `.env.example`.
2. Cài dependency bằng `npm install`.
3. Chạy `npm start` và mở `http://localhost:3000`.
4. Người dùng phải đăng nhập trước khi truy cập trang chính, chat, quiz hoặc API ứng dụng.

## Bật Google/GitHub

OAuth chỉ bật khi đã cấu hình Client ID và Secret. Tạo OAuth app tại nhà cung cấp, sau đó khai
báo các biến tương ứng trong `.env` và khởi động lại ứng dụng.

Đặt `AUTH_BASE_URL` thành origin chính xác mà người dùng truy cập (không có dấu `/` cuối), ví dụ
`https://hoc.example.com` khi triển khai HTTPS. Cấu hình callback URL y hệt bên dưới trong OAuth app:

- Google: `${AUTH_BASE_URL}/api/auth/oauth/google/callback`
- GitHub: `${AUTH_BASE_URL}/api/auth/oauth/github/callback`

Khi chạy mặc định tại máy cá nhân, callback lần lượt là:

- `http://localhost:3000/api/auth/oauth/google/callback`
- `http://localhost:3000/api/auth/oauth/github/callback`

Trong Google OAuth consent screen, yêu cầu scope `openid`, `email`, `profile`.
GitHub OAuth app cần quyền đọc hồ sơ và email (`read:user`, `user:email`). Ứng dụng chỉ liên kết
tài khoản qua email đã xác minh. Không đưa Client Secret vào mã nguồn hoặc trình duyệt.

Nếu ứng dụng chạy sau reverse proxy đáng tin cậy, đặt `TRUST_PROXY=true` để giới hạn tốc độ theo
địa chỉ IP thật do proxy chuyển tiếp. Chỉ bật tùy chọn này khi proxy được kiểm soát và cấu hình
đúng; không dùng khi máy chủ được truy cập trực tiếp.
