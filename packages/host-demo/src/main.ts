import { ChatSDK } from '@bankchat/loader'

const log = document.getElementById('log')!
const append = (msg: string) => {
  log.textContent += `\n${new Date().toISOString().slice(11, 19)} ${msg}`
}

append(`ChatSDK v${ChatSDK.version} loaded (stage 1 stub)`)

document.getElementById('btn-open')?.addEventListener('click', () =>
  append('open — implemented in stage 2'),
)
document.getElementById('btn-close')?.addEventListener('click', () =>
  append('close — implemented in stage 2'),
)
document.getElementById('btn-toggle')?.addEventListener('click', () =>
  append('toggle — implemented in stage 2'),
)
