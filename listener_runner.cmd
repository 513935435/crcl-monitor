@echo off
cd /d "C:\Users\T14s\Documents\New project"
"C:\Program Files\nodejs\node.exe" ".\feishu_listener.mjs" >> ".\.state\listener.out.log" 2>> ".\.state\listener.err.log"
