// =============================================================================
// Mock-сервер MatrixKC для разработки виджета БЕЗ настоящего бэкенда.
// Реализует подмножество Matrix C-S API, которое использует виджет. Сид-данные и
// авто-ответ берутся из ./scenario.json.
//
// Запуск:  pnpm dev          (слушает :3001 — vite проксирует /_matrix туда)
//
// Покрывает весь клиентский MVP: переписка, статусы, typing, ✓✓ (receipts),
// история, медиа-заглушки, стикеры, Adaptive Cards, завершение чата.
//
// История: ~480 осмысленных реплик из scenario.json → historyTopics, растянутых на 10 дней
// (работают date-разделители). Объём: MOCK_HISTORY_MESSAGES=1000 pnpm dev
// Временно выключить: галочка «История» в dev-панели виджета (GET/POST /_dev/history-toggle).
//
// Команды в поле ввода для тестирования сценариев:
//   /card    — оператор шлёт Adaptive Card с полем ввода
//   /notice  — системная плашка (m.notice)
//   /left    — оператор завершает чат
//   /html    — сообщение с rich-форматированием
//   /img     — оператор присылает картинку
//   /file    — оператор присылает файл (PDF)
//   /sticker — оператор присылает стикер
// =============================================================================
import { createServer } from "node:http";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

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

// ── In-memory состояние комнаты ──────────────────────────────────────────────
let seq = 0;
const nextId = () => "$ev" + ++seq;
const events = [];
let typing = [];
let typingVersion = 0;
let lastReadEventId = null;
let receiptVersion = 0;
let waiters = [];

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
function operatorRespond(text) {
  const t = (text || "").trim();
  if (t.startsWith("/card")) {
    return delay(700, () =>
      push("m.room.message", OP, {
        msgtype: "kc.adaptive.v1",
        body: "Карточка",
        adaptive_card: scenario.card,
      })
    );
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
  if (t.startsWith("/img")) {
    return delay(700, () =>
      push("m.room.message", OP, {
        msgtype: "m.image",
        body: "квитанция.png",
        url: "mxc://bank.ru/opimg1",
        filename: "квитанция.png",
        info: { mimetype: "image/png", size: 24000, w: 400, h: 300 },
      })
    );
  }
  if (t.startsWith("/file")) {
    return delay(700, () =>
      push("m.room.message", OP, {
        msgtype: "m.file",
        body: "Договор.pdf",
        url: "mxc://bank.ru/opfile1",
        filename: "Договор.pdf",
        info: { mimetype: "application/pdf", size: 1_200_000 },
      })
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
    "Access-Control-Allow-Headers": "*",
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
    const ev = push(type, GUEST, content, undefined, txnId);
    // Оператор «прочитал» — ✓✓.
    if (type === "m.room.message" || type === "m.sticker") {
      delay(600, () => operatorRead(ev.event_id));
    }
    // Авто-ответ на текстовые сообщения.
    if (type === "m.room.message" && content.msgtype === "m.text") {
      operatorRespond(content.body);
    }
    return send(res, 200, { event_id: ev.event_id });
  }

  // receipt / typing / presence — best-effort
  if (/\/receipt\//.test(path) || /\/typing\//.test(path) || /\/presence\//.test(path)) {
    return send(res, 200, {});
  }

  // Media upload
  if (path.endsWith("/media/v3/upload")) {
    return send(res, 200, { content_uri: "mxc://bank.ru/mock" + Date.now() });
  }
  // Media download/thumbnail → SVG-заглушка
  const mediaMatch = path.match(/\/media\/(?:download|thumbnail)\/[^/]+\/([^/]+)/);
  if (mediaMatch) {
    const w = Number(url.searchParams.get("width") || "400");
    const h = Number(url.searchParams.get("height") || "300");
    return send(res, 200, svgImage(w, h, `mock ${w}×${h}`), "image/svg+xml");
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
  console.log(`Команды в чате: /card  /notice  /left  /html  /img  /file  /sticker`);
});
