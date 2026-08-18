import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { FakeIntersectionObserver } from '../../../../test.setup'
import { t } from '../../../i18n'
import { EmojiPickerButton } from './EmojiPickerButton'

const loadEmojiCatalog = vi.fn()
const loadEmojiCategory = vi.fn()
const loadEmojiAnimation = vi.fn()
const loadStickerPacks = vi.fn()
const sendSticker = vi.fn()

vi.mock('../../../hooks/useChatActions', () => ({
  useChatActions: () => ({
    loadEmojiCatalog,
    loadEmojiCategory,
    loadEmojiAnimation,
    loadStickerPacks,
    sendSticker,
  }),
}))

const destroyPlayer = vi.fn()
const createEmojiPlayer = vi.fn(() => ({
  totalFrames: 30,
  frameRate: 30,
  goToAndStop: vi.fn(),
  destroy: destroyPlayer,
}))

// lottie-web тянет canvas, которого в jsdom нет; здесь проверяется поведение панели,
// а не сам плеер — у него свои тесты в shared/lottie.
vi.mock('../../../shared/lottie/lottiePlayer', () => ({
  loadLottiePlayer: () => Promise.resolve({}),
  createEmojiPlayer: () => createEmojiPlayer(),
}))

// Статичный кадр ячейки: в jsdom его не нарисовать (нет ни canvas, ни загрузки ресурсов в
// <img>), а тесты панели про него и не спрашивают — им важно, что плеера в ячейке нет.
vi.mock('../../../shared/lottie/emojiBitmap', () => ({
  getEmojiBitmap: () => Promise.resolve('data:image/png;base64,AAA'),
}))

function openPicker() {
  fireEvent.click(screen.getByRole('button', { name: t('input.stickers') }))
}

/**
 * Сетка грузит состав вкладки по пересечению сентинела — в jsdom его двигаем руками.
 * Сентинел появляется только после ответа каталога, поэтому сначала ждём наблюдателей.
 */
async function scrollIntoView() {
  await waitFor(() => expect(FakeIntersectionObserver.instances.length).toBeGreaterThan(0))
  act(() => {
    FakeIntersectionObserver.instances.forEach((observer) => observer.trigger(true))
  })
}

