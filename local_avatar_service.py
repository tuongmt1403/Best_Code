import os
import sys
import json
import hashlib
import subprocess
import time
from http.server import HTTPServer, BaseHTTPRequestHandler
from socketserver import ThreadingMixIn

import cv2
import numpy as np
import soundfile as sf
import librosa
import imageio_ffmpeg
import torch

DEVICE = "cuda" if torch.cuda.is_available() else "cpu"
FFMPEG_CMD = imageio_ffmpeg.get_ffmpeg_exe()
BASE_IMAGE_PATH = os.path.join(os.path.dirname(__file__), "public", "images", "ai-human-avatar.jpg")
OUTPUT_DIR = os.path.join(os.path.dirname(__file__), "public", "videos", "generated")
TEMP_DIR = os.path.join(os.path.dirname(__file__), "temp")

os.makedirs(OUTPUT_DIR, exist_ok=True)
os.makedirs(TEMP_DIR, exist_ok=True)

FPS = 25.0

print(f"[AvatarService] Loading 3D Avatar on device: {DEVICE}...")

BASE_FRAME = cv2.imread(BASE_IMAGE_PATH)
if BASE_FRAME is None:
    raise RuntimeError(f"Could not load base avatar image: {BASE_IMAGE_PATH}")
FRAME_H, FRAME_W = BASE_FRAME.shape[:2]

# Exact mouth coordinate in 554x554 avatar
MOUTH_CX = 276
MOUTH_CY = 279
MAX_RX = 28
MAX_RY = 14

ROI_X1 = MOUTH_CX - MAX_RX - 8
ROI_Y1 = MOUTH_CY - MAX_RY - 8
ROI_X2 = MOUTH_CX + MAX_RX + 8
ROI_Y2 = MOUTH_CY + MAX_RY + 8
PCX = MOUTH_CX - ROI_X1
PCY = MOUTH_CY - ROI_Y1
ROI_W = ROI_X2 - ROI_X1
ROI_H = ROI_Y2 - ROI_Y1

BASE_PATCH = BASE_FRAME[ROI_Y1:ROI_Y2, ROI_X1:ROI_X2].copy()

