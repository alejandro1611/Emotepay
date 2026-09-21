"use client";

import React, { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Sparkles, Send, Tv, Heart, Zap, Award, Flame } from "lucide-react";

// Lista de emotes y sus valores de apoyo predeterminados
const EMOTES = [
  { id: "fire", name: "Hype Fire", icon: "🔥", amount: "1 MON", color: "from-orange-500 to-red-600" },
  { id: "rocket", name: "To The Moon", icon: "🚀", amount: "5 MON", color: "from-purple-500 to-indigo-600" },
  { id: "crown", name: "King/Queen", icon: "👑", amount: "10 MON", color: "from-amber-400 to-yellow-600" },
  { id: "gem", name: "Diamond Hands", icon: "💎", amount: "25 MON", color: "from-cyan-400 to-blue-600" },
];

export default function Home() {
  const [selectedEmote, setSelectedEmote] = useState(EMOTES[0]);
  const [message, setMessage] = useState("");
  const [alerts, setAlerts] = useState<Array<{ id: number; emote: typeof EMOTES[0]; message: string }>>([]);

  // Simulación de envío de gesto social / propina
  const handleSendReaction = (e: React.FormEvent) => {
    e.preventDefault();
    const newAlert = {
      id: Date.now(),
      emote: selectedEmote,
      message: message || "¡Grandioso stream! 🔥",
    };

    setAlerts((prev) => [newAlert, ...prev]);
    setMessage("");

    // Ocultar alerta simulación después de 4 segundos
    setTimeout(() => {
      setAlerts((prev) => prev.filter((a) => a.id !== newAlert.id));
    }, 4000);
  };

  return (
    <main className="min-h-screen bg-slate-950 text-white font-sans selection:bg-purple-500 selection:text-white relative overflow-hidden">
      {/* Background Gradients */}
      <div className="absolute top-0 left-1/4 w-96 h-96 bg-purple-600/20 rounded-full blur-3xl pointer-events-none" />
      <div className="absolute bottom-0 right-1/4 w-96 h-96 bg-blue-600/20 rounded-full blur-3xl pointer-events-none" />

      {/* Header / Navbar */}
      <header className="border-b border-slate-800/80 backdrop-blur-md bg-slate-950/50 sticky top-0 z-50">
        <div className="max-w-6xl mx-auto px-6 h-16 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-gradient-to-tr from-purple-600 to-indigo-500 rounded-xl shadow-lg shadow-purple-500/20">
              <Zap className="w-5 h-5 text-white" />
            </div>
            <span className="font-bold text-xl tracking-tight bg-clip-text text-transparent bg-gradient-to-r from-white via-slate-200 to-slate-400">
              Emote<span className="text-purple-400">Pay</span>
            </span>
          </div>
          <button className="text-sm font-medium px-4 py-2 rounded-xl bg-slate-900 border border-slate-800 hover:border-purple-500/50 transition-all flex items-center gap-2">
            <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
            Monad Testnet
          </button>
        </div>
      </header>

      {/* Main Content Layout */}
      <div className="max-w-6xl mx-auto px-6 py-8 grid grid-cols-1 lg:grid-cols-12 gap-8">
        
        {/* Stream Simulator & Overlay (Left Column - 7 Cols) */}
        <div className="lg:col-span-7 flex flex-col gap-4">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-semibold uppercase tracking-wider text-slate-400 flex items-center gap-2">
              <Tv className="w-4 h-4 text-purple-400" /> Stream Overlay Preview
            </h2>
            <span className="text-xs bg-purple-500/10 text-purple-400 px-2.5 py-1 rounded-full border border-purple-500/20">
              OBS Live Feed
            </span>
          </div>

          {/* Stream Video Screen Mockup */}
          <div className="relative aspect-video rounded-2xl bg-slate-900 border border-slate-800 overflow-hidden shadow-2xl flex items-center justify-center">
            {/* Stream Background Mockup */}
            <div className="absolute inset-0 bg-gradient-to-br from-slate-900 via-slate-950 to-purple-950/40 flex flex-col items-center justify-center text-slate-600">
              <Tv className="w-16 h-16 stroke-[1] mb-2 opacity-40" />
              <p className="text-sm">Live Stream Gameplay Preview</p>
            </div>

            {/* OVERLAY ALERT ANIMATION (Lo que se ve en la pantalla del streamer) */}
            <AnimatePresence>
              {alerts.map((alert) => (
                <motion.div
                  key={alert.id}
                  initial={{ opacity: 0, scale: 0.5, y: 50 }}
                  animate={{ opacity: 1, scale: 1, y: 0 }}
                  exit={{ opacity: 0, scale: 0.8, y: -40 }}
                  transition={{ type: "spring", stiffness: 300, damping: 20 }}
                  className="absolute z-20 flex flex-col items-center text-center p-6 rounded-2xl bg-slate-900/90 border border-purple-500/40 backdrop-blur-xl shadow-2xl shadow-purple-500/30 max-w-xs"
                >
                  <motion.span
                    animate={{ rotate: [0, -10, 10, -10, 0], scale: [1, 1.2, 1] }}
                    transition={{ repeat: Infinity, duration: 1.5 }}
                    className="text-6xl mb-2"
                  >
                    {alert.emote.icon}
                  </motion.span>
                  <div className="text-xs font-bold uppercase tracking-wider text-purple-400 mb-1">
                    {alert.emote.name} ({alert.emote.amount})
                  </div>
                  <p className="text-sm font-medium text-slate-200">"{alert.message}"</p>
                </motion.div>
              ))}
            </AnimatePresence>
          </div>
        </div>

        {/* Viewer Reaction Panel (Right Column - 5 Cols) */}
        <div className="lg:col-span-5 flex flex-col gap-6">
          <div className="bg-slate-900/70 border border-slate-800 rounded-2xl p-6 backdrop-blur-xl shadow-xl">
            <h3 className="text-lg font-bold text-white mb-1 flex items-center gap-2">
              <Sparkles className="w-5 h-5 text-amber-400" /> Send Reaction Gesture
            </h3>
            <p className="text-xs text-slate-400 mb-6">
              Support the streamer instantly with zero crypto friction.
            </p>

            <form onSubmit={handleSendReaction} className="flex flex-col gap-5">
              {/* Emote Selector */}
              <div>
                <label className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-3 block">
                  1. Select your Gesture Emote
                </label>
                <div className="grid grid-cols-2 gap-3">
                  {EMOTES.map((e) => {
                    const isSelected = selectedEmote.id === e.id;
                    return (
                      <button
                        type="button"
                        key={e.id}
                        onClick={() => setSelectedEmote(e)}
                        className={`p-3 rounded-xl border transition-all flex items-center gap-3 text-left ${
                          isSelected
                            ? "bg-purple-600/15 border-purple-500 shadow-lg shadow-purple-500/10"
                            : "bg-slate-950/50 border-slate-800 hover:border-slate-700"
                        }`}
                      >
                        <span className="text-2xl">{e.icon}</span>
                        <div>
                          <div className="text-xs font-bold text-slate-200">{e.name}</div>
                          <div className="text-[11px] font-medium text-purple-400">{e.amount}</div>
                        </div>
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Message Input */}
              <div>
                <label className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-2 block">
                  2. Add a Message (Optional)
                </label>
                <input
                  type="text"
                  maxLength={80}
                  value={message}
                  onChange={(e) => setMessage(e.target.value)}
                  placeholder="¡Tremenda jugada bro!"
                  className="w-full bg-slate-950/80 border border-slate-800 rounded-xl px-4 py-3 text-sm text-white placeholder-slate-600 focus:outline-none focus:border-purple-500 transition-colors"
                />
              </div>

              {/* Send Button */}
              <button
                type="submit"
                className={`w-full py-3.5 px-6 rounded-xl font-bold text-sm transition-all flex items-center justify-center gap-2 shadow-lg bg-gradient-to-r ${selectedEmote.color} hover:opacity-95 hover:scale-[1.01] active:scale-[0.99]`}
              >
                <Send className="w-4 h-4" /> Send {selectedEmote.name} ({selectedEmote.amount})
              </button>
            </form>
          </div>
        </div>

      </div>
    </main>
  );
}
