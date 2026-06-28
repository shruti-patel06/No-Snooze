import React, { useState, useEffect } from "react";
import { 
  Volume2, 
  VolumeX, 
  Play, 
  Check, 
  Music, 
  Sparkles, 
  AlertTriangle, 
  ShieldAlert,
  Info,
  Sliders,
  HelpCircle
} from "lucide-react";
import { SOUND_PRESETS, playSound, AudioSoundPreset } from "../utils/soundEngine";

export interface UserAudioConfig {
  enabled: boolean;
  earlySound: string;
  closeSound: string;
  criticalSound: string;
}

interface AudioSettingsProps {
  onConfigChange?: (config: UserAudioConfig) => void;
}

// Key helper for saving configuration
const LOCAL_STORAGE_KEY = "nosnooze_audio_config";

export const DEFAULT_AUDIO_CONFIG: UserAudioConfig = {
  enabled: true,
  earlySound: "gentle_chime",
  closeSound: "retro_zap",
  criticalSound: "urgency_siren",
};

export function getSavedAudioConfig(): UserAudioConfig {
  try {
    const saved = localStorage.getItem(LOCAL_STORAGE_KEY);
    if (saved) {
      const parsed = JSON.parse(saved);
      return { ...DEFAULT_AUDIO_CONFIG, ...parsed };
    }
  } catch (e) {
    console.error("Failed to load audio configuration:", e);
  }
  return DEFAULT_AUDIO_CONFIG;
}

