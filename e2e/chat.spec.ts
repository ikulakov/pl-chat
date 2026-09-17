import {
  expect,
  test,
  type FrameLocator,
  type Locator,
  type Page,
  type Request,
} from '@playwright/test'
import { t } from '../packages/widget/src/i18n'

const BOTTOM_THRESHOLD_PX = 80

/** Кнопку чата рисует демо-хост (`tools/host-demo/index.html`), в словаре виджета её нет. */
const HOST_FAB_LABEL = 'Открыть чат поддержки'

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

/**
 * Кнопка «вниз» подписана по-разному в зависимости от того, есть ли непрочитанные, а подпись
 * со счётчиком — шаблон с `{count}`. Сверяем по началу строки, до первого плейсхолдера.
 */
const scrollDownPattern = new RegExp(
  `^(${[t('chat.scroll-down'), t('chat.scroll-down-unread')]
    .map((text) => escapeRegExp(text.split('{')[0]!.trim()))
    .join('|')})`,
)

function distanceToBottom(messageList: Locator): Promise<number> {
  return messageList.evaluate((list) => list.scrollHeight - list.clientHeight - list.scrollTop)
}

async function openChat(page: Page): Promise<{ chat: FrameLocator; messageList: Locator }> {
  await page.goto('/')
  await page.getByRole('button', { name: HOST_FAB_LABEL }).click()

  const chat = page.frameLocator('#plchat-frame')
  const messageList = chat.getByTestId('message-list')
  await expect(messageList).toBeVisible()
  await expect.poll(() => distanceToBottom(messageList)).toBeLessThanOrEqual(BOTTOM_THRESHOLD_PX)

  return { chat, messageList }
}

async function sendMessage(chat: FrameLocator, text: string): Promise<void> {
  const composer = chat.getByRole('textbox', { name: t('input.placeholder'), exact: true })
  await composer.fill(text)
  // по aria-label, а не по роли с именем: в dev-панели есть своя кнопка с тем же текстом
  await chat.locator(`button[aria-label="${t('input.send')}"]`).click()
}

async function scrollUp(page: Page, messageList: Locator): Promise<void> {
  await messageList.hover()
  // Свежая гостевая сессия приезжает с тремя событиями — крутить сперва нечего. Лента
  // растёт по мере подгрузки истории (mock отдаёт страницы с задержкой), поэтому колесо
  // крутим до тех пор, пока лента действительно не уйдёт от низа.
  await expect
    .poll(
      async () => {
        await page.mouse.wheel(0, -1200)
        return distanceToBottom(messageList)
      },
      { timeout: 15_000 },
    )
    .toBeGreaterThan(BOTTOM_THRESHOLD_PX)
}

function requestBody(request: Request): Record<string, unknown> | null {
  try {
    return request.postDataJSON() as Record<string, unknown>
  } catch {
    return null
  }
}

