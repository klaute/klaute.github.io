#!/usr/bin/env bash
set -euo pipefail

git ls-files -z |
while IFS= read -r -d '' file; do
  [ -f "$file" ] || continue

  case "$file" in
    *.jpg|*.jpeg|*.png|*.gif|*.webp|*.ico)
      continue
      ;;
  esac

  perl -0pi -e 's/\r\n?/\n/g' "$file"
done
