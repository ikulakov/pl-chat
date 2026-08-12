// =============================================================================
// Mock-сервер MatrixKC для разработки виджета БЕЗ настоящего бэкенда.
// Реализует подмножество Matrix C-S API, которое использует виджет. Сид-данные и
// авто-ответ берутся из ./scenario.json.
//
// Запуск:  pnpm dev          (слушает :3001 — vite проксирует /_matrix туда)
//
// Покрывает весь клиентский MVP: переписка, статусы, typing, ✓✓ (receipts),
// история, медиа-заглушки, стикеры, эмодзи, Adaptive Cards, завершение чата.
//
// Эмодзи: встроенный набор на 22 позиции в 3 категориях (codepoint'ы — из реального пака
// matrixkc). Силуэты и Lottie генерируются на лету, поэтому анимация в моке одинаковая
// «пульсирующая клякса» — проверить сетку на настоящих 580 позициях можно только против
// живого matrixkc с профилем emoji-pack.
//
// История: ~480 осмысленных реплик из scenario.json → historyTopics, растянутых на 10 дней
// (работают date-разделители). Объём: MOCK_HISTORY_MESSAGES=1000 pnpm dev
// Временно выключить: галочка «История» в dev-панели виджета (GET/POST /_dev/history-toggle).
//
// Отладка загрузки файла: MOCK_UPLOAD_DELAY_MS=5000 pnpm dev — ответ на upload
// придёт через 5 сек, состояние загрузки видно на файле любого размера.
//
// Команды в поле ввода для тестирования сценариев:
//   /card         — Adaptive Card с полем ввода (деградация в текст — Input.* не поддержан)
//   /card buttons — Adaptive Card только с кнопками (основной кейс T-60)
//   /card 3       — Adaptive Card с 3 кнопками (нечётный хвост — растягивается на всю строку)
//   /card broken  — Adaptive Card с невалидным payload (деградация в текст)
//   /card openurl — Adaptive Card только с Action.OpenUrl (кнопки нет — не Action.Submit)
//   /card many    — Adaptive Card с 12 кнопками (проверка клиентского лимита MAX_BUTTONS=10)
//   /notice     — системная плашка (m.notice)
//   /left       — оператор завершает чат
//   /join       — оператор возвращается (откат /left)
//   /html       — сообщение с rich-форматированием
//   /img        — оператор присылает картинку
//   /file       — оператор присылает файл (PDF)
//   /reply      — оператор отвечает цитатой на последнее сообщение клиента
//   /reply img  — то же картинкой, /reply file — файлом (входящая цитата на медиа)
//   /sticker    — оператор присылает стикер
//   /react [эм] — оператор ставит реакцию (по умолчанию 👍) на последнее сообщение клиента;
//                 повторный ввод той же реакции снимает её (m.room.redaction)
//   /fail       — следующая отправка клиента вернёт ошибку (проверка «Повторить»)
//   /failaction — следующий ответ на кнопку карточки вернёт ошибку (CardActions → failed)
//   /failupload — следующая загрузка файла вернёт ошибку (сеть/5xx — повтор осмыслен)
//   /rejectupload — следующая загрузка отклоняется fileguard'ом (400): повтора нет
//   /failthumb  — превью отвечает 404 (не изображение) → клиент идёт за оригиналом
//   /pendingmedia — download/thumbnail отвечают 504: файл ещё в карантине CDR
//   /rejectmedia  — download/thumbnail отвечают 404: файл отклонён проверкой
//   (три последние — переключатели, повторный ввод той же команды выключает режим)
//
// /rejectmedia и /pendingmedia также решают, что придёт вердиктом kc.media.status на
// СЛЕДУЮЩЕЕ ваше вложение (картинку/файл): включённый /rejectmedia — событие "rejected"
// через ~1.5с после отправки; /pendingmedia — событие не приходит вовсе (конвейер ещё не
// решил); иначе — "ready".
//
// Авто-ответ приходит и на вложения (m.image/m.file), не только на текст.
// =============================================================================
import { createServer } from "node:http";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { deflateSync } from "node:zlib";

const __dirname = dirname(fileURLToPath(import.meta.url));
const scenario = JSON.parse(readFileSync(join(__dirname, "scenario.json"), "utf8"));

const PORT = process.env.MOCK_PORT ? Number(process.env.MOCK_PORT) : 3001;
const ROOM = scenario.roomId;
const OP = scenario.operatorId;
const GUEST = scenario.guest.user_id;

// ── Каталог стикеров (mock) ──────────────────────────────────────────────────
const STICKERS = [
  { id: "s1", body: "Палец вверх", emoji: "👍" },
  { id: "s2", body: "Сердце", emoji: "❤️" },
  { id: "s3", body: "Огонь", emoji: "🔥" },
  { id: "s4", body: "Аплодисменты", emoji: "👏" },
].map((s) => ({
  id: s.id,
  body: s.body,
  emoji: s.emoji,
  info: { mimetype: "image/svg+xml", w: 120, h: 120, size: 600 },
  url: `mxc://bank.ru/${s.id}`,
  media_id: s.id,
}));
const STICKER_EMOJI = Object.fromEntries(STICKERS.map((s) => [s.media_id, s.emoji]));

// ── Каталог эмодзи (mock) ────────────────────────────────────────────────────
// Настоящий пак — 580 анимаций на 17 МБ в matrixkc (профиль emoji-pack). Здесь встроенный
// набор: codepoint'ы взяты из реального emoji.csv, поэтому переключение мока на живой
// бэкенд ничего не ломает. Силуэты и анимации генерируются на лету (см. grayPng/mockLottie).
const EMOJI_PACK_VERSION = "mock-1";
const EMOJI_CATEGORIES = [
  {
    id: "smileys",
    display_name: "Смайлы и эмоции",
    emoji: [
      ["1f600", "😀"],
      ["1f602", "😂"],
      ["1f60d", "😍"],
      ["1f618", "😘"],
      ["1f621", "😡"],
      ["1f62d", "😭"],
      ["1f643", "🙃"],
      ["1f929", "🤩"],
      ["1f92f", "🤯"],
      ["1f973", "🥳"],
      ["1f4a9", "💩"],
      ["2764", "❤"],
      ["1f47b", "👻"],
      ["1f480", "💀"],
    ],
  },
  {
    id: "animals",
    display_name: "Животные и природа",
    emoji: [
      ["1f331", "🌱"],
      ["1f333", "🌳"],
      ["1f337", "🌷"],
      ["1f339", "🌹"],
    ],
  },
  {
    id: "food",
    display_name: "Еда и напитки",
    emoji: [
      ["1f32d", "🌭"],
      ["1f346", "🍆"],
      ["1f353", "🍓"],
      ["1f355", "🍕"],
    ],
  },
];
const EMOJI_BY_CODEPOINT = new Set(
  EMOJI_CATEGORIES.flatMap((c) => c.emoji.map(([codepoint]) => codepoint)),
);

