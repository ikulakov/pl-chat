import { normalizeEmojiKey, type EmojiCatalog } from '../../domain/emoji'
import type { EmojiPacksResponse } from '../wire/emoji'

/**
 * Каталог пака → карта «символ → codepoint».
 *
 * Ключ нормализуется так же, как при разборе текста: без вариационного селектора. Иначе ❤️
 * (`2764 fe0f`) из сообщения не найдётся, хотя `2764` в паке есть.
 */
export function toEmojiCatalog(response: EmojiPacksResponse): EmojiCatalog {
  const packs = response.packs ?? []
  const codepointByChar = new Map<string, string>()

  for (const pack of packs) {
    for (const category of pack.categories ?? []) {
      for (const { codepoint, e } of category.emoji ?? []) {
        codepointByChar.set(normalizeEmojiKey(e), codepoint)
      }
    }
  }

  // Версия одна на пак; паков сервер публикует ровно один, но структура допускает список.
  return { version: packs[0]?.version ?? '', codepointByChar }
}
