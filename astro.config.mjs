// @ts-check
import { defineConfig } from 'astro/config';
import tailwindcss from '@tailwindcss/vite';
import icon from 'astro-icon';

import {Swiper, SwiperSlide} from 'swiper/react';


import react from '@astrojs/react';


// https://astro.build/config
export default defineConfig({
  site: 'https://yashnilay.ca',
  vite: { plugins: [tailwindcss()] },
  integrations: [react(), icon()], 
});