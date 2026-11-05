---
description: Speak text aloud using ElevenLabs v3 TTS with emotion tags
allowed-tools: ["Bash", "Read"]
---

# Speak Command (ElevenLabs v3)

Speak text aloud using ElevenLabs with optional emotion control.

## Usage

```
/voice-elevenlabs:speak [text with optional emotion tags]
```

## Audio Tags (v3 Feature)

Add emotion with inline tags:
- `[excited]` - Enthusiastic delivery
- `[whispers]` - Quiet, intimate
- `[laughs]` - Natural laughter
- `[sighs]` - Thoughtful pause
- `[angry]` - Intense, frustrated
- `[sad]` - Melancholic
- `[nervous]` - Hesitant
- `[shouting]` - Loud, emphatic

## Examples

- `/voice-elevenlabs:speak Hello world!`
- `/voice-elevenlabs:speak [excited] The build passed!`
- `/voice-elevenlabs:speak [whispers] Secret feature [laughs]`

## Implementation

Use this bash command to speak text via claude-voice-notifications:

```bash
echo '{"hook_event_name": "Stop", "message": "TEXT_HERE"}' | claude-voice-notifications
```

Or use the ElevenLabs API directly:
```bash
curl -X POST "https://api.elevenlabs.io/v1/text-to-speech/JBFqnCBsd6RMkjVDRZzb" \
  -H "xi-api-key: $ELEVENLABS_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{"text": "TEXT_HERE", "model_id": "eleven_v3_alpha"}' \
  --output /tmp/speech.mp3 && afplay /tmp/speech.mp3
```