describe('EmojiPickerButton', () => {
  beforeEach(() => {
    FakeIntersectionObserver.instances.length = 0
    createEmojiPlayer.mockClear()
    destroyPlayer.mockClear()
    loadEmojiCatalog.mockResolvedValue({
      version: 'v1',
      categories: [{ id: 'smileys', title: 'Смайлы', count: 2, items: null }],
    })
    loadEmojiCategory.mockResolvedValue({
      id: 'smileys',
      title: 'Смайлы',
      count: 1,
      items: [{ codepoint: '1f600', char: '😀', silhouette: null }],
    })
    loadEmojiAnimation.mockResolvedValue({})
    loadStickerPacks.mockResolvedValue([])
    sendSticker.mockResolvedValue(undefined)
  })

  /** Пак с одним растровым стикером: ветка `<img>` не тянет ни плеер, ни видео. */
  function withSticker() {
    loadStickerPacks.mockResolvedValue([
      {
        id: 'utya',
        title: 'Утя',
        stickers: [
          {
            id: '01_utya',
            body: '🐥',
            mediaId: 'AbCdEfGhIjKlMnOpQrStUvWx',
            url: 'mxc://bank.ru/AbCdEfGhIjKlMnOpQrStUvWx',
            info: { mimetype: 'image/webp' },
            silhouette: null,
          },
        ],
      },
    ])
  }

  it('панель закрыта по умолчанию, кнопка сообщает об этом', () => {
    render(<EmojiPickerButton onSelectEmoji={vi.fn()} />)

    expect(screen.getByRole('button', { name: t('input.stickers') })).toHaveAttribute(
      'aria-expanded',
      'false',
    )
    expect(screen.queryByRole('tablist')).not.toBeInTheDocument()
  })

  it('клик открывает панель с двумя вкладками', async () => {
    render(<EmojiPickerButton onSelectEmoji={vi.fn()} />)

    openPicker()

    expect(screen.getByRole('button', { name: t('input.stickers') })).toHaveAttribute(
      'aria-expanded',
      'true',
    )
    expect(await screen.findByRole('tab', { name: t('picker.tab.emoji') })).toHaveAttribute(
      'aria-selected',
      'true',
    )
    expect(screen.getByRole('tab', { name: t('picker.tab.stickers') })).toHaveAttribute(
      'aria-selected',
      'false',
    )
  })

  it('Escape закрывает панель и возвращает фокус на кнопку', async () => {
    render(<EmojiPickerButton onSelectEmoji={vi.fn()} />)
    openPicker()
    await screen.findByRole('tablist')

    fireEvent.keyDown(document, { key: 'Escape' })

    await waitFor(() => expect(screen.queryByRole('tablist')).not.toBeInTheDocument())
    expect(screen.getByRole('button', { name: t('input.stickers') })).toHaveFocus()
  })

  it('клик снаружи закрывает панель, не отбирая фокус', async () => {
    render(<EmojiPickerButton onSelectEmoji={vi.fn()} />)
    openPicker()
    await screen.findByRole('tablist')

    fireEvent.pointerDown(document.body)

    await waitFor(() => expect(screen.queryByRole('tablist')).not.toBeInTheDocument())
    expect(screen.getByRole('button', { name: t('input.stickers') })).not.toHaveFocus()
  })

  it('стрелка вправо переключает на вкладку стикеров', async () => {
    render(<EmojiPickerButton onSelectEmoji={vi.fn()} />)
    openPicker()
    const emojiTab = await screen.findByRole('tab', { name: t('picker.tab.emoji') })

    fireEvent.keyDown(emojiTab, { key: 'ArrowRight' })

    expect(screen.getByRole('tab', { name: t('picker.tab.stickers') })).toHaveAttribute(
      'aria-selected',
      'true',
    )
  })

  it('состав вкладки грузится только когда секция подошла к вьюпорту', async () => {
    render(<EmojiPickerButton onSelectEmoji={vi.fn()} />)
    openPicker()
    await waitFor(() => expect(FakeIntersectionObserver.instances.length).toBeGreaterThan(0))

    expect(loadEmojiCategory).not.toHaveBeenCalled()

    await scrollIntoView()

    await waitFor(() => expect(loadEmojiCategory).toHaveBeenCalledExactlyOnceWith('smileys'))
  })

  it('повторные пересечения не шлют повторных запросов состава', async () => {
    render(<EmojiPickerButton onSelectEmoji={vi.fn()} />)
    openPicker()

    await scrollIntoView()
    await waitFor(() => expect(loadEmojiCategory).toHaveBeenCalledOnce())
    await scrollIntoView()
    await scrollIntoView()

    expect(loadEmojiCategory).toHaveBeenCalledOnce()
  })

  it('выбор эмодзи отдаёт символ наружу и не закрывает панель', async () => {
    const onSelectEmoji = vi.fn()
    render(<EmojiPickerButton onSelectEmoji={onSelectEmoji} />)
    openPicker()
    await scrollIntoView()

    fireEvent.click(await screen.findByRole('button', { name: '😀' }))

    expect(onSelectEmoji).toHaveBeenCalledExactlyOnceWith('😀')
    expect(screen.getByRole('tablist')).toBeInTheDocument()
  })

  it('сетка стоит неподвижно: плеер заводится только под курсором и уходит вместе с ним', async () => {
    render(<EmojiPickerButton onSelectEmoji={vi.fn()} />)
    openPicker()
    await scrollIntoView()

    const cell = await screen.findByRole('button', { name: '😀' })
    // Раньше плеер заводила каждая видимая ячейка — открытая панель крутила десятки анимаций.
    expect(createEmojiPlayer).not.toHaveBeenCalled()

    fireEvent.pointerEnter(cell)
    await waitFor(() => expect(createEmojiPlayer).toHaveBeenCalledOnce())

    fireEvent.pointerLeave(cell)
    await waitFor(() => expect(destroyPlayer).toHaveBeenCalledOnce())
  })

  it('до наведения ячейка показывает статичный кадр', async () => {
    render(<EmojiPickerButton onSelectEmoji={vi.fn()} />)
    openPicker()
    await scrollIntoView()

    const cell = await screen.findByRole('button', { name: '😀' })
    // Наблюдатель самой ячейки появился только сейчас — вместе с ней; в браузере он сработал бы
    // сразу после создания, в jsdom пересечение двигаем руками.
    await scrollIntoView()

    await waitFor(() => expect(cell.querySelector('img')).not.toBeNull())
  })

  it('категории идут секциями со своими заголовками', async () => {
    render(<EmojiPickerButton onSelectEmoji={vi.fn()} />)

    openPicker()

    expect(await screen.findByRole('heading', { name: 'Смайлы' })).toBeInTheDocument()
  })

  it('одну категорию полоска быстрого перехода не показывает — перематывать некуда', async () => {
    render(<EmojiPickerButton onSelectEmoji={vi.fn()} />)
    openPicker()
    await screen.findByRole('tablist')

    expect(screen.queryByRole('toolbar')).not.toBeInTheDocument()
  })

  it('полоска категорий помечает выбранную текущей', async () => {
    loadEmojiCatalog.mockResolvedValue({
      version: 'v1',
      categories: [
        { id: 'smileys', title: 'Смайлы', count: 2, items: null },
        { id: 'flags', title: 'Флаги', count: 3, items: null },
      ],
    })
    render(<EmojiPickerButton onSelectEmoji={vi.fn()} />)
    openPicker()

    const flags = await screen.findByRole('button', { name: 'Флаги' })
    fireEvent.click(flags)

    expect(flags).toHaveAttribute('aria-current', 'true')
    expect(screen.getByRole('button', { name: 'Смайлы' })).not.toHaveAttribute('aria-current')
  })

  it('выбор стикера отправляет его и закрывает панель — в отличие от эмодзи', async () => {
    withSticker()
    render(<EmojiPickerButton onSelectEmoji={vi.fn()} />)
    openPicker()
    fireEvent.click(await screen.findByRole('tab', { name: t('picker.tab.stickers') }))

    fireEvent.click(await screen.findByRole('button', { name: '🐥' }))

    expect(sendSticker).toHaveBeenCalledOnce()
    await waitFor(() => expect(screen.queryByRole('tablist')).not.toBeInTheDocument())
    expect(screen.getByRole('button', { name: t('input.stickers') })).toHaveFocus()
  })

  it('сбой каталога показывает ошибку с повтором вместо пустой панели', async () => {
    loadEmojiCatalog.mockRejectedValue(new Error('offline'))
    vi.spyOn(console, 'error').mockImplementation(() => {})
    render(<EmojiPickerButton onSelectEmoji={vi.fn()} />)

    openPicker()

    expect(await screen.findByRole('button', { name: t('picker.retry') })).toBeInTheDocument()
  })
})
