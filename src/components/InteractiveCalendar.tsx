import React, { useState, useEffect } from "react";
import { Calendar as CalendarIcon, Clock, ArrowRight, ShieldAlert, CheckCircle2 } from "lucide-react";
import { Subtask } from "../types";

interface InteractiveCalendarProps {
  goal: string;
  deadline: string;
  suggestedSubtasks: Omit<Subtask, "id" | "completed">[];
  onCommit: (finalSubtasks: Subtask[]) => void;
  onCancel: () => void;
}

export default function InteractiveCalendar({
  goal,
  deadline,
  suggestedSubtasks,
  onCommit,
  onCancel,
}: InteractiveCalendarProps) {
  // Let's build a mutable copy of suggested subtasks with local state for editing
  const [subtasks, setSubtasks] = useState<any[]>([]);

  useEffect(() => {
    // Map with initial temporary IDs and default scheduledTimes if not present
    const mapped = suggestedSubtasks.map((st, i) => {
      return {
        ...st,
        id: `temp_${i}_${Date.now()}`,
        completed: false,
      };
    });
    setSubtasks(mapped);
  }, [suggestedSubtasks]);

  const daysOfWeek = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
  const timeSlotLabels = {
    morning: "Morning (09:00)",
    afternoon: "Afternoon (14:00)",
    evening: "Evening (19:00)",
  };

  // Helper to format offsets to day names relative to today
  const getDayLabel = (offset: number) => {
    const d = new Date();
    d.setDate(d.getDate() + offset);
    if (offset === 0) return "Today";
    if (offset === 1) return "Tomorrow";
    return `${daysOfWeek[d.getDay()]} (${d.getMonth() + 1}/${d.getDate()})`;
  };

  const handleDayChange = (id: string, newOffset: number) => {
    setSubtasks((prev) =>
      prev.map((st) => {
        if (st.id === id) {
          const d = new Date();
          d.setDate(d.getDate() + newOffset);
          let timeStr = st.scheduledTime ? (st.scheduledTime.split(" ")[1] || "09:00") : "09:00";
          const YYYY = d.getFullYear();
          const MM = String(d.getMonth() + 1).padStart(2, "0");
          const DD = String(d.getDate()).padStart(2, "0");
          return {
            ...st,
            dayOffset: Math.max(0, newOffset),
            scheduledTime: `${YYYY}-${MM}-${DD} ${timeStr}`,
          };
        }
        return st;
      })
    );
  };

  const handleTimeOfDayChange = (id: string, slot: "morning" | "afternoon" | "evening") => {
    setSubtasks((prev) =>
      prev.map((st) => {
        if (st.id === id) {
          const d = new Date();
          d.setDate(d.getDate() + st.dayOffset);
          let timeStr = "09:00";
          if (slot === "afternoon") timeStr = "14:00";
          if (slot === "evening") timeStr = "19:00";
          const YYYY = d.getFullYear();
          const MM = String(d.getMonth() + 1).padStart(2, "0");
          const DD = String(d.getDate()).padStart(2, "0");
          return {
            ...st,
            suggestedTimeOfDay: slot,
            scheduledTime: `${YYYY}-${MM}-${DD} ${timeStr}`,
          };
        }
        return st;
      })
    );
  };

  const handleTitleChange = (id: string, title: string) => {
    setSubtasks((prev) => prev.map((st) => (st.id === id ? { ...st, title } : st)));
  };

  const handleDurationChange = (id: string, mins: number) => {
    setSubtasks((prev) => prev.map((st) => (st.id === id ? { ...st, durationMinutes: mins } : st)));
  };

  const handleSaveAndCommit = () => {
    const final: Subtask[] = subtasks.map((st, index) => {
      const d = new Date();
      d.setDate(d.getDate() + st.dayOffset);
      let timeStr = "09:00";
      if (st.suggestedTimeOfDay === "afternoon") timeStr = "14:00";
      if (st.suggestedTimeOfDay === "evening") timeStr = "19:00";

      const YYYY = d.getFullYear();
      const MM = String(d.getMonth() + 1).padStart(2, "0");
      const DD = String(d.getDate()).padStart(2, "0");

      return {
        id: `st_${index}_${Math.random().toString(36).substr(2, 9)}`,
        title: st.title || `Sub-task ${index + 1}`,
        durationMinutes: Number(st.durationMinutes) || 60,
        dayOffset: Number(st.dayOffset),
        suggestedTimeOfDay: st.suggestedTimeOfDay,
        completed: false,
        scheduledTime: st.scheduledTime || `${YYYY}-${MM}-${DD} ${timeStr}`,
      };
    });

    onCommit(final);
  };

  return (
    <div id="interactive_calendar_container" className="bg-slate-900/40 border border-slate-800 rounded-2xl p-6 shadow-xl space-y-6">
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 border-b border-slate-800 pb-4">
        <div>
          <div className="flex items-center gap-2 text-xs text-rose-400 font-semibold uppercase tracking-wider mb-1">
            <ShieldAlert className="w-4 h-4" />
            <span>Interactive Scheduling Preview</span>
          </div>
          <h2 className="text-xl font-display font-semibold text-white">
            Block Out Slots for: <span className="text-rose-400 font-bold">"{goal}"</span>
          </h2>
          <p className="text-xs text-slate-400 mt-1">
            Review and adjust each sub-task to guarantee you finish before your deadline:{" "}
            <span className="text-slate-300 font-mono">
              {new Date(deadline).toLocaleDateString()} {new Date(deadline).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
            </span>
          </p>
        </div>
        <div className="flex gap-2 w-full md:w-auto">
          <button
            onClick={onCancel}
            className="flex-1 md:flex-none border border-slate-800 hover:bg-slate-950 text-slate-300 px-4 py-2.5 rounded-xl text-xs font-semibold transition"
          >
            Reset
          </button>
          <button
            onClick={handleSaveAndCommit}
            className="flex-1 md:flex-none bg-rose-600 hover:bg-rose-500 text-white px-4 py-2.5 rounded-xl text-xs font-bold uppercase tracking-widest flex items-center justify-center gap-2 shadow-lg shadow-rose-950/40 transition"
          >
            <CheckCircle2 className="w-4 h-4" />
            <span>Lock & Commit</span>
          </button>
        </div>
      </div>

      {/* Grid of decomposed subtasks for manual editing and slot alignment */}
      <div className="space-y-4">
        {subtasks.map((st, index) => {
          return (
            <div
              key={st.id}
              className="bg-slate-950 border border-slate-850 hover:border-rose-500/30 rounded-xl p-4 transition-all duration-200"
            >
              <div className="grid grid-cols-1 lg:grid-cols-12 gap-4 items-center">
                {/* Index & Title Input */}
                <div className="lg:col-span-5 flex flex-col justify-center">
                  <div className="flex items-center gap-3">
                    <div className="w-6 h-6 rounded-full bg-slate-900 border border-slate-800 flex items-center justify-center text-xs font-bold text-rose-400 flex-shrink-0">
                      {index + 1}
                    </div>
                    <input
                      type="text"
                      value={st.title}
                      onChange={(e) => handleTitleChange(st.id, e.target.value)}
                      className="w-full bg-transparent border-b border-transparent hover:border-slate-800 focus:border-rose-500 focus:outline-none text-white text-sm font-medium py-1"
                    />
                  </div>
                  {st.scheduledTime && (
                    <p className="text-[10px] text-rose-400 font-mono mt-1 ml-9">
                      ⚡ Scheduled Slot: {st.scheduledTime}
                    </p>
                  )}
                </div>

                {/* Duration Picker */}
                <div className="lg:col-span-2 flex items-center gap-1.5 bg-slate-900 border border-slate-800 rounded-lg px-2 py-1.5">
                  <Clock className="w-3.5 h-3.5 text-slate-500" />
                  <input
                    type="number"
                    value={st.durationMinutes}
                    onChange={(e) => handleDurationChange(st.id, parseInt(e.target.value))}
                    className="w-10 bg-transparent text-white text-xs font-medium focus:outline-none"
                  />
                  <span className="text-xs text-slate-500">mins</span>
                </div>

                {/* Relative Day Selector */}
                <div className="lg:col-span-3 flex items-center gap-1.5 bg-slate-900 border border-slate-800 rounded-lg px-2.5 py-1.5">
                  <CalendarIcon className="w-3.5 h-3.5 text-rose-400" />
                  <select
                    value={st.dayOffset}
                    onChange={(e) => handleDayChange(st.id, parseInt(e.target.value))}
                    className="bg-transparent text-white text-xs focus:outline-none w-full cursor-pointer"
                  >
                    <option value={0} className="bg-slate-900">{getDayLabel(0)}</option>
                    <option value={1} className="bg-slate-900">{getDayLabel(1)}</option>
                    <option value={2} className="bg-slate-900">{getDayLabel(2)}</option>
                    <option value={3} className="bg-slate-900">{getDayLabel(3)}</option>
                    <option value={4} className="bg-slate-900">{getDayLabel(4)}</option>
                  </select>
                </div>

                {/* Time of Day Picker */}
                <div className="lg:col-span-2 flex items-center gap-1 bg-slate-900 border border-slate-800 rounded-lg p-1">
                  <button
                    onClick={() => handleTimeOfDayChange(st.id, "morning")}
                    className={`flex-1 text-[10px] font-bold py-1 rounded transition-all ${
                      st.suggestedTimeOfDay === "morning"
                        ? "bg-rose-600 text-white"
                        : "text-slate-400 hover:text-white"
                    }`}
                  >
                    AM
                  </button>
                  <button
                    onClick={() => handleTimeOfDayChange(st.id, "afternoon")}
                    className={`flex-1 text-[10px] font-bold py-1 rounded transition-all ${
                      st.suggestedTimeOfDay === "afternoon"
                        ? "bg-rose-600 text-white"
                        : "text-slate-400 hover:text-white"
                    }`}
                  >
                    PM
                  </button>
                  <button
                    onClick={() => handleTimeOfDayChange(st.id, "evening")}
                    className={`flex-1 text-[10px] font-bold py-1 rounded transition-all ${
                      st.suggestedTimeOfDay === "evening"
                        ? "bg-rose-600 text-white"
                        : "text-slate-400 hover:text-white"
                    }`}
                  >
                    EVE
                  </button>
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {/* Footer calendar visualization of scheduling slots */}
      <div className="p-4 bg-slate-950 border border-slate-800 rounded-xl">
        <h3 className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-3">Internal Calendar Layout</h3>
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-5 gap-3">
          {[0, 1, 2, 3, 4].map((offset) => {
            const tasksForDay = subtasks.filter((s) => s.dayOffset === offset);
            return (
              <div key={offset} className="bg-slate-900 border border-slate-850 rounded-lg p-2.5">
                <span className="text-[11px] font-semibold text-rose-400 block border-b border-slate-800 pb-1 mb-2">
                  {offset === 0 ? "Today" : offset === 1 ? "Tomorrow" : getDayLabel(offset).split(" ")[0]}
                </span>
                {tasksForDay.length === 0 ? (
                  <span className="text-[10px] text-slate-500 italic">Empty Slot</span>
                ) : (
                  <div className="space-y-1.5">
                    {tasksForDay.map((s, index) => (
                      <div
                        key={s.id}
                        className="bg-slate-950 border border-slate-800 p-1.5 rounded text-[10px] text-white truncate"
                        title={s.title}
                      >
                        <span className="text-rose-500 font-mono text-[9px] uppercase font-bold block">
                          {s.suggestedTimeOfDay}
                        </span>
                        {s.title}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
