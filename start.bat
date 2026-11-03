@echo off
rem ============================================================
rem  CryptoJournal - запуск сайта на этом компьютере (Windows).
rem  Двойной клик по файлу. Окно не закрывать, пока работаешь:
rem  закроешь окно - сайт на localhost остановится.
rem ============================================================
chcp 65001 >nul
title CryptoJournal - localhost
cd /d "%~dp0"

where node >nul 2>nul
if errorlevel 1 goto no_node

where git >nul 2>nul
if errorlevel 1 goto skip_pull
echo.
echo [1/4] Забираю свежий код с GitHub...
git pull --ff-only
if errorlevel 1 echo [!] Обновить код не получилось - запускаю то, что уже есть на компьютере.
:skip_pull

echo.
echo [2/4] Проверяю зависимости - первый раз это займёт пару минут...
call npm install --no-audit --no-fund --loglevel=error
if errorlevel 1 goto npm_failed

if exist .env goto env_ok
echo.
echo [3/4] Создаю файл .env с настройками Supabase из .env.example
copy /y .env.example .env >nul
:env_ok

echo.
echo [4/4] Запускаю сайт. Браузер откроется сам: http://localhost:5173
echo      НЕ закрывай это окно, пока работаешь. Остановить сайт - Ctrl+C.
echo.
call npm run dev -- --open
echo.
echo Сайт остановлен.
pause
exit /b 0

:no_node
echo.
echo [!] Не найден Node.js. Установи Node.js 22 LTS с https://nodejs.org
echo     затем перезапусти этот файл.
start https://nodejs.org
pause
exit /b 1

:npm_failed
echo.
echo [!] npm install завершился с ошибкой. Сделай скриншот этого окна и пришли в чат.
pause
exit /b 1
