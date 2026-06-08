#!/bin/bash
cd "$(dirname "$0")";
"~/.nvm/versions/node/v24.15.0/bin/npx" tsc;
"~.nvm/versions/node/v24.15.0/bin/node" dist/index.js >> log/bot_$(date +'%F').log;