// ── In-memory состояние комнаты ──────────────────────────────────────────────
let seq = 0;
const nextId = () => "$ev" + ++seq;
const events = [];
let typing = [];
let typingVersion = 0;
let lastReadEventId = null;
let receiptVersion = 0;
let waiters = [];

// Одноразовые сбои по команде из чата: снимаются первым же сработавшим запросом,
// чтобы повтор («Отправить снова») сразу проходил — как при обычном сетевом сбое.
let failNextSend = false;
let failNextAction = false;
let failNextUpload = false;
// Отказ fileguard'а — детерминированный вердикт: повтор того же файла даст тот же ответ,
// поэтому клиент вместо «Повторить» предлагает убрать черновик.
let rejectNextUpload = false;
// Режимы отдачи медиа: имитируют статусную машину карантина CDR на стороне сервера.
let mediaMode = "clean"; // clean | pending | rejected
let failThumbnail = false;

function push(type, sender, content, stateKey, txnId) {
  const ev = { event_id: nextId(), type, sender, origin_server_ts: Date.now(), content };
  if (stateKey !== undefined) ev.state_key = stateKey;
  // unsigned.transaction_id — как на реальном MatrixKC: виден только паре, которая отправила
  // событие. Мок однопользовательский (один гость), поэтому scoping по (user, device) не нужен —
  // достаточно прокинуть txnId, если он был передан отправителем.
  if (txnId !== undefined) ev.unsigned = { transaction_id: txnId };
  events.push(ev);
  wake();
  return ev;
}

function setTyping(users) {
  typing = users;
  typingVersion++;
  wake();
}

function operatorRead(eventId) {
  lastReadEventId = eventId;
  receiptVersion++;
  wake();
}

function wake() {
  const w = waiters;
  waiters = [];
  w.forEach((r) => r());
}

// Сид комнаты из scenario.json.
for (const e of scenario.seed) {
  push(e.type, e.sender, e.content, "state_key" in e ? e.state_key : undefined);
}

// Как реальный MatrixKC (SyncServiceImpl.INITIAL_TIMELINE_LIMIT): initial sync отдаёт
// только последние N живых timeline-событий. Мок-процесс живёт долго (гость и комната
// в dev фиксированы, scenario.json), events копится на каждый reload/переоткрытие
// виджета — без капа initial sync рано или поздно возвращает ВСЮ сессионную переписку
// одним ответом, чего реальный сервер никогда не делает.
const INITIAL_TIMELINE_LIMIT = 50;

// ── Построение /sync-ответа от курсора "n.tv.rv" ────────────────────────────
function buildSync(n, tv, rv) {
  const newEvents = events.slice(n);
  const stateEvents = newEvents.filter((e) => e.state_key !== undefined);
  const timelineEvents = newEvents.filter((e) => e.state_key === undefined);
  const ephemeral = [];
  if (typingVersion > tv) {
    ephemeral.push({ type: "m.typing", content: { user_ids: typing } });
  }
  if (receiptVersion > rv && lastReadEventId) {
    ephemeral.push({
      type: "m.receipt",
      content: { [lastReadEventId]: { "m.read": { [OP]: { ts: Date.now() } } } },
    });
  }
  const hasDelta = newEvents.length > 0 || typingVersion > tv || receiptVersion > rv;
  const timeline = { events: timelineEvents };
  if (n === 0) {
    // Кап живых событий — ВСЕГДА, независимо от тумблера «История»: реальный сервер режет
    // initial sync до INITIAL_TIMELINE_LIMIT безусловно (это защита от раздутого ответа, а не
    // фича истории). Иначе выключенный тумблер продолжал бы отдавать всю накопленную за
    // dev-сессию переписку одним sync — ровно баг, который тумблер должен был исключить.
    const overflow = Math.max(0, timelineEvents.length - INITIAL_TIMELINE_LIMIT);
    if (overflow > 0) {
      timeline.events = timelineEvents.slice(-INITIAL_TIMELINE_LIMIT);
    }
    // limited/prev_batch — курсор докачки. Тумблер «История» регулирует ТОЛЬКО присутствие
    // синтетического корпуса HISTORY (см. combinedTimeline) — живой overflow (сообщения этой
    // dev-сессии сверх лимита) должен докачиваться независимо от тумблера, иначе выключение
    // истории делало бы недостижимыми реально отправленные сообщения.
    if (overflow > 0 || historyEnabled) {
      timeline.limited = true;
      timeline.prev_batch = `i${historyBaseLength() + overflow}`;
    }
  }
  return {
    hasDelta,
    body: {
      next_batch: `${events.length}.${typingVersion}.${receiptVersion}`,
      rooms: {
        join: {
          [ROOM]: { state: { events: stateEvents }, timeline, ephemeral: { events: ephemeral } },
        },
      },
    },
  };
}

// ── История комнаты (для GET /messages) ─────────────────────────────────────
// Воспроизводим поведение реального MatrixKC:
//   • токен пагинации — строгая граница по позиции события (у сервера это streamOrdering,
//     здесь — индекс в HISTORY); dir=b отдаёт события СТРОГО ЛЕВЕЕ границы;
//   • chunk — newest-first;
//   • `end` отдаётся ВСЕГДА, кроме пустого chunk. Значит признак «дошли до начала комнаты» —
//     именно пустой chunk, а не отсутствие `end` (клиент делает один холостой запрос);
//   • limit считается по СЫРЫМ событиям, поэтому страница может не дать ни одного
//     отображаемого сообщения — см. блок невидимых событий ниже.
const HISTORY_DAYS = 10; // на сколько дней назад растянута переписка (date-разделители)
const HISTORY_MESSAGES = Number(process.env.MOCK_HISTORY_MESSAGES ?? 480);
const HISTORY_DELAY_MS = 600; // чтобы спиннер подгрузки был виден

