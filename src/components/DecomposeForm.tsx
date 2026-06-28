import React, { useState, useEffect } from "react";
import { Sparkles, Loader2, Calendar, ChevronRight, Mic, MicOff, Info } from "lucide-react";
import { Subtask } from "../types";
import { getCalendarEvents, getAccessToken } from "../lib/oauth";

interface DecomposeFormProps {
  onDecomposeSuccess: (goal: string, deadline: string, subtasks: Omit<Subtask, "id" | "completed">[]) => void;
}

export default function DecomposeForm({ onDecomposeSuccess }: DecomposeFormProps) {
  const [goal, setGoal] = useState("");
  const [showAdvanced, setShowAdvanced] = useState(false);

  // Default deadline to 48 hours from now
  const getDefaultDeadline = () => {
    const d = new Date();
    d.setHours(d.getHours() + 48);
    const tzoffset = d.getTimezoneOffset() * 60000;
    const localISOTime = new Date(d.getTime() - tzoffset).toISOString().slice(0, 16);
    return localISOTime;
  };

  const [deadline, setDeadline] = useState(getDefaultDeadline());
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Voice States
  const [isListening, setIsListening] = useState(false);
  const [recognition, setRecognition] = useState<any>(null);
  const [recognitionError, setRecognitionError] = useState<string | null>(null);

  // Initialize Web Speech API
  useEffect(() => {
    const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (SpeechRecognition) {
      const rec = new SpeechRecognition();
      rec.continuous = true;
      rec.interimResults = true;
      rec.lang = "en-US";

      rec.onstart = () => {
        setIsListening(true);
        setRecognitionError(null);
      };

      rec.onerror = (event: any) => {
        console.error("Speech recognition error:", event.error);
        if (event.error === "not-allowed") {
          setRecognitionError("Mic access denied. Enable mic in browser settings.");
        } else {
          setRecognitionError(`Speech error: ${event.error}`);
        }
        setIsListening(false);
      };

      rec.onend = () => {
        setIsListening(false);
      };

      rec.onresult = (event: any) => {
        let transcript = "";
        for (let i = event.resultIndex; i < event.results.length; ++i) {
          if (event.results[i].isFinal) {
            transcript += event.results[i][0].transcript;
          }
        }
        if (transcript) {
          setGoal((prev) => {
            const trimmed = prev.trim();
            return trimmed ? `${trimmed} ${transcript.trim()}` : transcript.trim();
          });
        }
      };

      setRecognition(rec);
    }
  }, []);

  // Clean up recognition
  useEffect(() => {
    return () => {
      if (recognition && isListening) {
        recognition.stop();
      }
    };
  }, [recognition, isListening]);

  const toggleListening = () => {
    if (!recognition) {
      alert("Voice input is not supported in this browser. Please use Google Chrome, Apple Safari, or Microsoft Edge.");
      return;
    }

    if (isListening) {
      recognition.stop();
    } else {
      setRecognitionError(null);
      try {
        recognition.start();
      } catch (err) {
        console.error("Error starting speech recognition:", err);
      }
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!goal.trim()) return;

    setLoading(true);
    setError(null);

    if (recognition && isListening) {
      recognition.stop();
    }

    try {
      // Collect calendar events for finding real free slots
      const gcalToken = getAccessToken();
      let existingEvents: any[] = [];
      if (gcalToken) {
        const rawEvents = getCalendarEvents() || [];
        existingEvents = rawEvents.map((ev: any) => ({
          summary: ev.summary || "Busy",
          start: ev.start?.dateTime || ev.start?.date,
          end: ev.end?.dateTime || ev.end?.date,
        }));
      }

      const now = new Date();
      const YYYY = now.getFullYear();
      const MM = String(now.getMonth() + 1).padStart(2, "0");
      const DD = String(now.getDate()).padStart(2, "0");
      const localDateStr = `${YYYY}-${MM}-${DD}`;
      const HH = String(now.getHours()).padStart(2, "0");
      const mm = String(now.getMinutes()).padStart(2, "0");
      const localTimeStr = `${HH}:${mm}`;

      const response = await fetch("/api/decompose", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          goal,
          deadline: showAdvanced ? deadline : undefined,
          currentLocalTime: now.toString(),
          localDateStr,
          localTimeStr,
          existingEvents,
        }),
      });

      if (!response.ok) {
        const errData = await response.json();
        throw new Error(errData.error || "Failed to decompose goal");
      }

      const data = await response.json();
      if (data.subtasks && Array.isArray(data.subtasks)) {
        // Send the parsed goal and calculated deadline to parent!
        onDecomposeSuccess(data.parsedGoal, data.parsedDeadline, data.subtasks);
        setGoal("");
      } else {
        throw new Error("Invalid response format from Gemini");
      }
    } catch (err: any) {
      console.error(err);
      setError(err.message || "An unexpected error occurred during decomposition.");
    } finally {
      setLoading(false);
    }
  };

  const isGcalConnected = !!getAccessToken();

  return (
    <div id="decompose_form_container" className="bg-slate-900/40 border border-slate-800 rounded-2xl p-6 shadow-xl space-y-4">
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="p-2 bg-rose-500/10 rounded-lg text-rose-400">
            <Sparkles className="w-5 h-5" />
          </div>
          <div>
            <h2 className="text-xl font-display font-semibold text-white">Declare New Goal</h2>
            <p className="text-xs text-slate-400">State your goal & deadline in English or Hinglish</p>
          </div>
        </div>

        {isGcalConnected && (
          <span className="flex items-center gap-1.5 px-2.5 py-1 bg-rose-500/10 border border-rose-500/20 rounded-full text-[9px] font-bold uppercase tracking-wider text-rose-400 font-mono">
            <span className="w-1.5 h-1.5 rounded-full bg-rose-500 animate-pulse" />
            Calendar Aware
          </span>
        )}
      </div>

      <form onSubmit={handleSubmit} className="space-y-4">
        <div>
          <label htmlFor="goal_input" className="block text-[10px] font-bold text-slate-500 uppercase tracking-widest mb-1.5">
            What is your goal or assignment, and when is it due?
          </label>
          <div className="relative">
            <input
              id="goal_input"
              type="text"
              required
              placeholder="e.g., complete my Postgres assignment by Tuesday 4 PM"
              value={goal}
              onChange={(e) => setGoal(e.target.value)}
              disabled={loading}
              className="w-full bg-slate-950 border border-slate-800 rounded-xl pl-4 pr-12 py-3.5 text-white text-sm placeholder-slate-700 focus:outline-none focus:ring-2 focus:ring-rose-500/30 focus:border-rose-500 transition-all"
            />
            
            <button
              type="button"
              onClick={toggleListening}
              className={`absolute right-2 top-2 p-2 rounded-lg border transition ${
                isListening
                  ? "bg-rose-500/20 border-rose-500 text-rose-400 animate-pulse"
                  : "bg-slate-900 border-slate-800 text-slate-400 hover:text-rose-400"
              }`}
              title={isListening ? "Listening... Click to stop" : "Speak with voice (English/Hinglish)"}
            >
              {isListening ? <MicOff className="w-4 h-4" /> : <Mic className="w-4 h-4" />}
            </button>
          </div>

          {recognitionError && (
            <p className="text-[10px] text-rose-400 mt-1.5">{recognitionError}</p>
          )}

          {isListening && (
            <p className="text-[10px] text-rose-400 animate-pulse mt-1.5 flex items-center gap-1.5 font-mono">
              <span className="w-1.5 h-1.5 rounded-full bg-rose-500 animate-ping" />
              Listening... Tell me your goal and deadline (e.g., "finalize UI by Friday at noon")
            </p>
          )}
        </div>

        {/* Collapsible Manual Advanced Section */}
        <div>
          <button
            type="button"
            onClick={() => setShowAdvanced(!showAdvanced)}
            className="text-[10px] font-extrabold uppercase tracking-widest text-slate-500 hover:text-slate-300 flex items-center gap-1"
          >
            {showAdvanced ? "[-]" : "[+]"} Manual Deadline Specifics
          </button>

          {showAdvanced && (
            <div className="mt-3 p-4 bg-slate-950/40 border border-slate-850 rounded-xl">
              <label htmlFor="deadline_input" className="block text-[10px] font-bold text-slate-500 uppercase tracking-widest mb-1.5">
                Strict Manual Deadline
              </label>
              <div className="relative">
                <input
                  id="deadline_input"
                  type="datetime-local"
                  value={deadline}
                  onChange={(e) => setDeadline(e.target.value)}
                  disabled={loading}
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl pl-10 pr-4 py-3 text-white text-sm focus:outline-none focus:ring-2 focus:ring-rose-500/30 focus:border-rose-500 transition-all"
                />
                <Calendar className="w-4 h-4 text-slate-500 absolute left-3.5 top-3.5" />
              </div>
            </div>
          )}
        </div>

        <button
          id="decompose_submit_btn"
          type="submit"
          disabled={loading || !goal.trim()}
          className="w-full bg-rose-600 hover:bg-rose-500 disabled:bg-rose-900/30 disabled:cursor-not-allowed text-white font-bold text-xs uppercase tracking-widest rounded-xl py-3.5 px-4 flex items-center justify-center gap-2 shadow-lg shadow-rose-950/40 transition-all duration-200 cursor-pointer"
        >
          {loading ? (
            <>
              <Loader2 className="w-4 h-4 animate-spin" />
              <span>Gemini is scheduling in real free slots...</span>
            </>
          ) : (
            <>
              <Sparkles className="w-4 h-4 animate-pulse" />
              <span>Decompose & Schedule Tasks</span>
              <ChevronRight className="w-4 h-4 ml-1" />
            </>
          )}
        </button>

        {isGcalConnected && (
          <div className="p-3 bg-rose-500/5 border border-rose-500/10 rounded-xl flex gap-2 items-start">
            <Info className="w-3.5 h-3.5 text-rose-400 mt-0.5 flex-shrink-0" />
            <p className="text-[10px] text-slate-400 leading-relaxed">
              Google Calendar is active. NoSnooze will inspect your busy times to place subtasks only in <strong>real free slots</strong>, then auto-export them on commitment!
            </p>
          </div>
        )}

        {error && (
          <div className="p-3 bg-red-950/30 border border-red-500/30 rounded-xl text-xs text-red-400">
            {error}
          </div>
        )}
      </form>
    </div>
  );
}
