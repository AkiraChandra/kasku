#!/bin/bash
set -e

cd /home/akira04/projects/kasku

echo "[Deploy] Pulling latest code from main..." >> /tmp/kasku_deploy.log 2>&1
git pull origin main >> /tmp/kasku_deploy.log 2>&1

echo "[Deploy] Building and restarting containers..." >> /tmp/kasku_deploy.log 2>&1
docker compose up -d --build >> /tmp/kasku_deploy.log 2>&1

echo "[Deploy] Done at $(date)" >> /tmp/kasku_deploy.log 2>&1
