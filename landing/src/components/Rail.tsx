import { useEffect, useState } from 'react';

// Sticky slim progress rail: anchor links for each beat, aria-current on the beat in view.
const BEATS = [
  { id: 'top', label: 'Overview' },
  { id: 'meaning', label: 'The core idea' },
  { id: 'proof', label: 'Evidence' },
  { id: 'parts', label: 'Parts' },
  { id: 'fit', label: 'How parts fit' },
  { id: 'build', label: 'Building' },
  { id: 'operate', label: 'Agents at work' },
  { id: 'extend', label: 'Extension' },
  { id: 'start', label: 'Your turn' },
] as const;

export default function Rail() {
  const [current, setCurrent] = useState<string>('top');

  useEffect(() => {
    const observer = new IntersectionObserver(
      (entries) => {
        const visible = entries.filter((e) => e.isIntersecting).sort((a, b) => b.intersectionRatio - a.intersectionRatio);
        if (visible[0]) setCurrent(visible[0].target.id);
      },
      { rootMargin: '-45% 0px -45% 0px' },
    );
    BEATS.forEach((b) => {
      const el = document.getElementById(b.id);
      if (el) observer.observe(el);
    });
    return () => observer.disconnect();
  }, []);

  return (
    <nav className="rail" aria-label="Page sections">
      <ol>
        {BEATS.map((b) => (
          <li key={b.id}>
            <a href={`#${b.id}`} aria-current={current === b.id ? 'step' : undefined}>
              {b.label}
            </a>
          </li>
        ))}
      </ol>
    </nav>
  );
}