// Задержка ответа на media-upload; 0 — мгновенно, как было. Ставить при отладке UI загрузки.
const UPLOAD_DELAY_MS = Number(process.env.MOCK_UPLOAD_DELAY_MS ?? 0);

// Размер клиентской страницы (widget: HISTORY_PAGE_SIZE). Нужен, чтобы блок невидимых
// событий лёг ровно в границы одной страницы — иначе сценарий «страница без сообщений»
// не воспроизведётся.
const CLIENT_PAGE_SIZE = 50;
const INVISIBLE_PAGE_INDEX = 2; // третья страница с конца — целиком нерендерящаяся

const DAY_MS = 86_400_000;

// Реплики тем идут по кругу: получается длинная переписка «клиент возвращался много раз».
function buildHistoryMessages(total) {
  const lines = scenario.historyTopics.flat();
  const perDay = Math.ceil(total / HISTORY_DAYS);
  const midnight = new Date().setHours(0, 0, 0, 0);
  const out = [];

  for (let i = 0; i < total; i++) {
    const daysAgo = HISTORY_DAYS - Math.floor(i / perDay); // от HISTORY_DAYS до 1 (вчера)
    const dayStart = midnight - daysAgo * DAY_MS + 10 * 3_600_000; // диалоги с 10:00
    const [who, text] = lines[i % lines.length];

    out.push({
      event_id: `$hist${i}`,
      type: "m.room.message",
      sender: who === "op" ? OP : GUEST,
      origin_server_ts: dayStart + (i % perDay) * 5 * 60_000, // реплика раз в 5 минут
      content: { msgtype: "m.text", body: text },
    });
  }
  return out; // ASC: от самого старого к новому
}

function buildInvisibleBlock(size, afterTs) {
  return Array.from({ length: size }, (_, i) => ({
    event_id: `$react${i}`,
    type: "m.reaction",
    sender: OP,
    origin_server_ts: afterTs + (i + 1) * 1000,
    content: { "m.relates_to": { rel_type: "m.annotation", event_id: "$ev6", key: "👍" } },
  }));
}

// HISTORY — синтетическая «допроцессная» лента комнаты в хронологическом порядке (ASC).
const HISTORY = buildHistoryMessages(HISTORY_MESSAGES);

// Блок событий, которые виджет не рендерит, — ровно на границе страницы INVISIBLE_PAGE_INDEX.
// Клиент обязан сам дотянуть следующую страницу, иначе IntersectionObserver «залипнет»:
// лента не изменилась → состояние пересечения тоже → повторного выстрела не будет.
const invisibleAt = HISTORY.length - INVISIBLE_PAGE_INDEX * CLIENT_PAGE_SIZE;
if (invisibleAt > 0) {
  const afterTs = HISTORY[invisibleAt - 1].origin_server_ts;
  HISTORY.splice(invisibleAt, 0, ...buildInvisibleBlock(CLIENT_PAGE_SIZE, afterTs));
}

// Флаг для dev-панели: временно скрыть историю без перезапуска мока и без урезания
// самого массива HISTORY (он используется в findLast ниже для read receipt).
let historyEnabled = true;

// Оператор уже дочитал переписку до последнего сообщения гостя. Реальный сервер отдаёт на initial
// sync СНИМОК receipts комнаты (SyncServiceImpl: isInitial → receiptMapper.findCurrentByRoom),
// поэтому ✓✓ на старых своих сообщениях видны сразу. Без этой строки мок присылал receipt только
// реактивно — после первой отправки, — и подгруженная история выглядела непрочитанной.
lastReadEventId = HISTORY.findLast((e) => e.sender === GUEST)?.event_id ?? null;

// Единая адресуемая лента для GET /messages: синтетическая HISTORY (индексы [0, HISTORY.length))
// + всё, что реально прошло через комнату за жизнь процесса (индексы после неё). Живые события
// нужны здесь, а не только в /sync, — иначе initial sync (см. INITIAL_TIMELINE_LIMIT) обрежет
// накопленную за долгую dev-сессию переписку, а докачать обрезанный хвост будет неоткуда.
//
// Тумблер «История» из dev-панели регулирует ТОЛЬКО присутствие синтетического корпуса —
// живой overflow остаётся докачиваемым в любом случае (это реально отправленные сообщения,
// а не декорация мока).
function liveTimelineEvents() {
  return events.filter((e) => e.state_key === undefined);
}

function historyBaseLength() {
  return historyEnabled ? HISTORY.length : 0;
}

function combinedTimeline() {
  return historyEnabled ? [...HISTORY, ...liveTimelineEvents()] : liveTimelineEvents();
}

function currentHead() {
  return `i${combinedTimeline().length}`;
}

function historyPage(from, limit) {
  const all = combinedTimeline();
  const upTo = from && from.startsWith("i") ? Number(from.slice(1)) : all.length;
  if (upTo <= 0) return { chunk: [], start: from ?? currentHead() }; // начало комнаты (или её видимой части)

  const start = Math.max(0, upTo - limit);
  const chunk = all.slice(start, upTo).reverse(); // dir=b → newest-first

  return { chunk, start: from ?? currentHead(), end: `i${start}` };
}

// ── Авто-поведение оператора ─────────────────────────────────────────────────
// На что оператор отвечает автоматически. Стикеры и kc.adaptive.action намеренно
// не здесь: на них ответ сбивал бы проверку соответствующих сценариев.
const REPLYABLE_MSGTYPES = new Set(["m.text", "m.image", "m.file"]);
const MEDIA_MSGTYPES = new Set(["m.image", "m.file"]);

/** Свежий mediaId на каждую отправку — иначе клиентский кэш превью съест повторный запрос. */
const freshMxc = () => `mxc://bank.ru/op${Date.now().toString(36)}`;

const OPERATOR_IMAGE = {
  msgtype: "m.image",
  body: "квитанция.png",
  url: "mxc://bank.ru/opimg1",
  filename: "квитанция.png",
  info: { mimetype: "image/png", size: 24000, w: 400, h: 300 },
};

