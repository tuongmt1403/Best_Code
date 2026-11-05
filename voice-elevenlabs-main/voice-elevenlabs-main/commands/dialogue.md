---
description: Generate multi-speaker dialogue using ElevenLabs v3 dialogue mode
allowed-tools: ["Bash", "Read"]
---

# Dialogue Command (ElevenLabs v3)

Generate realistic multi-speaker conversations with natural timing and interruptions.

## Format

Write dialogue with speaker names followed by their lines:

```
Alice: Hey, have you seen the new feature?
Bob: [excited] Yes! It's amazing!
Alice: [laughs] I knew you'd love it.
Bob: [interrupting] Wait, there's more—
Alice: —I know, the audio tags!
```

## Features (v3 Dialogue Mode)

- **Natural interruptions** - Speakers can cut each other off with `—`
- **Emotional cues** - Each speaker can have their own [audio tags]
- **Timing control** - Automatic pacing between speakers
- **Multiple voices** - Assign different ElevenLabs voices to each speaker

## Voice Assignment

By default:
- First speaker uses your configured voice
- Additional speakers use complementary ElevenLabs voices

Or specify voices:
```
Alice (voice: Rachel): Hello!
Bob (voice: Adam): Hi there!
```

## Examples

Simple conversation:
```
/dialogue "Claude: Task complete! User: [excited] That was fast!"
```

With emotions:
```
/dialogue "Dev: [nervous] Did the tests pass? CI: [cheerfully] All green!"
```

## Instructions

1. Parse the dialogue script into speaker/line pairs
2. Use ElevenLabs v3 dialogue mode for natural conversation flow
3. Apply any [audio tags] to individual lines
4. Generate and play the complete dialogue

Script: $ARGUMENTS.script
