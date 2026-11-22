let alarmInterval: number | null = null;
let activeCtx: AudioContext | null = null;

export function startAlarmChime() {
  stopAlarmChime();
  const playPulse = () => {
    try {
      const AudioCtx =
        window.AudioContext ||
        (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      if (!AudioCtx) return;
      if (!activeCtx) {
        activeCtx = new AudioCtx();
      }
      const now = activeCtx.currentTime;
      const freqs = [523.25, 659.25, 783.99];
      freqs.forEach((f, idx) => {
        if (!activeCtx) return;
        const osc = activeCtx.createOscillator();
        const gain = activeCtx.createGain();
        osc.type = 'sine';
        osc.frequency.setValueAtTime(f, now + idx * 0.14);
        gain.gain.setValueAtTime(0.001, now + idx * 0.14);
        gain.gain.exponentialRampToValueAtTime(0.22, now + idx * 0.14 + 0.04);
        gain.gain.exponentialRampToValueAtTime(0.001, now + idx * 0.14 + 0.42);
        osc.connect(gain);
        gain.connect(activeCtx.destination);
        osc.start(now + idx * 0.14);
        osc.stop(now + idx * 0.14 + 0.45);
      });
    } catch {
      // AudioContext blocked before user interaction
    }
  };

  playPulse();
  alarmInterval = window.setInterval(playPulse, 1800);
}

export function stopAlarmChime() {
  if (alarmInterval !== null) {
    clearInterval(alarmInterval);
    alarmInterval = null;
  }
}
