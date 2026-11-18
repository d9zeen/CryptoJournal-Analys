#!/usr/bin/env bash
# Хук UserPromptSubmit: перед каждой задачей напоминает Claude сначала поискать подходящий скилл.
cat <<'JSON'
{"hookSpecificOutput":{"hookEventName":"UserPromptSubmit","additionalContext":"Правило владельца: прежде чем что-то делать, просмотри список доступных скиллов. Если какой-то подходит к задаче — сначала вызови его через Skill и работай по нему, и скажи владельцу, какой скилл взял. Подсказки: интерфейс дневника (аудит, полировка, анимации, адаптив) → impeccable; главная / лендинг → design-taste-frontend (правила CLAUDE.md важнее его правил); «в стиле Stripe / Linear / Binance» → design-md; проверить сайт в браузере → playwright-cli; 3D из картинки → img2threejs; токен / монета → analys (быстро), 2top-research (PDF-выпуск), token-scout (поиск кандидатов); графики → dataviz; ревью кода → code-review. Подходящего нет — работай как обычно, без лишних вызовов."}}
JSON
