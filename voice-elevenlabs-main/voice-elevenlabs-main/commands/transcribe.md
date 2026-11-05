---
description: Transcribe audio to text using ElevenLabs Scribe v2
allowed-tools: ["Bash", "Read"]
---

# Transcribe Command (Scribe v2)

Convert speech to text using ElevenLabs Scribe v2 - fast and accurate transcription.

## Features

- **High accuracy** - State-of-the-art speech recognition
- **Multiple formats** - MP3, WAV, M4A, FLAC, OGG, WEBM
- **Speaker diarization** - Identify different speakers
- **Timestamps** - Get word-level timing
- **70+ languages** - Automatic language detection

## Usage

From a local file:
```
/transcribe file:/path/to/audio.mp3
```

From a URL:
```
/transcribe url:https://example.com/audio.mp3
```

## Output Options

The transcription includes:
- Full text transcript
- Speaker labels (if multiple speakers)
- Timestamps for each segment
- Confidence scores

## Examples

Transcribe a meeting recording:
```
/transcribe file:~/Downloads/meeting.mp3
```

Transcribe from web:
```
/transcribe url:https://podcast.com/episode.mp3
```

## Use Cases

- **Meeting notes** - Transcribe recordings automatically
- **Voice memos** - Convert quick audio notes to text
- **Podcast editing** - Get searchable transcripts
- **Accessibility** - Generate captions from audio

## Instructions

1. Accept audio file path or URL
2. Use ElevenLabs Scribe v2 API for transcription
3. Return formatted transcript with speaker labels if detected
4. Include timestamps for easy reference

File: $ARGUMENTS.file
URL: $ARGUMENTS.url
