@echo off
chcp 65001 >nul
title Restart Online Quiz System

echo ================================
echo  Restarting Online Quiz System
echo ================================

call "%~dp0stop.bat"

timeout /t 3 >nul

call "%~dp0start.bat"
