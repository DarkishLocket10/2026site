// @ts-check
import { defineConfig } from 'astro/config';
import tailwindcss from '@tailwindcss/vite';
import icon from 'astro-icon';
import remarkMath from 'remark-math';
import rehypeKatex from 'rehype-katex';

import react from '@astrojs/react';


import mdx from '@astrojs/mdx';


// https://astro.build/config
export default defineConfig({
  site: 'https://yashnilay.ca',
  vite: { plugins: [tailwindcss()] },
  integrations: [react(), icon(), mdx()],
  markdown: {
    remarkPlugins: [remarkMath],
    rehypePlugins: [rehypeKatex],
  },
});