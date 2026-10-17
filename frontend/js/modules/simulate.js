const LABELS = {
  university: "Выбор вуза",
  job: "Первая работа",
  adapt: "Первый месяц",
};

const MODE_LABELS = {
  info: "Инфо",
  trainer: "Тренажёр",
};

const DISCLAIMER =
  "Рекомендации носят информационный характер и не заменяют официальные требования вузов и работодателей.";

/** Mirror of backend/data/sources/catalog.json — offline attribution fallback */
const SOURCES = {
  "minobrnauki-admission": {
    title: "Высшее образование: открытые материалы Минобрнауки",
    source: "Министерство науки и высшего образования РФ",
    url: "https://minobrnauki.gov.ru/action/stat/highed/",
    accessed: "2026-10-04",
  },
  "gosuslugi-university": {
    title: "Поступление в вуз онлайн: ситуация на Госуслугах",
    source: "Портал Госуслуги",
    url: "https://www.gosuslugi.ru/situation/university_admission",
    accessed: "2026-10-04",
  },
  "postupi-online": {
    title: "Поступай правильно: как выбрать профессию, вуз или колледж",
    source: "Поступи Онлайн — журнал",
    url: "https://postupi.online/journal/kuda-postupat/postupaj-pravilno-kak-vybrat-professiyu-vuz-ili-kolledzh-i-postroit-svoj-marshrut-obrazovaniya-i-karery/",
    accessed: "2026-10-04",
  },
  "postupi-admission-track": {
    title: "Как поступить в вуз: алгоритм поступления (бакалавриат)",
    source: "Поступи Онлайн",
    url: "https://postupi.online/online-priem/bakalavr/track/",
    accessed: "2026-10-04",
  },
  "student-reviews-vuz": {
    title: "Рейтинг вузов по отзывам студентов (бакалавриат / специалитет)",
    source: "Табитуриент — открытые отзывы студентов о вузах",
    url: "https://tabiturient.ru/rating/",
    accessed: "2026-10-13",
  },
  "student-reviews-vuz-page": {
    title: "Пример страницы отзывов студентов о вузе (МГУ)",
    source: "Табитуриент — модерируемые отзывы студентов «изнутри»",
    url: "https://tabiturient.ru/vuzu/mgu/",
    accessed: "2026-10-13",
  },
  "academic-oecd-career": {
    title: "Career readiness: переход из образования в работу",
    source: "OECD — академические материалы по карьерной готовности",
    url: "https://www.oecd.org/en/topics/sub-issues/career-readiness.html",
    accessed: "2026-10-04",
  },
  "hh-first-job": {
    title: "Составляем резюме: советы соискателям",
    source: "hh.ru — карьерные статьи",
    url: "https://hh.ru/article/3015367",
    accessed: "2026-10-04",
  },
  "hh-resume-employers": {
    title: "Резюме глазами работодателей: на что смотрят в первую очередь",
    source: "hh.ru — карьерные статьи",
    url: "https://hh.ru/article/32050",
    accessed: "2026-10-04",
  },
  "hh-interview": {
    title: "Подготовка к собеседованию: основные вопросы и ответы",
    source: "hh.ru — карьерные статьи",
    url: "https://hh.ru/article/301547",
    accessed: "2026-10-04",
  },
  "hh-self-pitch": {
    title: "Как презентовать свой опыт, чтобы вас наняли",
    source: "hh.ru — карьерные статьи",
    url: "https://hh.ru/article/302305",
    accessed: "2026-10-04",
  },
  "forum-first-interview": {
    title: "Стажёр, который смог: советы Junior-разрабов и менторов",
    source: "Habr / AGIMA — открытый опыт кандидатов и стажёров (сообщество)",
    url: "https://habr.com/ru/companies/agima/articles/831466/",
    accessed: "2026-10-13",
  },
  "employee-reviews-habr-career": {
    title: "Рейтинг работодателей и отзывы сотрудников на Хабр Карьере",
    source: "Habr Career — открытые отзывы текущих и бывших сотрудников",
    url: "https://habr.com/ru/articles/961240/",
    accessed: "2026-10-13",
  },
  "intern-diary-first-month": {
    title: "Дневник стажёра: первый месяц на работе",
    source: "Habr / Ozon Tech — открытый опыт адаптации новичка",
    url: "https://habr.com/ru/companies/ozontech/articles/862002/",
    accessed: "2026-10-13",
  },
  "mintrud-youth": {
    title: "Демография и занятость молодёжи: открытые программы Минтруда",
    source: "Минтруд России",
    url: "https://mintrud.gov.ru/ministry/programms/demography",
    accessed: "2026-10-04",
  },
  "rabota-russia": {
    title: "Работа России: поиск вакансий и карьерная навигация",
    source: "Федеральный портал «Работа России»",
    url: "https://trudvsem.ru/vacancy/search",
    accessed: "2026-10-04",
  },
  "onboarding-open": {
    title: "Induction / onboarding: практики адаптации новичка",
    source: "CIPD Factsheet (академический / HR open knowledge)",
    url: "https://www.cipd.org/en/knowledge/factsheets/induction-factsheet/",
    accessed: "2026-10-04",
  },
  "softline-career": {
    title: "В ИТ сразу после вуза: гайд по старту карьеры",
    source: "Softline — блог / карьерные материалы",
    url: "https://softline.ru/about/blog/v-it-srazu-posle-vuza-gayd-po-startu-karery",
    accessed: "2026-10-04",
  },
};

