import React, { useState, useEffect } from "react";
import { motion, AnimatePresence } from "motion/react";
import { 
  Bell, 
  BellOff, 
  ShieldAlert, 
  Send, 
  Terminal, 
  Copy, 
  Check, 
  RefreshCw, 
  Info,
  CalendarCheck2,
  Sparkles
} from "lucide-react";
import { notificationSystem } from "../utils/notificationSystem";

export default function NotificationFCMCenter() {
  const [permission, setPermission] = useState<string>("default");
  const [fcmToken, setFcmToken] = useState<string | null>(null);
  const [copied, setCopied] = useState<boolean>(false);
  const [logs, setLogs] = useState<Array<{ id: string; title: string; body: string; time: string; type: string }>>([]);

  useEffect(() => {
    // Sync initial states
    setPermission(notificationSystem.getPermissionStatus());
    setFcmToken(notificationSystem.getFCMToken());

    // Listen to changes in the notification system
    const unsubscribe = notificationSystem.subscribe((event) => {
      if (event.type === "permission_change") {
        setPermission(notificationSystem.getPermissionStatus());
        setFcmToken(notificationSystem.getFCMToken());
      } else if (event.type === "token_generated") {
        setFcmToken(event.token);
      } else if (event.type === "token_reset") {
        setFcmToken(null);
      } else if (event.type === "fcm_received" || event.type === "notification_sent") {
        setLogs((prev) => [
          {
            id: Math.random().toString(),
            title: event.title,
            body: event.body,
            time: event.timestamp || new Date().toLocaleTimeString(),
            type: event.type,
          },
          ...prev,
        ]);
      }
    });

    return () => unsubscribe();
  }, []);

  const handleRequestPermission = async () => {
    const granted = await notificationSystem.requestPermission();
    if (granted) {
      notificationSystem.sendLocalNotification(
        "🔔 Notifications Active!",
        "Awesome! NoSnooze will now alert you in the background before upcoming deadlines."
      );
    }
  };

  const handleRegenerateToken = () => {
    notificationSystem.generateMockFCMToken();
  };

  const handleCopyToken = () => {
    if (!fcmToken) return;
    navigator.clipboard.writeText(fcmToken);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleTriggerSimulatedPush = (type: "early" | "at_risk" | "morning") => {
    notificationSystem.triggerSimulatedFCMPush(type);
  };

  return (
    <div id="notification_fcm_center" className="bg-slate-900 border border-slate-800 rounded-3xl p-6 shadow-xl space-y-6">
      
      {/* HEADER */}
      <div className="flex items-center justify-between border-b border-slate-800/60 pb-4">
        <div className="flex items-center gap-3">
          <div className="p-2 bg-rose-500/10 border border-rose-500/20 rounded-2xl text-rose-400">
            <Bell className="w-5 h-5 animate-bounce" />
          </div>
          <div>
            <h3 className="text-sm font-black uppercase tracking-widest text-slate-200">
              Accountability Push Engine
            </h3>
            <p className="text-[10px] text-slate-500 font-mono mt-0.5">
              BROWSER NOTIFICATIONS & FIREBASE CLOUD MESSAGING
            </p>
          </div>
        </div>

        {permission === "granted" ? (
          <span className="flex items-center gap-1.5 px-3 py-1 bg-emerald-500/10 border border-emerald-500/20 rounded-full text-[10px] font-bold uppercase tracking-wider text-emerald-400 font-mono">
            <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
            Active
          </span>
        ) : (
          <span className="flex items-center gap-1.5 px-3 py-1 bg-amber-500/10 border border-amber-500/20 rounded-full text-[10px] font-bold uppercase tracking-wider text-amber-400 font-mono">
            <BellOff className="w-3.5 h-3.5" />
            Inactive
          </span>
        )}
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        
        {/* LEFT COLUMN: SETUP & REGISTRATION */}
        <div className="space-y-4">
          <div className="bg-slate-950/40 border border-slate-850 p-4 rounded-2xl space-y-3.5">
            <h4 className="text-[10px] font-bold uppercase tracking-widest text-slate-400 flex items-center gap-1.5">
              <CalendarCheck2 className="w-3.5 h-3.5 text-rose-400" />
              <span>Notification Authorization</span>
            </h4>
            <p className="text-xs text-slate-400 leading-relaxed">
              We send gentle background nudges when your tab is inactive or hidden, preventing you from missing crucial accountability goals.
            </p>
            
            {permission !== "granted" ? (
              <button
                type="button"
                onClick={handleRequestPermission}
                className="w-full flex items-center justify-center gap-2 px-4 py-2 bg-gradient-to-r from-rose-500 to-pink-500 text-white text-xs font-bold uppercase tracking-wider rounded-xl hover:opacity-90 active:scale-98 transition-all"
              >
                <Bell className="w-4 h-4" />
                Enable Desktop Alerts
              </button>
            ) : (
              <div className="p-3 bg-emerald-500/5 border border-emerald-500/10 rounded-xl text-center">
                <p className="text-xs text-emerald-400 font-bold">✓ Browser Permissions Enabled</p>
                <p className="text-[10px] text-slate-500 mt-1">Background accountability checks are running smoothly.</p>
              </div>
            )}
          </div>

          {/* FCM TOKEN DISCOVERY CARD */}
          <div className="bg-slate-950/40 border border-slate-850 p-4 rounded-2xl space-y-3">
            <div className="flex justify-between items-center">
              <h4 className="text-[10px] font-bold uppercase tracking-widest text-slate-400 flex items-center gap-1.5">
                <Terminal className="w-3.5 h-3.5 text-rose-400" />
                <span>Simulated FCM Device Token</span>
              </h4>
              {fcmToken && (
                <button
                  type="button"
                  onClick={handleRegenerateToken}
                  className="text-[9px] font-mono text-rose-400 hover:text-rose-300 flex items-center gap-1"
                  title="Regenerate token"
                >
                  <RefreshCw className="w-3 h-3" />
                  Regen
                </button>
              )}
            </div>

            {fcmToken ? (
              <div className="space-y-2">
                <div className="bg-slate-950 border border-slate-800 rounded-xl p-2.5 flex items-center justify-between gap-3 font-mono text-[9px] text-slate-400 overflow-hidden">
                  <span className="truncate flex-1 select-all">{fcmToken}</span>
                  <button
                    type="button"
                    onClick={handleCopyToken}
                    className="p-1 hover:bg-slate-900 rounded text-slate-400 hover:text-white transition"
                  >
                    {copied ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
                  </button>
                </div>
                <p className="text-[9px] text-slate-500 leading-normal">
                  This persistent client token is registered within Firebase Cloud Messaging for instant morning agendas & early-stage check-ins.
                </p>
              </div>
            ) : (
              <div className="text-center py-4">
                <p className="text-xs text-slate-500 italic">No registered FCM token found.</p>
                <button
                  type="button"
                  onClick={handleRequestPermission}
                  className="mt-2 text-[10px] font-bold uppercase tracking-wider text-rose-400 hover:text-rose-300"
                >
                  Authorize to Register
                </button>
              </div>
            )}
          </div>
        </div>

        {/* RIGHT COLUMN: INTERACTIVE SIMULATOR & PUSH LOGGER */}
        <div className="space-y-4">
          <div className="bg-slate-950/40 border border-slate-850 p-4 rounded-2xl space-y-3">
            <h4 className="text-[10px] font-bold uppercase tracking-widest text-slate-400 flex items-center gap-1.5">
              <Sparkles className="w-3.5 h-3.5 text-rose-400" />
              <span>Simulate Cloud Messaging</span>
            </h4>
            
            <div className="grid grid-cols-1 gap-2.5">
              <button
                type="button"
                onClick={() => handleTriggerSimulatedPush("morning")}
                className="flex items-center justify-between px-3.5 py-2.5 bg-slate-900 border border-slate-800 hover:border-rose-500/20 rounded-xl text-left hover:bg-slate-850/60 transition group cursor-pointer"
              >
                <div className="space-y-0.5">
                  <p className="text-xs font-bold text-slate-200">🌅 Morning Agenda</p>
                  <p className="text-[9px] text-slate-500 leading-none">Deliver morning motivational prompts in Hinglish</p>
                </div>
                <Send className="w-3.5 h-3.5 text-slate-500 group-hover:text-rose-400 transition" />
              </button>

              <button
                type="button"
                onClick={() => handleTriggerSimulatedPush("early")}
                className="flex items-center justify-between px-3.5 py-2.5 bg-slate-900 border border-slate-800 hover:border-rose-500/20 rounded-xl text-left hover:bg-slate-850/60 transition group cursor-pointer"
              >
                <div className="space-y-0.5">
                  <p className="text-xs font-bold text-slate-200">🔒 Early Check-in Nudge</p>
                  <p className="text-[9px] text-slate-500 leading-none">Simulate the early-stage accountability checklist push</p>
                </div>
                <Send className="w-3.5 h-3.5 text-slate-500 group-hover:text-rose-400 transition" />
              </button>

              <button
                type="button"
                onClick={() => handleTriggerSimulatedPush("at_risk")}
                className="flex items-center justify-between px-3.5 py-2.5 bg-slate-900 border border-slate-800 hover:border-rose-500/20 rounded-xl text-left hover:bg-slate-850/60 transition group cursor-pointer"
              >
                <div className="space-y-0.5">
                  <p className="text-xs font-bold text-slate-200">⚠️ Streak-at-Risk Alarm</p>
                  <p className="text-[9px] text-slate-500 leading-none">Trigger the urgent fallback push warning</p>
                </div>
                <Send className="w-3.5 h-3.5 text-slate-500 group-hover:text-rose-400 transition" />
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* INCOMING NOTIFICATION LOGS FEED */}
      <div className="bg-slate-950/60 border border-slate-850 rounded-2xl p-4">
        <h4 className="text-[10px] font-bold uppercase tracking-widest text-slate-400 mb-3 flex items-center justify-between">
          <span>Incoming Messaging Stream logs</span>
          <span className="text-[8px] font-mono text-slate-600 bg-slate-950 px-2 py-0.5 rounded border border-slate-850">
            {logs.length} logged
          </span>
        </h4>

        {logs.length > 0 ? (
          <div className="space-y-2.5 max-h-40 overflow-y-auto pr-1">
            <AnimatePresence initial={false}>
              {logs.map((log) => (
                <motion.div
                  key={log.id}
                  initial={{ opacity: 0, x: -10 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0 }}
                  className="bg-slate-900/80 border border-slate-850 rounded-xl p-3 flex justify-between items-start gap-4"
                >
                  <div className="space-y-1 min-w-0 flex-1">
                    <p className="text-xs font-bold text-slate-200 flex items-center gap-1.5">
                      <span className="w-1.5 h-1.5 bg-rose-500 rounded-full animate-ping" />
                      {log.title}
                    </p>
                    <p className="text-[11px] text-slate-400 leading-normal">{log.body}</p>
                  </div>
                  <span className="text-[9px] font-mono text-slate-500 whitespace-nowrap bg-slate-950/40 px-1.5 py-0.5 rounded">
                    {log.time}
                  </span>
                </motion.div>
              ))}
            </AnimatePresence>
          </div>
        ) : (
          <div className="text-center py-6 text-[11px] text-slate-500 italic bg-slate-900/10 border border-dashed border-slate-850 rounded-xl">
            No notification streams recorded yet. Trigger a simulated push above!
          </div>
        )}
      </div>

      {/* INFO FOOTER FOOTNOTE */}
      <div className="bg-rose-500/5 border border-rose-500/10 rounded-xl p-3 flex gap-2.5 items-start">
        <Info className="w-3.5 h-3.5 text-rose-400 flex-shrink-0 mt-0.5" />
        <p className="text-[10px] text-slate-400 leading-normal">
          <strong className="text-slate-300">Visibility Syncing:</strong> If you leave NoSnooze in the background (hidden browser tab), our localized check loop will automatically alert you of imminent subtask commitments within 30 minutes!
        </p>
      </div>

    </div>
  );
}
