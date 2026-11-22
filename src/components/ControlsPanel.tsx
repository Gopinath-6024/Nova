import React, { useState } from 'react';
import {
  AlarmClock,
  BatteryCharging,
  Bell,
  Bluetooth,
  Check,
  Cloud,
  Code2,
  Compass,
  Droplets,
  Eye,
  Fingerprint,
  Flashlight,
  HeartPulse,
  KeyRound,
  Lock,
  LogIn,
  LogOut,
  Moon,
  Pause,
  Play,
  Plus,
  Plane,
  RefreshCw,
  SkipForward,
  Sparkles,
  Sun,
  Trash2,
  Unlock,
  Volume2,
  Wifi,
  Zap,
} from 'lucide-react';
import type { User } from 'firebase/auth';
import type {
  AdaptedCommandCode,
  AlarmItem,
  BackgroundSyncState,
  BiometricState,
  DeviceControlsState,
  QuickCommandKey,
  TaskItem,
} from '../types/nova';

interface ControlsPanelProps {
  device: DeviceControlsState;
  tasks: TaskItem[];
  alarms: AlarmItem[];
  adaptedCodes: AdaptedCommandCode[];
  commandKeys: QuickCommandKey[];
  biometrics: BiometricState;
  isUnlocked: boolean;
  proactiveBrief: string | null;
  briefLoading: boolean;
  onToggleSetting: (key: keyof DeviceControlsState, requiresBio?: boolean) => void;
  onChangeSlider: (key: 'brightness' | 'volume', value: number) => void;
  onMediaToggle: () => void;
  onMediaNext: () => void;
  onAddTask: (task: Omit<TaskItem, 'id' | 'completed'>) => void;
  onToggleTask: (id: string) => void;
  onDeleteTask: (id: string) => void;
  onAddAlarm: (alarm: Omit<AlarmItem, 'id'>) => void;
  onToggleAlarm: (id: string) => void;
  onDeleteAlarm: (id: string) => void;
  onRunAdaptedCode: (code: AdaptedCommandCode) => void;
  onDeleteAdaptedCode: (id: string) => void;
  onCreateCommandKey: (params: {
    label: string;
    commandPrompt: string;
    operationType: QuickCommandKey['operationType'];
  }) => void;
  onRunCommandKey: (key: QuickCommandKey) => void;
  onDeleteCommandKey: (id: string) => void;
  onRunExpressOp: (op: 'focus' | 'privacy' | 'pdf' | 'wallpaper') => void;
  cloudUser: User | null;
  syncState: BackgroundSyncState;
  onSignInCloud: () => void;
  onSignOutCloud: () => void;
  onSyncNow: () => void;
  onActivateHealthyNova: (preset: 'hydration' | 'eyes' | 'posture' | 'sleep') => void;
  onRequestUnlock: (reason: string) => void;
  onLockNow: () => void;
  onRefreshBrief: () => void;
}

