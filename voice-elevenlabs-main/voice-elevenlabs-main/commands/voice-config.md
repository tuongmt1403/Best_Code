---
description: Configure voice settings for ElevenLabs TTS
allowed-tools: ["Bash", "Read"]
---

# Voice Configuration

Manage ElevenLabs voice settings.

## Actions

### show (default)
Display current voice configuration:
- Current voice ID
- API key status (configured/not configured)
- Available voices

### set-voice [voice_id]
Change the default voice. Popular options:
- `JBFqnCBsd6RMkjVDRZzb` - George (default, natural male)
- `pNInz6obpgDQGcFmaJgB` - Adam (deep male)
- `21m00Tcm4TlvDq8ikWAM` - Rachel (natural female)
- `AZnzlk1XvdvUeBnXmlld` - Domi (young female)

### test
Play a test message with current settings.

## Instructions

1. Check for ELEVENLABS_API_KEY environment variable
2. If action is "show", display current configuration
3. If action is "set-voice", update the voice ID in config
4. If action is "test", use ElevenLabs to say "Voice configuration is working correctly"

Action requested: $ARGUMENTS.action
