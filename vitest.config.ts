import { playwright } from '@vitest/browser-playwright';
import { defineConfig, mergeConfig } from 'vitest/config';
import viteConfig from './vite.config.ts';

export default mergeConfig(
    viteConfig,
    defineConfig({
        test: {
            include: ['test/**/*.browser.test.ts'],
            passWithNoTests: false,
            testTimeout: 30000,
            browser: {
                enabled: true,
                headless: true,
                provider: playwright(),
                instances: [{ browser: 'chromium', viewport: { width: 1400, height: 900 } }]
            }
        }
    })
);
