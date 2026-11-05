#!/bin/bash
# Subagent voice notification with project context
# Format: "[project]: [short task]"

input=$(cat)
transcript_path=$(echo "$input" | jq -r '.transcript_path // empty')
cwd=$(echo "$input" | jq -r '.cwd // empty')

# Get project name from cwd (last directory component)
project=""
if [ -n "$cwd" ]; then
  project=$(basename "$cwd")
fi

# Get task description from transcript
description=""
if [ -n "$transcript_path" ] && [ -f "$transcript_path" ]; then
  description=$(jq -rs '
    [.[] | select(.type == "tool_use" and .name == "Task")] |
    last |
    .input.description // empty
  ' "$transcript_path" 2>/dev/null)
fi

# Build short message
if [ -n "$project" ] && [ -n "$description" ]; then
  # Shorten description to ~30 chars
  short_desc=$(echo "$description" | cut -c1-30 | sed 's/[[:space:]]*$//')
  message="$project: $short_desc"
elif [ -n "$description" ]; then
  short_desc=$(echo "$description" | cut -c1-40 | sed 's/[[:space:]]*$//')
  message="Done: $short_desc"
elif [ -n "$project" ]; then
  message="$project task done"
else
  message="Task completed"
fi

# Send to ElevenLabs
echo "{\"hook_event_name\": \"Stop\", \"message\": \"$message\"}" | claude-voice-notifications
