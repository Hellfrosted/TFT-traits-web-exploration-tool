const js = require('@eslint/js');

module.exports = [
    js.configs.recommended,
    {
        languageOptions: {
            ecmaVersion: 2022,
            sourceType: 'commonjs',
            globals: {
                // Node globals
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
                // Browser globals
                window: 'readonly',
                document: 'readonly',
                fetch: 'readonly',
                AbortController: 'readonly',
                CustomEvent: 'readonly',
                HTMLElement: 'readonly',
                Event: 'readonly',
                // Project-specific globals used in retained tests
                electronAPI: 'readonly',
                showDialog: 'readonly'
            }
        },
        rules: {
            'no-unused-vars': ['warn', { argsIgnorePattern: '^_' }],
            'no-console': 'off',
            'prefer-const': 'warn',
            'eqeqeq': ['error', 'always'],
            'no-var': 'error'
        }
    },
    {
        ignores: ['node_modules/**']
    },
    {
        files: ['src/renderer/**/*.js', 'src/renderer/**/*.jsx'],
        languageOptions: {
            ecmaVersion: 2022,
            sourceType: 'module',
            parserOptions: {
                ecmaFeatures: {
                    jsx: true
                }
            },
            globals: {
                window: 'readonly',
                document: 'readonly',
                console: 'readonly',
                setTimeout: 'readonly',
                clearTimeout: 'readonly',
                CustomEvent: 'readonly',
                Intl: 'readonly'
            }
        }
    }
];