const INFO_TOPICS = {
  university: [
    {
      keywords: ["рейтинг", "топ", "лучший вуз", "какой вуз", "выбрать вуз", "сравн"],
      summary:
        "Рейтинг — ориентир, не решение. Сравнивай программу (учебный план), практику и стажировки, проходные баллы за 2–3 года, стоимость/общежитие и отзывы студентов по нагрузке и преподаванию. Сформулируй 3 критерия «важно именно мне» и проверяй вузы по ним, а не по месту в таблице.",
      source_ids: ["postupi-online", "student-reviews-vuz", "student-reviews-vuz-page", "academic-oecd-career"],
    },
    {
      keywords: ["документ", "заявл", "поступ", "егэ", "балл", "квота", "приём", "госуслуг"],
      summary:
        "Сроки и комплект документов зависят от формы приёма (бюджет/договор, особые квоты). Проверяй календарь приёмной кампании на сайте вуза и дублируй ключевые шаги через Госуслуги, если вуз принимает электронные заявления. Держи сканы паспорта, аттестата и согласий заранее.",
      source_ids: ["gosuslugi-university", "postupi-admission-track", "minobrnauki-admission"],
    },
    {
      keywords: ["день открытых", "открыт", "экскурси", "кампус", "посетить"],
      summary:
        "На дне открытых дверей спрашивай не «как поступить», а «как учатся»: где практика, сколько контактов с индустрией, как устроены проекты, какой процент отчислений на 1 курсе. Сверь ответы с отзывами студентов о нагрузке и преподавании, затем сравни вузы по одной таблице критериев.",
      source_ids: ["postupi-online", "student-reviews-vuz", "student-reviews-vuz-page"],
    },
    {
      keywords: ["программ", "факультет", "специальност", "направлени", "профиль"],
      summary:
        "Название направления не равно содержанию. Открой учебный план: какие дисциплины на 1–2 курсе, есть ли проектная работа, стажировка, выпускной проект с заказчиком. Если план слишком общий — уточни у приёмной и посмотри, что пишут студенты о реальной нагрузке на направлении.",
      source_ids: ["postupi-online", "postupi-admission-track", "student-reviews-vuz", "academic-oecd-career"],
    },
  ],
  job: [
    {
      keywords: ["резюме", "cv", "портфолио", "опыт", "нет опыта"],
      summary:
        "Для первой работы важны учебные и личные проекты, а не «пустой» стаж. В резюме: роль, что сделал, инструмент, измеримый результат (даже маленький). Один сильный кейс лучше списка курсов без результата. На hh и «Работе России» смотри требования вакансий junior/стажёр и копируй язык навыков честно.",
      source_ids: ["hh-first-job", "hh-resume-employers", "rabota-russia"],
    },
    {
      keywords: ["собесед", "интервью", "вопрос", "расскажи о себе", "самопрезентац"],
      summary:
        "К собеседованию готовь 2–3 истории по схеме: ситуация → действие → результат → вывод. «Ничего не умею» — слабая позиция; вместо этого покажи, чему научился на проекте. Уточняй формат роли, испытательный срок и ожидания по первой задаче.",
      source_ids: ["hh-interview", "hh-self-pitch", "forum-first-interview"],
    },
    {
      keywords: ["где искать", "ваканси", "стажиров", "hh", "работа россии"],
      summary:
        "Ищи стажировки и junior-роли на открытых площадках (hh, Работа России) и на карьерных страницах компаний. Перед откликом глянь открытые отзывы сотрудников (Habr Career): онбординг, нагрузка, отношение к стажёрам. Сохраняй отклики в таблице: компания, роль, статус, следующий шаг.",
      source_ids: ["rabota-russia", "hh-first-job", "softline-career", "employee-reviews-habr-career"],
    },
    {
      keywords: ["навык", "команд", "коммуникац", "ответственност", "дедлайн"],
      summary:
        "Работодатели на входе часто проверяют не «звёздный код», а умение уточнять задачу, держать срок и просить помощь вовремя. Готовь примеры: как закрыл дедлайн, как разобрал конфликт в учебном проекте, как принял фидбек. В открытых разборах стажёров те же сигналы звучат чаще, чем «идеальный стек».",
      source_ids: ["hh-interview", "forum-first-interview", "academic-oecd-career", "mintrud-youth"],
    },
  ],
  adapt: [
    {
      keywords: ["первая недел", "онбординг", "вводн", "новичок", "адаптац"],
      summary:
        "В первую неделю цель — карта: кто наставник, где доступы, какой формат стендапа и куда писать, если застрял. Запиши критерии «готово» для первой задачи. Открытые дневники стажёров и отзывы сотрудников подтверждают: уточнять в первую неделю — норма, а не слабость.",
      source_ids: ["onboarding-open", "intern-diary-first-month", "softline-career", "academic-oecd-career"],
    },
    {
      keywords: ["спросить", "помощь", "застрял", "не понимаю", "стесня"],
      summary:
        "Правило новичка: сначала 15–25 минут самостоятельной попытки, потом вопрос с контекстом — что уже пробовал, где скрин/лог, какой ожидаемый результат. В разборах стажёров тот же совет: не молчать часами — экономишь время наставника и быстрее учишься.",
      source_ids: ["onboarding-open", "forum-first-interview", "intern-diary-first-month"],
    },
    {
      keywords: ["фидбек", "обратн", "ревью", "критик", "оценк"],
      summary:
        "Проси короткий фидбек после первой сдачи: что ок, что переделать, что улучшить в следующий раз. Фиксируй договорённости в чате/тикете. В отзывах о работодателях прозрачный фидбек на испытательном часто отмечают как плюс адаптации.",
      source_ids: ["onboarding-open", "employee-reviews-habr-career", "hh-interview", "hh-self-pitch"],
    },
    {
      keywords: ["приоритет", "срок", "дедлайн", "перегруз", "много задач"],
      summary:
        "Если задач больше, чем часов — покажи список и спроси приоритет у руководителя: что сдать сегодня, что можно сдвинуть. Молчаливая перегрузка хуже, чем честный апдейт статуса — это повторяют и академические гайды онбординга, и дневники новичков.",
      source_ids: ["onboarding-open", "intern-diary-first-month", "academic-oecd-career"],
    },
  ],
};

