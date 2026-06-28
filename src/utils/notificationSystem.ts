import { Task, Subtask } from "../types";

// Class to handle simulated FCM registration and Browser notification scheduling
class NotificationSystem {
  private permissionGranted: boolean = false;
  private fcmToken: string | null = null;
  private listeners: Array<(event: any) => void> = [];

  constructor() {
    if (typeof window !== "undefined") {
      this.permissionGranted = "Notification" in window && Notification.permission === "granted";
      this.fcmToken = localStorage.getItem("nosnooze_mock_fcm_token") || null;

      // Start the background monitor loop for deadlines
      setInterval(() => {
        this.checkAndNudgeUpcomingDeadlines();
      }, 60000); // Check once a minute
    }
  }

  // Subscribe to system updates (e.g., token generated, notification fired)
  public subscribe(callback: (event: any) => void) {
    this.listeners.push(callback);
    return () => {
      this.listeners = this.listeners.filter((cb) => cb !== callback);
    };
  }

  private notifyListeners(event: any) {
    this.listeners.forEach((cb) => cb(event));
  }

  // Request browser notification permissions
  public async requestPermission(): Promise<boolean> {
    if (typeof window === "undefined" || !("Notification" in window)) {
      return false;
    }

    try {
      const permission = await Notification.requestPermission();
      this.permissionGranted = permission === "granted";
      
      if (this.permissionGranted && !this.fcmToken) {
        this.generateMockFCMToken();
      }

      this.notifyListeners({ type: "permission_change", granted: this.permissionGranted });
      return this.permissionGranted;
    } catch (error) {
      console.error("Error requesting notifications permission:", error);
      return false;
    }
  }

  // Check current browser permission state
  public getPermissionStatus(): NotificationPermission | "not-supported" {
    if (typeof window === "undefined" || !("Notification" in window)) {
      return "not-supported";
    }
    return Notification.permission;
  }

  // Simulate Firebase Cloud Messaging registration token creation
  public generateMockFCMToken(): string {
    const randomHex = Array.from({ length: 32 }, () =>
      Math.floor(Math.random() * 16).toString(16)
    ).join("");
    const token = `fcm:nosnooze_client_reg_${randomHex}`;
    
    this.fcmToken = token;
    localStorage.setItem("nosnooze_mock_fcm_token", token);
    
    this.notifyListeners({ type: "token_generated", token });
    return token;
  }

  public getFCMToken(): string | null {
    return this.fcmToken;
  }

  // Reset or regenerate token
  public resetFCMToken() {
    this.fcmToken = null;
    localStorage.removeItem("nosnooze_mock_fcm_token");
    this.notifyListeners({ type: "token_reset" });
  }

  // Checks if there are any uncompleted subtasks that are scheduled within the next 30 minutes,
  // and issues a gentle nudge via Notification if the browser tab is not active.
  private checkAndNudgeUpcomingDeadlines() {
    if (typeof window === "undefined" || !this.permissionGranted) return;

    // Only send the desktop notification if the user is not actively viewing the tab!
    if (document.visibilityState !== "hidden") return;

    const tasksStr = localStorage.getItem("nosnooze_tasks") || "[]";
    try {
      const tasks: Task[] = JSON.parse(tasksStr);
      const now = new Date();
      const thirtyMinutesFromNow = new Date(now.getTime() + 30 * 60000);

      tasks.forEach((task) => {
        if (task.status === "completed" || task.status === "failed") return;

        task.subtasks.forEach((subtask) => {
          if (subtask.completed || !subtask.scheduledTime) return;

          const scheduledDate = new Date(subtask.scheduledTime.replace(/-/g, "/"));
          // Check if scheduled time falls between now and 30 minutes from now
          if (scheduledDate > now && scheduledDate <= thirtyMinutesFromNow) {
            // Check if we already nudged the user for this specific subtask today
            const nudgeKey = `nosnooze_nudged_${subtask.id}`;
            const alreadyNudged = localStorage.getItem(nudgeKey);

            if (!alreadyNudged) {
              this.sendLocalNotification(
                "Upcoming Commitment Nudge!",
                `"${subtask.title}" starts soon (${subtask.scheduledTime.split(" ")[1] || ""}). Complete it to protect your streak!`
              );
              localStorage.setItem(nudgeKey, "true");
            }
          }
        });
      });
    } catch (e) {
      console.error("Error reading tasks in background notifier:", e);
    }
  }

  // Direct trigger to send a local desktop notification
  public sendLocalNotification(title: string, body: string, iconUrl?: string) {
    if (typeof window === "undefined" || !("Notification" in window)) return;

    if (Notification.permission === "granted") {
      const options = {
        body,
        icon: iconUrl || "https://fonts.gstatic.com/s/i/short-term/release/googlesymbols/notifications_active/default/24px.svg",
        requireInteraction: false,
      };
      
      const notification = new Notification(title, options);
      
      notification.onclick = () => {
        window.focus();
        notification.close();
      };

      this.notifyListeners({ type: "notification_sent", title, body });
    }
  }

  // Trigger a simulated incoming Firebase Cloud Messaging early-stage accountability check-in
  public triggerSimulatedFCMPush(type: "early" | "at_risk" | "morning") {
    let title = "";
    let body = "";

    switch (type) {
      case "early":
        title = "🔒 Early Check-in: Commitment Guard activated";
        body = "Did you make progress on your first milestone yet? Confirm to maintain your daily streak!";
        break;
      case "at_risk":
        title = "⚠️ Streak At Risk Alert";
        body = "You have 2 pending subtasks overdue. Take action now before your accountability contract escalates!";
        break;
      case "morning":
        title = "🌅 Morning Motivation Coach";
        body = "Namaste! Aaj ka schedule is loaded. Open the app to preview today's accountability metrics.";
        break;
    }

    // Always deliver visual alert in the app using custom handler
    this.notifyListeners({
      type: "fcm_received",
      title,
      body,
      timestamp: new Date().toLocaleTimeString(),
    });

    // Also fire a browser desktop notification if they are in another tab
    this.sendLocalNotification(title, body);
  }
}

export const notificationSystem = new NotificationSystem();
