// src/components/Hero.tsx
import { useEffect, useRef } from 'react';
import SocialBar from './SocialBar';           // React SocialBar
import type { JSX } from 'react';

interface Props {
  title: string;
  subtitle: string;
  description: string;
  image: string;          // e.g. "/images/hero.jpg" (served from /public)
  alt: string;
  iconSize?: number;      // optional, defaults to 6
}

export default function Hero({
  title,
  subtitle,
  description,
  image,
  alt,
  iconSize = 6,
}: Props): JSX.Element {
  /* ---------- parallax tilt on hover ---------- */
  const figRef = useRef<HTMLElement | null>(null);

  useEffect(() => {
    const fig = figRef.current;
    if (!fig) return;
    const img = fig.querySelector('img')!;
    const range = 12;

    const handleMove = (e: MouseEvent) => {
      const r = fig.getBoundingClientRect();
      const x = e.clientX - r.left - r.width / 2;
      const y = e.clientY - r.top - r.height / 2;
      const rx = (-y / (r.height / 1.5)) * range;
      const ry = (x / (r.width / 1.5)) * range;
      img.style.transform = `rotateX(${rx}deg) rotateY(${ry}deg) scale(1.05)`;
    };
    const reset = () => (img.style.transform = 'rotateX(0) rotateY(0) scale(1)');

    fig.addEventListener('mousemove', handleMove);
    fig.addEventListener('mouseleave', reset);
    return () => {
      fig.removeEventListener('mousemove', handleMove);
      fig.removeEventListener('mouseleave', reset);
    };
  }, []);

  return (
    <section
      id="hero"
      className="mx-auto max-w-7xl px-6 py-24 md:grid md:grid-cols-2 md:gap-12 items-center"
    >
      {/* ---------- Left column: text + socials ---------- */}
      <div className="space-y-6">
        <h1
          data-fade
          className="
            text-5xl font-extrabold leading-tight text-[color:var(--text)]
            opacity-0 -translate-x-6
            transition-all duration-700 ease-out
            motion-reduce:opacity-100 motion-reduce:translate-x-0
          "
        >
          {title}
        </h1>

        <h2
          data-fade
          className="
            text-4xl font-semibold text-[color:var(--text)]/80
            opacity-0 -translate-x-6
            transition-all duration-700 ease-out delay-100
            motion-reduce:opacity-100 motion-reduce:translate-x-0
          "
        >
          {subtitle}
        </h2>

        <p
          data-fade
          className="
            text-lg text-[color:var(--text)]/70
            opacity-0 -translate-x-6
            transition-all duration-700 ease-out delay-200
            motion-reduce:opacity-100 motion-reduce:translate-x-0
          "
        >
          {description}
        </p>

        {/* Social icons row */}
        <SocialBar size={iconSize} />
      </div>

      {/* ---------- Right column: photo ---------- */}
      <figure
        ref={figRef}
        data-fade
        style={{ perspective: 1200 }}
        className="
          mt-10 md:mt-0 relative
          opacity-0 translate-y-6
          transition-all duration-700 ease-out delay-300
          motion-reduce:opacity-100 motion-reduce:translate-y-0
        "
      >
        <img
          src={image}
          alt={alt}
          loading="lazy"
          className="
            w-full rounded-3xl object-cover
            transition-transform duration-200 ease-out
            will-change-transform
          "
        />
      </figure>
    </section>
  );
}