const TRAINER_CASES = {
  university: [
    {
      id: "criteria-pitch",
      prompt: "За 60 секунд объясни, почему ты выбрал именно эту программу, а не соседний факультет.",
      weak_signals: ["не знаю", "все говорят", "рейтинг", "просто нравится", "друзья"],
      ok_signals: ["практик", "учебн", "стажир", "проект", "критери"],
      improve: "Убери общие слова. Назови 2–3 критерия из учебного плана или практики и свяжи их со своей целью.",
      example:
        "«Выбрал программу из‑за проектной практики со 2 курса и партнёрских стажировок — хочу к 3 курсу портфолио, а не только теорию.»",
      source_ids: ["postupi-online"],
    },
    {
      id: "open-day-questions",
      prompt: "Составь 3 вопроса приёмной комиссии, которые нельзя закрыть одним баннером на сайте.",
      weak_signals: ["проходно", "общежити", "сколько стоит"],
      ok_signals: ["практик", "нагрузк", "отчисл", "стажир", "преподав", "трудоустр"],
      improve:
        "Вопросы про баллы и общежитие полезны, но добавь «внутреннюю кухню»: нагрузка, практика, поддержка после 1 курса.",
      example:
        "«Какой формат практики на 2 курсе? Сколько часов самостоятельной работы в неделю на 1 курсе? Есть ли сопровождение при академических трудностях?»",
      source_ids: ["postupi-online", "minobrnauki-admission"],
    },
    {
      id: "compare-table",
      prompt: "Сравни два вуза по одной таблице: программа, практика, баллы, быт. Что важнее для тебя лично?",
      weak_signals: ["один лучше", "все равно", "не сравнивал"],
      ok_signals: ["критери", "важн", "практик", "балл", "программ"],
      improve: "Без личных приоритетов сравнение превращается в чужой рейтинг. Зафиксируй свой топ-критерий.",
      example:
        "«Для меня важнее практика и стажировки, чем место в рейтинге: вуз A даёт проект с 1 курса, вуз B — выше балл, но практика только на 3.»",
      source_ids: ["postupi-online"],
    },
    {
      id: "plan-b",
      prompt: "Что будешь делать, если не пройдёшь на бюджет в первый вуз?",
      weak_signals: ["не знаю", "никуда", "всё пропало"],
      ok_signals: ["договор", "колледж", "другой вуз", "пересда", "запас", "план"],
      improve: "План B снижает панику. Назови конкретный запасной маршрут и срок решения.",
      example:
        "«Держу 2 запасных программы с близким планом и слежу за волнами зачисления; параллельно готовлю пакет на договор, если баллов не хватит.»",
      source_ids: ["gosuslugi-university", "minobrnauki-admission"],
    },
    {
      id: "family-pressure",
      prompt: "Родители давят: «Иди в престижный вуз, там все учатся». Как ответишь спокойно и по делу?",
      weak_signals: ["ладно пойду", "мне всё равно", "они правы", "не спорю"],
      ok_signals: ["критери", "программ", "практик", "цель", "сравн", "мой выбор"],
      improve: "Не спорь о престиже — покажи свои критерии и сравнение программ.",
      example:
        "«Престиж важен, но я сравниваю практику и трудоустройство. Вот таблица двух программ — давайте выберем по фактам, не только по бренду.»",
      source_ids: ["postupi-online"],
    },
  ],
  job: [
    {
      id: "tell-about-project",
      prompt: "Расскажи о учебном или личном проекте так, будто ты на собеседовании: задача, твой вклад, результат.",
      weak_signals: ["ничего не умею", "я никто", "просто учёба", "нечего сказать"],
      ok_signals: ["сделал", "результат", "научил", "команд", "срок", "проект"],
      improve: "Добавь конкретику: что именно сделал ты, какой был выход и чему научился.",
      example:
        "«Собрал лендинг за 2 недели: сверстал блоки, подключил форму заявок, по метрике получили 12 откликов — научился быстро править интерфейс по фидбеку.»",
      source_ids: ["hh-first-job", "hh-interview"],
    },
    {
      id: "weakness-answer",
      prompt: "На вопрос «Какие у тебя слабые стороны?» дай ответ без самосаботажа.",
      weak_signals: ["ничего не умею", "я плохой", "всё плохо", "нет навыков"],
      ok_signals: ["работаю над", "учусь", "улучш", "пример", "сейчас"],
      improve: "Слабость + конкретный шаг улучшения звучит зрелее, чем отрицание себя.",
      example:
        "«Раньше откладывал уточнение ТЗ — теперь в начале задачи фиксирую критерии «готово» письмом, чтобы не переделывать в конце.»",
      source_ids: ["hh-interview"],
    },
    {
      id: "why-this-company",
      prompt: "Почему хочешь стажировку / junior-роль именно в этой компании?",
      weak_signals: ["деньги", "лишь бы взяли", "не знаю", "все равно"],
      ok_signals: ["продукт", "команд", "навык", "задач", "рост", "практик"],
      improve: "Свяжи интерес к продукту/стеку с тем, чему хочешь научиться за 3–6 месяцев.",
      example:
        "«Хочу практику на реальных задачах поддержки продуктов: у вас сильный онбординг стажёров, и мне важно научиться работать с тикетами и сроками.»",
      source_ids: ["softline-career", "hh-interview"],
    },
    {
      id: "no-experience",
      prompt: "Работодатель: «У вас нет опыта». Что ответишь?",
      weak_signals: ["да нет опыта", "возьмите пожалуйста", "я никто"],
      ok_signals: ["проект", "практик", "готов", "научил", "пример", "стажир"],
      improve: "Переведи «нет опыта» в «есть релевантная практика» и предложи пробную задачу.",
      example:
        "«Коммерческого стажа нет, но есть учебный проект с дедлайном и ревью. Готов выполнить тестовое за N дней и показать, как работаю.»",
      source_ids: ["hh-first-job", "mintrud-youth"],
    },
    {
      id: "salary-talk",
      prompt: "На собеседовании спросили про ожидания по зарплате. Что скажешь на junior/стажировке?",
      weak_signals: ["мне всё равно", "сколько дадите", "не знаю", "миллион"],
      ok_signals: ["вилк", "рынк", "стажир", "рост", "обязанност", "диапазон"],
      improve: "Опирайся на вилку рынка и формат роли; привяжи ожидания к обязанностям и росту.",
      example:
        "«Смотрел вилку junior/стажёр по похожим вакансиям — ориентир X–Y. Готов обсудить в рамках обязанностей и пересмотра после испытательного.»",
      source_ids: ["hh-interview", "rabota-russia"],
    },
  ],
  adapt: [
    {
      id: "stuck-message",
      prompt: "Ты 40 минут не можешь закрыть задачу. Напиши сообщение наставнику.",
      weak_signals: ["ничего не получается", "помогите", "не умею", "я тупой"],
      ok_signals: ["пробовал", "ошибк", "ожидал", "вопрос", "шаг", "лог"],
      improve: "Добавь контекст: что уже сделал, где стопор, какой следующий шаг предлагаешь.",
      example:
        "«Застрял на шаге X: пробовал A и B, ошибка такая-то. Ожидал Y. Можешь подсказать, в какую сторону смотреть дальше?»",
      source_ids: ["onboarding-open"],
    },
    {
      id: "done-criteria",
      prompt: "Руководитель дал задачу устно. Что уточнишь, прежде чем начать?",
      weak_signals: ["сразу сделаю", "ок понял", "без вопросов"],
      ok_signals: ["готово", "срок", "формат", "приор", "критери", "пример"],
      improve:
        "Без критериев «готово» легко сделать не то. Уточни срок, формат сдачи и пример ожидаемого результата.",
      example:
        "«Уточню: критерий готово — PR + короткий апдейт в чат? Срок до пятницы 17:00? Есть пример похожей задачи?»",
      source_ids: ["onboarding-open"],
    },
    {
      id: "overload",
      prompt: "На тебе уже 3 срочных задачи. Как эскалируешь перегруз?",
      weak_signals: ["сделаю всё", "молча", "не скажу", "ночью доделаю"],
      ok_signals: ["приор", "список", "срок", "сдвин", "согласу"],
      improve: "Покажи список и спроси порядок. Скрытая перегрузка бьёт по качеству и доверию.",
      example:
        "«Сейчас в работе A (сегодня), B и C. Если все срочные — какой приоритет? Могу сдвинуть C на понедельник.»",
      source_ids: ["onboarding-open"],
    },
    {
      id: "first-month-review",
      prompt: "Через месяц спросили: «Как проходит адаптация?» Ответь конструктивно.",
      weak_signals: ["нормально", "всё ок", "не знаю", "плохо всё"],
      ok_signals: ["научил", "сложн", "следующ", "помощ", "задач", "рост"],
      improve: "Структура: что уже получается / где нужна поддержка / какой следующий фокус.",
      example:
        "«Освоил тикеты и стендап, ещё путаюсь в приоритетах релизов — хочу разобрать чеклист сдачи с наставником на следующей неделе.»",
      source_ids: ["onboarding-open", "softline-career"],
    },
    {
      id: "admit-mistake",
      prompt: "Ты допустил ошибку в задаче, которую уже отметили как готовую. Что напишешь в чат команды?",
      weak_signals: ["молчу", "это не я", "само разберётся", "скры"],
      ok_signals: ["ошиб", "исправ", "влияние", "срок", "провер", "изви"],
      improve: "Коротко: что случилось → влияние → как чинишь → как предотвратишь.",
      example:
        "«Нашёл ошибку в вчерашнем PR: ломает шаг X. Уже готовлю фикс, ETA 40 минут. Добавлю чеклист проверки, чтобы не повторилось.»",
      source_ids: ["onboarding-open"],
    },
  ],
};

