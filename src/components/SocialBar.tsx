import { Linkedin, Github, Twitter, Instagram, Youtube, Mail } from 'lucide-react';
import type { JSX } from 'react';

export default function SocialBar({ size = 24 }: { size?: number }): JSX.Element {
  const common = 'text-[color:var(--text)]/70 hover:text-[color:var(--text)] transition-colors';
  return (
    <section className="mx-auto max-w-7xl px-6 py-12 flex items-center justify-between">
      <ul className="flex gap-6">
        <li><a href="https://linkedin.com/in/yash-n-patel/" className={common}><Linkedin  size={size} /></a></li>
        <li><a href="https://github.com/yourname"            className={common}><Github    size={size} /></a></li>
        <li><a href="https://twitter.com/yourname"           className={common}><Twitter   size={size} /></a></li>
        <li><a href="https://instagram.com/yourname"         className={common}><Instagram size={size} /></a></li>
        <li><a href="https://youtube.com/@yourname"          className={common}><Youtube   size={size} /></a></li>
      </ul>

      <a
        href="/contact"
        className="inline-flex items-center gap-2 font-semibold rounded-full px-6 py-2
                   bg-[color:var(--text)] text-[color:var(--bg)]
                   hover:bg-transparent hover:text-[color:var(--text)]
                   hover:ring-2 ring-[color:var(--text)] transition-all"
      >
        <Mail size={size} aria-hidden="true" /> Contact
      </a>
    </section>
  );
}