export const ControlsPanel: React.FC<ControlsPanelProps> = ({
  device,
  tasks,
  alarms,
  adaptedCodes,
  commandKeys,
  biometrics,
  isUnlocked,
  proactiveBrief,
  briefLoading,
  onToggleSetting,
  onChangeSlider,
  onMediaToggle,
  onMediaNext,
  onAddTask,
  onToggleTask,
  onDeleteTask,
  onAddAlarm,
  onToggleAlarm,
  onDeleteAlarm,
  onRunAdaptedCode,
  onDeleteAdaptedCode,
  onCreateCommandKey,
  onRunCommandKey,
  onDeleteCommandKey,
  onRunExpressOp,
  cloudUser,
  syncState,
  onSignInCloud,
  onSignOutCloud,
  onSyncNow,
  onActivateHealthyNova,
  onRequestUnlock,
  onLockNow,
  onRefreshBrief,
}) => {
  const [newTitle, setNewTitle] = useState('');
  const [newTime, setNewTime] = useState('Today · 5:00 PM');
  const [newCategory, setNewCategory] = useState<TaskItem['category']>('personal');
  const [newPriority, setNewPriority] = useState<TaskItem['priority']>('medium');

  const [alarmTime, setAlarmTime] = useState('07:00');
  const [alarmLabel, setAlarmLabel] = useState('Morning Alarm');

  const [keyLabel, setKeyLabel] = useState('');
  const [keyCommand, setKeyCommand] = useState('');
  const [keyOpType, setKeyOpType] = useState<QuickCommandKey['operationType']>('macro');

  const handleCreateTask = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newTitle.trim()) return;
    onAddTask({
      title: newTitle.trim(),
      dueTime: newTime.trim() || 'Today',
      category: newCategory,
      priority: newPriority,
    });
    setNewTitle('');
  };

  const handleCreateAlarm = (e: React.FormEvent) => {
    e.preventDefault();
    if (!alarmTime) return;
    onAddAlarm({
      time24: alarmTime,
      label: alarmLabel.trim() || 'Nova Alarm',
      enabled: true,
      repeatDays: ['Daily'],
    });
    setAlarmLabel('Nova Alarm');
  };

  const quickToggles: Array<{
    key: keyof DeviceControlsState;
    label: string;
    active: boolean;
    icon: React.ReactNode;
    sensitive?: boolean;
  }> = [
    { key: 'wifi', label: 'Wi-Fi', active: device.wifi, icon: <Wifi className="h-5 w-5" /> },
    {
      key: 'bluetooth',
      label: 'Bluetooth',
      active: device.bluetooth,
      icon: <Bluetooth className="h-5 w-5" />,
    },
    {
      key: 'dnd',
      label: 'Do Not Disturb',
      active: device.dnd,
      icon: <Moon className="h-5 w-5" />,
    },
    {
      key: 'flashlight',
      label: 'Flashlight',
      active: device.flashlight,
      icon: <Flashlight className="h-5 w-5" />,
    },
    {
      key: 'batterySaver',
      label: 'Battery Saver',
      active: device.batterySaver,
      icon: <BatteryCharging className="h-5 w-5" />,
    },
    {
      key: 'location',
      label: 'Location GPS',
      active: device.location,
      icon: <Compass className="h-5 w-5" />,
      sensitive: true,
    },
    {
      key: 'airplaneMode',
      label: 'Airplane Mode',
      active: device.airplaneMode,
      icon: <Plane className="h-5 w-5" />,
      sensitive: true,
    },
    {
      key: 'autoSync',
      label: 'Auto-Sync',
      active: device.autoSync,
      icon: <RefreshCw className="h-5 w-5" />,
    },
  ];

  const enableNotifications = async () => {
    if (typeof Notification !== 'undefined' && Notification.permission === 'default') {
      await Notification.requestPermission();
    }
  };

  return (
    <div className="space-y-6">
      {/* Biometric & Device Hardware Banner */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 rounded-2xl border border-violet-400/15 bg-white dark:bg-[#120D1F] p-5">
        <div className="flex items-start gap-3.5">
          <div
            className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-xl ${
              isUnlocked
                ? 'bg-emerald-500/15 text-emerald-300'
                : 'bg-violet-500/15 text-violet-600 dark:text-violet-300'
            }`}
          >
            {isUnlocked ? <Unlock className="h-5 w-5" /> : <Fingerprint className="h-5 w-5" />}
          </div>
          <div>
            <h2 className="text-base font-semibold text-slate-900 dark:text-white">
              {isUnlocked ? 'Fingerprint Access Unlocked' : 'Fingerprint-Protected Controls'}
            </h2>
            <p className="mt-0.5 text-xs text-slate-600 dark:text-slate-400">
              {biometrics.enrolled
                ? isUnlocked
                  ? 'Sensitive toggles (GPS Location, Airplane Mode, Security actions) are unlocked for this session.'
                  : 'Verify with your fingerprint to unlock sensitive hardware switches & deep security actions.'
                : 'Enroll your fingerprint once to control sensitive phone settings hands-free.'}
            </p>
            <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-slate-600 dark:text-slate-400 tabular-nums">
              <span>Network: {device.networkType}</span>
              <span aria-hidden="true">·</span>
              <span>
                Battery:{' '}
                {device.batteryLevel !== null
                  ? `${device.batteryLevel}%${device.batteryCharging ? ' (Charging)' : ''}`
                  : 'Managed by OS'}
              </span>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-2 shrink-0">
          {isUnlocked ? (
            <button
              type="button"
              onClick={onLockNow}
              className="flex min-h-[44px] items-center gap-2 rounded-xl border border-violet-400/25 bg-slate-100 dark:bg-[#19122B] px-4 py-2 text-xs font-semibold text-slate-800 dark:text-slate-200 hover:bg-violet-900/30 transition-colors whitespace-nowrap"
            >
              <Lock className="h-4 w-4 text-violet-600 dark:text-violet-300" />
              <span>Lock Session</span>
            </button>
          ) : (
            <button
              type="button"
              onClick={() =>
                onRequestUnlock('Unlock GPS Location, Airplane Mode, and Security actions')
              }
              className="flex min-h-[44px] items-center gap-2 rounded-xl bg-violet-600 px-4 py-2 text-xs font-semibold text-white hover:bg-violet-500 transition-colors whitespace-nowrap"
            >
              <Fingerprint className="h-4 w-4" />
              <span>{biometrics.enrolled ? 'Verify Fingerprint' : 'Enroll Fingerprint'}</span>
            </button>
          )}
        </div>
      </div>

      {/* Cloud Storage & Background Sync + Healthy Nova Companion */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-5">
        <section className="lg:col-span-6 rounded-2xl border border-violet-400/15 bg-white dark:bg-[#120D1F] p-5 flex flex-col justify-between gap-4">
          <div className="flex items-start justify-between gap-3">
            <div className="flex items-start gap-3">
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-violet-500/15 text-violet-600 dark:text-violet-300">
                <Cloud className="h-5 w-5" />
              </div>
              <div>
                <h2 className="text-sm font-semibold text-slate-900 dark:text-white">
                  Cloud Vault &amp; Background Sync
                </h2>
                <p className="mt-0.5 text-xs text-slate-600 dark:text-slate-400 leading-relaxed">
                  {cloudUser
                    ? `Signed in as ${cloudUser.email || cloudUser.displayName || 'Private Account'}. Offline edits to tasks, alarms, and indexed files reconcile automatically on reconnect.`
                    : 'Connect Google to back up tasks, alarms, and indexed files across devices with automatic offline reconciliation.'}
                </p>
              </div>
            </div>
          </div>

          {syncState.errorMessage && (
            <div className="rounded-xl border border-rose-400/25 bg-rose-950/35 px-3 py-2 text-xs text-rose-200">
              {syncState.errorMessage}
            </div>
          )}

          <div className="flex flex-wrap items-center justify-between gap-3 border-t border-slate-200 dark:border-white/8 pt-3.5">
            <div className="text-xs text-slate-700 dark:text-slate-300 tabular-nums">
              {syncState.pendingCount > 0
                ? `${syncState.pendingCount} offline change(s) queued`
                : syncState.lastSyncedAt
                  ? `Synced at ${syncState.lastSyncedAt}${syncState.lastSummary ? ` · ${syncState.lastSummary}` : ''}`
                  : cloudUser
                    ? 'Vault ready for automatic reconciliation'
                    : 'Local vault active'}
            </div>

            <div className="flex items-center gap-2 shrink-0">
              {cloudUser ? (
                <>
                  <button
                    type="button"
                    onClick={onSyncNow}
                    disabled={syncState.status === 'syncing'}
                    className="flex min-h-[40px] items-center gap-1.5 rounded-xl bg-violet-600 px-3.5 text-xs font-semibold text-white hover:bg-violet-500 disabled:opacity-50 transition-colors"
                  >
                    <RefreshCw
                      className={`h-3.5 w-3.5 ${syncState.status === 'syncing' ? 'animate-spin' : ''}`}
                    />
                    <span>{syncState.status === 'syncing' ? 'Syncing...' : 'Sync Now'}</span>
                  </button>
                  <button
                    type="button"
                    onClick={onSignOutCloud}
                    className="flex min-h-[40px] items-center gap-1.5 rounded-xl border border-slate-200 dark:border-white/12 bg-slate-50 dark:bg-[#181228] px-3 text-xs font-medium text-slate-700 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white transition-colors"
                  >
                    <LogOut className="h-3.5 w-3.5" />
                    <span>Sign Out</span>
                  </button>
                </>
              ) : (
                <button
                  type="button"
                  onClick={onSignInCloud}
                  className="flex min-h-[40px] items-center gap-1.5 rounded-xl bg-violet-600 px-4 text-xs font-semibold text-white hover:bg-violet-500 transition-colors"
                >
                  <LogIn className="h-3.5 w-3.5" />
                  <span>Connect Cloud Vault</span>
                </button>
              )}
            </div>
          </div>
        </section>

        {/* Healthy Nova Routine Builder */}
        <section className="lg:col-span-6 rounded-2xl border border-emerald-400/20 bg-white dark:bg-[#120D1F] p-5 flex flex-col justify-between gap-4">
          <div className="flex items-start justify-between gap-3">
            <div className="flex items-start gap-3">
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-emerald-500/15 text-emerald-300">
                <HeartPulse className="h-5 w-5" />
              </div>
              <div>
                <h2 className="text-sm font-semibold text-slate-900 dark:text-white">Healthy Nova Wellness</h2>
                <p className="mt-0.5 text-xs text-slate-600 dark:text-slate-400 leading-relaxed">
                  One-tap healthy habits &amp; wind-down routines synced to your tasks and alarms
                </p>
              </div>
            </div>
            <span className="text-xs font-medium text-emerald-300 tabular-nums shrink-0">
              {tasks.filter((t) => t.category === 'health' && !t.completed).length} active
            </span>
          </div>

          <div className="grid grid-cols-2 gap-2">
            <button
              type="button"
              onClick={() => onActivateHealthyNova('hydration')}
              className="flex min-h-[44px] items-center gap-2 rounded-xl border border-emerald-400/20 bg-slate-50 dark:bg-[#181228] px-3 py-2 text-left text-xs font-medium text-slate-800 dark:text-slate-200 hover:border-emerald-400/45 hover:bg-emerald-500/10 transition-colors"
            >
              <Droplets className="h-4 w-4 text-emerald-300 shrink-0" />
              <span>Hydration Check</span>
            </button>
            <button
              type="button"
              onClick={() => onActivateHealthyNova('eyes')}
              className="flex min-h-[44px] items-center gap-2 rounded-xl border border-emerald-400/20 bg-slate-50 dark:bg-[#181228] px-3 py-2 text-left text-xs font-medium text-slate-800 dark:text-slate-200 hover:border-emerald-400/45 hover:bg-emerald-500/10 transition-colors"
            >
              <Eye className="h-4 w-4 text-emerald-300 shrink-0" />
              <span>20-20-20 Eye Break</span>
            </button>
            <button
              type="button"
              onClick={() => onActivateHealthyNova('posture')}
              className="flex min-h-[44px] items-center gap-2 rounded-xl border border-emerald-400/20 bg-slate-50 dark:bg-[#181228] px-3 py-2 text-left text-xs font-medium text-slate-800 dark:text-slate-200 hover:border-emerald-400/45 hover:bg-emerald-500/10 transition-colors"
            >
              <HeartPulse className="h-4 w-4 text-emerald-300 shrink-0" />
              <span>Posture &amp; Stretch</span>
            </button>
            <button
              type="button"
              onClick={() => onActivateHealthyNova('sleep')}
              className="flex min-h-[44px] items-center gap-2 rounded-xl border border-emerald-400/20 bg-slate-50 dark:bg-[#181228] px-3 py-2 text-left text-xs font-medium text-slate-800 dark:text-slate-200 hover:border-emerald-400/45 hover:bg-emerald-500/10 transition-colors"
            >
              <Moon className="h-4 w-4 text-violet-600 dark:text-violet-300 shrink-0" />
              <span>22:30 Sleep Alarm</span>
            </button>
          </div>
        </section>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Left: Phone Quick Controls, Sliders & Live Alarms */}
        <div className="lg:col-span-6 space-y-5">
          <section className="rounded-2xl border border-violet-400/12 bg-white dark:bg-[#120D1F] p-5">
            <div className="flex items-center justify-between mb-4">
              <div>
                <h3 className="text-sm font-semibold text-slate-900 dark:text-white">Device Quick Tiles</h3>
                <p className="text-xs text-slate-600 dark:text-slate-400 mt-0.5">
                  Tap directly or command Nova by voice
                </p>
              </div>
              <button
                type="button"
                onClick={enableNotifications}
                className="flex min-h-[40px] items-center gap-1.5 rounded-xl border border-violet-400/20 px-3 py-1.5 text-xs font-medium text-violet-700 dark:text-violet-200 hover:bg-violet-500/10 transition-colors"
              >
                <Bell className="h-3.5 w-3.5" />
                <span>Allow Alerts</span>
              </button>
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-2 xl:grid-cols-4 gap-2.5">
              {quickToggles.map((tile) => (
                <button
                  key={String(tile.key)}
                  type="button"
                  onClick={() => onToggleSetting(tile.key, tile.sensitive)}
                  className={`flex min-h-[82px] flex-col items-start justify-between rounded-2xl border p-3.5 text-left transition-all duration-150 active:scale-[0.98] ${
                    tile.active
                      ? 'border-violet-500/50 bg-violet-600/15 dark:bg-violet-600/25 text-slate-900 dark:text-white'
                      : 'border-slate-200 dark:border-white/8 bg-slate-50 dark:bg-[#181228] text-slate-700 dark:text-slate-300 hover:border-violet-400/25'
                  }`}
                >
                  <div className="flex w-full items-center justify-between">
                    <span className={tile.active ? 'text-violet-700 dark:text-violet-200' : 'text-slate-600 dark:text-slate-400'}>
                      {tile.icon}
                    </span>
                    {tile.sensitive && !isUnlocked && (
                      <Lock className="h-3.5 w-3.5 text-slate-600 dark:text-slate-400" aria-label="Fingerprint locked" />
                    )}
                  </div>
                  <div className="mt-2 w-full">
                    <div className="text-xs font-semibold truncate">{tile.label}</div>
                    <div className="text-[11px] text-slate-600 dark:text-slate-400 mt-0.5">
                      {tile.active ? 'Active' : 'Off'}
                    </div>
                  </div>
                </button>
              ))}
            </div>

            {/* Sliders */}
            <div className="mt-5 space-y-4 border-t border-slate-200 dark:border-white/8 pt-5">
              <div>
                <div className="flex items-center justify-between text-xs mb-2">
                  <span className="flex items-center gap-2 font-medium text-slate-800 dark:text-slate-200">
                    <Sun className="h-4 w-4 text-violet-600 dark:text-violet-300" />
                    Display Brightness
                  </span>
                  <span className="font-mono tabular-nums text-violet-600 dark:text-violet-300">
                    {device.brightness}%
                  </span>
                </div>
                <input
                  type="range"
                  min={10}
                  max={100}
                  value={device.brightness}
                  onChange={(e) => onChangeSlider('brightness', Number(e.target.value))}
                  aria-label="Display Brightness"
                  className="w-full accent-violet-500 h-2 rounded-lg bg-slate-200 dark:bg-[#1C152E] cursor-pointer"
                />
              </div>

              <div>
                <div className="flex items-center justify-between text-xs mb-2">
                  <span className="flex items-center gap-2 font-medium text-slate-800 dark:text-slate-200">
                    <Volume2 className="h-4 w-4 text-violet-600 dark:text-violet-300" />
                    Media & Voice Volume
                  </span>
                  <span className="font-mono tabular-nums text-violet-600 dark:text-violet-300">
                    {device.volume}%
                  </span>
                </div>
                <input
                  type="range"
                  min={0}
                  max={100}
                  value={device.volume}
                  onChange={(e) => onChangeSlider('volume', Number(e.target.value))}
                  aria-label="Media and Voice Volume"
                  className="w-full accent-violet-500 h-2 rounded-lg bg-slate-200 dark:bg-[#1C152E] cursor-pointer"
                />
              </div>
            </div>

            {/* Media Controller */}
            <div className="mt-5 flex items-center justify-between gap-3 rounded-xl border border-slate-200 dark:border-white/8 bg-slate-50 dark:bg-[#181228] px-4 py-3">
              <div className="min-w-0">
                <div className="text-xs font-semibold text-slate-900 dark:text-white truncate">
                  {device.activeMedia.title}
                </div>
                <div className="text-[11px] text-slate-600 dark:text-slate-400 truncate mt-0.5">
                  {device.activeMedia.artist} · {device.activeMedia.playing ? 'Playing' : 'Paused'}
                </div>
              </div>
              <div className="flex items-center gap-1.5 shrink-0">
                <button
                  type="button"
                  onClick={onMediaToggle}
                  aria-label={device.activeMedia.playing ? 'Pause media' : 'Play media'}
                  className="flex h-11 w-11 items-center justify-center rounded-xl bg-violet-600 text-white hover:bg-violet-500 transition-colors"
                >
                  {device.activeMedia.playing ? (
                    <Pause className="h-4 w-4" />
                  ) : (
                    <Play className="h-4 w-4" />
                  )}
                </button>
                <button
                  type="button"
                  onClick={onMediaNext}
                  aria-label="Next track"
                  className="flex h-11 w-11 items-center justify-center rounded-xl border border-slate-200 dark:border-white/10 text-slate-800 dark:text-slate-200 hover:bg-white/5 transition-colors"
                >
                  <SkipForward className="h-4 w-4" />
                </button>
              </div>
            </div>
          </section>

          {/* Live Ticking Alarms */}
          <section className="rounded-2xl border border-violet-400/12 bg-white dark:bg-[#120D1F] p-5 space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="text-sm font-semibold text-slate-900 dark:text-white">Live Ticking Alarms</h3>
                <p className="text-xs text-slate-600 dark:text-slate-400 mt-0.5">
                  Rings with chime &amp; notification even in Offline mode
                </p>
              </div>
              <AlarmClock className="h-4 w-4 text-violet-600 dark:text-violet-300" />
            </div>

            <form onSubmit={handleCreateAlarm} className="flex flex-col sm:flex-row gap-2">
              <input
                type="time"
                value={alarmTime}
                onChange={(e) => setAlarmTime(e.target.value)}
                aria-label="Alarm time"
                className="min-h-[44px] rounded-xl border border-slate-200 dark:border-white/10 bg-slate-50 dark:bg-[#181228] px-3 text-sm text-slate-900 dark:text-white tabular-nums focus:border-violet-400 focus:outline-none"
              />
              <input
                type="text"
                value={alarmLabel}
                onChange={(e) => setAlarmLabel(e.target.value)}
                placeholder="Alarm label"
                className="flex-1 min-h-[44px] rounded-xl border border-slate-200 dark:border-white/10 bg-slate-50 dark:bg-[#181228] px-3 text-sm text-slate-900 dark:text-white placeholder:text-slate-500 focus:border-violet-400 focus:outline-none"
              />
              <button
                type="submit"
                className="min-h-[44px] rounded-xl bg-violet-600 px-4 text-xs font-semibold text-white hover:bg-violet-500 shrink-0"
              >
                Set Alarm
              </button>
            </form>

            <div className="divide-y divide-slate-200 dark:divide-white/8">
              {alarms.map((al) => (
                <div
                  key={al.id}
                  className="flex items-center justify-between gap-3 py-3 first:pt-1 last:pb-1"
                >
                  <div>
                    <div className="text-lg font-bold font-mono tabular-nums text-slate-900 dark:text-white">
                      {al.time24}
                    </div>
                    <div className="text-xs text-slate-600 dark:text-slate-400">{al.label}</div>
                  </div>
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => onToggleAlarm(al.id)}
                      className={`min-h-[38px] rounded-xl px-3 text-xs font-semibold transition-colors ${
                        al.enabled
                          ? 'bg-violet-600 text-white'
                          : 'border border-slate-200 dark:border-white/10 bg-slate-50 dark:bg-[#181228] text-slate-600 dark:text-slate-400'
                      }`}
                    >
                      {al.enabled ? 'On' : 'Off'}
                    </button>
                    <button
                      type="button"
                      onClick={() => onDeleteAlarm(al.id)}
                      aria-label={`Delete alarm ${al.time24}`}
                      className="flex h-10 w-10 items-center justify-center rounded-xl text-slate-600 dark:text-slate-400 hover:text-rose-300"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </section>
        </div>

        {/* Right: Proactive Brief, Tasks & Adapted Command Codes */}
        <div className="lg:col-span-6 space-y-5">
          <section className="rounded-2xl border border-violet-400/12 bg-white dark:bg-[#120D1F] p-5">
            <div className="flex items-start justify-between gap-3">
              <div>
                <h3 className="text-sm font-semibold text-slate-900 dark:text-white">Proactive Companion Brief</h3>
                <p className="mt-1 text-xs leading-relaxed text-slate-700 dark:text-slate-300">
                  {briefLoading
                    ? 'Nova is reviewing your schedule and phone state...'
                    : proactiveBrief ||
                      'Tap refresh to let Nova prioritize your next task and smart reminder.'}
                </p>
              </div>
              <button
                type="button"
                onClick={onRefreshBrief}
                disabled={briefLoading}
                className="flex min-h-[44px] items-center gap-1.5 rounded-xl border border-violet-400/25 px-3 py-2 text-xs font-medium text-violet-700 dark:text-violet-200 hover:bg-violet-500/10 transition-colors shrink-0"
              >
                <Sparkles className={`h-3.5 w-3.5 ${briefLoading ? 'animate-spin' : ''}`} />
                <span>Refresh</span>
              </button>
            </div>
          </section>

          {/* Express Operations & Auto-Generated Nova Command Passkeys */}
          <section className="rounded-2xl border border-violet-400/12 bg-white dark:bg-[#120D1F] p-5 space-y-4">
            <div className="flex items-center justify-between gap-2">
              <div>
                <h3 className="text-sm font-semibold text-slate-900 dark:text-white">
                  Express Operations &amp; Command Passkeys
                </h3>
                <p className="text-xs text-slate-600 dark:text-slate-400 mt-0.5">
                  Auto-generate local Nova passkeys to apply commands &amp; generate assets in 1 tap
                </p>
              </div>
              <Zap className="h-4 w-4 text-violet-600 dark:text-violet-300 shrink-0" />
            </div>

            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={() => onRunExpressOp('focus')}
                className="min-h-[42px] rounded-xl border border-violet-400/25 bg-slate-50 dark:bg-[#181228] px-3 text-xs font-medium text-violet-700 dark:text-violet-200 hover:bg-violet-600/20 text-left"
              >
                Focus Lockdown
              </button>
              <button
                type="button"
                onClick={() => onRunExpressOp('privacy')}
                className="min-h-[42px] rounded-xl border border-violet-400/25 bg-slate-50 dark:bg-[#181228] px-3 text-xs font-medium text-violet-700 dark:text-violet-200 hover:bg-violet-600/20 text-left"
              >
                Privacy Armor + Scan
              </button>
              <button
                type="button"
                onClick={() => onRunExpressOp('pdf')}
                className="min-h-[42px] rounded-xl border border-violet-400/25 bg-slate-50 dark:bg-[#181228] px-3 text-xs font-medium text-violet-700 dark:text-violet-200 hover:bg-violet-600/20 text-left"
              >
                Instant PDF Brief
              </button>
              <button
                type="button"
                onClick={() => onRunExpressOp('wallpaper')}
                className="min-h-[42px] rounded-xl border border-violet-400/25 bg-slate-50 dark:bg-[#181228] px-3 text-xs font-medium text-violet-700 dark:text-violet-200 hover:bg-violet-600/20 text-left"
              >
                Instant Planet Art
              </button>
            </div>

            <form
              onSubmit={(e) => {
                e.preventDefault();
                if (!keyLabel.trim() || !keyCommand.trim()) return;
                onCreateCommandKey({
                  label: keyLabel.trim(),
                  commandPrompt: keyCommand.trim(),
                  operationType: keyOpType,
                });
                setKeyLabel('');
                setKeyCommand('');
              }}
              className="space-y-2 border-t border-slate-200 dark:border-white/8 pt-3"
            >
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                <input
                  type="text"
                  value={keyLabel}
                  onChange={(e) => setKeyLabel(e.target.value)}
                  placeholder="Passkey name (e.g. Night Study)"
                  className="min-h-[40px] rounded-xl border border-slate-200 dark:border-white/10 bg-slate-50 dark:bg-[#181228] px-3 text-xs text-slate-900 dark:text-white placeholder:text-slate-500 focus:border-violet-400 focus:outline-none"
                />
                <select
                  value={keyOpType}
                  onChange={(e) =>
                    setKeyOpType(e.target.value as QuickCommandKey['operationType'])
                  }
                  aria-label="Passkey operation type"
                  className="min-h-[40px] rounded-xl border border-slate-200 dark:border-white/10 bg-slate-50 dark:bg-[#181228] px-2.5 text-xs text-slate-800 dark:text-slate-200 focus:border-violet-400 focus:outline-none"
                >
                  <option value="macro">Phone Control / Alarm Macro</option>
                  <option value="generate-pdf">Generate PDF Document</option>
                  <option value="generate-art">Generate Vector Art</option>
                  <option value="security-lockdown">Security Lockdown Sweep</option>
                </select>
              </div>
              <div className="flex gap-2">
                <input
                  type="text"
                  value={keyCommand}
                  onChange={(e) => setKeyCommand(e.target.value)}
                  placeholder="Command or generation prompt..."
                  className="flex-1 min-h-[40px] rounded-xl border border-slate-200 dark:border-white/10 bg-slate-50 dark:bg-[#181228] px-3 text-xs text-slate-900 dark:text-white placeholder:text-slate-500 focus:border-violet-400 focus:outline-none"
                />
                <button
                  type="submit"
                  disabled={!keyLabel.trim() || !keyCommand.trim()}
                  className="flex min-h-[40px] items-center gap-1.5 rounded-xl bg-violet-600 px-3.5 text-xs font-semibold text-white hover:bg-violet-500 disabled:opacity-45 whitespace-nowrap"
                >
                  <KeyRound className="h-3.5 w-3.5" />
                  <span>Auto-Generate Key</span>
                </button>
              </div>
            </form>

            {commandKeys.length > 0 && (
              <div className="divide-y divide-slate-200 dark:divide-white/8">
                {commandKeys.map((k) => (
                  <div
                    key={k.id}
                    className="flex items-center justify-between gap-2 py-2.5 first:pt-1 last:pb-1"
                  >
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="text-xs font-semibold text-slate-900 dark:text-white truncate">{k.label}</span>
                        <span className="font-mono text-[11px] text-violet-600 dark:text-violet-300">{k.passkey}</span>
                      </div>
                      <div className="text-[11px] text-slate-600 dark:text-slate-400 truncate mt-0.5">
                        {k.operationType} · {k.commandPrompt}
                      </div>
                    </div>
                    <div className="flex items-center gap-1 shrink-0">
                      <button
                        type="button"
                        onClick={() => onRunCommandKey(k)}
                        className="min-h-[34px] rounded-lg bg-violet-600/25 border border-violet-400/30 px-2.5 text-xs font-medium text-violet-700 dark:text-violet-200 hover:bg-violet-600/40"
                      >
                        Apply
                      </button>
                      <button
                        type="button"
                        onClick={() => onDeleteCommandKey(k.id)}
                        aria-label={`Delete key ${k.label}`}
                        className="flex h-8 w-8 items-center justify-center rounded-lg text-slate-600 dark:text-slate-400 hover:text-rose-300"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </section>

          {/* Adapted Command Codes */}
          <section className="rounded-2xl border border-violet-400/12 bg-white dark:bg-[#120D1F] p-5 space-y-3">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="text-sm font-semibold text-slate-900 dark:text-white">Adapted Chat Command Codes</h3>
                <p className="text-xs text-slate-600 dark:text-slate-400 mt-0.5">
                  Tell Nova in chat: &ldquo;Adapt code #focus: turn on DND and set brightness to 45%&rdquo;
                </p>
              </div>
              <Code2 className="h-4 w-4 text-violet-600 dark:text-violet-300" />
            </div>

            <div className="divide-y divide-slate-200 dark:divide-white/8">
              {adaptedCodes.length === 0 ? (
                <p className="py-4 text-xs text-slate-600 dark:text-slate-400">
                  No custom codes adapted yet. Teach Nova a shortcut code in chat!
                </p>
              ) : (
                adaptedCodes.map((c) => (
                  <div
                    key={c.id}
                    className="flex items-center justify-between gap-3 py-3 first:pt-1 last:pb-1"
                  >
                    <div className="min-w-0">
                      <div className="text-xs font-mono font-semibold text-violet-600 dark:text-violet-300">
                        {c.code}
                      </div>
                      <div className="text-xs text-slate-700 dark:text-slate-300 truncate mt-0.5">{c.description}</div>
                    </div>
                    <div className="flex items-center gap-1.5 shrink-0">
                      <button
                        type="button"
                        onClick={() => onRunAdaptedCode(c)}
                        className="min-h-[36px] rounded-xl bg-violet-600/25 border border-violet-400/30 px-3 text-xs font-medium text-violet-700 dark:text-violet-200 hover:bg-violet-600/40"
                      >
                        Run
                      </button>
                      <button
                        type="button"
                        onClick={() => onDeleteAdaptedCode(c.id)}
                        aria-label={`Delete code ${c.code}`}
                        className="flex h-9 w-9 items-center justify-center rounded-xl text-slate-600 dark:text-slate-400 hover:text-rose-300"
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </div>
                  </div>
                ))
              )}
            </div>
          </section>

          <section className="rounded-2xl border border-violet-400/12 bg-white dark:bg-[#120D1F] p-5">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-sm font-semibold text-slate-900 dark:text-white">Tasks &amp; Reminders</h3>
              <span className="text-xs text-slate-600 dark:text-slate-400 tabular-nums">
                {tasks.filter((t) => !t.completed).length} active
              </span>
            </div>

            <form onSubmit={handleCreateTask} className="space-y-2.5 mb-5">
              <div className="flex flex-col sm:flex-row gap-2">
                <input
                  type="text"
                  value={newTitle}
                  onChange={(e) => setNewTitle(e.target.value)}
                  placeholder="Add reminder or task..."
                  className="flex-1 min-h-[44px] rounded-xl border border-slate-200 dark:border-white/10 bg-slate-50 dark:bg-[#181228] px-3.5 text-sm text-slate-900 dark:text-white placeholder:text-slate-500 focus:border-violet-400 focus:outline-none"
                />
                <button
                  type="submit"
                  className="flex min-h-[44px] items-center justify-center gap-1.5 rounded-xl bg-violet-600 px-4 text-xs font-semibold text-white hover:bg-violet-500 transition-colors shrink-0"
                >
                  <Plus className="h-4 w-4" />
                  <span>Add</span>
                </button>
              </div>

              <div className="grid grid-cols-3 gap-2">
                <input
                  type="text"
                  value={newTime}
                  onChange={(e) => setNewTime(e.target.value)}
                  aria-label="Due time"
                  className="min-h-[40px] rounded-xl border border-slate-200 dark:border-white/10 bg-slate-50 dark:bg-[#181228] px-3 text-xs text-slate-800 dark:text-slate-200 focus:border-violet-400 focus:outline-none"
                />
                <select
                  value={newCategory}
                  onChange={(e) => setNewCategory(e.target.value as TaskItem['category'])}
                  aria-label="Task category"
                  className="min-h-[40px] rounded-xl border border-slate-200 dark:border-white/10 bg-slate-50 dark:bg-[#181228] px-2.5 text-xs text-slate-800 dark:text-slate-200 focus:border-violet-400 focus:outline-none"
                >
                  <option value="personal">Personal</option>
                  <option value="work">Work</option>
                  <option value="alarm">Alarm</option>
                  <option value="health">Health</option>
                </select>
                <select
                  value={newPriority}
                  onChange={(e) => setNewPriority(e.target.value as TaskItem['priority'])}
                  aria-label="Task priority"
                  className="min-h-[40px] rounded-xl border border-slate-200 dark:border-white/10 bg-slate-50 dark:bg-[#181228] px-2.5 text-xs text-slate-800 dark:text-slate-200 focus:border-violet-400 focus:outline-none"
                >
                  <option value="high">High priority</option>
                  <option value="medium">Medium</option>
                  <option value="low">Low</option>
                </select>
              </div>
            </form>

            <div className="divide-y divide-slate-200 dark:divide-white/8">
              {tasks.length === 0 ? (
                <p className="py-6 text-center text-xs text-slate-600 dark:text-slate-400">
                  No tasks yet. Tell Nova &ldquo;Remind me to call Alex at 7 PM&rdquo; or add one above.
                </p>
              ) : (
                tasks.map((task) => (
                  <div
                    key={task.id}
                    className="flex items-start justify-between gap-3 py-3.5 first:pt-1 last:pb-1"
                  >
                    <button
                      type="button"
                      onClick={() => onToggleTask(task.id)}
                      className="flex min-h-[44px] flex-1 items-start gap-3 text-left group"
                    >
                      <span
                        className={`mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-md border transition-colors ${
                          task.completed
                            ? 'border-violet-500 bg-violet-600 text-white'
                            : 'border-violet-400/35 bg-slate-50 dark:bg-[#181228] group-hover:border-violet-400'
                        }`}
                      >
                        {task.completed && <Check className="h-3.5 w-3.5" />}
                      </span>
                      <div className="min-w-0 flex-1">
                        <div
                          className={`text-sm font-medium ${
                            task.completed ? 'line-through text-slate-500' : 'text-slate-900 dark:text-slate-100'
                          }`}
                        >
                          {task.title}
                        </div>
                        <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-slate-600 dark:text-slate-400 tabular-nums">
                          <span>{task.dueTime}</span>
                          <span aria-hidden="true">·</span>
                          <span className="capitalize">{task.category}</span>
                          <span aria-hidden="true">·</span>
                          <span
                            className={
                              task.priority === 'high'
                                ? 'text-amber-600 dark:text-amber-300 font-medium'
                                : 'text-slate-600 dark:text-slate-400'
                            }
                          >
                            {task.priority} priority
                          </span>
                        </div>
                        {task.proactiveNote && !task.completed && (
                          <p className="mt-1 text-xs text-violet-600 dark:text-violet-300/85">{task.proactiveNote}</p>
                        )}
                      </div>
                    </button>
                    <button
                      type="button"
                      onClick={() => onDeleteTask(task.id)}
                      aria-label={`Delete ${task.title}`}
                      className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl text-slate-500 hover:bg-white/5 hover:text-rose-300 transition-colors"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </div>
                ))
              )}
            </div>
          </section>
        </div>
      </div>
    </div>
  );
};
