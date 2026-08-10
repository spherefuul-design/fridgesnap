# FridgeSnap

Сфотографуй холодильник — отримай 3 рецепти за 10 секунд.

## Як це влаштовано

- `components/FridgeSnapApp.jsx` — весь інтерфейс (той самий, що був артефактом).
- `app/api/claude/route.js` — серверна функція (Vercel Serverless Function), яка ходить
  в Anthropic API з ключем, захованим у змінних середовища. Ключ ніколи не потрапляє
  в браузер.
- Фронтенд тепер стукає у власний `/api/claude`, а не напряму в `api.anthropic.com`.

## Запуск локально

1. Встанови залежності:
   ```bash
   npm install
   ```
2. Скопіюй `.env.example` в `.env.local` і встав свій ключ:
   ```bash
   cp .env.example .env.local
   ```
   ```
   ANTHROPIC_API_KEY=sk-ant-...
   ```
   Ключ береш у консолі Anthropic: https://console.anthropic.com/settings/keys
3. Запусти дев-сервер:
   ```bash
   npm run dev
   ```
4. Відкрий http://localhost:3000

## Виклад на GitHub

```bash
git init
git add .
git commit -m "FridgeSnap"
git branch -M main
git remote add origin https://github.com/<твій-юзернейм>/fridgesnap.git
git push -u origin main
```

## Деплой на Vercel

1. Зайди на https://vercel.com і залогінься через GitHub.
2. "Add New… → Project" → обери щойно запушений репозиторій `fridgesnap`.
3. Vercel сам розпізнає Next.js — нічого змінювати в налаштуваннях білду не треба.
4. **Обовʼязково** перед деплоєм (або одразу після, у Project → Settings → Environment
   Variables) додай змінну:
   - Name: `ANTHROPIC_API_KEY`
   - Value: твій ключ з console.anthropic.com
   - Environment: Production, Preview, Development — постав усі три
5. Натисни Deploy. Через хвилину отримаєш робоче посилання типу
   `https://fridgesnap.vercel.app`.

Якщо після деплою бачиш помилку розпізнавання/рецептів — перевір, що змінна
`ANTHROPIC_API_KEY` точно збережена в Vercel і що зробив Redeploy після її додавання
(Vercel не підхоплює нові env-змінні у вже задеплоєній збірці автоматично).

## Важливо про камеру на телефоні

Кнопка камери відкриває системний вибір фото/камери через `<input type="file" capture>`.
Це працює тільки по HTTPS (Vercel завжди на HTTPS з коробки) — по звичайному http:// на
телефоні браузер може блокувати доступ до камери.
