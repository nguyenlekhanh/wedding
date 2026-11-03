@echo off
chcp 65001 >nul
cd /d "%~dp0"
title Tiệc Cưới Online Pro - Đức Quân (0329024876)
if not exist "runtime\node.exe" (
  echo Hay giai nen day du thu muc Tiec Cuoi truoc khi chay.
  pause
  exit /b 1
)
"%~dp0runtime\node.exe" "%~dp0launcher.cjs"
if errorlevel 1 pause