const OPERATOR_FILE = {
  msgtype: "m.file",
  body: "Договор.pdf",
  url: "mxc://bank.ru/opfile1",
  filename: "Договор.pdf",
  info: { mimetype: "application/pdf", size: 1_200_000 },
};

/** Последнее сообщение клиента — цель цитаты оператора. `exclude` — сама команда `/reply`. */
function lastGuestMessageId(exclude) {
  for (let i = events.length - 1; i >= 0; i--) {
    const e = events[i];
    if (e.type === "m.room.message" && e.sender === GUEST && e.event_id !== exclude) {
      return e.event_id;
    }
  }
  return null;
}

// Активная реакция оператора — поставленная и не снятая редакцией. Реакцию снимает
// редакция её собственного события, а не сообщения, поэтому ищем по event_id самой реакции.
function activeOperatorReaction(target, key) {
  const redacted = new Set(
    events.filter((e) => e.type === "m.room.redaction").map((e) => e.content.redacts)
  );
  const hit = events.findLast(
    (e) =>
      e.type === "m.reaction" &&
      e.sender === OP &&
      e.content["m.relates_to"]?.event_id === target &&
      e.content["m.relates_to"]?.key === key &&
      !redacted.has(e.event_id)
  );
  return hit?.event_id ?? null;
}

// Синтетические варианты карточки, которые нет смысла держать в scenario.json — это тест-фикстуры
// для проверки границ маппера/проекции (domain/adaptiveCards.ts toSubmitActions), не сид-данные.
const CARD_BUTTONS = {
  type: "AdaptiveCard",
  version: "1.5",
  body: [{ type: "TextBlock", text: "Подтвердите операцию", wrap: true }],
  actions: [
    { type: "Action.Submit", id: "confirm", title: "Подтвердить", data: { action: "confirm" } },
    { type: "Action.Submit", id: "cancel", title: "Отменить", data: { action: "cancel" } },
  ],
};
const CARD_THREE = {
  type: "AdaptiveCard",
  version: "1.5",
  body: [{ type: "TextBlock", text: "Нечётное число кнопок", wrap: true }],
  actions: [
    { type: "Action.Submit", id: "one", title: "Вариант 1", data: { option: 1 } },
    { type: "Action.Submit", id: "two", title: "Вариант 2", data: { option: 2 } },
    { type: "Action.Submit", id: "three", title: "Вариант 3", data: { option: 3 } },
  ],
};
const CARD_OPENURL = {
  type: "AdaptiveCard",
  version: "1.5",
  body: [{ type: "TextBlock", text: "Открыть сайт банка?", wrap: true }],
  actions: [{ type: "Action.OpenUrl", title: "Открыть", url: "https://bank.ru" }],
};
const CARD_MANY = {
  type: "AdaptiveCard",
  version: "1.5",
  body: [{ type: "TextBlock", text: "Выберите один из вариантов", wrap: true }],
  actions: Array.from({ length: 12 }, (_, i) => ({
    type: "Action.Submit",
    id: `opt${i + 1}`,
    title: `Вариант ${i + 1}`,
    data: { option: i + 1 },
  })),
};

function buildCardContent(variant) {
  switch (variant) {
    case "buttons":
      return { msgtype: "kc.adaptive.v1", body: "Карточка с кнопками", adaptive_card: CARD_BUTTONS };
    case "broken":
      // Невалидный payload (не AdaptiveCard) — клиент обязан деградировать в текст, не потерять сообщение.
      return {
        msgtype: "kc.adaptive.v1",
        body: "Карточка (битый payload)",
        adaptive_card: { type: "NotAdaptiveCard" },
      };
    case "3":
      return { msgtype: "kc.adaptive.v1", body: "Карточка (3 кнопки)", adaptive_card: CARD_THREE };
    case "openurl":
      return { msgtype: "kc.adaptive.v1", body: "Карточка (только OpenUrl)", adaptive_card: CARD_OPENURL };
    case "many":
      return { msgtype: "kc.adaptive.v1", body: "Карточка (много кнопок)", adaptive_card: CARD_MANY };
    default:
      // Карточка с Input.Text — деградация в текст (клиент не собирает поля ввода в T-60).
      return { msgtype: "kc.adaptive.v1", body: "Карточка", adaptive_card: scenario.card };
  }
}

