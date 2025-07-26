# 2026 Portfolio Site &nbsp;![Astro](https://img.shields.io/badge/Built%20with-Astro-ff5d01?logo=astro&logoColor=white)

A fast, accessible, and fully‑responsive portfolio, showcasing projects, experience, and photography.

&nbsp;  
[Live Site](https://yashnilay.ca/) | [Report Issue](../../issues)

---

## ✨ Features

| Feature | Notes |
|---------|-------|
| **Astro Islands architecture** | Static HTML with partial hydration for snappy page loads. |
| **Tailwind CSS design system** | Utility‑first classes + custom theme for rapid iteration. |
| **Automatic dark / light mode** | Follows user preference with a toggle in the nav. |
| **Projects & Resume sections** | MD/MDX‑driven content for easy updates. |
| **Photography carousel** | Swiper‑powered slider fed by my self‑hosted Piwigo gallery. |
| **SEO‑ready** | Clean metadata and Open Graph tags for rich link previews. |
| **CI + CD** | GitHub Actions deploy to **GitHub Pages / Cloudflare Pages** (configured in `.github/workflows`). |

---

## 🚀 Quick start

> Requires **Node ≥ 18** and **npm** (or pnpm/yarn).

```bash
# 1) Clone
git clone https://github.com/DarkishLocket10/2026site.git
cd 2026site

# 2) Install deps
npm install

# 3) Develop locally
npm run dev         # http://localhost:4321

# 4) Production build + preview
npm run build
npm run preview
