import json
import sys

from gtts import gTTS


request = json.loads(sys.stdin.buffer.read().decode("utf-8-sig"))
text = request.get("text")
if not isinstance(text, str) or not text.strip():
    raise ValueError("Text must be a non-empty string.")

for audio_chunk in gTTS(text=text.strip(), lang="vi", slow=False).stream():
    sys.stdout.buffer.write(audio_chunk)
    sys.stdout.buffer.flush()
