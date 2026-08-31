import { defineConfig } from 'vitepress';

export default defineConfig({
    title: 'Phalanx',
    description:
        'Opinionated REST + Auth foundation for Vue 3 admin panels. Declare the domain once; the services, queries, mutations and actions derive from it.',
    lastUpdated: true,
    cleanUrls: true,

    // GitHub Pages serves this from /phalanx/. Set DOCS_BASE=/ when a custom
    // domain serves it from the root — otherwise every asset resolves to a 404.
    base: process.env.DOCS_BASE ?? '/phalanx/',

    themeConfig: {
        nav: [
            { text: 'Guide', link: '/guide/getting-started' },
            { text: 'Concepts', link: '/concepts/why-phalanx' },
            { text: 'Reference', link: '/reference/api' }
        ],

        sidebar: [
            {
                text: 'Guide',
                items: [
                    { text: 'Getting started', link: '/guide/getting-started' },
                    { text: 'Configuration', link: '/guide/configuration' },
                    { text: 'Services', link: '/guide/services' },
                    { text: 'Queries and mutations', link: '/guide/queries-and-mutations' },
                    { text: 'Actions', link: '/guide/actions' },
                    { text: 'Authentication', link: '/guide/authentication' },
                    { text: 'Field encryption', link: '/guide/field-encryption' }
                ]
            },
            {
                text: 'Concepts',
                items: [
                    { text: 'Why Phalanx', link: '/concepts/why-phalanx' },
                    { text: 'The auth model', link: '/concepts/auth-model' },
                    { text: 'Backend contract', link: '/concepts/backend-contract' }
                ]
            },
            {
                text: 'Reference',
                items: [{ text: 'Public API', link: '/reference/api' }]
            }
        ],

        socialLinks: [{ icon: 'github', link: 'https://github.com/Arex95/phalanx' }],

        search: { provider: 'local' },

        footer: {
            message: 'Released under the MIT License.',
            copyright: 'Built by Arex Forge'
        }
    }
});
