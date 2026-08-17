#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/match3"
npm install
npm run build
npm run dev
