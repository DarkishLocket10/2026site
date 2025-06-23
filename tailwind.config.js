import aspect from '@tailwindcss/aspect-ratio';


export default {
  darkMode: 'class',
  content: ['./src/**/*.{astro,jsx,js,ts,mdx,tsx}','./public/**/*.html',],
  theme: { extend: {} },
  plugins: [aspect],
};
