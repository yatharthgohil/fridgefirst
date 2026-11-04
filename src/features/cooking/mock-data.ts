import { TimelineStep } from "./types";

export const defaultSmartTimeline: TimelineStep[] = [
  { time: "0:00", duration: "0–8 min", title: "Prep chickpeas & broccoli", detail: "Dry, chop, season, and arrange on the tray.", type: "active" },
  { time: "0:08", duration: "8–26 min", title: "Roast tray", detail: "Oven work begins. Turn the tray once at 17 minutes.", type: "passive" },
  { time: "0:09", duration: "9–15 min", title: "Blend green goddess sauce", detail: "Safe to overlap while the tray roasts.", type: "parallel" },
  { time: "0:15", duration: "15–19 min", title: "Quick cleanup", detail: "Rinse blender, wipe the board, and load the dishwasher.", type: "cleanup" },
  { time: "0:19", duration: "19–26 min", title: "Warm grains & set bowls", detail: "Keep an ear out for the turn-tray alert.", type: "parallel" },
  { time: "0:26", duration: "26–32 min", title: "Assemble & finish", detail: "Check doneness, build bowls, and add dressing.", type: "active" },
];
