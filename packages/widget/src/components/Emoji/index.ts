// Публичный API слайса: рендер эмодзи и стикеров, разбор текста на эмодзи, кнопка пикера и
// загрузка индекса пака. lottie-плеер, пул, растеризация и кэши каталога — внутреннее
// устройство, снаружи их трогают только тесты.
export { AnimatedEmoji } from './AnimatedEmoji'
export { EmojiPickerButton } from './EmojiPicker'
export { EmojiText } from './EmojiText'
export { StickerView } from './StickerView'
export { useEmojiIndexBootstrap } from './hooks/useEmojiIndexBootstrap'
export { useEmojiSegments } from './hooks/useEmojiSegments'
