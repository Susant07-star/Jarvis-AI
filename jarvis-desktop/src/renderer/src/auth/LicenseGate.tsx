import { useState, useEffect } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { RiShieldFlashLine, RiKeyLine, RiCheckboxCircleLine, RiErrorWarningLine, RiExternalLinkLine, RiRefreshLine } from 'react-icons/ri'

interface LicenseGateProps {
  onActivated: () => void
}

type Screen = 'checking' | 'unlicensed' | 'activating' | 'error' | 'mismatch'

const LicenseGate = ({ onActivated }: LicenseGateProps) => {
  const [screen, setScreen] = useState<Screen>('checking')
  const [key, setKey] = useState('')
  const [hwid, setHwid] = useState('')
  const [message, setMessage] = useState('')
  const [isLoading, setIsLoading] = useState(false)

  useEffect(() => {
    checkLicense()
  }, [])

  const checkLicense = async () => {
    setScreen('checking')
    try {
      const result = await window.electron.ipcRenderer.invoke('license:check')
      if (result.status === 'licensed') {
        onActivated()
      } else if (result.status === 'hwid_mismatch') {
        setHwid(result.hwid)
        setScreen('mismatch')
      } else {
        setHwid(result.hwid)
        setScreen('unlicensed')
      }
    } catch {
      setScreen('unlicensed')
    }
  }

  const activateLicense = async () => {
    if (!key.trim()) return
    setIsLoading(true)
    setMessage('')
    try {
      const result = await window.electron.ipcRenderer.invoke('license:activate', key)
      if (result.success) {
        setScreen('checking')
        setTimeout(onActivated, 800)
      } else {
        setMessage(result.message)
        setIsLoading(false)
      }
    } catch {
      setMessage('Activation failed. Please try again.')
      setIsLoading(false)
    }
  }

  const formatKey = (value: string) => {
    const clean = value.replace(/[^A-Z0-9a-z]/g, '').toUpperCase()
    return clean.match(/.{1,4}/g)?.join('-') ?? clean
  }

  return (
    <div className="h-screen w-screen bg-[#030303] flex items-center justify-center overflow-hidden relative select-none">
      {/* Ambient background glow */}
      <div className="absolute inset-0 pointer-events-none">
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[600px] h-[600px] rounded-full bg-emerald-500/5 blur-3xl" />
        <div className="absolute top-0 right-0 w-[300px] h-[300px] rounded-full bg-cyan-500/3 blur-3xl" />
      </div>

      {/* Scanline overlay */}
      <div className="absolute inset-0 pointer-events-none opacity-[0.03]"
        style={{ backgroundImage: 'repeating-linear-gradient(0deg, transparent, transparent 2px, rgba(255,255,255,0.8) 2px, rgba(255,255,255,0.8) 4px)' }}
      />

      <AnimatePresence mode="wait">

        {/* ── CHECKING ─────────────────────────────── */}
        {screen === 'checking' && (
          <motion.div key="checking"
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            className="flex flex-col items-center gap-4"
          >
            <RiShieldFlashLine className="text-5xl text-emerald-500 animate-pulse" />
            <p className="text-emerald-400 font-mono text-xs tracking-[0.3em] uppercase">
              Verifying License...
            </p>
          </motion.div>
        )}

        {/* ── UNLICENSED / ACTIVATE ─────────────────── */}
        {(screen === 'unlicensed' || screen === 'activating') && (
          <motion.div key="activate"
            initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -20 }}
            transition={{ duration: 0.4, ease: 'easeOut' }}
            className="w-full max-w-md px-4"
          >
            <div className="bg-black/60 backdrop-blur-2xl border border-white/8 rounded-2xl shadow-2xl overflow-hidden">

              {/* Header */}
              <div className="p-6 border-b border-white/5 flex items-center gap-4">
                <div className="p-3 rounded-xl bg-emerald-500/10 border border-emerald-500/20">
                  <RiShieldFlashLine className="text-2xl text-emerald-400" />
                </div>
                <div>
                  <h1 className="text-white font-bold text-lg tracking-wide">J.A.R.V.I.S.</h1>
                  <p className="text-emerald-500/60 font-mono text-[10px] tracking-[0.2em] uppercase">License Verification Required</p>
                </div>
              </div>

              {/* Body */}
              <div className="p-6 flex flex-col gap-5">
                <p className="text-zinc-400 text-sm leading-relaxed">
                  Enter your license key to activate J.A.R.V.I.S. on this machine.
                  Each key is locked to one PC — your key cannot be used on another computer.
                </p>

                {/* Key Input */}
                <div className="flex flex-col gap-2">
                  <label className="text-[10px] font-mono tracking-widest text-zinc-500 uppercase">License Key</label>
                  <div className="relative">
                    <RiKeyLine className="absolute left-3 top-1/2 -translate-y-1/2 text-emerald-500/50 text-lg" />
                    <input
                      value={key}
                      onChange={e => setKey(formatKey(e.target.value))}
                      onKeyDown={e => e.key === 'Enter' && activateLicense()}
                      placeholder="XXXX-XXXX-XXXX-XXXX"
                      maxLength={19}
                      spellCheck={false}
                      className="w-full pl-10 pr-4 py-3 bg-zinc-900/60 border border-white/8 rounded-xl text-emerald-300 font-mono text-sm tracking-widest placeholder:text-zinc-700 focus:outline-none focus:border-emerald-500/40 focus:ring-1 focus:ring-emerald-500/20 transition-all"
                    />
                  </div>
                </div>

                {/* Error message */}
                <AnimatePresence>
                  {message && (
                    <motion.div
                      initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} exit={{ opacity: 0, height: 0 }}
                      className="flex items-center gap-2 text-red-400 text-xs font-mono p-3 bg-red-500/10 border border-red-500/20 rounded-lg"
                    >
                      <RiErrorWarningLine className="text-base shrink-0" />
                      {message}
                    </motion.div>
                  )}
                </AnimatePresence>

                {/* Activate Button */}
                <button
                  onClick={activateLicense}
                  disabled={isLoading || key.length < 4}
                  className="cursor-pointer w-full py-3 rounded-xl bg-emerald-500 hover:bg-emerald-400 disabled:bg-zinc-800 disabled:text-zinc-600 text-black font-bold text-sm tracking-widest transition-all duration-200 flex items-center justify-center gap-2"
                >
                  {isLoading ? (
                    <><RiRefreshLine className="animate-spin" /> Activating...</>
                  ) : (
                    <><RiCheckboxCircleLine /> Activate J.A.R.V.I.S.</>
                  )}
                </button>

                {/* Purchase Link */}
                <div className="text-center">
                  <a
                    onClick={() => window.electron.ipcRenderer.send('open-external', 'https://github.com/Susant07-star/Jarvis-AI')}
                    className="cursor-pointer text-[10px] font-mono text-zinc-600 hover:text-emerald-500 transition-colors flex items-center justify-center gap-1"
                  >
                    <RiExternalLinkLine /> Don't have a key? Get J.A.R.V.I.S. →
                  </a>
                </div>

                {/* HWID for support */}
                {hwid && (
                  <div className="text-center">
                    <p className="text-[9px] font-mono text-zinc-700">
                      Machine ID: <span className="text-zinc-600">{hwid}</span>
                    </p>
                  </div>
                )}
              </div>
            </div>
          </motion.div>
        )}

        {/* ── HWID MISMATCH ─────────────────────────── */}
        {screen === 'mismatch' && (
          <motion.div key="mismatch"
            initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -20 }}
            className="w-full max-w-md px-4"
          >
            <div className="bg-black/60 backdrop-blur-2xl border border-red-500/20 rounded-2xl p-6 flex flex-col gap-4 items-center text-center">
              <RiErrorWarningLine className="text-5xl text-red-400" />
              <h2 className="text-white font-bold text-lg">Hardware Mismatch</h2>
              <p className="text-zinc-400 text-sm leading-relaxed">
                This license key is registered to a different machine.
                Each license is locked to one PC. Please contact support with your Machine ID.
              </p>
              <div className="w-full p-3 bg-red-500/10 border border-red-500/20 rounded-lg">
                <p className="text-[9px] font-mono text-zinc-500">
                  Your Machine ID: <span className="text-zinc-400">{hwid}</span>
                </p>
              </div>
              <button
                onClick={() => setScreen('unlicensed')}
                className="cursor-pointer text-xs font-mono text-emerald-500 hover:text-emerald-400 transition-colors"
              >
                Enter a different key
              </button>
            </div>
          </motion.div>
        )}

      </AnimatePresence>
    </div>
  )
}

export default LicenseGate
