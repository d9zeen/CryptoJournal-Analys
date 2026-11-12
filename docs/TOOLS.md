# Инструменты для Claude Code

Что уже лежит в репозитории и что нужно ставить на своём компьютере.

## Уже в репозитории (`.claude/skills/`)

Подхватываются автоматически в любой сессии Claude Code с этим проектом.

| Команды | Откуда | Что делает |
|---|---|---|
| `/trader-copycat`, `/trader-news`, `/trader-budget`, `/trader-pelosi`, `/trader-analyst`, `/trader-screener`, `/trader-risk`, `/trader-broker`, `/trader-tax`, `/trader-alerts`, `/trader-rebalance` | [Jakeschincariol/trader-skill](https://github.com/Jakeschincariol/trader-skill), MIT | Американские акции: отчёты SEC, сделки Конгресса, размер позиции, риск, налоги. Для запросов к SEC нужна переменная `SEC_USER_AGENT="Имя почта"`. Рабочие файлы пишет в `trader/` (в `.gitignore`) |
| `/claude-automation-recommender` | [anthropics/claude-plugins-official](https://github.com/anthropics/claude-plugins-official), плагин `claude-code-setup`, Apache-2.0 | Официальный скилл Anthropic: сканирует проект и советует хуки, скиллы, MCP-серверы, сабагентов. Только читает, ничего не меняет. Сказать: «посоветуй автоматизации для этого проекта» |
| `/strix-find-security-vulnerabilities-in-code`, `/strix-penetration-testing-with-strix`, `/strix-owasp-top-10-testing`, `/strix-web-app-penetration-testing`, `/strix-api-security-testing`, `/strix-application-security-testing`, `/strix-fix-security-vulnerabilities-with-strix`, `/strix-ci-security-scanning-with-strix`, `/strix-managed-pentesting-with-strix` | [usestrix/strix](https://github.com/usestrix/strix), Apache-2.0 | Инструкции для ИИ-пентеста. Сами скиллы только объясняют Claude, как запускать Strix. Программа `strix` ставится отдельно, см. ниже |

## Ставится на свой компьютер

Это программы, а не скиллы. В облачной сессии Claude Code они не сохраняются, поэтому команды ниже запускать на своём ПК.

### Strix (ИИ-пентестер)

Нужны Docker (запущенный) и ключ от любой LLM (OpenAI, Anthropic, Google, OpenRouter).

```bash
pipx install strix-agent
```

```bash
export STRIX_LLM="openrouter/z-ai/glm-5.3"
export LLM_API_KEY="ключ"
strix --target ./app-directory
```

Результаты в `strix_runs/<имя>`. Для Windows: `pip install strix-agent` и переменные через `set`.

### Claude Mem (память между сессиями)

Ставится на компьютер, где работает Claude Code. Память хранится в `~/.claude-mem`.

```bash
npx claude-mem install
```

Или внутри Claude Code:

```
/plugin marketplace add thedotmack/claude-mem
/plugin install claude-mem
```

После установки перезапустить Claude Code. Отключить сбор анонимной статистики: `npx claude-mem telemetry disable`.

### Agent Reach (доступ агента в интернет без платных API)

Нужен `uv` (установщик консольных программ). Пакет `agent-reach` на PyPI не этот проект, ставить только с GitHub.

```bash
uv tool install https://github.com/Panniantong/Agent-Reach/releases/latest/download/agent-reach.zip
```

```bash
agent-reach setup
```

`setup` включает каналы по умолчанию и сам ставит скилл `agent-reach` в Claude Code. Обновление: `agent-reach update`.

### FreeLLMAPI (один OpenAI-совместимый адрес поверх бесплатных LLM)

Нужен Docker. Модели там не Claude, качество ниже; смысл только в экономии лимитов.

```bash
curl -fsSL https://freellmapi.co/install.sh | bash
```

Открыть http://localhost:3001, на странице Keys добавить ключи провайдеров, настроить Fallback Chain, скопировать единый ключ. Подключить к Claude Code:

```bash
npx freellmapi setup-claude --url http://localhost:3001 --api-key <единый ключ>
```

Для Windows есть установщик `.exe` в Releases репозитория.