function operatorRespond(text, ownEventId) {
  const t = (text || "").trim();
  if (t.startsWith("/card")) {
    const variant = t.slice("/card".length).trim();
    return delay(700, () => push("m.room.message", OP, buildCardContent(variant)));
  }
  if (t.startsWith("/notice")) {
    return delay(500, () =>
      push("m.room.message", OP, { msgtype: "m.notice", body: "Системное уведомление" })
    );
  }
  if (t.startsWith("/left")) {
    return delay(500, () => {
      // m.room.member leave — наш findOperator перестаёт видеть оператора.
      push("m.room.member", OP, { membership: "leave", displayname: "Оля" }, OP);
      push("kc.operator.left", OP, { operator_id: "olya42", reason: "completed" });
      push("kc.operator.current", OP, { status: "left", operator_id: null }, "");
    });
    return;
  }
  if (t.startsWith("/html")) {
    return delay(700, () =>
      push("m.room.message", OP, {
        msgtype: "m.text",
        format: "org.matrix.custom.html",
        body: "Подробности: ссылка, список, выделение",
        formatted_body:
          'Подробности на <a href="https://bank.ru">сайте банка</a>.<br>' +
          "<b>Важно:</b><ul><li>паспорт</li><li>карта</li></ul>",
      })
    );
  }
  // Каждая отправка — новый mediaId: клиент кэширует байты по mxc, и с фиксированным адресом
  // повторный /img брал бы их из кэша, не ходя в сеть. Тогда переключатели режимов отдачи
  // (/failthumb, /pendingmedia, /rejectmedia) молча не действовали бы на второй и далее раз.
  if (t.startsWith("/img")) {
    return delay(700, () => push("m.room.message", OP, { ...OPERATOR_IMAGE, url: freshMxc() }));
  }
  if (t.startsWith("/file")) {
    return delay(700, () => push("m.room.message", OP, { ...OPERATOR_FILE, url: freshMxc() }));
  }
  // Ответ оператора цитатой на последнее сообщение клиента: `/reply`, `/reply img`,
  // `/reply file`. Медиа-варианты проверяют, что m.relates_to переживает маппинг
  // входящего m.image/m.file (у своих черновиков связь ставится локально и баг не виден).
  if (t.startsWith("/reply")) {
    const target = lastGuestMessageId(ownEventId);
    if (!target) return;

    const kind = t.slice("/reply".length).trim();
    const base =
      kind === "img"
        ? { ...OPERATOR_IMAGE, url: freshMxc() }
        : kind === "file"
          ? { ...OPERATOR_FILE, url: freshMxc() }
          : { msgtype: "m.text", body: "Отвечаю на ваше сообщение" };

    return delay(700, () =>
      push("m.room.message", OP, {
        ...base,
        "m.relates_to": { "m.in_reply_to": { event_id: target } },
      })
    );
  }
  // Реакция оператора на последнее сообщение клиента: `/react`, `/react 🔥`.
  // Повторный ввод той же реакции снимает её — так проверяется разбор m.room.redaction.
  if (t.startsWith("/react")) {
    const target = lastGuestMessageId(ownEventId);
    if (!target) return;

    const key = t.slice("/react".length).trim() || "👍";

    return delay(500, () => {
      const existing = activeOperatorReaction(target, key);
      if (existing) {
        push("m.room.redaction", OP, { redacts: existing });
        return;
      }
      push("m.reaction", OP, {
        "m.relates_to": { rel_type: "m.annotation", event_id: target, key },
      });
    });
  }
  // Возврат оператора после /left — иначе состояние «чат завершён» не откатить без рестарта.
  if (t.startsWith("/join")) {
    return delay(500, () => {
      push("m.room.member", OP, { membership: "join", displayname: "Оля" }, OP);
      push("kc.operator.joined", OP, {
        operator_id: "olya42",
        displayname: "Оля",
        role: "human",
      });
      push(
        "kc.operator.current",
        OP,
        { status: "active", operator_id: "olya42", displayname: "Оля" },
        ""
      );
    });
  }
  // Одноразовые сбои: следующая отправка / следующая загрузка байт вернут ошибку.
  if (t.startsWith("/failupload")) {
    failNextUpload = true;
    return delay(300, () =>
      push("m.room.message", OP, { msgtype: "m.notice", body: "Следующая загрузка файла упадёт" })
    );
  }
  if (t.startsWith("/rejectupload")) {
    rejectNextUpload = true;
    return delay(300, () =>
      push("m.room.message", OP, {
        msgtype: "m.notice",
        body: "Следующая загрузка будет отклонена проверкой",
      })
    );
  }
  // Подтверждение переключателя системной плашкой — иначе неясно, какой режим активен.
  const notice = (body) => delay(300, () => push("m.room.message", OP, { msgtype: "m.notice", body }));

  // Режимы отдачи медиа — переключатели: повторный ввод возвращает обычную отдачу байт.
  if (t.startsWith("/failthumb")) {
    failThumbnail = !failThumbnail;
    return notice(`Превью ${failThumbnail ? "отвечает 404" : "снова отдаётся"}`);
  }
  if (t.startsWith("/pendingmedia")) {
    mediaMode = mediaMode === "pending" ? "clean" : "pending";
    return notice(`Медиа: ${mediaMode === "pending" ? "504, файл в карантине" : "готово"}`);
  }
  if (t.startsWith("/rejectmedia")) {
    mediaMode = mediaMode === "rejected" ? "clean" : "rejected";
    return notice(`Медиа: ${mediaMode === "rejected" ? "404, файл отклонён" : "готово"}`);
  }
  // Отдельный флаг от /fail — иначе тест ответа на карточку случайно ловил бы и обычный /fail,
  // выставленный для другого сценария, и наоборот. Проверяем content.msgtype === kc.adaptive.action
  // в самом PUT /send, поэтому команда не мешает следующей текстовой/медиа отправке.
  if (t.startsWith("/failaction")) {
    failNextAction = true;
    return delay(300, () =>
      push("m.room.message", OP, { msgtype: "m.notice", body: "Следующий ответ на карточку упадёт" })
    );
  }
  if (t.startsWith("/fail")) {
    failNextSend = true;
    return delay(300, () =>
      push("m.room.message", OP, { msgtype: "m.notice", body: "Следующая отправка упадёт" })
    );
  }
  if (t.startsWith("/sticker")) {
    const s = STICKERS[0];
    return delay(700, () => push("m.sticker", OP, { body: s.body, info: s.info, url: s.url }));
  }
  // Обычный путь: «печатает…» → ответ.
  delay(400, () => setTyping([OP]));
  delay(1700, () => {
    typing = [];
    typingVersion++; // wake разбудит push ниже
    push("m.room.message", OP, scenario.autoReply);
  });
}

function delay(ms, fn) {
  setTimeout(fn, ms);
}

// ── HTTP ─────────────────────────────────────────────────────────────────────
const send = (res, status, body, type = "application/json") => {
  res.writeHead(status, {
    "Content-Type": type,
    "Access-Control-Allow-Origin": "*",
    // Authorization подстановочный знак не покрывает (Fetch spec) — заголовок нужен явно,
    // иначе браузер режет preflight и запрос уходит без токена. Остальные — всё, что шлёт
    // MatrixTransport сверх CORS-safelist: при добавлении нового заголовка дополнить список.
    "Access-Control-Allow-Headers": "Authorization, Content-Type, traceparent",
    "Access-Control-Allow-Methods": "GET,POST,PUT,OPTIONS",
  });
  res.end(typeof body === "string" || Buffer.isBuffer(body) ? body : JSON.stringify(body));
};

function readBody(req) {
  return new Promise((resolve) => {
    let data = "";
    req.on("data", (c) => (data += c));
    req.on("end", () => {
      try {
        resolve(data ? JSON.parse(data) : {});
      } catch {
        resolve({});
      }
    });
  });
}

