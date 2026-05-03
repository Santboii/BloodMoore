#!/usr/bin/env bash
set -euo pipefail

DEST="client/public/assets/characters"

if [ $# -lt 2 ]; then
  echo "Usage: $0 <input.gltf|input.glb> <class-name>"
  echo "Example: $0 ~/Downloads/Viking.gltf amazon"
  exit 1
fi

INPUT="$1"
CLASS="$2"
OUTPUT="$DEST/$CLASS.glb"

if [ ! -f "$INPUT" ]; then
  echo "Error: file not found: $INPUT"
  exit 1
fi

echo "Converting $INPUT -> $OUTPUT"
npx gltf-pipeline -i "$INPUT" -o "$OUTPUT"

SIZE=$(wc -c < "$OUTPUT" | tr -d ' ')
echo "Done: $OUTPUT ($SIZE bytes)"

if [ "$SIZE" -lt 1000000 ]; then
  echo "Warning: file is under 1MB — animations may be missing."
  echo "Make sure the source .gltf has its .bin file in the same directory."
fi
