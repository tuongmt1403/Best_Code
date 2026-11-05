---
name: voice-responses
description: |
  Automatically speak important responses using ElevenLabs TTS.
  Use when: user asks for verbal explanation, requests spoken feedback,
  mentions "read aloud", "speak", "tell me", or voice-related requests.
  Activates for: voice requests, accessibility needs, hands-free usage.
---

# Voice Response Skill

This skill enables Claude to speak responses aloud using ElevenLabs.

## When to Activate

- User explicitly asks to "speak" or "read aloud"
- User mentions accessibility or hands-free needs
- User says "tell me" in a conversational context
- After completing a significant task (optional announcement)

## How to Use

1. Generate your text response normally
2. Create a concise spoken version (1-3 sentences)
3. Use ElevenLabs MCP to convert text to speech
4. Play the audio

## Spoken Response Guidelines

- Maximum 50 words for spoken summaries
- Use natural, conversational language
- Avoid code syntax, file paths, or technical notation
- Pronounce acronyms (API → "A P I", JSON → "Jason")

## Example

Text response: "I've updated the configuration in `config.json` with the new API endpoint."

Spoken version: "I've updated your configuration file with the new API endpoint."
