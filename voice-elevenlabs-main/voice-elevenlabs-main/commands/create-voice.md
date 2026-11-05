---
description: Create a custom AI voice from a text description using Voice Design v3
allowed-tools: ["Bash", "Read"]
---

# Create Voice Command (Voice Design v3)

Generate a unique AI voice from a text description - no audio samples needed.

## How It Works

1. Describe the voice you want in natural language
2. ElevenLabs generates 3 voice options
3. Preview and select your favorite
4. Voice is saved to your account for future use

## Description Tips

Be specific about:
- **Age**: young, middle-aged, elderly
- **Gender**: male, female, neutral
- **Accent**: British, Southern US, Australian, French
- **Tone**: warm, authoritative, playful, serious
- **Quality**: clear, raspy, smooth, deep

## Examples

```
/create-voice "warm female voice, mid-30s, slight British accent, professional but friendly"
```

```
/create-voice "deep male narrator voice, gravelly, like a classic audiobook reader"
```

```
/create-voice "energetic young voice, gender-neutral, upbeat and enthusiastic, podcast host style"
```

## Advanced Descriptions

You can get very specific:
```
/create-voice "middle-aged New Yorker with rising intonation and a half-smile in his voice, like a friendly cab driver telling stories"
```

## Audio Quality Control

Add quality descriptors:
- "perfect audio quality" - Studio clean
- "slight room reverb" - Natural feel
- "radio effect" - Vintage sound

## Instructions

1. Use ElevenLabs Voice Design v3 API
2. Generate 3 voice candidates from the description
3. Present options with sample audio
4. Save selected voice with the provided name (or auto-generate name)
5. Return the new voice ID for future use

Description: $ARGUMENTS.description
Voice name: $ARGUMENTS.name
