import prettier from 'eslint-config-prettier'
import compat from 'eslint-plugin-compat'
import i18next from 'eslint-plugin-i18next'
import reactHooks from 'eslint-plugin-react-hooks'
import reactRefresh from 'eslint-plugin-react-refresh'
import globals from 'globals'
import tseslint from 'typescript-eslint'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const WIDGET_SRC = fileURLToPath(new URL('./packages/widget/src/', import.meta.url))

/**
 * Слои виджета — папки первого уровня в `src/`. `styles/` в список не входит: это не слой,
 * а глобальный CSS, который подключает композиционный корень.
 */
const LAYERS = new Set([
  'components',
  'domain',
  'hooks',
  'i18n',
  'matrix',
  'middleware',
  'shared',
  'store',
])

/** Слой, в котором лежит файл; null — корень `src/` (композиционный корень) или вне `src/`. */
function layerOf(absolutePath) {
  const relative = path.relative(WIDGET_SRC, absolutePath)
  if (relative === '' || relative.startsWith('..')) return null

  const [first] = relative.split(path.sep)
  return LAYERS.has(first) ? first : null
}

/**
 * Относительный импорт не покидает свой слой. Раньше это проверялось порогом глубины
 * (`../../../*`), и порог врал в обе стороны: `components/Foo.tsx → ../store/store` проходил,
 * а появление папки уровнем глубже сделало бы ложными внутрислойные импорты. Здесь слой файла
 * и слой цели считаются по факту, от `src/`, поэтому глубина ни на что не влияет.
 *
 * Молчит там, где относительный путь и есть контракт: внутри одного слоя (файл рядом), в
 * файлах корня `src/` (корень собирает слои и берёт их как соседей) и на цели вне слоёв —
 * корневой `../chatController`, глобальный CSS.
 */
const layerBoundary = {
  meta: {
    type: 'problem',
    docs: { description: 'межслойный импорт идёт через @/, относительный путь — внутри слоя' },
    schema: [],
  },
  create(context) {
    function check(node) {
      const request = node.source?.value
      if (typeof request !== 'string' || !request.startsWith('.')) return

      const fileLayer = layerOf(context.filename)
      if (!fileLayer) return

      const targetLayer = layerOf(path.resolve(path.dirname(context.filename), request))
      if (!targetLayer || targetLayer === fileLayer) return

      context.report({
        node: node.source,
        message: `Между слоями импортируй через @/ (здесь @/${targetLayer}/…); относительный путь — только внутри своего слоя.`,
      })
    }

    return { ImportDeclaration: check, ExportNamedDeclaration: check, ExportAllDeclaration: check }
  },
}

