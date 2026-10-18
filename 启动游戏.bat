@echo off
chcp 65001 >nul
cd /d "%~dp0"
title 潮汐遗歌 · TIDESONG
if not exist "dist\index.html" (
  echo.
  echo   还没有构建游戏文件，正在准备……
  echo.
  call npm.cmd run build
  if errorlevel 1 (
    echo.
    echo   构建失败。请确认已安装 Node.js 20 或更高版本。
    pause
    exit /b 1
  )
)
node server.mjs
if errorlevel 1 pause
