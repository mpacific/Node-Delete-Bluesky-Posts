#!/bin/bash
cd "$(dirname "$0")";
/home/mike/.nvm/versions/node/v18.20.2/bin/node index.js >> log/bot_$(date +'%F').log;
