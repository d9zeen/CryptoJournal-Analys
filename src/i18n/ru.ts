/**
 * ВСЕ тексты интерфейса на русском.
 * Чтобы добавить английский: создать en.ts с такой же структурой (тип Dict это проверит).
 */
export const ru = {
  app: {
    name: 'CryptoJournal',
    tagline: 'Дневник сделок криптотрейдера',
  },
  nav: {
    dashboard: 'Дашборд',
    trades: 'Сделки',
    import: 'Импорт',
    settings: 'Настройки',
    logout: 'Выйти',
  },
  auth: {
    email: 'Email',
    password: 'Пароль',
    passwordRepeat: 'Повтори пароль',
    newPassword: 'Новый пароль',
    login: {
      title: 'Вход',
      submit: 'Войти',
      noAccount: 'Нет аккаунта?',
      toRegister: 'Зарегистрироваться',
      forgot: 'Забыли пароль?',
    },
    register: {
      title: 'Регистрация',
      submit: 'Создать аккаунт',
      hasAccount: 'Уже есть аккаунт?',
      toLogin: 'Войти',
      checkEmail: 'Готово! Мы отправили письмо для подтверждения на {email}. Перейди по ссылке из письма, затем войди.',
    },
    reset: {
      title: 'Восстановление пароля',
      hint: 'Укажи email — пришлём ссылку для смены пароля.',
      submit: 'Отправить ссылку',
      sent: 'Если такой аккаунт есть, письмо уже в пути. Проверь почту (и папку «Спам»).',
      back: 'Вернуться ко входу',
    },
    update: {
      title: 'Новый пароль',
      submit: 'Сохранить пароль',
      done: 'Пароль изменён.',
      noSession: 'Ссылка недействительна или устарела. Запроси восстановление пароля ещё раз.',
    },
    errors: {
      passwordShort: 'Пароль должен быть не короче 8 символов',
      passwordMismatch: 'Пароли не совпадают',
      invalidCredentials: 'Неверный email или пароль',
      emailNotConfirmed: 'Email не подтверждён. Проверь почту.',
      userExists: 'Пользователь с таким email уже существует',
      rateLimit: 'Слишком много попыток. Подожди немного и попробуй снова.',
      generic: 'Что-то пошло не так. Попробуй ещё раз.',
    },
  },
  common: {
    loading: 'Загрузка…',
    comingSoon: 'Скоро здесь появится этот раздел.',
    notFound: 'Страница не найдена',
    toHome: 'На главную',
  },
  pages: {
    dashboard: { title: 'Дашборд', stage: 'Статистика и графики — этап 3.' },
    trades: { title: 'Сделки', stage: 'Список и форма сделок — этап 2.' },
    import: { title: 'Импорт CSV', stage: 'Импорт из Bybit — этап 4.' },
    settings: { title: 'Настройки', stage: 'Профиль, сетапы, теги, эмоции — этап 2.', account: 'Аккаунт' },
  },
  setup: {
    title: 'Supabase ещё не подключён',
    text: 'Приложению нужны адрес проекта и публичный ключ Supabase. Добавь переменные VITE_SUPABASE_URL и VITE_SUPABASE_ANON_KEY (в файл .env локально или в настройки Cloudflare Pages) и пересобери проект.',
  },
} as const

/** Структура словаря: строки любые, но набор ключей обязан совпадать. */
type Widen<T> = { [K in keyof T]: T[K] extends string ? string : Widen<T[K]> }
export type Dict = Widen<typeof ru>
