#!/bin/bash
# 启动局域网服务.command —— 双击即可把健身打卡部署到局域网
cd "$(dirname "$0")"
node scripts/dev-server.js --port 8000 --host 0.0.0.0