const INFO_PROMPTS = {
  university: [
    "Как выбрать между двумя вузами?",
    "На что смотреть кроме рейтинга?",
    "Какие вопросы задать на дне открытых дверей?",
  ],
  job: [
    "Что писать в резюме без опыта?",
    "Как говорить о слабых сторонах?",
    "Нужно ли портфолио junior-у?",
  ],
  adapt: [
    "Как просить помощь у тимлида?",
    "Что уточнять в первой задаче?",
    "Как не потеряться в первые недели?",
  ],
};

const INFO_GREETINGS = {
  university: {
    text: "Я MentOrAI — ИИ-ментор по выбору вуза и колледжа.\n\nОтвечаю по открытым источникам и указываю ссылки. Могу разобрать программы, проходные баллы и «внутреннюю кухню» поступления. Что сейчас важнее всего?",
    tags: [],
    sources: [],
  },
  job: {
    text: "Сценарий: первая работа.\n\nРазберём резюме, портфолио и ответы на собеседовании — с опорой на открытые карьерные источники. С чего начнём?",
    tags: [],
    sources: [],
  },
  adapt: {
    text: "Сценарий: первый месяц в компании.\n\nПомогу с ожиданиями команды, апдейтами и тем, как спокойно просить помощь. Источники будут под ответом. Что сейчас мешает больше всего?",
    tags: [],
    sources: [],
  },
};

