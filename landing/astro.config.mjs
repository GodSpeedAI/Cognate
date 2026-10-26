// @ts-check
import { defineConfig } from 'astro/config';
import react from '@astrojs/react';

export default defineConfig({
  site: 'https://cognate.gspeedai.com',
  output: 'static',
  integrations: [react()],
  devToolbar: { enabled: false },
});
