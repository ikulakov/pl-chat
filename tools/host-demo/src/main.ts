import './main.css'
import { ChatSDK } from '@bankchat/loader'

const log = document.getElementById('log')!

function append(msg: string): void {
  const line = document.createElement('div')
  line.textContent = `${new Date().toISOString().slice(11, 19)} ${msg}`
  log.appendChild(line)
}

append('BankChat Demo Host')

ChatSDK.init({
  chatUrl: 'http://localhost:5174',
})

const fab = document.getElementById('fab')!
const fabBadge = document.getElementById('fab-badge')!

ChatSDK.on('INIT_ACK', () => {
  append('← INIT_ACK (handshake complete)')
})
ChatSDK.on('OPENED', () => {
  append('← OPENED')
  fab.setAttribute('aria-expanded', 'true')
})
ChatSDK.on('CLOSED', () => {
  append('← CLOSED')
  fab.setAttribute('aria-expanded', 'false')
  fabBadge.style.display = 'none'
})

fab.addEventListener('click', () => {
  append('→ toggle() [FAB]')
  ChatSDK.toggle()
})

document.getElementById('btn-open')?.addEventListener('click', () => {
  append('→ open()')
  ChatSDK.open()
})
document.getElementById('btn-close')?.addEventListener('click', () => {
  append('→ close()')
  ChatSDK.close()
})
document.getElementById('btn-toggle')?.addEventListener('click', () => {
  append('→ toggle()')
  ChatSDK.toggle()
})
