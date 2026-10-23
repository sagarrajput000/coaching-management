import { CalendarCheck, Contact, GraduationCap, LayoutGrid, Menu as MenuIcon, ReceiptText, Search, Settings, X } from 'lucide-react'
import { useEffect, useState } from 'react'
import { NavLink, Outlet, useLocation } from 'react-router'

import { useMe } from '../lib/api'
import { cx } from '../lib/cx'
import { CommandPalette } from './CommandPalette'
import { Avatar } from './ui'

const links = [
  { to: '/', label: 'Overview', icon: LayoutGrid, end: true },
  { to: '/students', label: 'Students', icon: Contact },
  { to: '/attendance', label: 'Attendance', icon: CalendarCheck },
  { to: '/fees', label: 'Fees', icon: ReceiptText },
  { to: '/batches', label: 'Batches', icon: GraduationCap },
]

export function Shell() {
  const { data: me } = useMe()
  const [paletteOpen, setPaletteOpen] = useState(false)
  const [mobileOpen, setMobileOpen] = useState(false)
  const location = useLocation()

  useEffect(() => setMobileOpen(false), [location.pathname])

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault()
        setPaletteOpen((v) => !v)
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  const isMac = typeof navigator !== 'undefined' && /Mac|iPhone|iPad/.test(navigator.platform)

  const sidebar = (
    <div className="flex h-full flex-col px-3 py-3">
      <div className="flex h-10 items-center gap-2.5 px-2">
        <span className="grid size-7 place-items-center rounded-[9px] bg-fg text-white">
          <svg viewBox="0 0 24 24" className="size-4" fill="currentColor" aria-hidden>
            <path d="M4 17.5V9l8-4.5 8 4.5v8.5a1.5 1.5 0 0 1-1.5 1.5h-13A1.5 1.5 0 0 1 4 17.5z" opacity="0.25" />
            <path d="M3 8.2 12 3l9 5.2-.9 1.6L12 5.2 3.9 9.8z" />
            <path d="M8.6 18.5v-4.1a1.4 1.4 0 0 1 1.4-1.4h4a1.4 1.4 0 0 1 1.4 1.4v4.1z" />
          </svg>
        </span>
        <span className="truncate text-[14px] font-semibold tracking-tight">{me?.workspace.name ?? 'Your Coaching Center'}</span>
      </div>

      <button
        type="button"
        onClick={() => setPaletteOpen(true)}
        className="mt-3 flex h-9 items-center gap-2 rounded-control border border-line-strong bg-surface px-2.5 text-[13px] text-muted shadow-[0_1px_1px_rgb(20_20_24/0.04)] transition-colors hover:bg-surface-2"
      >
        <Search className="size-4" />
        <span className="flex-1 text-left">Search</span>
        <kbd className="rounded-[6px] border border-line bg-bg px-1.5 py-0.5 font-sans text-[11px] text-faint">{isMac ? '⌘' : 'Ctrl'} K</kbd>
      </button>

      <nav className="mt-4 flex flex-col gap-0.5">
        {links.map(({ to, label, icon: Icon, end }) => (
          <NavLink
            key={to}
            to={to}
            end={end}
            className={({ isActive }) =>
              cx(
                'flex h-9 items-center gap-2.5 rounded-control px-2.5 text-[13.5px] font-medium transition-colors',
                isActive ? 'bg-surface text-fg shadow-card' : 'text-muted hover:bg-raised/60 hover:text-fg',
              )
            }
          >
            <Icon className="size-4" />
            {label}
          </NavLink>
        ))}
      </nav>

      <div className="mt-auto flex flex-col gap-0.5">
        <NavLink
          to="/settings"
          className={({ isActive }) =>
            cx(
              'flex h-9 items-center gap-2.5 rounded-control px-2.5 text-[13.5px] font-medium transition-colors',
              isActive ? 'bg-surface text-fg shadow-card' : 'text-muted hover:bg-raised/60 hover:text-fg',
            )
          }
        >
          <Settings className="size-4" />
          Settings
        </NavLink>
        {me && (
          <NavLink to="/settings" className="mt-1 flex items-center gap-2.5 rounded-control px-2 py-2 transition-colors hover:bg-raised/60">
            <Avatar name={me.user.name ?? me.user.email ?? 'You'} hue={210} src={me.user.picture} size={28} />
            <span className="min-w-0">
              <span className="block truncate text-[13px] font-medium">{me.user.name ?? 'Signed in'}</span>
              {me.user.email && <span className="block truncate text-[11.5px] text-faint">{me.user.email}</span>}
            </span>
          </NavLink>
        )}
      </div>
    </div>
  )

  return (
    <div className="flex h-full">
      <aside className="hidden w-[236px] shrink-0 lg:block">{sidebar}</aside>

      {/* Mobile top bar */}
      <div className="fixed inset-x-0 top-0 z-30 flex h-12 items-center justify-between border-b border-line bg-bg/90 px-3 backdrop-blur lg:hidden">
        <button type="button" aria-label="Open menu" onClick={() => setMobileOpen(true)} className="grid size-9 place-items-center rounded-control">
          <MenuIcon className="size-5" />
        </button>
        <span className="text-[14px] font-semibold">{me?.workspace.name ?? 'Your Coaching Center'}</span>
        <button type="button" aria-label="Search" onClick={() => setPaletteOpen(true)} className="grid size-9 place-items-center rounded-control">
          <Search className="size-5" />
        </button>
      </div>
      {mobileOpen && (
        <div className="fixed inset-0 z-40 lg:hidden" onClick={() => setMobileOpen(false)}>
          <div className="absolute inset-0 bg-fg/20" />
          <aside className="absolute inset-y-0 left-0 w-[280px] bg-bg shadow-dialog" onClick={(e) => e.stopPropagation()}>
            <button type="button" aria-label="Close menu" onClick={() => setMobileOpen(false)} className="absolute right-3 top-3 grid size-9 place-items-center rounded-control">
              <X className="size-5" />
            </button>
            {sidebar}
          </aside>
        </div>
      )}

      <main className="min-w-0 flex-1 pt-12 lg:p-2 lg:pl-0 lg:pt-2">
        <div className="scrollbar-thin h-full overflow-y-auto bg-surface lg:rounded-card lg:border lg:border-line">
          <Outlet />
        </div>
      </main>

      <CommandPalette open={paletteOpen} onClose={() => setPaletteOpen(false)} />
    </div>
  )
}