function resolveSources(ids) {
  return (ids || []).map((id) => SOURCES[id]).filter(Boolean);
}

function scoreKeywords(text, keywords) {
  let score = 0;
  for (const keyword of keywords || []) {
    if (keyword && text.includes(keyword.toLowerCase())) {
      score += 1 + Math.min(3, Math.floor(keyword.length / 4));
    }
  }
  return score;
}

function findTopic(scenario, text) {
  const topics = INFO_TOPICS[scenario] || INFO_TOPICS.university;
  let best = null;
  let bestScore = 0;
  for (const topic of topics) {
    const score = scoreKeywords(text, topic.keywords);
    if (score > bestScore) {
      best = topic;
      bestScore = score;
    }
  }
  return bestScore > 0 ? best : topics[0];
}

function getCases(scenario) {
  return TRAINER_CASES[scenario] || TRAINER_CASES.university;
}

function clampCaseIndex(scenario, index) {
  const cases = getCases(scenario);
  const safe = Math.max(0, Math.min(Number(index) || 0, cases.length - 1));
  return { cases, index: safe, case: cases[safe], total: cases.length };
}

function hitAny(text, signals) {
  const lowered = String(text || "").toLowerCase();
  return (signals || []).some((signal) => signal && lowered.includes(String(signal).toLowerCase()));
}

