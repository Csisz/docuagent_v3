import { useEffect, useCallback, useState } from 'react'
import { api } from '../services/api'
import { useStore } from '../store'

export function useDashboard() {
  const { setDashData, setLive } = useStore()

  const load = useCallback(async () => {
    setLive('loading', '')
    try {
      const d = await api.dashboard()
      setDashData(d)
      setLive('ok', new Date().toLocaleTimeString('hu-HU', { hour: '2-digit', minute: '2-digit' }))
      return d
    } catch {
      setLive('error', '')
      return null
    }
  }, [setDashData, setLive])

  useEffect(() => {
    load()
    const t = setInterval(load, 60000)
    return () => clearInterval(t)
  }, [load])

  return { reload: load }
}

// ── FIX: health stores result in dedicated store field ────────
export function useHealth() {
  const { setHealth } = useStore()

  useEffect(() => {
    const check = async () => {
      try {
        const h = await api.health()
        setHealth(h)
      } catch {
        setHealth(null)
      }
    }
    check()
    const t = setInterval(check, 30000)
    return () => clearInterval(t)
  }, [setHealth])
}

export function useEmails() {
  const { emailFilter, setEmails } = useStore()

  const load = useCallback(async (filter) => {
    try {
      const d = await api.emails(filter ?? emailFilter)
      setEmails(d.emails || [], d.total || 0)
    } catch {}
  }, [emailFilter, setEmails])

  return { load }
}

export function useToast() {
  const show = useCallback((msg, type = 'ok', ms = 3500) => {
    const el = document.getElementById('toast-root')
    if (!el) return
    el.textContent = msg
    el.className = `toast-visible toast-${type}`
    clearTimeout(el._t)
    el._t = setTimeout(() => { el.className = '' }, ms)
  }, [])
  return show
}
