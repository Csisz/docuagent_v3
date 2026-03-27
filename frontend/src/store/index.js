import { create } from 'zustand'

export const useStore = create((set, get) => ({
  // Data
  dashData:  null,
  health:    null,   // ← new: separate health state
  emails:    [],
  emailTotal: 0,
  emailFilter: null,

  // UI state
  mobileNavOpen: false,
  theme: localStorage.getItem('da-theme') || 'dark',

  // Status
  liveStatus: 'loading',
  liveTime: '',

  // Actions
  setDashData:    (d)  => set({ dashData: d }),
  setHealth:      (h)  => set({ health: h }),          // ← new
  setEmails:      (e, total) => set({ emails: e, emailTotal: total }),
  setEmailFilter: (f)  => set({ emailFilter: f }),
  setLive:        (s, t) => set({ liveStatus: s, liveTime: t }),
  toggleMobileNav: ()  => set(s => ({ mobileNavOpen: !s.mobileNavOpen })),
  closeMobileNav: ()   => set({ mobileNavOpen: false }),

  setTheme: (t) => {
    localStorage.setItem('da-theme', t)
    document.documentElement.setAttribute('data-theme', t)
    set({ theme: t })
  },
  toggleTheme: () => {
    const next = get().theme === 'dark' ? 'light' : 'dark'
    get().setTheme(next)
  },

  updateEmailStatus: (id, status) => set(s => ({
    emails: s.emails.map(e => e.id === id ? { ...e, status } : e)
  })),

  deleteEmail: (id) => set(s => ({
    emails: s.emails.filter(e => e.id !== id),
    emailTotal: Math.max(0, s.emailTotal - 1)
  })),
}))