function normalizeMeta(text) {
  return String(text || "")
    .toLowerCase()
    .trim()
    .replace(/[.!?…]+$/g, "")
    .replace(/\s+/g, " ");
}

const META_START = new Set([
  "готов",
  "готов к кейсу",
  "давай",
  "давай кейс",
  "дай кейс",
  "начнём",
  "начнем",
  "старт",
  "поехали",
]);

const META_NEXT = new Set([
  "следующий",
  "следующий кейс",
  "ещё кейс",
  "еще кейс",
  "дальше",
  "next",
  "пропусти",
  "пропустить",
]);

function isMetaStart(text) {
  return META_START.has(normalizeMeta(text));
}

function isMetaNext(text) {
  return META_NEXT.has(normalizeMeta(text));
}

function looksLikeCasePrompt(text, item) {
  const answer = normalizeMeta(text);
  const prompt = normalizeMeta(item?.prompt || "");
  if (!answer || !prompt) return false;
  return answer === prompt || (answer.length > 40 && prompt.includes(answer));
}

function formatCaseCard(item, number, total) {
  return (
    `**Кейс ${number} из ${total}**\n\n` +
    `${item.prompt}\n\n` +
    "Ответь в 3–6 предложениях — как на реальной встрече."
  );
}

function presentCase(scenario, index, intro) {
  const { case: item, index: idx, total } = clampCaseIndex(scenario, index);
  return {
    text: `${intro}\n\n${formatCaseCard(item, idx + 1, total)}`,
    tags: [],
    sources: resolveSources(item.source_ids),
    case_id: item.id,
    case_index: idx,
    next_case_index: idx,
    total_cases: total,
    trainer_completed: false,
    trainer_phase: "present",
  };
}

