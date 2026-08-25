import { useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { RiBrainLine, RiDatabase2Line, RiMacLine, RiCheckDoubleLine, RiArrowRightLine, RiKeyLine } from 'react-icons/ri'

interface SetupWizardProps {
  onComplete: () => void
}

const SetupWizard = ({ onComplete }: SetupWizardProps) => {
  const [step, setStep] = useState(1)
  const [isSaving, setIsSaving] = useState(false)
  const [config, setConfig] = useState({
    JARVIS_API_KEY: '',
    SUPABASE_URL: '',
    SUPABASE_ANON_KEY: ''
  })

  const handleNext = () => setStep((s) => Math.min(s + 1, 4))
  const handlePrev = () => setStep((s) => Math.max(s - 1, 1))

  const handleSaveAndComplete = async () => {
    setIsSaving(true)
    try {
      const result = await window.electron.ipcRenderer.invoke('vault:save-config', config)
      if (result.success) {
        // Add a slight delay for dramatic effect
        setTimeout(onComplete, 1500)
      } else {
        alert('Failed to save securely: ' + result.error)
        setIsSaving(false)
      }
    } catch (e) {
      alert('System error.')
      setIsSaving(false)
    }
  }

  const isStep2Valid = config.JARVIS_API_KEY.length > 10
  const isStep3Valid = config.SUPABASE_URL.startsWith('http') && config.SUPABASE_ANON_KEY.length > 20

  return (
    <div className="h-screen w-screen bg-[#030303] flex items-center justify-center overflow-hidden relative select-none">
      <div className="absolute inset-0 pointer-events-none opacity-20 bg-[url('https://www.transparenttextures.com/patterns/carbon-fibre.png')]" />

      <motion.div 
        className="w-full max-w-2xl px-6"
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ duration: 0.6 }}
      >
        <div className="bg-black/80 backdrop-blur-3xl border border-white/10 rounded-2xl shadow-[0_0_50px_rgba(16,185,129,0.05)] overflow-hidden">
          
          {/* Progress Header */}
          <div className="flex bg-white/5 border-b border-white/5">
            {[1, 2, 3, 4].map((s) => (
              <div key={s} className="flex-1 relative h-1.5 bg-black/40 overflow-hidden">
                <motion.div 
                  initial={{ width: 0 }}
                  animate={{ width: step >= s ? '100%' : '0%' }}
                  className="absolute inset-y-0 left-0 bg-emerald-500"
                />
              </div>
            ))}
          </div>

          <div className="p-10 min-h-[400px] flex flex-col relative">
            <AnimatePresence mode="wait">

              {/* STEP 1: WELCOME */}
              {step === 1 && (
                <motion.div key="1"
                  initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -20 }}
                  className="flex flex-col gap-6"
                >
                  <div className="p-4 rounded-2xl bg-emerald-500/10 border border-emerald-500/20 w-fit">
                    <RiMacLine className="text-4xl text-emerald-400" />
                  </div>
                  <div>
                    <h1 className="text-3xl font-bold text-white tracking-tight mb-2">Welcome to J.A.R.V.I.S.</h1>
                    <p className="text-zinc-400 leading-relaxed">
                      Before J.A.R.V.I.S. can take control of your system, we need to establish a neural connection.
                      In the following steps, you will securely inject your AI credentials.
                      <br/><br/>
                      <strong className="text-emerald-500">Security Note:</strong> All keys provided are encrypted using your native OS keychain and never leave your device.
                    </p>
                  </div>
                  <div className="mt-auto pt-8 flex justify-end">
                    <button onClick={handleNext} className="px-6 py-3 bg-white text-black font-semibold rounded-xl hover:bg-zinc-200 transition-colors flex items-center gap-2">
                      Initialize Setup <RiArrowRightLine />
                    </button>
                  </div>
                </motion.div>
              )}

              {/* STEP 2: NEURAL ENGINE */}
              {step === 2 && (
                <motion.div key="2"
                  initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -20 }}
                  className="flex flex-col gap-6"
                >
                  <div className="flex items-center gap-4">
                    <div className="p-3 rounded-xl bg-blue-500/10 border border-blue-500/20">
                      <RiBrainLine className="text-2xl text-blue-400" />
                    </div>
                    <div>
                      <h2 className="text-xl font-bold text-white">Neural Engine</h2>
                      <p className="text-zinc-500 text-xs font-mono uppercase">Provide LLM Authentication</p>
                    </div>
                  </div>

                  <div className="flex flex-col gap-4 mt-4">
                    <div className="flex flex-col gap-2">
                      <label className="text-xs font-mono text-zinc-400">GEMINI API KEY (REQUIRED)</label>
                      <div className="relative">
                        <RiKeyLine className="absolute left-3 top-1/2 -translate-y-1/2 text-zinc-600" />
                        <input 
                          type="password"
                          value={config.JARVIS_API_KEY}
                          onChange={e => setConfig({...config, JARVIS_API_KEY: e.target.value})}
                          placeholder="AIzaSy..."
                          className="w-full bg-zinc-900 border border-white/10 rounded-xl pl-10 pr-4 py-3 text-sm text-emerald-300 font-mono focus:outline-none focus:border-blue-500/50"
                        />
                      </div>
                      <p className="text-[10px] text-zinc-600">
                        Powers the core reasoning and voice engine of J.A.R.V.I.S. <br />
                        <span className="text-zinc-500">Get this from: <a href="https://aistudio.google.com/app/apikey" target="_blank" className="text-blue-400 hover:underline">Google AI Studio</a></span>
                      </p>
                    </div>
                  </div>

                  <div className="mt-auto pt-8 flex justify-between">
                    <button onClick={handlePrev} className="px-6 py-3 text-zinc-400 hover:text-white transition-colors font-semibold">Back</button>
                    <button 
                      onClick={handleNext} 
                      disabled={!isStep2Valid}
                      className="px-6 py-3 bg-blue-500 text-white font-semibold rounded-xl hover:bg-blue-400 disabled:bg-zinc-800 disabled:text-zinc-600 transition-colors flex items-center gap-2"
                    >
                      Next Step <RiArrowRightLine />
                    </button>
                  </div>
                </motion.div>
              )}

              {/* STEP 3: MEMORY BANK */}
              {step === 3 && (
                <motion.div key="3"
                  initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -20 }}
                  className="flex flex-col gap-6"
                >
                  <div className="flex items-center gap-4">
                    <div className="p-3 rounded-xl bg-purple-500/10 border border-purple-500/20">
                      <RiDatabase2Line className="text-2xl text-purple-400" />
                    </div>
                    <div>
                      <h2 className="text-xl font-bold text-white">Memory Bank</h2>
                      <p className="text-zinc-500 text-xs font-mono uppercase">Provide Supabase Credentials</p>
                    </div>
                  </div>

                  <div className="flex flex-col gap-4 mt-2">
                    <div className="flex flex-col gap-2">
                      <label className="text-xs font-mono text-zinc-400">SUPABASE URL</label>
                      <input 
                        type="url"
                        value={config.SUPABASE_URL}
                        onChange={e => setConfig({...config, SUPABASE_URL: e.target.value})}
                        placeholder="https://xxxxxx.supabase.co"
                        className="w-full bg-zinc-900 border border-white/10 rounded-xl px-4 py-3 text-sm text-emerald-300 font-mono focus:outline-none focus:border-purple-500/50"
                      />
                    </div>
                    
                    <div className="flex flex-col gap-2">
                      <label className="text-xs font-mono text-zinc-400">SUPABASE ANON KEY</label>
                      <input 
                        type="password"
                        value={config.SUPABASE_ANON_KEY}
                        onChange={e => setConfig({...config, SUPABASE_ANON_KEY: e.target.value})}
                        placeholder="eyJhbGciOiJIUzI1NiIs..."
                        className="w-full bg-zinc-900 border border-white/10 rounded-xl px-4 py-3 text-sm text-emerald-300 font-mono focus:outline-none focus:border-purple-500/50"
                      />
                    </div>
                    <p className="text-[10px] text-zinc-600 -mt-1">
                      Allows J.A.R.V.I.S. to form permanent memories across sessions. <br />
                      <span className="text-zinc-500">Find these in your <strong className="text-purple-400">Supabase Project Settings &gt; API</strong></span>
                    </p>
                  </div>

                  <div className="mt-auto pt-4 flex justify-between">
                    <button onClick={handlePrev} className="px-6 py-3 text-zinc-400 hover:text-white transition-colors font-semibold">Back</button>
                    <button 
                      onClick={handleNext} 
                      disabled={!isStep3Valid}
                      className="px-6 py-3 bg-purple-500 text-white font-semibold rounded-xl hover:bg-purple-400 disabled:bg-zinc-800 disabled:text-zinc-600 transition-colors flex items-center gap-2"
                    >
                      Next Step <RiArrowRightLine />
                    </button>
                  </div>
                </motion.div>
              )}

              {/* STEP 4: FINALIZE */}
              {step === 4 && (
                <motion.div key="4"
                  initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -20 }}
                  className="flex flex-col gap-6 items-center text-center py-10"
                >
                  <div className="relative">
                    <div className="absolute inset-0 bg-emerald-500/20 blur-xl rounded-full" />
                    <RiCheckDoubleLine className="text-7xl text-emerald-500 relative z-10" />
                  </div>
                  
                  <div>
                    <h2 className="text-2xl font-bold text-white mb-2">Systems Configured</h2>
                    <p className="text-zinc-400 text-sm max-w-md mx-auto">
                      All credentials have been provided. J.A.R.V.I.S. will now encrypt these locally and boot the neural OS.
                    </p>
                  </div>

                  <div className="mt-8 flex gap-4 w-full justify-center">
                    {!isSaving && <button onClick={handlePrev} className="px-6 py-3 text-zinc-400 hover:text-white transition-colors font-semibold">Review</button>}
                    <button 
                      onClick={handleSaveAndComplete} 
                      disabled={isSaving}
                      className="px-10 py-3 bg-emerald-500 text-black font-bold rounded-xl hover:bg-emerald-400 disabled:bg-emerald-500/50 transition-colors flex items-center justify-center min-w-[200px]"
                    >
                      {isSaving ? 'Encrypting Vault...' : 'Boot J.A.R.V.I.S.'}
                    </button>
                  </div>
                </motion.div>
              )}

            </AnimatePresence>
          </div>
        </div>
      </motion.div>
    </div>
  )
}

export default SetupWizard
