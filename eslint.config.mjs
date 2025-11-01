import js from '@eslint/js';
import globals from 'globals';
import importPlugin from 'eslint-plugin-import';
import unicorn from 'eslint-plugin-unicorn';
import tseslint from 'typescript-eslint';

const typedFiles = ['**/*.ts', '**/*.tsx'];

export default tseslint.config(
  {
    ignores: [
      'dist/**',
      'node_modules/**',
      '*.d.ts',
      'bun.lock',
      'eslint.config.mjs',
    ],
  },
  js.configs.recommended,
  ...tseslint.configs.strictTypeChecked,
  ...tseslint.configs.stylisticTypeChecked,
  {
    files: typedFiles,
    languageOptions: {
      parserOptions: {
        project: './tsconfig.json',
        tsconfigRootDir: import.meta.dirname,
      },
      globals: {
        ...globals.node,
      },
    },
    plugins: {
      import: importPlugin,
      unicorn,
    },
    settings: {
      'import/resolver': {
        typescript: {
          project: './tsconfig.json',
        },
      },
    },
    rules: {
      'no-console': 'off',
      'logical-assignment-operators': ['error', 'always'],
      'prefer-object-has-own': 'error',
      'no-restricted-syntax': [
        'error',
        {
          selector: 'ForInStatement',
          message: 'Use Object.keys or Object.entries instead of for...in',
        },
        {
          selector: 'LabeledStatement',
          message: 'Labels are not allowed.',
        },
        {
          selector: 'WithStatement',
          message: 'with is disallowed.',
        },
      ],
      'import/no-default-export': 'error',
      'import/order': [
        'error',
        {
          groups: [
            ['builtin'],
            ['external'],
            ['internal', 'parent', 'sibling', 'index'],
            ['type'],
          ],
          'newlines-between': 'always',
          alphabetize: {
            order: 'asc',
            caseInsensitive: true,
          },
        },
      ],
      'import/no-extraneous-dependencies': [
        'error',
        {
          devDependencies: [
            'tests/**',
            '**/__tests__/**',
            '**/*.test.*',
            'eslint.config.mjs',
            '**/*.config.*',
            '**/.*rc.*',
          ],
        },
      ],
      'import/no-cycle': 'error',
      '@typescript-eslint/consistent-type-definitions': ['error', 'interface'],
      '@typescript-eslint/consistent-type-imports': [
        'error',
        {
          prefer: 'type-imports',
          disallowTypeAnnotations: true,
          fixStyle: 'inline-type-imports',
        },
      ],
      '@typescript-eslint/explicit-function-return-type': [
        'error',
        {
          allowExpressions: true,
          allowTypedFunctionExpressions: true,
          allowHigherOrderFunctions: true,
        },
      ],
      '@typescript-eslint/no-explicit-any': 'error',
      '@typescript-eslint/ban-ts-comment': [
        'error',
        {
          'ts-ignore': 'allow-with-description',
          'ts-expect-error': 'allow-with-description',
        },
      ],
      '@typescript-eslint/no-floating-promises': [
        'error',
        {
          ignoreVoid: false,
          ignoreIIFE: false,
        },
      ],
      '@typescript-eslint/no-misused-promises': [
        'error',
        {
          checksVoidReturn: false,
        },
      ],
      '@typescript-eslint/no-non-null-assertion': 'error',
      '@typescript-eslint/no-unnecessary-boolean-literal-compare': 'error',
      '@typescript-eslint/no-unnecessary-type-arguments': 'error',
      '@typescript-eslint/no-unnecessary-type-assertion': 'error',
      '@typescript-eslint/no-confusing-void-expression': [
        'error',
        {
          ignoreArrowShorthand: true,
          ignoreVoidOperator: true,
        },
      ],
      '@typescript-eslint/prefer-nullish-coalescing': [
        'error',
        {
          ignoreConditionalTests: false,
          ignoreMixedLogicalExpressions: false,
        },
      ],
      '@typescript-eslint/prefer-readonly': 'error',
      '@typescript-eslint/prefer-return-this-type': 'error',
      '@typescript-eslint/switch-exhaustiveness-check': 'error',
      '@typescript-eslint/no-useless-empty-export': 'error',
      '@typescript-eslint/restrict-template-expressions': [
        'error',
        {
          allowNumber: true,
          allowBoolean: false,
          allowNullish: false,
          allowRegExp: false,
          allowAny: false,
        },
      ],
      '@typescript-eslint/unified-signatures': 'off',
      'unicorn/prefer-number-properties': 'error',
      'unicorn/prefer-string-slice': 'error',
      'unicorn/no-await-expression-member': 'error',
    },
  },
  {
    files: ['**/__tests__/**', '**/*.test.*'],
    languageOptions: {
      globals: {
        ...globals.jest,
      },
    },
  },
  {
    files: ['**/*.js'],
    languageOptions: {
      sourceType: 'module',
      globals: {
        ...globals.node,
      },
    },
  },
);
