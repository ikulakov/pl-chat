import prettier from 'eslint-config-prettier'
import i18next from 'eslint-plugin-i18next'
import reactHooks from 'eslint-plugin-react-hooks'
import reactRefresh from 'eslint-plugin-react-refresh'
import globals from 'globals'
import tseslint from 'typescript-eslint'

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
      ],
    },
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
              group: ['**/matrix/**'],
              message:
                'domain и store не знают wire-протокол Matrix: переводи его в matrix/mappers/* и передавай доменный тип (например RoomSyncPatch).',
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
              group: ['**/i18n', '**/i18n/**'],
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
