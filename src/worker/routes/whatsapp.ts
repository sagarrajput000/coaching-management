import { Hono } from 'hono'
import { privateJson } from '../auth'
import type { AppContext } from '../env'

export const whatsapp = new Hono<AppContext>()

// Generate a WhatsApp message URL for a phone number and optional text
whatsapp.get('/send', async (c) => {
  const phone = c.req.query('phone') ?? ''
  const text = c.req.query('text') ?? ''
  // Strip non-digit characters except +
  const cleanPhone = phone.replace(/[^\d+]/g, '')
  if (!cleanPhone) return c.json({ error: 'Phone number is required.' }, 400)
  const whatsappUrl = `https://wa.me/${cleanPhone}?text=${encodeURIComponent(text)}`
  return privateJson(c, { whatsappUrl })
})

// Send a WhatsApp message (POST) - for future API integration
// This endpoint accepts a phone and message and can be extended to use
// a WhatsApp Business API provider. For now it returns the URL.
whatsapp.post('/send', async (c) => {
  const { phone, message } = await c.req.json()
  const cleanPhone = phone.replace(/[^\d+]/g, '')
  if (!cleanPhone) return c.json({ error: 'Phone number is required.' }, 400)
  const whatsappUrl = `https://wa.me/${cleanPhone}?text=${encodeURIComponent(message ?? '')}`
  return privateJson(c, { whatsappUrl })
})