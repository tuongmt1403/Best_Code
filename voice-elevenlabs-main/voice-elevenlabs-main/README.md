# Voice ElevenLabs - Claude Code Plugin

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![Claude Code Plugin](https://img.shields.io/badge/Claude%20Code-Plugin-blueviolet)](https://claude.ai/code)
[![ElevenLabs v3](https://img.shields.io/badge/ElevenLabs-v3-FF6B35)](https://elevenlabs.io/v3)

> Add natural voice capabilities to Claude Code using ElevenLabs v3 - the most expressive AI voice model.

## Install

**One command in Claude Code:**

```
/plugin install adamanz/voice-elevenlabs
```

Or manually:
```bash
cd ~/.claude/plugins
git clone https://github.com/adamanz/voice-elevenlabs.git
```

## Setup

1. Get a free API key from [ElevenLabs](https://elevenlabs.io/app/settings/api-keys)

2. Add to your shell config:
```bash
echo 'export ELEVENLABS_API_KEY="your_key_here"' >> ~/.zshrc
source ~/.zshrc
```

3. Install the voice notification CLI:
```bash
npm install -g claude-voice-notifications
```

4. Restart Claude Code

## Commands

| Command | Description |
|---------|-------------|
| `/speak [text]` | Speak text with emotion tags `[excited]`, `[whispers]`, etc. |
| `/dialogue` | Generate multi-speaker conversations |
| `/create-voice` | Create custom voice from text description |
| `/transcribe` | Convert audio to text (Scribe v2) |
| `/voices` | List available ElevenLabs voices |
| `/voice-config` | View and modify voice settings |

## ElevenLabs v3 Features

### Audio Tags (Emotion Control)

Add emotional nuance to any speech:

```
/speak [excited] We did it! The tests passed!
/speak [whispers] Don't tell anyone, but... [laughs] I love this feature!
/speak [nervous] Did the deploy work? [relieved] Oh thank goodness.
```

**Available tags:**
- `[excited]` - Enthusiastic
- `[whispers]` - Quiet, intimate
- `[laughs]` / `[laughing]` - Natural laughter
- `[sighs]` - Thoughtful pause
- `[angry]` - Intense
- `[sad]` - Melancholic
- `[nervous]` - Hesitant
- `[shouting]` - Loud
- `[sarcastically]` - Dry humor

### Multi-Speaker Dialogue

Generate natural conversations:

```
/dialogue "Alice: Hey, did you see the new feature?
Bob: [excited] Yes! It's incredible!
Alice: [laughs] I knew you'd love it."
```

### Voice Design v3

Create custom voices from descriptions:

```
/create-voice "warm female narrator, mid-30s, slight British accent, professional"
```

### Scribe v2 Transcription

Convert speech to text:

```
/transcribe file:~/meeting.mp3
```

## Voices

| Voice | ID | Style |
|-------|-----|-------|
| George | `JBFqnCBsd6RMkjVDRZzb` | Natural male (default) |
| Adam | `pNInz6obpgDQGcFmaJgB` | Deep male |
| Rachel | `21m00Tcm4TlvDq8ikWAM` | Natural female |
| Domi | `AZnzlk1XvdvUeBnXmlld` | Young female |

Change voice: Set `ELEVENLABS_VOICE_ID` environment variable.

## Hooks

Auto-triggers on these events:
- **Stop** - "Claude has finished responding"
- **SubagentStop** - "Subagent finished: [task]"
- **Notification** - "Claude needs your permission"

## Requirements

- [Claude Code](https://claude.ai/code)
- [ElevenLabs API key](https://elevenlabs.io) (free tier works)
- [claude-voice-notifications](https://github.com/ZeldOcarina/claude-code-voice-notifications) (`npm i -g claude-voice-notifications`)

## License

MIT

## Author

Adam Anzuoni - [@adamanz](https://github.com/adamanz)

---

**Keywords:** claude-code, plugin, voice, tts, text-to-speech, elevenlabs, v3, audio-tags, dialogue, transcription, scribe, notifications, accessibility
