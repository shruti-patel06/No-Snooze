import React, { useState, useEffect } from "react";
import {
  X,
  Sparkles,
  Loader2,
  Skull,
  TrendingUp,
  AlertOctagon,
  CornerDownRight,
  RefreshCw,
  Frown,
  CheckCircle,
  HelpCircle,
  Mic,
  MicOff
} from "lucide-react";
import { Task, Subtask } from "../types";
import { getAccessToken, getCalendarEvents } from "../lib/oauth";

interface EscalationModalProps {
  task: Task;
  level: "close" | "critical";
  currentStreak: number;
  onReplanSuccess: (taskId: string, updatedSubtasks: Subtask[], reasoning: string, blockerText?: string) => void;
  onConsequenceAcknowledged: (taskId: string, breakStreak: boolean) => void;
  onClose: () => void;
}

export default function EscalationModal({
  task,
  level,
  currentStreak,
  onReplanSuccess,
  onConsequenceAcknowledged,
  onClose,
}: EscalationModalProps) {
  // Blocker response state
  const [blocker, setBlocker] = useState("");
  const [loading, setLoading] = useState(false);
  const [aiResponse, setAiResponse] = useState<{ reasoning: string; subtasks: any[] } | null>(null);
  const [customQuestion, setCustomQuestion] = useState("");
  const [loadingQuestion, setLoadingQuestion] = useState(false);

  // Voice check-in state
  const [isListening, setIsListening] = useState(false);
  const [recognition, setRecognition] = useState<any>(null);
  const [recognitionError, setRecognitionError] = useState<string | null>(null);

  // Critical pledge state
  const [pledgeInput, setPledgeInput] = useState("");
  const PLEDGE_PHRASE = "I WILL TAKE ACTION NOW";

  // Web Speech API Initialization
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
          setRecognitionError("Mic access denied. Check browser settings.");
        } else {
          setRecognitionError(`Speech recognition failed: ${event.error}`);
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
          setBlocker((prev) => {
            const trimmed = prev.trim();
            return trimmed ? `${trimmed} ${transcript.trim()}` : transcript.trim();
          });
        }
      };

      setRecognition(rec);
    }
  }, []);

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
      } catch (err: any) {
        console.error("Error starting speech recognition:", err);
      }
    }
  };

  // Stop listening on modal close
  useEffect(() => {
    return () => {
      if (recognition && isListening) {
        recognition.stop();
      }
    };
  }, [recognition, isListening]);

  // Generate dynamic question using Gemini when modal opens
  useEffect(() => {
    if (level === "close") {
      setLoadingQuestion(true);
      fetch("/api/generate-checkin", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          goal: task.goal,
          escalationLevel: "close",
          ignoreCount: task.ignoreCount,
          currentStreak
        })
      })
        .then((res) => res.json())
        .then((data) => {
          if (data.message) {
            setCustomQuestion(data.message);
          } else {
            setCustomQuestion(`What is blocking you from completing your goal to "${task.goal}"?`);
          }
        })
        .catch(() => {
          setCustomQuestion(`What is blocking you from completing your goal to "${task.goal}"?`);
        })
        .finally(() => {
          setLoadingQuestion(false);
        });
    }
  }, [level, task.id]);

  const handleBlockerSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!blocker.trim()) return;

    setLoading(true);
    try {
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

      const remaining = task.subtasks.filter((s) => !s.completed);
      const res = await fetch("/api/replan", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          goal: task.goal,
          deadline: task.deadline,
          currentLocalTime: now.toString(),
          localDateStr,
          localTimeStr,
          blocker,
          remainingSubtasks: remaining,
          existingEvents,
        }),
      });

      if (!res.ok) throw new Error("Failed to replan sub-tasks");
      const data = await res.json();
      setAiResponse(data);
    } catch (err) {
      console.error(err);
      alert("Error contacting Gemini to replan tasks. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  const handleAcceptReplan = () => {
    if (!aiResponse) return;

    // Preserve completed subtasks, replace remaining with new ones
    const completed = task.subtasks.filter((s) => s.completed);
    const newSubtasks: Subtask[] = aiResponse.subtasks.map((st: any, i: number) => {
      const d = new Date();
      d.setDate(d.getDate() + (st.dayOffset || 0));
      let timeStr = "09:00";
      if (st.suggestedTimeOfDay === "afternoon") timeStr = "14:00";
      if (st.suggestedTimeOfDay === "evening") timeStr = "19:00";

      const YYYY = d.getFullYear();
      const MM = String(d.getMonth() + 1).padStart(2, "0");
      const DD = String(d.getDate()).padStart(2, "0");

      return {
        id: `st_replan_${i}_${Date.now()}`,
        title: st.title,
        durationMinutes: st.durationMinutes,
        dayOffset: st.dayOffset,
        suggestedTimeOfDay: st.suggestedTimeOfDay,
        completed: false,
        scheduledTime: st.scheduledTime || `${YYYY}-${MM}-${DD} ${timeStr}`,
      };
    });

    onReplanSuccess(task.id, [...completed, ...newSubtasks], aiResponse.reasoning, blocker);
    onClose();
  };

  const handleCriticalPledgeSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (pledgeInput.trim().toUpperCase() === PLEDGE_PHRASE) {
      // User successfully pledges and unlocks!
      onConsequenceAcknowledged(task.id, false);
      onClose();
    }
  };

  const handleStreakBreakConfirm = () => {
    onConsequenceAcknowledged(task.id, true);
    onClose();
  };

  return (
    <div
      id="escalation_modal_overlay"
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/90 backdrop-blur-md overflow-y-auto"
    >
      {/* 1. GETTING CLOSE MODAL */}
      {level === "close" && (
        <div
          id="close_level_modal"
          className="bg-slate-900 border border-slate-800 rounded-2xl max-w-lg w-full p-6 shadow-2xl relative space-y-6"
        >
          <div className="flex justify-between items-start">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-rose-500/10 rounded-xl text-rose-400">
                <HelpCircle className="w-6 h-6 animate-pulse" />
              </div>
              <div>
                <span className="text-[10px] text-rose-400 font-bold uppercase tracking-widest block">
                  Interactive Accountability Check
                </span>
                <h3 className="text-lg font-display font-semibold text-white">
                  Goal is Getting Close!
                </h3>
              </div>
            </div>
            <button onClick={onClose} className="text-slate-400 hover:text-white p-1">
              <X className="w-5 h-5" />
            </button>
          </div>

          <div className="bg-slate-950 border border-slate-850 rounded-xl p-4">
            <h4 className="text-[10px] font-bold text-slate-500 uppercase tracking-widest mb-1">
              Goal Target
            </h4>
            <p className="text-sm font-medium text-white">{task.goal}</p>
          </div>

          {!aiResponse ? (
            <form onSubmit={handleBlockerSubmit} className="space-y-4">
              <div>
                <label className="block text-[10px] font-bold text-rose-400 mb-2 uppercase tracking-widest">
                  {loadingQuestion ? (
                    <span className="flex items-center gap-1.5">
                      <Loader2 className="w-3.5 h-3.5 animate-spin" />
                      Generating personalized check-in...
                    </span>
                  ) : (
                    customQuestion
                  )}
                </label>
                <textarea
                  required
                  rows={3}
                  value={blocker}
                  onChange={(e) => setBlocker(e.target.value)}
                  placeholder="e.g., I'm stuck trying to set up my Express server database connections, or I'm tired after a long lecture..."
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl p-3 text-white text-sm focus:outline-none focus:ring-2 focus:ring-rose-500/30 focus:border-rose-500"
                />

                {/* Voice check-in speech recognition container */}
                <div id="voice_checkin_controls" className="mt-2.5 flex items-center justify-between gap-2 p-2 bg-slate-950/40 border border-slate-800/40 rounded-xl">
                  <div className="flex items-center gap-2">
                    {isListening ? (
                      <span className="flex items-center gap-1.5 text-[10px] text-rose-400 font-semibold uppercase tracking-wider animate-pulse">
                        <span className="w-1.5 h-1.5 rounded-full bg-rose-500 animate-ping" />
                        Listening... Speak now
                      </span>
                    ) : recognitionError ? (
                      <span className="text-[10px] text-rose-500 font-medium">
                        {recognitionError}
                      </span>
                    ) : (
                      <span className="text-[10px] text-slate-500 font-mono uppercase">
                        Web Speech Voice Check-in
                      </span>
                    )}
                  </div>

                  <button
                    type="button"
                    onClick={toggleListening}
                    className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg border text-[10px] font-bold uppercase tracking-wider transition-all duration-300 ${
                      isListening
                        ? "bg-rose-600 border-rose-500 text-white shadow-md shadow-rose-600/20"
                        : "bg-slate-900 hover:bg-slate-950 border-slate-800 hover:border-rose-500/30 text-slate-400 hover:text-rose-400"
                    }`}
                  >
                    {isListening ? (
                      <>
                        <MicOff className="w-3 h-3 text-white" />
                        <span>Stop Voice</span>
                      </>
                    ) : (
                      <>
                        <Mic className="w-3 h-3 text-rose-500" />
                        <span>Voice Check-in</span>
                      </>
                    )}
                  </button>
                </div>
              </div>

              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={onClose}
                  className="flex-1 bg-transparent hover:bg-slate-950 text-slate-300 font-semibold py-2.5 rounded-xl text-xs border border-slate-800"
                >
                  Dismiss
                </button>
                <button
                  type="submit"
                  disabled={loading || !blocker.trim()}
                  className="flex-1 bg-rose-600 hover:bg-rose-500 disabled:bg-rose-950/30 text-white font-bold py-2.5 rounded-xl text-xs uppercase tracking-wider flex items-center justify-center gap-2"
                >
                  {loading ? (
                    <>
                      <Loader2 className="w-3.5 h-3.5 animate-spin" />
                      <span>Gemini is replanning...</span>
                    </>
                  ) : (
                    <>
                      <Sparkles className="w-3.5 h-3.5" />
                      <span>Replan with AI</span>
                    </>
                  )}
                </button>
              </div>
            </form>
          ) : (
            <div className="space-y-4">
              <div className="bg-rose-500/10 border border-rose-500/20 rounded-xl p-4">
                <div className="flex gap-2 text-rose-400 font-semibold text-xs mb-1">
                  <Sparkles className="w-4 h-4 text-rose-400" />
                  <span>Gemini Coach Analysis</span>
                </div>
                <p className="text-xs text-slate-300 leading-relaxed italic">
                  "{aiResponse.reasoning}"
                </p>
              </div>

              <div className="space-y-2">
                <h4 className="text-[10px] font-bold text-slate-500 uppercase tracking-widest">
                  Proposed Adjusted Timeline
                </h4>
                <div className="space-y-2 max-h-40 overflow-y-auto pr-1">
                  {aiResponse.subtasks.map((st: any, i: number) => (
                    <div
                      key={i}
                      className="bg-slate-950 border border-slate-850 rounded-lg p-2.5 flex items-center justify-between text-xs"
                    >
                      <div className="flex items-center gap-2">
                        <CornerDownRight className="w-3.5 h-3.5 text-rose-400" />
                        <span className="text-white font-medium">{st.title}</span>
                      </div>
                      <span className="text-[10px] font-mono bg-rose-500/10 text-rose-400 px-2 py-0.5 rounded uppercase font-bold">
                        Day +{st.dayOffset} {st.suggestedTimeOfDay}
                      </span>
                    </div>
                  ))}
                </div>
              </div>

              <div className="flex gap-2">
                <button
                  onClick={() => setAiResponse(null)}
                  className="flex-1 bg-transparent hover:bg-slate-950 text-slate-300 font-semibold py-2.5 rounded-xl text-xs border border-slate-800 flex items-center justify-center gap-1.5"
                >
                  <RefreshCw className="w-3.5 h-3.5" />
                  <span>Revise Blocker</span>
                </button>
                <button
                  onClick={handleAcceptReplan}
                  className="flex-1 bg-rose-600 hover:bg-rose-500 text-white font-bold py-2.5 rounded-xl text-xs uppercase tracking-widest flex items-center justify-center gap-1.5"
                >
                  <CheckCircle className="w-3.5 h-3.5" />
                  <span>Accept Schedule</span>
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      {/* 2. CRITICAL LEVEL TAKEOVER MODAL */}
      {level === "critical" && (
        <div
          id="critical_level_takeover_modal"
          className="bg-slate-950 border-2 border-rose-500 rounded-3xl max-w-xl w-full p-8 shadow-2xl relative space-y-6 text-center animate-bounce-short"
        >
          <div className="mx-auto w-16 h-16 rounded-2xl bg-rose-500/10 border border-rose-500/30 flex items-center justify-center text-rose-500 mb-2">
            <AlertOctagon className="w-10 h-10 animate-pulse" />
          </div>

          <div>
            <span className="text-[10px] text-rose-500 font-bold uppercase tracking-widest block mb-1">
              CRITICAL INTERVENTION TAKEOVER
            </span>
            <h3 className="text-2xl font-display font-bold text-white leading-tight">
              YOUR COMPLETION STREAK IS AT RISK!
            </h3>
            <p className="text-sm text-slate-300 mt-2">
              You have ignored warnings or missed deadlines multiple times.
              Your current streak of <span className="text-rose-400 font-extrabold text-base">{currentStreak} days</span> is about to be terminated.
            </p>
          </div>

          {/* Warning Card */}
          <div className="bg-slate-900 border border-rose-500/10 rounded-2xl p-5 text-left space-y-3">
            <div className="flex gap-2 items-center text-rose-400 text-xs font-semibold uppercase tracking-wider">
              <Skull className="w-4 h-4" />
              <span>Consequence Protocol</span>
            </div>
            <p className="text-xs text-slate-400 leading-relaxed">
              Goal: <span className="text-white font-semibold">"{task.goal}"</span>
              <br />
              If you click <span className="text-rose-400 font-semibold">"Give up"</span>, your streak will reset to 0, and this task will be permanently marked as "Failed". To dismiss this takeover and save your streak, you must type the action pledge below and commit immediately.
            </p>
          </div>

          {/* Action pledge input */}
          <form onSubmit={handleCriticalPledgeSubmit} className="space-y-4">
            <div>
              <label className="block text-[10px] font-bold text-rose-400 mb-2 uppercase tracking-widest">
                Type: "{PLEDGE_PHRASE}"
              </label>
              <input
                required
                type="text"
                placeholder="Type the exact phrase..."
                value={pledgeInput}
                onChange={(e) => setPledgeInput(e.target.value)}
                className="w-full bg-slate-900 border border-rose-500/20 rounded-xl px-4 py-3 text-center text-white text-sm font-semibold tracking-wide placeholder-rose-950/45 focus:outline-none focus:ring-2 focus:ring-rose-500/30"
              />
            </div>

            <div className="flex flex-col sm:flex-row gap-3">
              <button
                type="button"
                onClick={handleStreakBreakConfirm}
                className="order-2 sm:order-1 flex-1 bg-transparent hover:bg-slate-900 border border-rose-500/20 text-rose-400 font-semibold py-3 rounded-xl text-xs flex items-center justify-center gap-1.5 transition"
              >
                <Frown className="w-4 h-4" />
                <span>Reset Streak & Fail Task</span>
              </button>

              <button
                type="submit"
                disabled={pledgeInput.trim().toUpperCase() !== PLEDGE_PHRASE}
                className="order-1 sm:order-2 flex-1 bg-rose-600 hover:bg-rose-500 disabled:bg-rose-900/50 disabled:cursor-not-allowed text-white font-bold py-3 rounded-xl text-xs flex items-center justify-center gap-1.5 transition shadow-lg shadow-rose-950/40"
              >
                <TrendingUp className="w-4 h-4" />
                <span>Commit & Protect Streak</span>
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
}