def generate_video_from_audio(audio_path, output_path):
    t0 = time.time()
    
    # 1. Ultra-fast audio loading (<10ms)
    try:
        y, sr = sf.read(audio_path)
        if y.ndim > 1:
            y = np.mean(y, axis=1)
    except Exception:
        y, sr = librosa.load(audio_path, sr=22050)
        
    duration = len(y) / sr
    total_frames = int(np.ceil(duration * FPS))
    if total_frames == 0:
        raise ValueError("Audio is empty.")
        
    hop_length = int(sr / FPS)
    frame_samples = [y[i * hop_length : i * hop_length + hop_length * 2] for i in range(total_frames)]
    rms = np.array([np.sqrt(np.mean(fs**2)) if len(fs) > 0 else 0.0 for fs in frame_samples])
    
    max_rms = np.percentile(rms, 95) if np.percentile(rms, 95) > 0.001 else 0.05
    norm_rms = np.clip(rms / max_rms, 0.0, 1.25)
    smooth_energy = np.convolve(norm_rms, np.ones(3)/3.0, mode='same')
    
    # 2. Piped direct ffmpeg encoder (zero intermediate files on disk)
    mux_cmd = [
        FFMPEG_CMD, "-y",
        "-f", "rawvideo", "-pix_fmt", "bgr24", "-s", f"{FRAME_W}x{FRAME_H}", "-r", str(int(FPS)),
        "-i", "-",
        "-i", audio_path,
        "-c:v", "libx264",
        "-preset", "ultrafast",
        "-crf", "22",
        "-pix_fmt", "yuv420p",
        "-c:a", "aac",
        "-b:a", "128k",
        "-shortest",
        "-movflags", "+faststart",
        output_path
    ]
    
    proc = subprocess.Popen(mux_cmd, stdin=subprocess.PIPE, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
    base_frame = BASE_FRAME.copy()
    base_bytes = base_frame.tobytes()
    
    cavity_color = (25, 20, 50)
    teeth_color = (245, 245, 248)
    tongue_color = (100, 100, 215)
    border_color = (35, 30, 60)
    
    for i in range(total_frames):
        energy = smooth_energy[i]
        if energy < 0.10:
            proc.stdin.write(base_bytes)
            continue
            
        open_ratio = np.clip((energy - 0.08) * 1.18, 0.0, 1.0)
        rx = int(MAX_RX * 0.96)
        ry = int(MAX_RY * open_ratio)
        if ry < 2:
            proc.stdin.write(base_bytes)
            continue
            
        patch = BASE_PATCH.copy()
        overlay = patch.copy()
        cv2.ellipse(overlay, (PCX, PCY), (rx, ry), 0, 0, 360, cavity_color, -1, cv2.LINE_AA)
        
        if open_ratio > 0.20:
            th = int(ry * 0.45)
            trx = int(rx * 0.75)
            cv2.ellipse(overlay, (PCX, PCY - ry + th), (trx, th), 0, 0, 180, teeth_color, -1, cv2.LINE_AA)
            
        if open_ratio > 0.30:
            tgh = int(ry * 0.5)
            tgrx = int(rx * 0.6)
            cv2.ellipse(overlay, (PCX, PCY + ry - int(tgh * 0.3)), (tgrx, tgh), 0, 180, 360, tongue_color, -1, cv2.LINE_AA)
            
        cv2.ellipse(overlay, (PCX, PCY), (rx, ry), 0, 0, 360, border_color, 2, cv2.LINE_AA)
        
        mask = np.zeros((ROI_H, ROI_W), dtype=np.float32)
        cv2.ellipse(mask, (PCX, PCY), (rx + 2, ry + 2), 0, 0, 360, 1.0, -1, cv2.LINE_AA)
        mask = cv2.GaussianBlur(mask, (5, 5), 0)[:, :, None]
        
        blended = (patch.astype(np.float32) * (1.0 - mask) + overlay.astype(np.float32) * mask).astype(np.uint8)
        frame = base_frame.copy()
        frame[ROI_Y1:ROI_Y2, ROI_X1:ROI_X2] = blended
        proc.stdin.write(frame.tobytes())
        
    proc.stdin.close()
    proc.wait()
    
    elapsed = time.time() - t0
    speed = duration / elapsed if elapsed > 0 else 0
    print(f"[AvatarService] Generated {duration:.2f}s video in {elapsed:.3f}s ({speed:.1f}x real-time) -> {output_path}")
    return duration

class AvatarHandler(BaseHTTPRequestHandler):
    def do_GET(self):
        if self.path == "/health":
            self.send_response(200)
            self.send_header("Content-Type", "application/json")
            self.end_headers()
            self.wfile.write(json.dumps({
                "status": "ok",
                "device": DEVICE,
                "gpu": torch.cuda.get_device_name(0) if torch.cuda.is_available() else "cpu",
                "avatar": "3D Mentor Clay"
            }).encode())
        else:
            self.send_response(404)
            self.end_headers()

    def do_POST(self):
        if self.path == "/generate":
            content_len = int(self.headers.get("Content-Length", 0))
            post_data = self.rfile.read(content_len)
            try:
                data = json.loads(post_data.decode("utf-8"))
                audio_path = data.get("audio_path")
                text = data.get("text", "")

                if not audio_path or not os.path.exists(audio_path):
                    self.send_response(400)
                    self.send_header("Content-Type", "application/json")
                    self.end_headers()
                    self.wfile.write(json.dumps({"ok": False, "error": "Invalid audio_path"}).encode())
                    return

                with open(audio_path, "rb") as f:
                    audio_hash = hashlib.md5(f.read()).hexdigest()

                video_filename = f"luna_speech_{audio_hash[:16]}.mp4"
                video_filepath = os.path.join(OUTPUT_DIR, video_filename)
                video_url = f"/videos/generated/{video_filename}"

                # Always regenerate if cached video was from old avatar (e.g. check modified time or clear cache)
                # To guarantee fresh new avatar, we check if file exists
                if os.path.exists(video_filepath) and os.path.getsize(video_filepath) > 1000:
                    # check if file was generated before today's 3D avatar switch
                    file_mtime = os.path.getmtime(video_filepath)
                    avatar_mtime = os.path.getmtime(BASE_IMAGE_PATH)
                    if file_mtime > avatar_mtime:
                        self.send_response(200)
                        self.send_header("Content-Type", "application/json")
                        self.end_headers()
                        self.wfile.write(json.dumps({"ok": True, "video_url": video_url, "cached": True}).encode())
                        return

                duration = generate_video_from_audio(audio_path, video_filepath)
                self.send_response(200)
                self.send_header("Content-Type", "application/json")
                self.end_headers()
                self.wfile.write(json.dumps({"ok": True, "video_url": video_url, "duration": duration, "cached": False}).encode())
            except Exception as e:
                import traceback
                traceback.print_exc()
                self.send_response(500)
                self.send_header("Content-Type", "application/json")
                self.end_headers()
                self.wfile.write(json.dumps({"ok": False, "error": str(e)}).encode())
        else:
            self.send_response(404)
            self.end_headers()

class ThreadedHTTPServer(ThreadingMixIn, HTTPServer):
    daemon_threads = True

def run_server(port=5005):
    server = ThreadedHTTPServer(("127.0.0.1", port), AvatarHandler)
    print(f"[AvatarService] Listening on http://127.0.0.1:{port}")
    server.serve_forever()

if __name__ == "__main__":
    run_server()
