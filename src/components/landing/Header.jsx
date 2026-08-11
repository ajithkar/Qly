import { useState } from 'react';
import { Link } from 'react-router-dom';
import { Menu, Moon, Sun, X } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { useTheme } from '@/hooks/useTheme';
import logoIcon from '@/assets/logo-icon.png';

export function Header() {
  const { theme, toggle } = useTheme();
  const [menuOpen, setMenuOpen] = useState(false);

  return (
    <header className="sticky top-0 z-40 border-b border-line bg-surface/90 backdrop-blur">
      <div className="mx-auto flex h-16 max-w-6xl items-center justify-between px-4 sm:px-6">
        <Link to="/" className="flex items-center gap-2">
          <img src={logoIcon} alt="" className="h-8 w-8" />
          <span className="text-base font-semibold tracking-tight text-ink">Qly</span>
        </Link>

        <nav className="hidden items-center gap-6 md:flex">
          <a href="#for-clinics" className="text-sm text-secondary hover:text-ink">
            For clinics
          </a>
          <Link to="/login" className="text-sm text-secondary hover:text-ink">
            Sign in
          </Link>
          <Link to="/find">
            <Button size="sm" className="min-h-11">Join a queue</Button>
          </Link>
          <button
            type="button"
            onClick={toggle}
            aria-label={theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'}
            className="flex h-11 w-11 items-center justify-center rounded-button text-secondary hover:bg-paper hover:text-ink"
          >
            {theme === 'dark' ? (
              <Sun className="h-5 w-5" aria-hidden="true" />
            ) : (
              <Moon className="h-5 w-5" aria-hidden="true" />
            )}
          </button>
        </nav>

        <div className="flex items-center gap-2 md:hidden">
          <button
            type="button"
            onClick={toggle}
            aria-label={theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'}
            className="flex h-11 w-11 items-center justify-center rounded-button text-secondary hover:bg-paper hover:text-ink"
          >
            {theme === 'dark' ? (
              <Sun className="h-5 w-5" aria-hidden="true" />
            ) : (
              <Moon className="h-5 w-5" aria-hidden="true" />
            )}
          </button>
          <button
            type="button"
            aria-label={menuOpen ? 'Close menu' : 'Open menu'}
            aria-expanded={menuOpen}
            onClick={() => setMenuOpen((open) => !open)}
            className="flex h-11 w-11 items-center justify-center rounded-button text-ink"
          >
            {menuOpen ? <X className="h-5 w-5" aria-hidden="true" /> : <Menu className="h-5 w-5" aria-hidden="true" />}
          </button>
        </div>
      </div>

      {menuOpen && (
        <div className="border-t border-line px-4 py-3 md:hidden">
          <div className="flex flex-col gap-1">
            <a
              href="#for-clinics"
              onClick={() => setMenuOpen(false)}
              className="flex min-h-11 items-center text-sm text-secondary hover:text-ink"
            >
              For clinics
            </a>
            <Link
              to="/login"
              onClick={() => setMenuOpen(false)}
              className="flex min-h-11 items-center text-sm text-secondary hover:text-ink"
            >
              Sign in
            </Link>
            <Link to="/find" onClick={() => setMenuOpen(false)} className="mt-2">
              <Button className="min-h-11 w-full">Join a queue</Button>
            </Link>
          </div>
        </div>
      )}
    </header>
  );
}
