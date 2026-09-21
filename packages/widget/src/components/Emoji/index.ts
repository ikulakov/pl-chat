// Публичный API слайса: рендер эмодзи и стикеров, разбор текста на эмодзи, кнопка пикера и
// загрузка индекса пака. lottie-плеер, пул, растеризация и кэши каталога — внутреннее
// устройство, снаружи их трогают только тесты.
export { AnimatedEmoji } from './ui/AnimatedEmoji'
export { EmojiPickerButton } from './ui/picker/EmojiPickerButton'
export { EmojiText } from './ui/EmojiText'
export { StickerView } from './ui/StickerView'
export { useEmojiIndexBootstrap } from './hooks/useEmojiIndexBootstrap'
export { useEmojiSegments } from './hooks/useEmojiSegments'
export type { EmojiLayout } from './utils/emojiLayout'
