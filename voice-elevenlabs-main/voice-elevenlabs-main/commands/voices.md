---
description: List available ElevenLabs voices
allowed-tools: ["Bash"]
---

# List Available Voices

Display available ElevenLabs voices that can be used with the speak command.

## Default Voices

| Voice | ID | Style |
|-------|-----|-------|
| George | `JBFqnCBsd6RMkjVDRZzb` | Natural male (default) |
| Adam | `pNInz6obpgDQGcFmaJgB` | Deep male |
| Rachel | `21m00Tcm4TlvDq8ikWAM` | Natural female |
| Domi | `AZnzlk1XvdvUeBnXmlld` | Young female |

## Change Voice

Set the `ELEVENLABS_VOICE_ID` environment variable:

```bash
export ELEVENLABS_VOICE_ID="pNInz6obpgDQGcFmaJgB"
```

## Fetch All Voices

To list all voices from your ElevenLabs account:

```bash
curl -s "https://api.elevenlabs.io/v1/voices" \
  -H "xi-api-key: $ELEVENLABS_API_KEY" | jq '.voices[] | {name, voice_id}'
```