export default function AudioSettings({ onConfigChange }: AudioSettingsProps) {
  const [config, setConfig] = useState<UserAudioConfig>(getSavedAudioConfig);
  const [activePreview, setActivePreview] = useState<string | null>(null);
  const [showSavedFeedback, setShowSavedFeedback] = useState(false);

  // Synchronize state with storage and propagate updates
  const updateConfig = (newConfig: UserAudioConfig) => {
    setConfig(newConfig);
    localStorage.setItem(LOCAL_STORAGE_KEY, JSON.stringify(newConfig));
    if (onConfigChange) {
      onConfigChange(newConfig);
    }
    
    // Brief visual feedback for saving
    setShowSavedFeedback(true);
    const t = setTimeout(() => setShowSavedFeedback(false), 1500);
    return () => clearTimeout(t);
  };

  const handleToggleEnabled = () => {
    updateConfig({ ...config, enabled: !config.enabled });
  };

  const handleSelectSound = (level: "early" | "close" | "critical", soundId: string) => {
    const keyMap = {
      early: "earlySound",
      close: "closeSound",
      critical: "criticalSound",
    } as const;

    const updated = {
      ...config,
      [keyMap[level]]: soundId,
    };
    updateConfig(updated);
    
    // Instantly preview selected sound if audio is enabled
    if (config.enabled) {
      handlePlayPreview(soundId);
    }
  };

  const handlePlayPreview = (soundId: string) => {
    setActivePreview(soundId);
    playSound(soundId);
    setTimeout(() => {
      setActivePreview(null);
    }, 1600); // Siren is our longest sound (~1.6s)
  };

  return (
    <div id="audio_settings_panel" className="space-y-6 animate-fade-in">
      {/* Settings Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-md font-bold text-white tracking-tight font-display flex items-center gap-2.5">
            <Sliders className="w-5 h-5 text-rose-500 animate-pulse" />
            <span>Escalation Audio & Sound Settings</span>
          </h2>
          <p className="text-xs text-slate-500 mt-1">
            Personalize synthetic warnings triggered as your deadlines approach or tasks are neglected
          </p>
        </div>

        {/* Master Switch Button */}
        <button
          type="button"
          onClick={handleToggleEnabled}
          className={`flex items-center gap-2 px-4 py-2 rounded-2xl border text-xs font-bold uppercase tracking-wider transition-all duration-300 ${
            config.enabled
              ? "bg-rose-500/15 border-rose-500/30 text-rose-400 hover:bg-rose-500/25"
              : "bg-slate-900 border-slate-800 text-slate-500 hover:text-slate-400"
          }`}
        >
          {config.enabled ? (
            <>
              <Volume2 className="w-4 h-4 text-rose-400" />
              <span>Audio Alerts Enabled</span>
            </>
          ) : (
            <>
              <VolumeX className="w-4 h-4 text-slate-500" />
              <span>Audio Muted</span>
            </>
          )}
        </button>
      </div>

      {/* Main Settings Grid */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        
        {/* 1. EARLY ESCALATION SOUND */}
        <div className="bg-slate-900 border border-slate-800/80 rounded-3xl p-5 flex flex-col justify-between space-y-4 hover:border-slate-700/80 transition-all duration-300 relative overflow-hidden group">
          <div className="absolute top-0 right-0 w-24 h-24 bg-sky-500/5 rounded-full blur-2xl group-hover:bg-sky-500/10 transition-all duration-500" />
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <span className="px-2.5 py-0.5 rounded-full text-[9px] font-bold font-mono tracking-wider bg-sky-500/10 text-sky-400 border border-sky-500/15 uppercase">
                Early Stage
              </span>
              <Sparkles className="w-4 h-4 text-sky-400" />
            </div>
            <h3 className="text-sm font-extrabold text-white">Gentle Reminder</h3>
            <p className="text-xs text-slate-500 leading-normal">
              Triggers when NoSnooze launches a subtle reminder banner. Perfect for soft, non-disruptive notifications.
            </p>
          </div>

          <div className="space-y-3 pt-2">
            <label className="text-[10px] font-bold uppercase tracking-widest text-slate-500 block">
              Warning Sound
            </label>
            <div className="flex gap-2">
              <select
                disabled={!config.enabled}
                value={config.earlySound}
                onChange={(e) => handleSelectSound("early", e.target.value)}
                className="flex-1 bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:ring-2 focus:ring-sky-500/30 focus:border-sky-500 disabled:opacity-50"
              >
                {SOUND_PRESETS.map((preset) => (
                  <option key={preset.id} value={preset.id}>
                    {preset.name}
                  </option>
                ))}
              </select>
              <button
                type="button"
                onClick={() => handlePlayPreview(config.earlySound)}
                className={`p-2 bg-slate-950 border border-slate-800 rounded-xl text-sky-400 hover:text-white hover:bg-sky-600/15 hover:border-sky-500/30 transition-all ${
                  activePreview === config.earlySound ? "animate-pulse scale-95" : ""
                }`}
                title="Preview Sound"
              >
                <Play className="w-4 h-4" />
              </button>
            </div>
          </div>
        </div>

        {/* 2. CLOSE ESCALATION SOUND */}
        <div className="bg-slate-900 border border-slate-800/80 rounded-3xl p-5 flex flex-col justify-between space-y-4 hover:border-slate-700/80 transition-all duration-300 relative overflow-hidden group">
          <div className="absolute top-0 right-0 w-24 h-24 bg-amber-500/5 rounded-full blur-2xl group-hover:bg-amber-500/10 transition-all duration-500" />
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <span className="px-2.5 py-0.5 rounded-full text-[9px] font-bold font-mono tracking-wider bg-amber-500/10 text-amber-400 border border-amber-500/15 uppercase">
                Close Stage
              </span>
              <AlertTriangle className="w-4 h-4 text-amber-400" />
            </div>
            <h3 className="text-sm font-extrabold text-white">Moderate Urgency</h3>
            <p className="text-xs text-slate-500 leading-normal">
              Triggers when an escalation check-in modal shows up. Demands immediate awareness.
            </p>
          </div>

          <div className="space-y-3 pt-2">
            <label className="text-[10px] font-bold uppercase tracking-widest text-slate-500 block">
              Warning Sound
            </label>
            <div className="flex gap-2">
              <select
                disabled={!config.enabled}
                value={config.closeSound}
                onChange={(e) => handleSelectSound("close", e.target.value)}
                className="flex-1 bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:ring-2 focus:ring-amber-500/30 focus:border-amber-500 disabled:opacity-50"
              >
                {SOUND_PRESETS.map((preset) => (
                  <option key={preset.id} value={preset.id}>
                    {preset.name}
                  </option>
                ))}
              </select>
              <button
                type="button"
                onClick={() => handlePlayPreview(config.closeSound)}
                className={`p-2 bg-slate-950 border border-slate-800 rounded-xl text-amber-400 hover:text-white hover:bg-amber-600/15 hover:border-amber-500/30 transition-all ${
                  activePreview === config.closeSound ? "animate-pulse scale-95" : ""
                }`}
                title="Preview Sound"
              >
                <Play className="w-4 h-4" />
              </button>
            </div>
          </div>
        </div>

        {/* 3. CRITICAL ESCALATION SOUND */}
        <div className="bg-slate-900 border border-slate-800/80 rounded-3xl p-5 flex flex-col justify-between space-y-4 hover:border-slate-700/80 transition-all duration-300 relative overflow-hidden group">
          <div className="absolute top-0 right-0 w-24 h-24 bg-rose-500/5 rounded-full blur-2xl group-hover:bg-rose-500/10 transition-all duration-500" />
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <span className="px-2.5 py-0.5 rounded-full text-[9px] font-bold font-mono tracking-wider bg-rose-500/10 text-rose-400 border border-rose-500/15 uppercase">
                Critical Stage
              </span>
              <ShieldAlert className="w-4 h-4 text-rose-500" />
            </div>
            <h3 className="text-sm font-extrabold text-white">High Alert Siren</h3>
            <p className="text-xs text-slate-500 leading-normal">
              Triggers on critical countdown failure when the full screen is captured. High volume siren to break stalling loops.
            </p>
          </div>

          <div className="space-y-3 pt-2">
            <label className="text-[10px] font-bold uppercase tracking-widest text-slate-500 block">
              Warning Sound
            </label>
            <div className="flex gap-2">
              <select
                disabled={!config.enabled}
                value={config.criticalSound}
                onChange={(e) => handleSelectSound("critical", e.target.value)}
                className="flex-1 bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:ring-2 focus:ring-rose-500/30 focus:border-rose-500 disabled:opacity-50"
              >
                {SOUND_PRESETS.map((preset) => (
                  <option key={preset.id} value={preset.id}>
                    {preset.name}
                  </option>
                ))}
              </select>
              <button
                type="button"
                onClick={() => handlePlayPreview(config.criticalSound)}
                className={`p-2 bg-slate-950 border border-slate-800 rounded-xl text-rose-500 hover:text-white hover:bg-rose-600/15 hover:border-rose-500/30 transition-all ${
                  activePreview === config.criticalSound ? "animate-pulse scale-95" : ""
                }`}
                title="Preview Sound"
              >
                <Play className="w-4 h-4" />
              </button>
            </div>
          </div>
        </div>

      </div>

      {/* Preset Catalogue Showcase */}
      <div className="bg-slate-900 border border-slate-800/80 rounded-3xl p-5 space-y-4">
        <h3 className="text-xs font-bold text-white uppercase tracking-wider flex items-center gap-2">
          <Music className="w-4 h-4 text-rose-500" />
          <span>Synthetic Preset Library Definitions</span>
        </h3>
        
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3">
          {SOUND_PRESETS.map((preset) => (
            <div 
              key={preset.id} 
              className="bg-slate-950 border border-slate-800/60 hover:border-slate-700/60 rounded-2xl p-3 flex flex-col justify-between gap-2.5 transition-all"
            >
              <div className="space-y-1">
                <div className="flex justify-between items-center gap-2">
                  <span className="text-xs font-extrabold text-slate-200">
                    {preset.name}
                  </span>
                  <span className={`text-[8px] font-extrabold uppercase px-1.5 py-0.5 rounded ${
                    preset.category === "gentle" 
                      ? "bg-emerald-500/10 text-emerald-400 border border-emerald-500/15" 
                      : preset.category === "moderate"
                      ? "bg-sky-500/10 text-sky-400 border border-sky-500/15"
                      : "bg-rose-500/10 text-rose-400 border border-rose-500/15"
                  }`}>
                    {preset.category}
                  </span>
                </div>
                <p className="text-[10px] text-slate-500 leading-normal">
                  {preset.description}
                </p>
              </div>

              <button
                type="button"
                onClick={() => handlePlayPreview(preset.id)}
                className="w-full flex items-center justify-center gap-1.5 py-1.5 bg-slate-900 hover:bg-rose-500/10 hover:text-rose-400 border border-slate-800/80 rounded-xl text-[10px] font-bold text-slate-400 transition-all uppercase tracking-wider"
              >
                <Play className="w-3 h-3" />
                <span>Test Waveform</span>
              </button>
            </div>
          ))}
        </div>
      </div>

      {/* Save configuration visual success message */}
      {showSavedFeedback && (
        <div className="fixed bottom-6 right-6 bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 rounded-2xl px-4 py-2.5 flex items-center gap-2.5 text-xs font-semibold shadow-xl animate-bounce">
          <Check className="w-4 h-4 text-emerald-400" />
          <span>Audio options synchronized with system local storage!</span>
        </div>
      )}

      {/* Informative advice */}
      <div className="bg-rose-500/5 border border-rose-500/10 rounded-2xl p-4 flex gap-3 items-start">
        <Info className="w-4 h-4 text-rose-400 flex-shrink-0 mt-0.5" />
        <div className="text-[11px] text-slate-400 leading-relaxed">
          <strong className="text-slate-300">Browser Auto-play Policy Notice:</strong> Modern web browsers restrict audio generation until you actively interact with the application. Make sure you have clicked or tapped anywhere on the page to allow the dynamic sound synthesizer to trigger successfully!
        </div>
      </div>
    </div>
  );
}
