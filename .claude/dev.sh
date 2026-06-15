#!/bin/zsh
export PATH="/Users/user/.local/share/fnm/node-versions/v24.12.0/installation/bin:$PATH"
cd "$(dirname "$0")/.." || exit 1
exec npm run dev
