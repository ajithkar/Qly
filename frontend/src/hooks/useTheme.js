import { useCallback, useEffect, useState } from 'react';

const KEY = 'qly.theme';

/** Dark mode, persisted, defaulting to the operating system preference. */
export function useTheme() {
  const [theme, setTheme] = useState(
    () =>
      localStorage.getItem(KEY) ||
      (window.matchMedia?.('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'),
  );

  useEffect(() => {
    document.documentElement.classList.toggle('dark', theme === 'dark');
    localStorage.setItem(KEY, theme);
  }, [theme]);

  const toggle = useCallback(
    () => setTheme((current) => (current === 'dark' ? 'light' : 'dark')),
    [],
  );

  return { theme, toggle };
}
