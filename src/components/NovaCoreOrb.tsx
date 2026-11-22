import React from 'react';
import { Mic, MicOff } from 'lucide-react';
import type { NovaOrbState } from '../types/nova';

interface NovaCoreOrbProps {
  orbState: NovaOrbState;
  onToggleListen: () => void;
  statusLabel: string;
}

export const NovaMiniPlanetLoader: React.FC<{
  label?: string;
  size?: 'sm' | 'md';
}> = ({ label = 'Nova is replying...', size = 'sm' }) => {
  const dimClass = size === 'md' ? 'h-12 w-12' : 'h-9 w-9';
  const planetClass = size === 'md' ? 'h-7 w-7' : 'h-5 w-5';

  return (
    <div className="inline-flex items-center gap-3">
      <div
        className={`relative flex ${dimClass} shrink-0 items-center justify-center`}
        aria-hidden="true"
      >
        <div className="absolute inset-0 rounded-full bg-violet-600/30 blur-md nova-core-breathe" />
        {/* Outer revolving indigo ring */}
        <div
          className="absolute inset-0 flex items-center justify-center"
          style={{ transform: 'rotateZ(-14deg) rotateX(66deg)' }}
        >
          <svg viewBox="0 0 100 100" className="h-full w-full nova-ring-spin-fast">
            <circle
              cx="50"
              cy="50"
              r="45"
              fill="none"
              stroke="#6D28D9"
              strokeWidth="6"
              strokeDasharray="95 28 50 20"
              strokeLinecap="round"
            />
            <circle cx="95" cy="50" r="5" fill="#C4B5FD" />
          </svg>
        </div>
        {/* Counter-revolving inner ring */}
        <div
          className="absolute inset-1 flex items-center justify-center"
          style={{ transform: 'rotateZ(-14deg) rotateX(72deg)' }}
        >
          <svg viewBox="0 0 100 100" className="h-full w-full nova-ring-spin-ccw">
            <circle
              cx="50"
              cy="50"
              r="38"
              fill="none"
              stroke="#3B82F6"
              strokeWidth="4.5"
              strokeDasharray="68 24 44 26"
              opacity="0.9"
            />
          </svg>
        </div>
        {/* Center purple planet */}
        <img
          src="/assets/aistudio/nova-logo-transparent_5434d2c2.png"
          alt=""
          referrerPolicy="no-referrer"
          className={`relative z-10 ${planetClass} object-contain drop-shadow-[0_0_10px_rgba(139,92,246,0.75)]`}
        />
      </div>
      {label && (
        <span className="text-xs font-medium text-violet-700 dark:text-violet-200/90">
          {label}
        </span>
      )}
    </div>
  );
};

