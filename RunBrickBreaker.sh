#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/brickbreaker"
npm install
npm run build
npm run dev
