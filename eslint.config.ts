const js = require('@eslint/js');
const tseslint = require('typescript-eslint');

module.exports = [
    {
        ignores: [
            'build/**',
            'dist/**',
            'node_modules/**',
            'renderer-dist/**'
        ]
    },
    js.configs.recommended,
    ...tseslint.configs.recommended,
    {
        files: ['**/*.ts', '**/*.tsx'],
        languageOptions: {
            ecmaVersion: 2022,
            sourceType: 'module',
            globals: {
                require: 'readonly',
                module: 'readonly',
                exports: 'readonly',
                __dirname: 'readonly',
                __filename: 'readonly',
                process: 'readonly',
                console: 'readonly',
                Buffer: 'readonly',
                setTimeout: 'readonly',
                setInterval: 'readonly',
                clearTimeout: 'readonly',
                clearInterval: 'readonly',
                fetch: 'readonly',
                AbortController: 'readonly',
                CustomEvent: 'readonly',
                HTMLElement: 'readonly',
                Event: 'readonly',
                window: 'readonly',
                document: 'readonly',
                Intl: 'readonly'
            },
            parserOptions: {
                ecmaFeatures: {
                    jsx: true
                }
            }
        },
        rules: {
            'no-unused-vars': 'off',
            '@typescript-eslint/no-unused-vars': ['warn', { argsIgnorePattern: '^_' }],
            '@typescript-eslint/no-require-imports': 'off',
            '@typescript-eslint/no-explicit-any': 'off',
            'no-console': 'off',
            'prefer-const': 'warn',
            'eqeqeq': ['error', 'always'],
            'no-var': 'error'
        }
    }
];
