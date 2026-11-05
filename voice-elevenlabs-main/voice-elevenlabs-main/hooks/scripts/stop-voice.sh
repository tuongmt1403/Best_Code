#!/bin/bash
# Claude stop voice notification with project context
# Format: "[project]: done" or "[project]: [context]"

input=$(cat)
cwd=$(echo "$input" | jq -r '.cwd // empty')

# Get project name from cwd
project=""
if [ -n "$cwd" ]; then
  project=$(basename "$cwd")
fi

# Build short message
if [ -n "$project" ]; then
  message="$project: done"
else
  message="Claude done"
fi

# Send to ElevenLabs
echo "{\"hook_event_name\": \"Stop\", \"message\": \"$message\"}" | claude-voice-notifications