export const NovaCoreOrb: React.FC<NovaCoreOrbProps> = ({
  orbState,
  onToggleListen,
  statusLabel,
}) => {
  const isWorking = orbState !== 'idle';
  const isListening = orbState === 'listening';
  const isScanning = orbState === 'scanning';

  const outerSpinClass = isListening || isScanning
    ? 'nova-ring-spin-fast'
    : isWorking
      ? 'nova-ring-spin-cw'
      : 'nova-ring-idle';

  const innerSpinClass = isWorking ? 'nova-ring-spin-ccw' : 'nova-ring-idle';

  return (
    <div className="relative flex flex-col items-center justify-center py-4 select-none">
      <button
        type="button"
        onClick={onToggleListen}
        aria-label={isListening ? 'Stop listening' : 'Tap to speak with Nova'}
        className="group relative flex h-44 w-44 sm:h-52 sm:w-52 items-center justify-center rounded-full focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-400 focus-visible:ring-offset-4 focus-visible:ring-offset-[#06040C]"
      >
        {/* Deep obsidian purple ambient aura */}
        <div
          className={`pointer-events-none absolute inset-2 rounded-full blur-2xl transition-opacity duration-300 ${
            isWorking
              ? 'bg-violet-600/35 opacity-100 nova-core-breathe'
              : 'bg-violet-700/18 opacity-75 group-hover:opacity-100'
          }`}
        />

        {/* Revolving tilted planetary rings around the purple planet when Nova works */}
        <div
          className="pointer-events-none absolute inset-0 flex items-center justify-center"
          style={{ perspective: '680px' }}
        >
          {/* Outer Indigo Ring Plane (revolving) */}
          <div
            className="absolute h-44 w-44 sm:h-52 sm:w-52 flex items-center justify-center"
            style={{ transform: 'rotateZ(-14deg) rotateX(68deg)' }}
          >
            <svg
              viewBox="0 0 220 220"
              className={`h-full w-full ${outerSpinClass}`}
              aria-hidden="true"
            >
              <defs>
                <linearGradient id="novaOrbitGrad1" x1="0%" y1="0%" x2="100%" y2="100%">
                  <stop offset="0%" stopColor="#1E32E8" stopOpacity="0.95" />
                  <stop offset="50%" stopColor="#6D28D9" stopOpacity="0.95" />
                  <stop offset="100%" stopColor="#3B82F6" stopOpacity="0.4" />
                </linearGradient>
              </defs>
              <circle
                cx="110"
                cy="110"
                r="100"
                fill="none"
                stroke="url(#novaOrbitGrad1)"
                strokeWidth={isWorking ? '5.5' : '4'}
                strokeDasharray="165 24 85 18"
                strokeLinecap="round"
              />
              <circle
                cx="110"
                cy="110"
                r="88"
                fill="none"
                stroke="#2536E8"
                strokeWidth="2.5"
                strokeDasharray="110 22 64 20"
                opacity="0.85"
              />
              <circle cx="210" cy="110" r="4" fill="#A78BFA" />
            </svg>
          </div>

          {/* Counter-revolving Inner Ring Plane */}
          <div
            className="absolute h-36 w-36 sm:h-44 sm:w-44 flex items-center justify-center"
            style={{ transform: 'rotateZ(-14deg) rotateX(72deg)' }}
          >
            <svg
              viewBox="0 0 180 180"
              className={`h-full w-full ${innerSpinClass}`}
              aria-hidden="true"
            >
              <circle
                cx="90"
                cy="90"
                r="76"
                fill="none"
                stroke="#8B5CF6"
                strokeWidth={isWorking ? '3' : '2'}
                strokeDasharray="78 24 46 28"
                opacity={isWorking ? '0.9' : '0.45'}
              />
              <circle
                cx="90"
                cy="90"
                r="66"
                fill="none"
                stroke="#4338CA"
                strokeWidth="2"
                strokeDasharray="95 30"
                opacity="0.65"
              />
            </svg>
          </div>
        </div>

        {/* User's uploaded Nova Purple Planet Logo */}
        <div
          className={`relative z-10 flex h-28 w-28 sm:h-32 sm:w-32 items-center justify-center rounded-full transition-transform duration-200 ${
            isListening ? 'scale-105' : 'group-hover:scale-[1.03] active:scale-95'
          }`}
        >
          <img
            src="/assets/aistudio/nova-logo-transparent_5434d2c2.png"
            alt="Nova Purple Planet Logo"
            referrerPolicy="no-referrer"
            className="h-28 w-28 sm:h-32 sm:w-32 object-contain drop-shadow-[0_0_24px_rgba(139,92,246,0.55)]"
          />
        </div>

        {/* Interactive Mic Affordance Badge */}
        <span
          className={`absolute bottom-2 right-4 z-20 flex h-11 w-11 items-center justify-center rounded-full border transition-colors duration-200 ${
            isListening
              ? 'border-violet-300/60 bg-violet-600 text-white shadow-lg shadow-violet-600/40'
              : 'border-violet-400/25 bg-white dark:bg-[#120D1F]/95 text-violet-700 dark:text-violet-200 group-hover:border-violet-400/60'
          }`}
        >
          {isListening ? <Mic className="h-5 w-5" /> : <MicOff className="h-4 w-4 opacity-80" />}
        </span>
      </button>

      <div className="mt-1 flex items-center gap-2 text-xs font-medium tracking-wide text-violet-700 dark:text-violet-200/80">
        <span>{statusLabel}</span>
      </div>
    </div>
  );
};