function infoReply(text, scenario) {
  const topic = findTopic(scenario, text);
  return {
    text: `${topic.summary}\n\n${DISCLAIMER}`,
    tags: [],
    sources: resolveSources(topic.source_ids),
  };
}

function trainerReply(text, scenario, caseIndex = 0) {
  const { cases, index, case: item, total } = clampCaseIndex(scenario, caseIndex);
  const meta = normalizeMeta(text);

  if (["заново", "сначала", "пройти ещё раз", "пройти еще раз", "restart", "начать заново"].includes(meta)) {
    return presentCase(
      scenario,
      0,
      "Начинаем тренажёр заново — 5 кейсов подряд, в конце будет итог."
    );
  }

  if (isMetaNext(text)) {
    if (index >= total - 1) {
      return presentCase(
        scenario,
        index,
        "Это уже последний кейс круга. Ответь на него — после разбора тренажёр завершится. Или напиши «заново»."
      );
    }
    return presentCase(scenario, index + 1, "Ок, берём следующий кейс без разбора предыдущего.");
  }

  if (isMetaStart(text)) {
    return presentCase(
      scenario,
      index,
      `Тренажёр «${LABELS[scenario] || scenario}»: ${total} кейсов. Отвечай по одному — это не свободный чат.`
    );
  }

  if (looksLikeCasePrompt(text, item)) {
    return {
      text:
        `Это текст задания, а не твой ответ.\n\n` + formatCaseCard(item, index + 1, total),
      tags: [],
      sources: resolveSources(item.source_ids),
      case_id: item.id,
      case_index: index,
      next_case_index: index,
      total_cases: total,
      trainer_completed: false,
      trainer_phase: "present",
    };
  }

  const sources = resolveSources(item.source_ids);
  const weak = hitAny(text, item.weak_signals);
  const strong = hitAny(text, item.ok_signals);
  const isLast = index >= total - 1;
  const header = `**Разбор твоего ответа** · кейс ${index + 1} из ${total}`;

  let body;
  let tags;
  if (weak && !strong) {
    tags = ["improve", "example"];
    body = `${header}\n\nВопрос был: ${item.prompt}\n\nВот что можно улучшить: ${item.improve}\n\nУдачный пример: ${item.example}`;
  } else if (strong) {
    tags = ["ok", "example"];
    body = `${header}\n\nЭто верно по сути — есть конкретика.\n\nУсилить можно так: ${item.improve}\n\nОриентир: ${item.example}`;
  } else {
    tags = ["improve", "example"];
    body = `${header}\n\nПринял ответ. ${item.improve}\n\nПример сильной формулировки: ${item.example}`;
  }

  if (isLast) {
    return {
      text:
        `${body}\n\n**Тренажёр завершён**\n\n` +
        `Ты прошёл все ${total} кейсов. Напиши «заново», чтобы пройти круг ещё раз.\n\n${DISCLAIMER}`,
      tags,
      sources,
      case_id: item.id,
      case_index: index,
      next_case_index: null,
      total_cases: total,
      trainer_completed: true,
      trainer_phase: "complete",
    };
  }

  const nextIdx = index + 1;
  const nextCase = cases[nextIdx];
  return {
    text: `${body}\n\n---\n\n${formatCaseCard(nextCase, nextIdx + 1, total)}`,
    tags,
    sources,
    case_id: item.id,
    case_index: index,
    next_case_index: nextIdx,
    total_cases: total,
    trainer_completed: false,
    trainer_phase: "feedback",
  };
}

