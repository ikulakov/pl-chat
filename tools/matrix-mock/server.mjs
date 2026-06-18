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

function push(type, sender, content, stateKey) {
  const ev = { event_id: nextId(), type, sender, origin_server_ts: Date.now(), content };
  if (stateKey !== undefined) ev.state_key = stateKey;
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
    // Initial sync: limited=true + prev_batch → клиент показывает «Загрузить ещё».
    // На инкрементальных НЕ шлём limited — иначе клиентский hasMore сбросится в false.
    timeline.limited = true;
    timeline.prev_batch = "h0";
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

// ── Подгрузка истории (dir=b, страницы h0→h1→h2, потом конец) ────────────────
const HISTORY_PAGES = 3;
const HISTORY_PER = 8;
function historyPage(from) {
  const page = from && from.startsWith("h") ? Number(from.slice(1)) : 0;
  if (page >= HISTORY_PAGES) return { chunk: [], start: from || "h0" };
  const baseTs = Date.now() - (page + 1) * 3_600_000;
  const chunk = [];
  for (let i = 0; i < HISTORY_PER; i++) {
    const idx = page * HISTORY_PER + i;
    chunk.push({
      event_id: `$hist_${page}_${i}`,
      type: "m.room.message",
      sender: idx % 2 === 0 ? OP : GUEST,
      origin_server_ts: baseTs - i * 60_000, // newest-first (dir=b)
      content: { msgtype: "m.text", body: `Сообщение из истории #${idx + 1}` },
    });
  }
  const end = page + 1 < HISTORY_PAGES ? `h${page + 1}` : undefined;
  return { chunk, start: from || "h0", end };
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
      push("kc.operator.current", OP, { status: "LEFT", operator_id: null }, "");
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
    return send(res, 200, historyPage(url.searchParams.get("from")));
  }

  // KC-расширение: POST /createRoom/{txnId}
  if (/\/createRoom\/[^/]+$/.test(path) && method === "POST") {
    return send(res, 200, { room_id: ROOM });
  }

  // PUT /rooms/{id}/send/{type}/{txnId}
  const sendMatch = path.match(/\/rooms\/[^/]+\/send\/([^/]+)\/[^/]+$/);
  if (sendMatch && method === "PUT") {
    const type = decodeURIComponent(sendMatch[1]);
    const content = await readBody(req);
    const ev = push(type, GUEST, content);
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
