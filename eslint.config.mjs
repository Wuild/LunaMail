import js from '@eslint/js';
import globals from 'globals';
import reactHooks from 'eslint-plugin-react-hooks';
import reactRefresh from 'eslint-plugin-react-refresh';
import tseslint from 'typescript-eslint';

export default tseslint.config(
    {
        ignores: ['build/**', 'dist/**', 'node_modules/**', 'drizzle/**', 'preload.cjs', '*.config.js', '*.config.cjs'],
    },
    js.configs.recommended,
    ...tseslint.configs.recommended,
    {
        files: ['src/renderer/**/*.{ts,tsx}'],
        languageOptions: {
            globals: globals.browser,
        },
        plugins: {
            'react-hooks': reactHooks,
            'react-refresh': reactRefresh,
        },
        rules: {
            ...reactHooks.configs.recommended.rules,
            'react-hooks/exhaustive-deps': 'off',
            'react-refresh/only-export-components': 'off',
        },
    },
    {
        files: ['src/main/**/*.ts', 'src/preload/**/*.ts', 'src/shared/**/*.ts', 'src/tests/**/*.ts'],
        languageOptions: {
            globals: globals.node,
        },
    },
    {
        files: ['scripts/**/*.cjs', 'scripts/**/*.js'],
        languageOptions: {
            globals: globals.node,
        },
        rules: {
            '@typescript-eslint/no-require-imports': 'off',
        },
    },
    {
        rules: {
            '@typescript-eslint/no-explicit-any': 'off',
            '@typescript-eslint/no-empty-object-type': 'off',
            '@typescript-eslint/no-unused-vars': [
                'warn',
                {
                    argsIgnorePattern: '^_',
                    varsIgnorePattern: '^_',
                    caughtErrorsIgnorePattern: '^_',
                },
            ],
            'react-hooks/set-state-in-effect': 'off',
            'no-control-regex': 'off',
            'no-useless-escape': 'off',
        },
    },
);
