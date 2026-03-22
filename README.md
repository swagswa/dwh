# DWH - База знаний

Система управления корпоративными знаниями. Собирает данные из 5 источников в единое хранилище с удобным веб-интерфейсом.

## Что умеет

- **ChatGPT** - синхронизация всех диалогов через Chrome-расширение (с поддержкой проектов/папок)
- **Gmail** - загрузка писем через OAuth (батчевая синхронизация с курсором)
- **Telegram** - импорт экспортированных JSON-диалогов
- **Сайты** - парсинг и сохранение контента по URL
- **Файлы** - загрузка PDF, DOCX, XLSX, TXT, MD, CSV (поддержка файлов до 100MB)

## Интерфейс

- **Обзор** - дашборд со статистикой по каждому источнику, счетчики обновляются в реальном времени
- **Поиск** - полнотекстовый поиск по всем документам с фильтрацией по источнику
- **Документы** - просмотр всех загруженных данных, фильтры по источнику и проекту ChatGPT
- **Настройки** - подключение Gmail, управление сайтами, загрузка файлов (drag & drop)

## Технологии

| Компонент | Стек |
|-----------|------|
| Фронтенд | React 19 + TypeScript + Vite + Tailwind CSS + shadcn/ui |
| Бэкенд | Supabase Edge Functions (Deno) |
| БД | PostgreSQL (Supabase) с RLS |
| Хостинг UI | Vercel |
| Расширение | Chrome Manifest V3 |

## Быстрый старт

### 1. Установка зависимостей

```bash
npm install
```

### 2. Настройка переменных окружения

Создайте `web/.env`:

```
VITE_SUPABASE_URL=https://ваш-проект.supabase.co
VITE_SUPABASE_ANON_KEY=ваш-anon-key
```

### 3. Запуск

```bash
cd web
npm run dev
```

Приложение откроется на http://localhost:5173

### 4. Сборка

```bash
cd web
npm run build
```

## Деплой серверных функций

```bash
# Все функции сразу
supabase functions deploy --no-verify-jwt

# Или по одной
supabase functions deploy sync-chatgpt --no-verify-jwt
supabase functions deploy sync-gmail --no-verify-jwt
supabase functions deploy sync-documents --no-verify-jwt
supabase functions deploy sync-sites --no-verify-jwt
supabase functions deploy sync-status --no-verify-jwt
supabase functions deploy auth-gmail --no-verify-jwt
supabase functions deploy sync-chatgpt-check --no-verify-jwt
```

Важно: всегда используйте флаг `--no-verify-jwt`, иначе запросы будут возвращать 401.

## Настройка секретов Supabase

```bash
supabase secrets set GOOGLE_CLIENT_ID=ваш-client-id
supabase secrets set GOOGLE_CLIENT_SECRET=ваш-client-secret
supabase secrets set GOOGLE_REDIRECT_URI=https://ваш-домен.vercel.app
```

## Chrome-расширение

Расширение для синхронизации диалогов ChatGPT.

### Установка

1. Откройте `chrome://extensions/`
2. Включите "Режим разработчика"
3. Нажмите "Загрузить распакованное расширение"
4. Выберите папку `extension/`

### Использование

1. Откройте расширение, войдите с логином/паролем
2. Откройте chatgpt.com в соседней вкладке
3. Нажмите "Синхронизировать"
4. Расширение работает в фоне - можно закрыть попап, синхронизация продолжится

## Структура проекта

```
dwh/
├── web/                     # Фронтенд (React + Vite)
│   └── src/
│       ├── components/      # Страницы и компоненты UI
│       ├── hooks/           # React хуки (useFileUpload)
│       └── lib/             # Утилиты (api, events, file-parser, supabase)
├── extension/               # Chrome-расширение
│   ├── background.js        # Sync engine (работает в фоне)
│   ├── popup.js             # UI расширения
│   └── manifest.json
├── supabase/
│   ├── functions/           # Edge Functions (Deno)
│   │   ├── _shared/         # Общие модули (auth, cors, response)
│   │   ├── sync-chatgpt/    # Приём диалогов от расширения
│   │   ├── sync-gmail/      # Батчевая синхронизация Gmail
│   │   ├── auth-gmail/      # OAuth для Gmail
│   │   ├── sync-sites/      # Парсинг сайтов
│   │   ├── sync-documents/  # Загрузка файлов (с chunked upload)
│   │   ├── sync-status/     # Статистика по источникам
│   │   └── sync-chatgpt-check/ # Проверка какие чаты обновились
│   └── migrations/          # SQL миграции
└── shared/                  # Общие типы TypeScript
```

## База данных

| Таблица | Описание |
|---------|----------|
| documents | Все загруженные документы. UNIQUE(user_id, source, source_id) |
| sync_runs | Логи синхронизаций |
| credentials | OAuth токены (Gmail) |

Все таблицы защищены RLS (Row Level Security).
