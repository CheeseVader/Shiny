@echo off
setlocal

set "SHINY_URL=http://127.0.0.1:5173/login?kiosk=1"
set "SHINY_PROFILE=%LOCALAPPDATA%\ShinyPOSKiosk"

set "CHROME=%ProgramFiles%\Google\Chrome\Application\chrome.exe"
if exist "%CHROME%" goto RUN_CHROME

set "CHROME=%ProgramFiles(x86)%\Google\Chrome\Application\chrome.exe"
if exist "%CHROME%" goto RUN_CHROME

set "EDGE=%ProgramFiles(x86)%\Microsoft\Edge\Application\msedge.exe"
if exist "%EDGE%" goto RUN_EDGE

set "EDGE=%ProgramFiles%\Microsoft\Edge\Application\msedge.exe"
if exist "%EDGE%" goto RUN_EDGE

echo.
echo ERROR: No se encontro Google Chrome ni Microsoft Edge.
echo Instala uno de los navegadores o ajusta la ruta en este archivo.
pause
exit /b 1

:RUN_CHROME
start "" "%CHROME%" ^
  --kiosk "%SHINY_URL%" ^
  --user-data-dir="%SHINY_PROFILE%" ^
  --no-first-run ^
  --no-default-browser-check ^
  --disable-session-crashed-bubble ^
  --disable-infobars ^
  --disable-features=TranslateUI
exit /b 0

:RUN_EDGE
start "" "%EDGE%" ^
  --kiosk "%SHINY_URL%" ^
  --edge-kiosk-type=fullscreen ^
  --user-data-dir="%SHINY_PROFILE%" ^
  --no-first-run ^
  --no-default-browser-check ^
  --disable-session-crashed-bubble
exit /b 0