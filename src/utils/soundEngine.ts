// Web Audio API Sound Synthesis Engine for NoSnooze Escalation Alerts

let audioCtx: AudioContext | null = null;

function getAudioContext(): AudioContext {
  if (!audioCtx) {
    audioCtx = new (window.AudioContext || (window as any).webkitAudioContext)();
  }
  if (audioCtx.state === "suspended") {
    audioCtx.resume();
  }
  return audioCtx;
}

// Preset definitions with nice human labels and preview metadata
export interface AudioSoundPreset {
  id: string;
  name: string;
  description: string;
  category: "gentle" | "moderate" | "urgent";
}

export const SOUND_PRESETS: AudioSoundPreset[] = [
  {
    id: "gentle_chime",
    name: "Ambient Gentle Chime",
    description: "A soothing double-tone bell chime. Perfect for early notices.",
    category: "gentle",
  },
  {
    id: "digital_beep",
    name: "Dual Digital Beep",
    description: "Crisp, standard electronic double ping. Clear and non-intrusive.",
    category: "moderate",
  },
  {
    id: "retro_zap",
    name: "Retro Arcade Sweep",
    description: "A dynamic classic 8-bit rising synth flourish.",
    category: "moderate",
  },
  {
    id: "snooze_horn",
    name: "Assertive Claxon",
    description: "An low-frequency buzzer alert for close calls.",
    category: "urgent",
  },
  {
    id: "urgency_siren",
    name: "Screaming Urgency Siren",
    description: "Alternating high-intensity sweeps. Designed to break paralysis.",
    category: "urgent",
  },
];

// Helper to synthesize sounds
export function playSound(presetId: string) {
  try {
    const ctx = getAudioContext();
    const now = ctx.currentTime;

    switch (presetId) {
      case "gentle_chime": {
        // Double-tone sweet bell chime (C5 then G5, layered with harmonics)
        const playBell = (freq: number, startTime: number) => {
          const osc1 = ctx.createOscillator();
          const osc2 = ctx.createOscillator();
          const gainNode = ctx.createGain();

          osc1.type = "sine";
          osc1.frequency.setValueAtTime(freq, startTime);
          
          // Layer higher harmonic for metallic bell character
          osc2.type = "triangle";
          osc2.frequency.setValueAtTime(freq * 2, startTime);

          gainNode.gain.setValueAtTime(0, startTime);
          gainNode.gain.linearRampToValueAtTime(0.2, startTime + 0.015);
          gainNode.gain.exponentialRampToValueAtTime(0.0001, startTime + 1.2);

          osc1.connect(gainNode);
          osc2.connect(gainNode);
          gainNode.connect(ctx.destination);

          osc1.start(startTime);
          osc2.start(startTime);
          osc1.stop(startTime + 1.3);
          osc2.stop(startTime + 1.3);
        };

        playBell(523.25, now); // C5
        playBell(783.99, now + 0.12); // G5 after short delay
        break;
      }

      case "digital_beep": {
        // Crisp dual digital beeps
        const playBeep = (time: number) => {
          const osc = ctx.createOscillator();
          const gain = ctx.createGain();

          osc.type = "sine";
          osc.frequency.setValueAtTime(1200, time);

          gain.gain.setValueAtTime(0, time);
          gain.gain.linearRampToValueAtTime(0.15, time + 0.01);
          gain.gain.exponentialRampToValueAtTime(0.0001, time + 0.15);

          osc.connect(gain);
          gain.connect(ctx.destination);

          osc.start(time);
          osc.stop(time + 0.2);
        };

        playBeep(now);
        playBeep(now + 0.18);
        break;
      }

      case "retro_zap": {
        // Rising arcade-style 8-bit zap
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();

        osc.type = "triangle";
        osc.frequency.setValueAtTime(250, now);
        osc.frequency.exponentialRampToValueAtTime(1500, now + 0.35);

        gain.gain.setValueAtTime(0, now);
        gain.gain.linearRampToValueAtTime(0.18, now + 0.05);
        gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.4);

        osc.connect(gain);
        gain.connect(ctx.destination);

        osc.start(now);
        osc.stop(now + 0.45);
        break;
      }

      case "snooze_horn": {
        // Assertive dual low buzzers (minor second interval for tension)
        const osc1 = ctx.createOscillator();
        const osc2 = ctx.createOscillator();
        const gain = ctx.createGain();

        osc1.type = "sawtooth";
        osc1.frequency.setValueAtTime(220, now); // A3
        osc2.type = "triangle";
        osc2.frequency.setValueAtTime(233.08, now); // A#3 (dissonance)

        gain.gain.setValueAtTime(0, now);
        gain.gain.linearRampToValueAtTime(0.25, now + 0.02);
        gain.gain.setValueAtTime(0.25, now + 0.35);
        gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.55);

        // Lowpass filter to make it sound full/muffled and professional
        const filter = ctx.createBiquadFilter();
        filter.type = "lowpass";
        filter.frequency.setValueAtTime(800, now);

        osc1.connect(filter);
        osc2.connect(filter);
        filter.connect(gain);
        gain.connect(ctx.destination);

        osc1.start(now);
        osc2.start(now);
        osc1.stop(now + 0.6);
        osc2.stop(now + 0.6);
        break;
      }

      case "urgency_siren": {
        // Double alternating siren cycle
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();

        osc.type = "sawtooth";
        // Wee-woo high-pitch frequency oscillation
        osc.frequency.setValueAtTime(600, now);
        osc.frequency.linearRampToValueAtTime(1100, now + 0.25);
        osc.frequency.linearRampToValueAtTime(600, now + 0.5);
        osc.frequency.linearRampToValueAtTime(1100, now + 0.75);
        osc.frequency.linearRampToValueAtTime(600, now + 1.0);
        osc.frequency.linearRampToValueAtTime(1100, now + 1.25);
        osc.frequency.exponentialRampToValueAtTime(100, now + 1.5);

        gain.gain.setValueAtTime(0, now);
        gain.gain.linearRampToValueAtTime(0.25, now + 0.05);
        gain.gain.setValueAtTime(0.25, now + 1.35);
        gain.gain.exponentialRampToValueAtTime(0.0001, now + 1.55);

        const filter = ctx.createBiquadFilter();
        filter.type = "lowpass";
        filter.frequency.setValueAtTime(1200, now);

        osc.connect(filter);
        filter.connect(gain);
        gain.connect(ctx.destination);

        osc.start(now);
        osc.stop(now + 1.6);
        break;
      }

      default:
        console.warn("Unknown sound preset:", presetId);
    }
  } catch (error) {
    console.error("Web Audio playback failed:", error);
  }
}
