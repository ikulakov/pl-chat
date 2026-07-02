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
