// High-quality, lightweight Web Audio API Sound Synthesizer for CPKB System Notifications
// Zero external audio files required, completely offline-safe, and instantly responsive.

const SOUND_STORAGE_KEY = 'lsm_audio_notifications_enabled';

class SoundService {
  private audioCtx: AudioContext | null = null;
  private soundEnabled: boolean = true;

  constructor() {
    if (typeof window !== 'undefined') {
      const saved = localStorage.getItem(SOUND_STORAGE_KEY);
      this.soundEnabled = saved !== null ? saved === 'true' : true;
    }
  }

  private getAudioContext(): AudioContext | null {
    if (typeof window === 'undefined') return null;
    try {
      if (!this.audioCtx) {
        const AudioContextClass = window.AudioContext || (window as any).webkitAudioContext;
        if (AudioContextClass) {
          this.audioCtx = new AudioContextClass();
        }
      }
      if (this.audioCtx && this.audioCtx.state === 'suspended') {
        this.audioCtx.resume().catch(() => {});
      }
    } catch (e) {
      console.warn('[soundService] AudioContext initialization issue:', e);
    }
    return this.audioCtx;
  }

  public isEnabled(): boolean {
    return this.soundEnabled;
  }

  public setEnabled(enabled: boolean): void {
    this.soundEnabled = enabled;
    if (typeof window !== 'undefined') {
      localStorage.setItem(SOUND_STORAGE_KEY, String(enabled));
    }
  }

  public toggle(): boolean {
    const next = !this.soundEnabled;
    this.setEnabled(next);
    if (next) {
      this.play('info');
    }
    return next;
  }

  /**
   * Play specific chime based on notification urgency
   */
  public play(type: 'warning' | 'critical' | 'success' | 'info' | 'revert' = 'info'): void {
    if (!this.soundEnabled) return;

    try {
      const ctx = this.getAudioContext();
      if (!ctx) return;

      const now = ctx.currentTime;

      if (type === 'critical' || type === 'warning' || type === 'revert') {
        // High-clarity 2-stage alert chime (E5 -> A5 -> E5, audible & clear)
        this.playTone(ctx, 659.25, now, 0.18, 0.35, 'triangle');
        this.playTone(ctx, 880.00, now + 0.12, 0.22, 0.38, 'sine');
        this.playTone(ctx, 659.25, now + 0.28, 0.40, 0.40, 'sine');
      } else if (type === 'success') {
        // Melodic ascending harmonic triad (C5 -> E5 -> G5 -> C6)
        this.playTone(ctx, 523.25, now, 0.12, 0.25, 'sine');
        this.playTone(ctx, 659.25, now + 0.08, 0.14, 0.28, 'sine');
        this.playTone(ctx, 783.99, now + 0.18, 0.20, 0.32, 'triangle');
        this.playTone(ctx, 1046.50, now + 0.28, 0.45, 0.35, 'sine');
      } else {
        // Crisp dual-tone notification ping (A5 -> E6)
        this.playTone(ctx, 880.00, now, 0.14, 0.30, 'sine');
        this.playTone(ctx, 1318.51, now + 0.08, 0.35, 0.32, 'triangle');
      }
    } catch (e) {
      console.warn('[soundService] Failed to play audio chime:', e);
    }
  }

  private playTone(
    ctx: AudioContext,
    freq: number,
    startTime: number,
    duration: number,
    maxGain: number = 0.3,
    type: OscillatorType = 'sine'
  ) {
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();

    osc.type = type;
    osc.frequency.setValueAtTime(freq, startTime);

    gain.gain.setValueAtTime(0.001, startTime);
    gain.gain.exponentialRampToValueAtTime(maxGain, startTime + 0.02);
    gain.gain.exponentialRampToValueAtTime(0.0001, startTime + duration);

    osc.connect(gain);
    gain.connect(ctx.destination);

    osc.start(startTime);
    osc.stop(startTime + duration + 0.05);
  }
}

export const soundService = new SoundService();

