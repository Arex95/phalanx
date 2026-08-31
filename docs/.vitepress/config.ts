import { defineConfig } from 'vitepress';
import { arexDark, arexLight } from './theme/code';

export default defineConfig({
    title: 'Phalanx',
    description:
        'Opinionated REST + Auth foundation for Vue 3 admin panels. Declare the domain once; the services, queries, mutations and actions derive from it.',
    lastUpdated: true,
    cleanUrls: true,

    // GitHub Pages serves this from /phalanx/. Set DOCS_BASE=/ when a custom
    // domain serves it from the root — otherwise every asset resolves to a 404.
    base: process.env.DOCS_BASE ?? '/phalanx/',

    // The default GitHub themes bring seven hues of their own, one of them a
    // second orange that competes with the brand accent. See theme/code.ts.
    markdown: {
        theme: { light: arexLight, dark: arexDark }
    },

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
                    { text: 'Session handling', link: '/concepts/session' },
                    { text: 'Server requirements', link: '/concepts/server-requirements' }
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