export default tseslint.config(
  {
    ignores: ['**/dist/**', '**/node_modules/**', '**/.turbo/**', 'pnpm-lock.yaml'],
  },

  // TypeScript rules — all packages
  ...tseslint.configs.recommended,
  {
    languageOptions: {
      globals: {
        ...globals.browser,
        ...globals.es2022,
      },
    },
    rules: {
      '@typescript-eslint/no-unused-vars': [
        'error',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_' },
      ],
      '@typescript-eslint/no-explicit-any': 'error',
      '@typescript-eslint/consistent-type-imports': ['error', { prefer: 'type-imports' }],
      'no-restricted-syntax': [
        'error',
        {
          selector: 'JSXAttribute[name.name="dangerouslySetInnerHTML"]',
          message:
            'dangerouslySetInnerHTML запрещён — используй sanitizeHtml() перед передачей __html.',
        },
        // `@/` адресует слой, а не файл: `@/features` в корне src делал корень неявным слоем,
        // куда все ходят абсолютным путём. Всё, что нужно нескольким слоям, живёт в одном из
        // них (фича-флаги — в shared/features.ts). Односегментными остаются только слои с
        // баррелем — i18n и middleware; корневые файлы (main/App/bridge/chatController)
        // берутся относительным путём, как соседи по корню.
        {
          selector: 'ImportDeclaration[source.value=/^@\\u002F(?!i18n$|middleware$)[^\\u002F]+$/]',
          message:
            "Абсолютный импорт указывает на слой: '@/shared/features', а не '@/features'. Файл в корне src берётся относительным путём.",
        },
        // Wire-типы читаются с префиксом: `Matrix.ClientEvent` сразу видно как форму с провода,
        // а доменный тип рядом идёт без префикса. Правило на весь каталог, а не на один файл:
        // типы провода лежат в types/dto/emoji, и новый типовой файл обязан попасть под него
        // сам, без правки конфига. Исключены consts и guards — там значения и функции,
        // `import type * as` для них не годится.
        {
          selector:
            'ImportDeclaration[source.value=/wire(\\u002F(?!consts$|guards$)[\\w.-]+)?$/] > ImportSpecifier',
          message:
            "wire-типы импортируй неймспейсом через баррель: import type * as Matrix from '…/wire' и читай как Matrix.ClientEvent. Именованно берутся только wire/consts и wire/guards — там значения.",
        },
        // Строку в vi.mock не проверяют ни tsc, ни линт: после переноса файла мок молча
        // перестаёт применяться, а тест продолжает проходить на настоящем модуле (так жил
        // мок lottiePlayer в ReplyPreview.test). Путь внутри import() компилятор резолвит.
        {
          selector:
            "CallExpression[callee.object.name='vi'][callee.property.name=/^(mock|doMock|unmock|doUnmock)$/] > Literal.arguments:first-child",
          message:
            "Путь мока передавай через import(): vi.mock(import('./x'), …) — его проверит tsc. Фабрика с частичной заглушкой — vi.mock<unknown>(import('./x'), …).",
        },
      ],
    },
  },

  // Абсолютные импорты между слоями: `@/shared/utils/cn` вместо `../../shared/utils/cn`.
  // Внутри своего слоя относительный путь остаётся — он и показывает, что файл рядом.
  // Правило локальное (см. layerBoundary выше): слой файла и слой цели считаются от `src/`,
  // поэтому оно ловит и выход на один этаж (`../store/store` из components/), который прежний
  // порог глубины `../../../*` пропускал. Тесты и testUtils не исключены — контракт формы
  // записи для них тот же.
  {
    files: ['packages/widget/src/**/*.{ts,tsx}'],
    plugins: { local: { rules: { 'layer-boundary': layerBoundary } } },
    rules: { 'local/layer-boundary': 'error' },
  },

  {
    files: ['packages/widget/src/**/*.{ts,tsx}'],
    // Композиционный корень собирает MatrixService — ему matrix/ знать положено.
    // testUtils и тесты двуязычны по природе.
    ignores: [
      'packages/widget/src/chatController.ts',
      'packages/widget/src/shared/testUtils/**',
      '**/*.test.{ts,tsx}',
    ],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            // matrix/ — внутренняя кухня клиента homeserver'а: транспорт, сессия, адреса
            // эндпоинтов, wire-типы. Наружу она отдаёт результат работы мапперов (доменные
            // типы) и ничего больше, иначе ACL обходится через чёрный ход. Исключения — в
            // `ignores` выше, а не новым паттерном.
            {
              group: ['**/matrix/**', '@/matrix/**'],
              message:
                'matrix/ наружу не импортируется: нужен доменный тип — переводи его в matrix/mappers/*, нужен вызов — заводи метод в MatrixService и прокидывай через ChatActions.',
            },
          ],
        },
      ],
    },
  },

  // Браузерные API новее минимальной поддерживаемой версии. Планка — .browserslistrc,
  // она обязана совпадать с build.target в packages/widget/vite.config.ts.
  // Покрываем ВСЕ пакеты, а не только виджет: loader грузится на каждом просмотре
  // страницы хоста, а protocol вкомпилирован в оба, и его код исполняется на
  // странице банка. Обоснование планки — docs/adr/browser-support.md.
  //
  // Охват неполный по устройству плагина: он надёжно видит глобалы и статические
  // методы (AbortSignal.timeout, crypto.randomUUID), но не методы экземпляра —
  // тип получателя ему неизвестен, поэтому array.at() и array.findLast() он
  // пропустит. Зелёный линтер не отменяет ревью, см. rules/frontend.md.
  {
    ...compat.configs['flat/recommended'],
    files: ['packages/*/src/**/*.{ts,tsx}'],
  },

  // Граница ACL: wire-форма Matrix живёт только в matrix/. Перевод протокола в доменные
  // типы делают matrix/mappers/*, поэтому domain и store о нём знать не должны.
  {
    files: ['packages/widget/src/{domain,store}/**/*.ts'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            {
              group: ['**/matrix/**', '@/matrix/**'],
              message:
                'domain и store не знают wire-протокол Matrix: переводи его в matrix/mappers/* и передавай доменный тип (например RoomSyncPatch).',
            },
          ],
        },
      ],
    },
  },

  // shared/ — нижний слой: к нему ходят все, он не ходит ни к кому. Запрет держит его
  // переиспользуемым: утилита, дёрнувшая стор или контроллер, перестаёт быть утилитой и
  // тянет за собой пол-приложения в каждый тест.
  //
  // `domain` и `i18n` из запрета пока исключены сознательно, это не недосмотр. К i18n ходят
  // форматтеры (`formatSize`, `formatDate`): «2,4 МБ» без локали не напечатать, и i18n тут
  // не верхний слой, а инфраструктура-ровесник. К `domain/emoji` ходят `shared/lottie/*` и
  // `shared/emoji/*` — вот это настоящее нарушение, но чинится оно переездом, а не запретом:
  // подсистема анимации эмодзи и стикеров лежит в shared/ по единственному признаку «нужна
  // двоим», а это тот самый путь, которым shared/ превращается в свалку. Разложить её по
  // потребителям — отдельная работа; до неё запрет на domain дал бы семь eslint-disable.
  {
    files: ['packages/widget/src/shared/**/*.{ts,tsx}'],
    // testUtils по природе двуязычны (строят и wire-, и доменные объекты), тесты — тоже.
    ignores: ['packages/widget/src/shared/testUtils/**', '**/*.test.{ts,tsx}'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            {
              group: [
                '@/components/**',
                '@/hooks/**',
                '@/store/**',
                '@/matrix/**',
                '@/middleware/**',
                '**/components/**',
                '**/hooks/**',
                '**/store/**',
                '**/matrix/**',
                '**/middleware/**',
              ],
              message:
                'shared/ — нижний слой: он не знает ни стора, ни контроллера, ни компонентов. Нужен верхний слой — значит модуль не shared: положи его рядом с потребителем.',
            },
          ],
        },
      ],
    },
  },

  // Перевод — только при показе. Строка из t() в сторе или в доменной структуре не переживёт
  // смену языка, поэтому данные несут дескриптор (ключ, код причины), а переводит UI.
  // Отдельное правило (@typescript-eslint/…), а не второй no-restricted-imports: в flat config
  // одноимённое правило для тех же файлов перетёрло бы границу ACL выше.
  {
    files: ['packages/widget/src/{domain,store,matrix}/**/*.ts'],
    ignores: ['**/*.test.ts'],
    rules: {
      '@typescript-eslint/no-restricted-imports': [
        'error',
        {
          patterns: [
            {
              group: ['**/i18n', '**/i18n/**', '@/i18n', '@/i18n/**'],
              allowTypeImports: true,
              message:
                'domain, store и matrix не переводят: храни ключ или код причины, t() вызывай в UI при рендере.',
            },
          ],
        },
      ],
    },
  },

  // widget only
  {
    files: ['packages/widget/src/**/*.{ts,tsx}'],
    ...reactHooks.configs.flat.recommended,
  },
  {
    files: ['packages/widget/src/**/*.tsx'],
    ...reactRefresh.configs.vite,
  },
  {
    files: ['packages/widget/src/**/*.tsx'],
    plugins: { i18next },
    rules: {
      'i18next/no-literal-string': [
        'error',
        {
          framework: 'react',
          mode: 'jsx-only',
          'jsx-attributes': {
            // whitelist: только атрибуты с пользовательским текстом
            include: ['aria-label', 'aria-placeholder', 'placeholder', 'title', 'subtitle', 'alt'],
          },
          words: {
            // строки без латиницы и кириллицы: эмодзи, пунктуация, одиночные символы
            exclude: ['^[^a-zA-Z\\u0400-\\u04ff]+$'],
          },
        },
      ],
    },
  },

  prettier,
)
