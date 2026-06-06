#!/bin/bash
cd "$(dirname "$0")";
"npx" tsc;
"node" dist/index.js >> log/bot_$(date +'%F').log;
