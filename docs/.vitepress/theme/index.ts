import DefaultTheme from 'vitepress/theme';

// Self-hosted rather than pulled from a font CDN. On a public site that also
// means no third-party request carrying a reader's IP on every page load.
import '@fontsource-variable/inter';
import '@fontsource-variable/space-grotesk';

import './brand.css';

export default DefaultTheme;