function svgImage(w, h, label) {
  return (
    `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}">` +
    `<rect width="100%" height="100%" fill="#e7e3ee"/>` +
    `<text x="50%" y="50%" fill="#8c8a94" font-family="sans-serif" font-size="14" ` +
    `text-anchor="middle" dominant-baseline="middle">${label}</text></svg>`
  );
}
function svgSticker(emoji) {
  return (
    `<svg xmlns="http://www.w3.org/2000/svg" width="120" height="120" viewBox="0 0 120 120">` +
    `<text x="50%" y="54%" font-size="84" text-anchor="middle" dominant-baseline="middle">${emoji}</text></svg>`
  );
}

// ── Генерация ассетов эмодзи ─────────────────────────────────────────────────
// Силуэт обязан быть настоящим PNG: клиент подставляет его как data:image/png;base64,...
// и SVG под этим mime браузер не покажет. Кодировщик минимальный (grayscale 8 бит), zlib
// в node встроенный — зависимостей у мока по-прежнему нет.

const CRC_TABLE = Array.from({ length: 256 }, (_, n) => {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c >>> 0;
});

function crc32(buf) {
  let c = 0xffffffff;
  for (const byte of buf) c = CRC_TABLE[(c ^ byte) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function pngChunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const body = Buffer.concat([Buffer.from(type, "ascii"), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body));
  return Buffer.concat([len, body, crc]);
}

/** Силуэт 32×32: круглое пятно, как альфа-маска настоящего эмодзи. */
function grayPng(seed) {
  const size = 32;
  const radius = 12 + (seed % 4);
  const raw = Buffer.alloc(size * (size + 1));

  for (let y = 0; y < size; y++) {
    raw[y * (size + 1)] = 0; // фильтр строки: None
    for (let x = 0; x < size; x++) {
      const dx = x - 15.5;
      const dy = y - 15.5;
      const inside = dx * dx + dy * dy <= radius * radius;
      raw[y * (size + 1) + 1 + x] = inside ? 0xb0 : 0xff;
    }
  }

  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0);
  ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8; // бит на канал
  ihdr[9] = 0; // grayscale

  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    pngChunk("IHDR", ihdr),
    pngChunk("IDAT", deflateSync(raw)),
    pngChunk("IEND", Buffer.alloc(0)),
  ]);
}

/**
 * Синтетическая Lottie-анимация: пульсирующий круг. Настоящие .tgs весят ~30 КБ каждая,
 * тащить их в репозиторий фронта незачем — для проверки плеера, пула и пауз по видимости
 * достаточно того, что что-то заметно движется. Цвет выводится из codepoint'а, чтобы
 * соседние ячейки визуально различались.
 *
 * Структура повторяет вывод Bodymovin вплоть до служебных полей (`d` у эллипса, `r` у
 * заливки, `ix`/`np`, `sk`/`sa` у трансформа). Это не украшательство: без `d` lottie-web
 * строит пустой path, и вместо круга рисуется залитый прямоугольник во всю канву.
 */
function mockLottie(codepoint) {
  const seed = [...codepoint].reduce((acc, ch) => (acc * 31 + ch.charCodeAt(0)) >>> 0, 7);
  const hue = seed % 360;
  const rgb = hslToRgb(hue / 360, 0.7, 0.55);

  // Промежуточный keyframe обязан нести кривые i/o. Без них lottie-web не считает значение,
  // трансформ слоя уходит в никуда и не рисуется вообще ничего.
  const EASE = { i: { x: [0.5], y: [1] }, o: { x: [0.5], y: [0] } };
  const scale = (t, s) => ({ ...EASE, t, s: [s, s, 100] });

  return {
    v: "5.7.4",
    fr: 30,
    ip: 0,
    op: 30,
    w: 512,
    h: 512,
    nm: `mock-${codepoint}`,
    ddd: 0,
    assets: [],
    layers: [
      {
        ddd: 0,
        ind: 1,
        ty: 4,
        nm: "blob",
        sr: 1,
        ao: 0,
        ks: {
          o: { a: 0, k: 100, ix: 11 },
          r: {
            a: 1,
            k: [
              { ...EASE, t: 0, s: [0] },
              { t: 30, s: [360] },
            ],
            ix: 10,
          },
          p: { a: 0, k: [256, 256, 0], ix: 2 },
          a: { a: 0, k: [0, 0, 0], ix: 1 },
          s: { a: 1, k: [scale(0, 70), scale(15, 110), scale(30, 70)], ix: 6 },
        },
        shapes: [
          {
            ty: "gr",
            it: [
              {
                d: 1,
                ty: "el",
                s: { a: 0, k: [300, 300], ix: 2 },
                p: { a: 0, k: [0, 0], ix: 3 },
                nm: "Ellipse Path 1",
                hd: false,
              },
              {
                ty: "fl",
                c: { a: 0, k: [...rgb, 1], ix: 4 },
                o: { a: 0, k: 100, ix: 5 },
                r: 1,
                bm: 0,
                nm: "Fill 1",
                hd: false,
              },
              {
                ty: "tr",
                p: { a: 0, k: [0, 0], ix: 2 },
                a: { a: 0, k: [0, 0], ix: 1 },
                s: { a: 0, k: [100, 100], ix: 3 },
                r: { a: 0, k: 0, ix: 6 },
                o: { a: 0, k: 100, ix: 7 },
                sk: { a: 0, k: 0, ix: 4 },
                sa: { a: 0, k: 0, ix: 5 },
                nm: "Transform",
              },
            ],
            nm: "Ellipse 1",
            np: 3,
            cix: 2,
            bm: 0,
            ix: 1,
            hd: false,
          },
        ],
        ip: 0,
        op: 30,
        st: 0,
        bm: 0,
      },
    ],
    markers: [],
  };
}

function hslToRgb(h, s, l) {
  const f = (n) => {
    const k = (n + h * 12) % 12;
    return l - s * Math.min(l, 1 - l) * Math.max(-1, Math.min(k - 3, 9 - k, 1));
  };
  return [f(0), f(8), f(4)];
}

