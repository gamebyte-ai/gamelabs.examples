#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/sortexpress"
npm install
npm run build
npm run dev
