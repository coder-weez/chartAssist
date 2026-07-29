const js = require('@eslint/js');
const globals = require('globals');
const prettier = require('eslint-config-prettier');

// Helpers defined in chartassist.js and consumed by the page*.js content scripts
// (they all share the same content-script global scope at runtime).
const caHelpers = {
    caFill: 'readonly',
    caFillPopup: 'readonly',
    caFillPertNeg: 'readonly',
    caPertNegFields: 'readonly',
    caPertNegCatalog: 'readonly',
    caPertNegCatalogs: 'writable',
    caClrField: 'readonly',
    caClrPopup: 'readonly',
    caClrPertNeg: 'readonly',
    caToast: 'readonly',
    caFlash: 'readonly',
    caToolbar: 'readonly',
    caOnPage: 'readonly',
    caActive: 'readonly',
    caHealthCheck: 'readonly',
    caMakeDraggable: 'readonly',
    caSavePosition: 'readonly',
    caRestorePosition: 'readonly',
};

module.exports = [
    { ignores: ['src/jquery.min.js', 'build/**', 'node_modules/**'] },
    {
        files: ['src/**/*.js'],
        languageOptions: {
            ecmaVersion: 2022,
            sourceType: 'script',
            // `module` is for the CommonJS test-export shim at each file's end.
            globals: { ...globals.browser, ...globals.webextensions, module: 'readonly' },
        },
        rules: {
            ...js.configs.recommended.rules,
            ...prettier.rules,
            // Pragmatic: surface real problems, not style (Prettier owns style).
            'no-unused-vars': ['warn', { args: 'none', caughtErrors: 'none' }],
            'no-prototype-builtins': 'off',
        },
    },
    // Content scripts run with the vendored jQuery available.
    {
        files: ['src/chartassist.js', 'src/page*.js'],
        languageOptions: { globals: { jQuery: 'readonly', $: 'readonly' } },
    },
    // chartassist.js defines the ca* helper API consumed by the page scripts,
    // so those top-level definitions read as "unused" within this file — ignore
    // the ca-prefixed names here (genuine unused locals are still reported).
    {
        files: ['src/chartassist.js'],
        rules: {
            'no-unused-vars': [
                'warn',
                { args: 'none', caughtErrors: 'none', varsIgnorePattern: '^ca' },
            ],
        },
    },
    // Page scripts additionally consume the helpers defined in chartassist.js.
    {
        files: ['src/page*.js'],
        languageOptions: { globals: { ...caHelpers } },
    },
];