const server = createServer(async (req, res) => {
  const url = new URL(req.url, `http://localhost:${PORT}`);
  const path = url.pathname;
  const method = req.method || "GET";

  if (method === "OPTIONS") return send(res, 204, "");

  // Dev-панель виджета: временно скрыть историю без перезапуска мока.
  if (path === "/_dev/history-toggle") {
    if (method === "GET") return send(res, 200, { enabled: historyEnabled });
    if (method === "POST") {
      const body = await readBody(req);
      historyEnabled = body.enabled !== false;
      console.log(`[matrix-mock] история ${historyEnabled ? "включена" : "выключена"}`);
      return send(res, 200, { enabled: historyEnabled });
    }
  }

  // Auth / session
  if (path.endsWith("/v3/register")) return send(res, 200, scenario.guest);
  if (path.endsWith("/v3/refresh")) {
    return send(res, 200, {
      access_token: "tok_mock_" + Date.now(),
      refresh_token: scenario.guest.refresh_token,
      expires_in_ms: scenario.guest.expires_in_ms,
    });
  }
  if (path.endsWith("/account/whoami")) {
    return send(res, 200, { user_id: GUEST, device_id: scenario.guest.device_id });
  }
  if (path.endsWith("/v3/logout")) return send(res, 200, {});

  // /sync — long-poll по курсору n.tv.rv
  if (path.endsWith("/v3/sync")) {
    const since = url.searchParams.get("since");
    const timeout = Number(url.searchParams.get("timeout") || "0");
    const [n, tv, rv] = since ? since.split(".").map(Number) : [0, -1, -1];

    const respond = () => send(res, 200, buildSync(n, tv, rv).body);
    if (!since || buildSync(n, tv, rv).hasDelta || timeout === 0) return respond();

    let done = false;
    const finish = () => {
      if (done) return;
      done = true;
      respond();
    };
    waiters.push(finish);
    setTimeout(finish, Math.min(timeout, 30_000));
    return;
  }

  // История: GET /rooms/{id}/messages?dir=b&from=&limit=
  if (/\/rooms\/[^/]+\/messages$/.test(path) && method === "GET") {
    // Реальный сервер валидирует limit ∈ [1,100] и dir ∈ {b,f} — ловим косяки клиента здесь же.
    const limit = Number(url.searchParams.get("limit") ?? "10");
    if (!Number.isInteger(limit) || limit < 1 || limit > 100) {
      return send(res, 400, { errcode: "M_INVALID_PARAM", error: `bad limit: ${limit}` });
    }
    const dir = url.searchParams.get("dir") ?? "b";
    if (dir !== "b" && dir !== "f") {
      return send(res, 400, { errcode: "M_INVALID_PARAM", error: `bad dir: ${dir}` });
    }

    const page = historyPage(url.searchParams.get("from"), limit);
    return delay(HISTORY_DELAY_MS, () => send(res, 200, page));
  }

  // KC-расширение: POST /createRoom/{txnId}
  if (/\/createRoom\/[^/]+$/.test(path) && method === "POST") {
    return send(res, 200, { room_id: ROOM });
  }

  // PUT /rooms/{id}/send/{type}/{txnId}
  const sendMatch = path.match(/\/rooms\/[^/]+\/send\/([^/]+)\/([^/]+)$/);
  if (sendMatch && method === "PUT") {
    const type = decodeURIComponent(sendMatch[1]);
    const txnId = decodeURIComponent(sendMatch[2]);
    const content = await readBody(req);

    // /fail: роняем отправку ДО push — сообщение не попадает в ленту, клиент видит failed
    if (failNextSend) {
      failNextSend = false;
      return send(res, 500, { errcode: "M_UNKNOWN", error: "Mock: отправка отклонена" });
    }
    // /failaction: роняем именно ответ на карточку — cardAnswers.status уходит в failed,
    // кнопки в CardActions разблокируются обратно (см. card.answerFailed в matrixController).
    if (failNextAction && content.msgtype === "kc.adaptive.action") {
      failNextAction = false;
      return send(res, 500, { errcode: "M_UNKNOWN", error: "Mock: ответ на карточку отклонён" });
    }

    const ev = push(type, GUEST, content, undefined, txnId);
    // Оператор «прочитал» — ✓✓.
    if (type === "m.room.message" || type === "m.sticker") {
      delay(600, () => operatorRead(ev.event_id));
    }
    // Вердикт CDR по своему вложению: как на настоящем бэкенде, приходит отдельным событием
    // ПОСЛЕ самого сообщения. Клиент сопоставляет по media_id (один вердикт на файл, не на
    // каждое упоминание), event_id — лишь подсказка. Причины отказа в payload нет намеренно:
    // бэкенд её не раскрывает, текст пользователю клиент берёт из своего словаря.
    // При mediaMode === "pending" событие не шлём вовсе: конвейер ещё не вынес решения,
    // download продолжает штатно отвечать 504.
    if (type === "m.room.message" && MEDIA_MSGTYPES.has(content.msgtype) && mediaMode !== "pending") {
      const mediaId = String(content.url || "").split("/").pop();
      if (mediaId) {
        delay(1500, () =>
          push("kc.media.status", OP, {
            media_id: mediaId,
            event_id: ev.event_id,
            status: mediaMode === "rejected" ? "rejected" : "ready",
          }),
        );
      }
    }
    // Авто-ответ на сообщения клиента. У медиа body — это подпись или имя файла,
    // слэш-команды там разбирать нечего: отдаём пустую строку, чтобы ушёл обычный
    // путь «печатает… → autoReply» и на вложение тоже приходил ответ оператора.
    if (type === "m.room.message" && REPLYABLE_MSGTYPES.has(content.msgtype)) {
      operatorRespond(content.msgtype === "m.text" ? content.body : "", ev.event_id);
    }
    // Ack на нажатие кнопки карточки — отдельно от generic REPLYABLE_MSGTYPES (см. комментарий
    // выше): это не канед-автоответ, а адресный отклик на конкретный action_id, нужен чтобы
    // вручную проверить ветвление бота и что sending → sent доезжает через реальный /sync-эхо.
    if (type === "m.room.message" && content.msgtype === "kc.adaptive.action") {
      const actionId = content.adaptive_action?.action_id ?? "?";
      delay(500, () => push("m.room.message", OP, { msgtype: "m.text", body: `Принято: ${actionId}` }));
    }
    return send(res, 200, { event_id: ev.event_id });
  }

  // receipt / typing / presence — best-effort
  if (/\/receipt\//.test(path) || /\/typing\//.test(path) || /\/presence\//.test(path)) {
    return send(res, 200, {});
  }

  // Media upload
  if (path.endsWith("/media/v3/upload")) {
    // /rejectupload: отказ fileguard'а (тип не из whitelist, подмена типа, кривое имя).
    // Вердикт детерминированный — клиент не предлагает повтор, только убрать черновик.
    if (rejectNextUpload) {
      rejectNextUpload = false;
      return delay(UPLOAD_DELAY_MS, () =>
        send(res, 400, {
          errcode: "M_INVALID_PARAM",
          error: "Mock: тип файла не поддерживается",
        }),
      );
    }
    // /failupload: обрываем отдачу байт — черновик остаётся в ленте с текстом ошибки
    // и кнопкой «Повторить», повтор начинается заново с загрузки.
    if (failNextUpload) {
      failNextUpload = false;
      return delay(UPLOAD_DELAY_MS, () =>
        send(res, 500, { errcode: "M_UNKNOWN", error: "Mock: загрузка отклонена" }),
      );
    }
    // MOCK_UPLOAD_DELAY_MS растягивает ответ, чтобы разглядеть состояние загрузки
    // (прогресс-бар, «Отмена») на маленьком файле. Сам процент так не замедлить —
    // на localhost тело уходит мгновенно, для плавного прогресса нужен throttling в DevTools.
    return delay(UPLOAD_DELAY_MS, () =>
      send(res, 200, { content_uri: "mxc://bank.ru/mock" + Date.now() }),
    );
  }
  // Media download/thumbnail → SVG-заглушка либо ответ статусной машины карантина
  const mediaMatch = path.match(/\/media\/(download|thumbnail)\/[^/]+\/([^/]+)/);
  if (mediaMatch) {
    const isThumbnail = mediaMatch[1] === "thumbnail";

    if (mediaMode === "pending") {
      return send(res, 504, { errcode: "M_NOT_YET_UPLOADED", error: "Файл проверяется" });
    }
    if (mediaMode === "rejected") {
      return send(res, 404, { errcode: "M_NOT_FOUND", error: "Файл не найден" });
    }
    // 404 на превью означает «превью не генерировалось» — клиент обязан уйти на оригинал.
    if (isThumbnail && failThumbnail) {
      return send(res, 404, { errcode: "M_NOT_FOUND", error: "Превью нет" });
    }

    // Подпись называет отдавший эндпоинт: у /failthumb весь смысл в том, что клиент молча
    // уходит с превью на оригинал, и без метки эта подмена на глаз неотличима.
    const w = Number(url.searchParams.get("width") || "400");
    const h = Number(url.searchParams.get("height") || "300");
    const label = isThumbnail ? `thumbnail ${w}×${h}` : `original ${w}×${h}`;
    return send(res, 200, svgImage(w, h, label), "image/svg+xml");
  }
  // Публичные байты стикеров
  const stickerMatch = path.match(/\/_matrix\/sticker\/([^/]+)/);
  if (stickerMatch) {
    return send(res, 200, svgSticker(STICKER_EMOJI[stickerMatch[1]] || "🙂"), "image/svg+xml");
  }
  // Каталог стикеров
  if (/stickers\/v1\/packs$/.test(path)) {
    return send(res, 200, { packs: [{ id: "otp", display_name: "OTP", stickers: STICKERS }] });
  }
  // Вкладки пикера эмодзи: счётчики без состава
  if (/emoji\/v1\/categories$/.test(path)) {
    return send(res, 200, {
      version: EMOJI_PACK_VERSION,
      categories: EMOJI_CATEGORIES.map((c) => ({
        id: c.id,
        display_name: c.display_name,
        count: c.emoji.length,
      })),
    });
  }
  // Состав одной вкладки — вместе с силуэтами
  const categoryMatch = path.match(/emoji\/v1\/categories\/([^/]+)$/);
  if (categoryMatch) {
    const category = EMOJI_CATEGORIES.find((c) => c.id === categoryMatch[1]);
    if (!category) return send(res, 404, { errcode: "M_NOT_FOUND", error: "unknown category" });

    return send(res, 200, {
      id: category.id,
      display_name: category.display_name,
      count: category.emoji.length,
      emoji: category.emoji.map(([codepoint, e], i) => ({
        codepoint,
        e,
        p: grayPng(i).toString("base64"),
      })),
    });
  }
  // Байты анимации. Настоящий сервер отдаёт gzip'нутый .tgs как есть, но заголовок
  // Content-Encoding ставит только под Accept-Encoding — здесь просто отдаём готовый JSON.
  const emojiMatch = path.match(/^\/_matrix\/emoji\/([^/]+)$/);
  if (emojiMatch) {
    const codepoint = emojiMatch[1];
    if (!/^[0-9a-f]{4,5}(-[0-9a-f]{4,5})*$/.test(codepoint)) {
      return send(res, 400, { errcode: "M_INVALID_PARAM", error: "bad codepoint" });
    }
    if (!EMOJI_BY_CODEPOINT.has(codepoint)) {
      return send(res, 404, { errcode: "M_NOT_FOUND", error: "no such emoji" });
    }
    return send(res, 200, mockLottie(codepoint));
  }
  // Web Push — требует реального браузерного push-сервиса
  if (/kc\/push\/webpush/.test(path)) {
    return send(res, 404, { errcode: "M_NOT_FOUND", error: "push disabled in mock" });
  }

  return send(res, 404, { errcode: "M_NOT_FOUND", error: "mock: " + path });
});

server.on("error", (err) => {
  if (err.code === "EADDRINUSE") {
    console.error(`\n[matrix-mock] Порт ${PORT} занят. Завершите предыдущий процесс или задайте MOCK_PORT=<другой>.\n`);
    process.exit(1);
  }
  throw err;
});

server.listen(PORT, () => {
  console.log(`BankChat mock-сервер: http://localhost:${PORT}`);
  console.log(`Откройте виджет:     http://localhost:5174`);
  console.log(`Команды в чате: /card [buttons|3|broken|openurl|many]  /notice  /left  /join  /html`);
  console.log(`                /img  /file  /sticker  /reply [img|file]  /react [эмодзи]  /fail`);
  console.log(`                /failaction  /failupload  /rejectupload  /failthumb  /pendingmedia`);
  console.log(`                /rejectmedia`);
});
