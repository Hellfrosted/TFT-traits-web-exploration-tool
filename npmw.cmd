@echo off
setlocal

set "NODE_EXE=%~dp0tools\node\node.exe"
set "NPM_CLI=%~dp0tools\node\node_modules\npm\bin\npm-cli.js"
set "PATH=%~dp0tools\node;%PATH%"

if not exist "%NODE_EXE%" (
  echo Missing local Node runtime at "%NODE_EXE%".
  exit /b 1
)

if not exist "%NPM_CLI%" (
  echo Missing local npm CLI at "%NPM_CLI%".
  exit /b 1
)

"%NODE_EXE%" "%NPM_CLI%" %*
