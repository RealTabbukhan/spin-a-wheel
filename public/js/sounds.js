/* ═══════════════════════════════════════════════════════
   SpinAWheel — Sound Manager (v2 — Presets & Volume)
   Procedural sounds via Web Audio API (no files needed)
   ═══════════════════════════════════════════════════════ */

class SoundManager {
  constructor() {
    this.ctx = null;
    this.muted = localStorage.getItem('spinawheel-muted') === 'true';
    this.volume = parseInt(localStorage.getItem('spinawheel-volume') || '70', 10) / 100;
    this.tickPreset = localStorage.getItem('spinawheel-tick') || 'click';
    this.winPreset = localStorage.getItem('spinawheel-win') || 'clapping';
  }

  /* ── Tick Sound Presets ───────────────────────────── */
  static TICK_PRESETS = {
    click:   { label: 'Click',   emoji: '🖱️', freq: 800, type: 'sine',     dur: 0.035, vol: 0.08 },
    pop:     { label: 'Pop',     emoji: '🫧', freq: 1200, type: 'sine',    dur: 0.025, vol: 0.10 },
    beep:    { label: 'Beep',    emoji: '📟', freq: 1600, type: 'square',  dur: 0.020, vol: 0.05 },
    soft:    { label: 'Soft',    emoji: '🔔', freq: 600,  type: 'triangle',dur: 0.050, vol: 0.07 },
    sharp:   { label: 'Sharp',   emoji: '⚡', freq: 2200, type: 'sawtooth',dur: 0.015, vol: 0.04 },
    wooden:  { label: 'Wooden',  emoji: '🪵', freq: 400,  type: 'triangle',dur: 0.040, vol: 0.09 },
  };

  /* ── Win Sound Presets ───────────────────────────── */
  static WIN_PRESETS = {
    clapping: { label: 'Clapping', emoji: '👏', type: 'custom_clapping' },
    fanfare:  { label: 'Fanfare',  emoji: '🎺', notes: [523.25, 659.25, 783.99, 1046.50], type: 'triangle', dur: 0.35 },
    chime:    { label: 'Chime',    emoji: '🔔', notes: [880, 1108.73, 1318.51, 1760],      type: 'sine',     dur: 0.40 },
    arcade:   { label: 'Arcade',   emoji: '🕹️', notes: [440, 554.37, 659.25, 880],         type: 'square',   dur: 0.25 },
    magic:    { label: 'Magic',    emoji: '✨', notes: [392, 523.25, 659.25, 783.99, 1046.50], type: 'sine', dur: 0.30 },
    victory:  { label: 'Victory',  emoji: '🏆', notes: [659.25, 783.99, 987.77, 1318.51],  type: 'triangle', dur: 0.28 },
    gentle:   { label: 'Gentle',   emoji: '🌸', notes: [523.25, 587.33, 659.25],           type: 'sine',     dur: 0.50 },
  };

  /** Lazily initialise AudioContext (must be after user gesture) */
  _init() {
    if (!this.ctx) {
      this.ctx = new (window.AudioContext || window.webkitAudioContext)();
    }
    if (this.ctx.state === 'suspended') {
      this.ctx.resume();
    }
  }

  /** Short click/tick sound — called once per segment during spin */
  tick() {
    if (this.muted) return;
    try {
      this._init();
      const t = this.ctx.currentTime;
      const preset = SoundManager.TICK_PRESETS[this.tickPreset] || SoundManager.TICK_PRESETS.click;

      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();
      osc.connect(gain);
      gain.connect(this.ctx.destination);

      osc.type = preset.type;
      osc.frequency.setValueAtTime(preset.freq + Math.random() * 200, t);
      gain.gain.setValueAtTime(preset.vol * this.volume, t);
      gain.gain.exponentialRampToValueAtTime(0.001, t + preset.dur);

      osc.start(t);
      osc.stop(t + preset.dur);
    } catch (_) { /* ignore audio errors */ }
  }

  /** Celebratory sound — called when winner is revealed */
  fanfare() {
    if (this.muted) return;
    try {
      this._init();
      const t = this.ctx.currentTime;
      const preset = SoundManager.WIN_PRESETS[this.winPreset] || SoundManager.WIN_PRESETS.fanfare;

      if (preset.type === 'custom_clapping') {
        // Synthesize applause using burst of filtered noise
        for (let i = 0; i < 35; i++) {
          const delay = Math.random() * 1.5;
          const dur = 0.15 + Math.random() * 0.1;
          const bufferSize = this.ctx.sampleRate * dur;
          const buffer = this.ctx.createBuffer(1, bufferSize, this.ctx.sampleRate);
          const data = buffer.getChannelData(0);
          for (let b = 0; b < bufferSize; b++) data[b] = Math.random() * 2 - 1;
          
          const noise = this.ctx.createBufferSource();
          noise.buffer = buffer;
          
          const filter = this.ctx.createBiquadFilter();
          filter.type = 'bandpass';
          filter.frequency.value = 800 + Math.random() * 400;
          
          const gain = this.ctx.createGain();
          gain.gain.setValueAtTime(0.04 * this.volume, t + delay);
          gain.gain.exponentialRampToValueAtTime(0.001, t + delay + dur);
          
          noise.connect(filter);
          filter.connect(gain);
          gain.connect(this.ctx.destination);
          noise.start(t + delay);
        }
        return;
      }

      preset.notes.forEach((freq, i) => {
        const osc = this.ctx.createOscillator();
        const gain = this.ctx.createGain();
        osc.connect(gain);
        gain.connect(this.ctx.destination);

        osc.type = preset.type;
        osc.frequency.setValueAtTime(freq, t + i * 0.12);
        gain.gain.setValueAtTime(0.12 * this.volume, t + i * 0.12);
        gain.gain.exponentialRampToValueAtTime(0.001, t + i * 0.12 + preset.dur);

        osc.start(t + i * 0.12);
        osc.stop(t + i * 0.12 + preset.dur);
      });
    } catch (_) { /* ignore audio errors */ }
  }

  /** Play a preview of a tick preset */
  previewTick(presetKey) {
    const saved = this.tickPreset;
    this.tickPreset = presetKey;
    const wasMuted = this.muted;
    this.muted = false;
    this.tick();
    this.tickPreset = saved;
    this.muted = wasMuted;
  }

  /** Play a preview of a win preset */
  previewWin(presetKey) {
    const saved = this.winPreset;
    this.winPreset = presetKey;
    const wasMuted = this.muted;
    this.muted = false;
    this.fanfare();
    this.winPreset = saved;
    this.muted = wasMuted;
  }

  /** Set tick preset */
  setTickPreset(key) {
    this.tickPreset = key;
    localStorage.setItem('spinawheel-tick', key);
  }

  /** Set win preset */
  setWinPreset(key) {
    this.winPreset = key;
    localStorage.setItem('spinawheel-win', key);
  }

  /** Set volume 0-1 */
  setVolume(v) {
    this.volume = Math.max(0, Math.min(1, v));
    localStorage.setItem('spinawheel-volume', String(Math.round(this.volume * 100)));
  }

  /** Toggle mute state, returns new muted state */
  toggle() {
    this.muted = !this.muted;
    localStorage.setItem('spinawheel-muted', String(this.muted));
    return this.muted;
  }

  /** Get current muted state */
  isMuted() {
    return this.muted;
  }
}

// Export global instance
window.soundManager = new SoundManager();