test.describe.serial('chat', () => {
  test('does not steal the position for an incoming message while the user is scrolled up', async ({
    page,
  }) => {
    const { chat, messageList } = await openChat(page)
    await scrollUp(page, messageList)

    const incoming = `e2e incoming ${Date.now()}`
    const operatorInput = chat.locator('input[name="devOperatorMessage"]')
    await operatorInput.fill(incoming)
    await operatorInput.press('Enter')

    await expect(chat.getByText(incoming)).toBeVisible()
    await expect.poll(() => distanceToBottom(messageList)).toBeGreaterThan(BOTTOM_THRESHOLD_PX)

    const scrollDown = chat.getByRole('button', { name: scrollDownPattern })
    await expect(scrollDown).toBeVisible()
    await scrollDown.click()
    await expect.poll(() => distanceToBottom(messageList)).toBeLessThanOrEqual(BOTTOM_THRESHOLD_PX)
  })

  test('returns to the bottom after the user sends a message from the history', async ({
    page,
  }) => {
    const { chat, messageList } = await openChat(page)
    await scrollUp(page, messageList)

    const ownMessage = `e2e own ${Date.now()}`
    await sendMessage(chat, ownMessage)

    await expect(chat.getByText(ownMessage)).toBeVisible()
    await expect.poll(() => distanceToBottom(messageList)).toBeLessThanOrEqual(BOTTOM_THRESHOLD_PX)
  })

  test('stays pinned to the bottom while the composer grows and shrinks', async ({ page }) => {
    const { chat, messageList } = await openChat(page)
    const composer = chat.getByRole('textbox', { name: t('input.placeholder'), exact: true })
    const initialHeight = await composer.evaluate((textarea) => textarea.clientHeight)

    await composer.fill(Array.from({ length: 8 }, (_, index) => `Строка ${index + 1}`).join('\n'))

    await expect
      .poll(() => composer.evaluate((textarea) => textarea.clientHeight))
      .toBeGreaterThan(initialHeight)
    await expect.poll(() => distanceToBottom(messageList)).toBeLessThanOrEqual(BOTTOM_THRESHOLD_PX)

    await composer.fill('')

    await expect
      .poll(() => composer.evaluate((textarea) => textarea.clientHeight))
      .toBeLessThanOrEqual(initialHeight)
    await expect.poll(() => distanceToBottom(messageList)).toBeLessThanOrEqual(BOTTOM_THRESHOLD_PX)
  })

  test('keeps the bottom position when the host closes and reopens the iframe', async ({
    page,
  }) => {
    const { chat, messageList } = await openChat(page)
    const fab = page.getByRole('button', { name: HOST_FAB_LABEL })

    await fab.click()
    await expect(fab).toHaveAttribute('aria-expanded', 'false')
    await fab.click()
    await expect(fab).toHaveAttribute('aria-expanded', 'true')
    await expect(messageList).toBeVisible()

    await expect.poll(() => distanceToBottom(messageList)).toBeLessThanOrEqual(BOTTOM_THRESHOLD_PX)
    await expect(chat.getByRole('button', { name: scrollDownPattern })).toHaveCount(0)
  })

  test('scrolls to the original message from a reply preview', async ({ page }) => {
    const { chat, messageList } = await openChat(page)
    const marker = `e2e reply target ${Date.now()}`

    await sendMessage(chat, marker)
    const spacer = `e2e reply spacer ${Date.now()} ${'длинный ответ оператора '.repeat(40)}`
    const operatorInput = chat.locator('input[name="devOperatorMessage"]')
    await operatorInput.fill(spacer)
    await operatorInput.press('Enter')
    await expect(chat.getByText(spacer)).toBeVisible()
    await sendMessage(chat, '/reply')

    const replyLink = chat
      .getByRole('button', { name: t('chat.reply.goToOriginal') })
      .filter({ hasText: marker })
    await expect(replyLink).toBeVisible()
    await expect.poll(() => distanceToBottom(messageList)).toBeLessThanOrEqual(BOTTOM_THRESHOLD_PX)

    await replyLink.click()

    await expect.poll(() => distanceToBottom(messageList)).toBeGreaterThan(BOTTOM_THRESHOLD_PX)
  })

  test('aligns an original message taller than the viewport to its beginning', async ({ page }) => {
    const { chat, messageList } = await openChat(page)
    const marker = `e2e long original ${Date.now()}`
    const longMessage = Array.from({ length: 36 }, (_, index) => `${marker} ${index + 1}`).join(
      '\n',
    )

    await sendMessage(chat, longMessage)
    await sendMessage(chat, '/reply')
    const replyLink = chat
      .getByRole('button', { name: t('chat.reply.goToOriginal') })
      .filter({ hasText: marker })
    await expect(replyLink).toBeVisible()

    const originalRow = chat.locator('[data-item-id]').filter({ hasText: marker }).first()
    await expect
      .poll(async () => {
        const [rowHeight, viewportHeight] = await Promise.all([
          originalRow.evaluate((row) => (row as HTMLElement).offsetHeight),
          messageList.evaluate((list) => list.clientHeight),
        ])
        return rowHeight - viewportHeight
      })
      .toBeGreaterThan(0)

    await replyLink.click()

    await expect
      .poll(() =>
        originalRow.evaluate((row) => {
          const list = row.closest<HTMLElement>('[data-testid="message-list"]')
          if (!list) throw new Error('message list not found')
          return Math.abs(row.getBoundingClientRect().top - list.getBoundingClientRect().top)
        }),
      )
      .toBeLessThanOrEqual(2)
  })

  test('retries a failed message without creating a duplicate', async ({ page, browserName }) => {
    test.skip(browserName !== 'chromium', 'Critical business flow is covered once in Chromium')

    const marker = `e2e retry ${Date.now()}`
    let failedOnce = false

    await page.route('**/send/**', async (route) => {
      const request = route.request()
      const body = requestBody(request)

      if (!failedOnce && request.method() === 'PUT' && body?.body === marker) {
        failedOnce = true
        await route.fulfill({
          status: 500,
          contentType: 'application/json',
          body: JSON.stringify({ errcode: 'M_UNKNOWN', error: 'E2E simulated failure' }),
        })
        return
      }

      await route.continue()
    })

    const { chat } = await openChat(page)
    await sendMessage(chat, marker)

    const rows = chat.locator('[data-item-id]').filter({ hasText: marker })
    const row = rows.last()
    await expect(row).toBeVisible()
    await row.hover()
    await row.getByRole('button', { name: t('chat.action.menu') }).click()

    const retry = chat.getByRole('menuitem', { name: t('chat.action.retry') })
    await expect(retry).toBeVisible()

    const successfulRetry = page.waitForResponse((response) => {
      const request = response.request()
      return request.method() === 'PUT' && requestBody(request)?.body === marker && response.ok()
    })
    await retry.dispatchEvent('click')
    await successfulRetry

    await expect(rows).toHaveCount(1)
    await row.hover()
    await row.getByRole('button', { name: t('chat.action.menu') }).click()
    await expect(chat.getByRole('menuitem', { name: t('chat.action.retry') })).toHaveCount(0)
    expect(failedOnce).toBe(true)
  })

  test('submits an adaptive-card action only once on a double click', async ({
    page,
    browserName,
  }) => {
    test.skip(browserName !== 'chromium', 'Critical business flow is covered once in Chromium')

    const { chat } = await openChat(page)
    let actionRequests = 0

    page.on('request', (request) => {
      if (requestBody(request)?.msgtype === 'kc.adaptive.action') actionRequests += 1
    })

    const cards = chat.locator('[data-item-id]').filter({ hasText: 'Карточка с кнопками' })
    const cardCount = await cards.count()
    const acknowledgements = chat.getByText('Принято: confirm')
    const acknowledgementCount = await acknowledgements.count()
    await sendMessage(chat, '/card buttons')

    await expect(cards).toHaveCount(cardCount + 1)
    const card = cards.nth(cardCount)
    await expect(card).toBeVisible()
    const confirm = card.getByRole('button', { name: 'Подтвердить', exact: true })

    await confirm.dblclick()

    await expect(confirm).toBeDisabled()
    await expect(acknowledgements).toHaveCount(acknowledgementCount + 1)
    expect(actionRequests).toBe(1)
  })
})
