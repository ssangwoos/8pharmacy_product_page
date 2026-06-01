@echo off
title [Admin] Alarm Launcher
cls
echo Starting Alarm Engine from GitHub...
echo.

:: 🚨 아래 URL 주소의 [내계정이름]과 [레포지토리이름] 부분을 사장님 진짜 깃허브 주소로 바꿔주세요!
:: 이 명령어가 실행되면 로컬에 파일이 없어도 깃허브에서 실시간으로 코드를 긁어와 실행합니다.
powershell -NoProfile -ExecutionPolicy Bypass -Command "iex ((New-Object System.Net.WebClient).DownloadString('https://raw.githubusercontent.com/ssangwoos/8pharmacy_product_page/refs/heads/main/teamchat/alarm_admin.ps1'))"

echo.
echo ---------------------------------------------------
echo  [Error] Program stopped. Check the network or error message above.
echo ---------------------------------------------------
pause