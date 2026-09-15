@echo off
rem jimakuChan – WhisperLiveKit + Ollama ブリッジ起動（Windows 用の簡易ラッパ）
setlocal
set "HERE=%~dp0"
where py >nul 2>nul && (set "PY=py -3") || (set "PY=python")
%PY% "%HERE%whisper_launcher.py" start %*
echo.
pause