function replyFor(text, scenario, mode, caseIndex = 0) {
  if (mode === "trainer") return trainerReply(text, scenario, caseIndex);
  return infoReply(text, scenario);
}

export function getScenarioLabel(id) {
  return LABELS[id] ?? id;
}

export function getModeLabel(mode) {
  return MODE_LABELS[mode] ?? mode;
}

export function getTrainerCases(scenario) {
  return getCases(scenario).map((item, index) => ({
    id: item.id,
    index,
    prompt: item.prompt,
  }));
}

export function getPrompts(scenario, mode) {
  if (mode === "trainer") {
    return ["Следующий кейс", "Заново"];
  }
  return INFO_PROMPTS[scenario] || INFO_PROMPTS.university;
}

export function getGreeting(scenario, mode) {
  if (mode === "trainer") {
    const { case: item, total } = clampCaseIndex(scenario, 0);
    return {
      text:
        `Тренажёр «${LABELS[scenario] || scenario}»: ${total} кейсов подряд.\n` +
        "Это экзаменатор, не свободный чат — отвечай на текущий кейс, затем получишь разбор.\n\n" +
        formatCaseCard(item, 1, total),
      tags: [],
      sources: resolveSources(item.source_ids),
      case_id: item.id,
      case_index: 0,
      next_case_index: 0,
      total_cases: total,
      trainer_completed: false,
      trainer_phase: "present",
    };
  }
  return INFO_GREETINGS[scenario] || INFO_GREETINGS.university;
}

export async function simulateReply({ text, scenario, mode, weak_zones = [], case_index = 0 }) {
  const delay = 550 + Math.floor(Math.random() * 700);
  await new Promise((r) => setTimeout(r, delay));
  const { appendAdaptiveTail, detectWeakZones } = await import("./progress.js");
  const base = replyFor(text, scenario, mode, case_index);
  const detected = detectWeakZones(text).map((hit) => hit.zone);
  const withZones = {
    ...base,
    detected_weak_zones: detected,
  };
  return appendAdaptiveTail(withZones, { weakZones: weak_zones }, scenario, mode);
}
