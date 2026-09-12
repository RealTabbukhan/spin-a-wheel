/* ═══════════════════════════════════════════════════════
   SpinAWheel — Canvas Wheel Engine (v2 — Weighted + Colors)
   Renders, animates, and manages the spinning wheel
   ═══════════════════════════════════════════════════════ */

class SpinWheel {
  /**
   * @param {HTMLCanvasElement} canvas
   * @param {Object} opts
   * @param {Function} opts.onSpinEnd   - (winner: string, index: number) => void
   * @param {Function} opts.onTick      - () => void — called each segment tick
   */
  constructor(canvas, opts = {}) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.entries = [];      // Array of { name, weight, color } objects
    this.rotation = Math.random() * Math.PI * 2;
    this.isSpinning = false;
    this.onSpinEnd = opts.onSpinEnd || (() => {});
    this.onTick = opts.onTick || (() => {});
    this.dpr = window.devicePixelRatio || 1;

    // Speed setting: 1=Slow, 2=Normal, 3=Fast
    this.speed = 2;

    // Font size mode: 0=Small, 1=Medium, 2=Large
    const savedFs = localStorage.getItem('spinawheel-fontsize');
    this.fontSizeMode = savedFs !== null ? parseInt(savedFs, 10) : 1;

    // Cached dimensions
    this.w = 0;
    this.h = 0;
    this.centerX = 0;
    this.centerY = 0;
    this.radius = 0;

    // Track segment for tick detection
    this._lastSegIdx = -1;

    // Animation frame counter
    this._frameCount = 0;
    this._idleAnimId = null;
    this._colorMap = [];

    // Color palettes — the active one is set via setPalette()
    this._palettes = {
      classic:   ['#3369E8', '#D50F25', '#EEB211', '#009925'],
      sunset:    ['#FF6B35', '#F7931A', '#FF1654', '#FF3864', '#FF6F61'],
      ocean:     ['#006D77', '#83C5BE', '#0077B6', '#00B4D8', '#48CAE4'],
      neon:      ['#FF00FF', '#00FFFF', '#FFFF00', '#FF4500', '#7FFF00'],
      pastel:    ['#FFB3BA', '#BAFFC9', '#BAE1FF', '#FFFFBA', '#E8BAFF'],
      forest:    ['#2D6A4F', '#40916C', '#52B788', '#74C69D', '#95D5B2'],
      candy:     ['#F72585', '#B5179E', '#7209B7', '#560BAD', '#480CA8', '#3A0CA3', '#3F37C9', '#4361EE', '#4895EF', '#4CC9F0'],
      rainbow:   ['#E40303', '#FF8C00', '#FFED00', '#008026', '#004DFF', '#750787'],
      midnight:  ['#1B1464', '#3D2B56', '#5C4A72', '#8B687F', '#DB93B0'],
      tropical:  ['#FF6B6B', '#FEC89A', '#90BE6D', '#43AA8B', '#577590'],
    };

    this.promptDismissed = localStorage.getItem('spinawheel-prompt-dismissed') === 'true';

    this.activePalette = localStorage.getItem('spinawheel-palette') || 'classic';
    this.colors = this._palettes[this.activePalette] || this._palettes.classic;

    this.resize();
    this.draw();
    this._startIdleAnimation();

    // Responsive
    this._resizeObserver = new ResizeObserver(() => {
      this.resize();
      this.draw();
    });
    this._resizeObserver.observe(this.canvas.parentElement);
  }

  /* ── Sizing ────────────────────────────────────────── */

  resize() {
    const rect = this.canvas.parentElement.getBoundingClientRect();
    const size = Math.min(rect.width, rect.height);

    this.canvas.width = size * this.dpr;
    this.canvas.height = size * this.dpr;

    this.w = size;
    this.h = size;
    this.centerX = size / 2;
    this.centerY = size / 2;
    this.radius = size / 2 - 22;
  }

  /* ── Public API ────────────────────────────────────── */

  /**
   * Set entries. Accepts:
   *  - Array of strings (legacy): ['Pizza', 'Burger']
   *  - Array of objects: [{ name: 'Pizza', weight: 1, color: null }, ...]
   */
  setEntries(entries) {
    this.entries = entries.map(e => {
      if (typeof e === 'string') {
        return { name: e.trim(), weight: 1, color: null };
      }
      return { name: (e.name || '').trim(), weight: e.weight || 1, color: e.color || null };
    }).filter(e => e.name !== '');
    this._buildColorMap();
    if (!this.isSpinning) this.draw();
  }

  /** Get all palette names and their colors */
  getPalettes() {
    return this._palettes;
  }

  /** Switch active palette */
  setPalette(key) {
    if (this._palettes[key]) {
      this.activePalette = key;
      this.colors = this._palettes[key];
      localStorage.setItem('spinawheel-palette', key);
      this._buildColorMap();
      if (!this.isSpinning) this.draw();
    }
  }

  /** Set font size mode (0=Small, 1=Medium, 2=Large) */
  setFontSizeMode(mode) {
    this.fontSizeMode = mode;
    if (!this.isSpinning) this.draw();
  }

  /** Calculate total weight */
  _totalWeight() {
    return this.entries.reduce((sum, e) => sum + (e.weight || 1), 0);
  }

  /** Build a per-segment color list so no two adjacent segments share a color */
  _buildColorMap() {
    const n = this.entries.length;
    const palette = this.colors;
    const k = palette.length;
    if (n === 0) { this._colorMap = []; return; }
    if (n === 1) {
      this._colorMap = [this.entries[0].color || palette[0]];
      return;
    }

    const map = new Array(n);
    for (let i = 0; i < n; i++) {
      if (this.entries[i].color) {
        map[i] = this.entries[i].color;
      } else {
        let ci = i % k;
        if (i > 0 && palette[ci] === map[i - 1]) {
          ci = (ci + 1) % k;
        }
        map[i] = palette[ci];
      }
    }
    // Fix wrap-around
    if (n > 2 && map[n - 1] === map[0] && !this.entries[n - 1].color) {
      for (let c = 0; c < k; c++) {
        if (palette[c] !== map[n - 2] && palette[c] !== map[0]) {
          map[n - 1] = palette[c];
          break;
        }
      }
    }
    this._colorMap = map;
  }

  spin() {
    if (this.isSpinning || this.entries.length < 2) return;
    this.isSpinning = true;
    this.promptDismissed = true;
    localStorage.setItem('spinawheel-prompt-dismissed', 'true');
    this._stopIdleAnimation();

    const speedDurations = {
      1: [12000, 3000],
      2: [9000,  3000],
      3: [5000,  2000],
    };
    const [base, range] = speedDurations[this.speed] || speedDurations[2];

    const extraRotations = (10 + Math.random() * 6) * Math.PI * 2;
    const randomAngle = Math.random() * Math.PI * 2;
    const targetRotation = this.rotation + extraRotations + randomAngle;
    const duration = base + Math.random() * range;

    const startRotation = this.rotation;
    const startTime = performance.now();
    this._lastSegIdx = -1;

    const animate = (now) => {
      const elapsed = now - startTime;
      const progress = Math.min(elapsed / duration, 1);
      const eased = this._easeWheelSpin(progress);
      this.rotation = startRotation + (targetRotation - startRotation) * eased;

      // Tick detection
      const segIdx = this._getSegmentAtPointer();
      if (segIdx !== this._lastSegIdx && this._lastSegIdx !== -1) {
        this.onTick();
      }
      this._lastSegIdx = segIdx;

      this._frameCount++;
      this.draw();

      if (progress < 1) {
        requestAnimationFrame(animate);
      } else {
        this.isSpinning = false;
        const winnerIdx = this._getWeightedSegmentAtPointer();
        this.onSpinEnd(this.entries[winnerIdx].name, winnerIdx);
      }
    };

    requestAnimationFrame(animate);
  }

  /* ── Easing ───────────────────────────────────────── */

  _easeWheelSpin(t) {
    const accelEnd = 0.12;
    const A = 0.21;
    if (t <= accelEnd) {
      const tN = t / accelEnd;
      return A * tN * tN * tN;
    } else {
      const u = (t - accelEnd) / (1 - accelEnd);
      return A + (1 - A) * (1 - Math.pow(1 - u, 6));
    }
  }

  /* ── Idle Animation ──────────────────────────────── */

  _startIdleAnimation() {
    if (this._idleAnimId) return;
    const tick = () => {
      this._frameCount++;
      if (!this.isSpinning) {
        this.rotation += 0.001;
      }
      this.draw();
      this._idleAnimId = requestAnimationFrame(tick);
    };
    this._idleAnimId = requestAnimationFrame(tick);
  }

  _stopIdleAnimation() {
    if (this._idleAnimId) {
      cancelAnimationFrame(this._idleAnimId);
      this._idleAnimId = null;
    }
  }

  /* ── Drawing ───────────────────────────────────────── */

  draw() {
    const ctx = this.ctx;
    const dpr = this.dpr;

    ctx.save();
    ctx.scale(dpr, dpr);
    ctx.clearRect(0, 0, this.w, this.h);

    if (this.entries.length === 0) {
      this._drawEmpty();
      ctx.restore();
      return;
    }

    // Wheel shadow
    ctx.save();
    ctx.shadowColor = 'rgba(0,0,0,0.35)';
    ctx.shadowBlur = 24;
    ctx.shadowOffsetY = 4;
    ctx.beginPath();
    ctx.arc(this.centerX, this.centerY, this.radius, 0, Math.PI * 2);
    ctx.fillStyle = 'rgba(0,0,0,0.01)';
    ctx.fill();
    ctx.restore();

    // Rotating segments
    ctx.save();
    ctx.translate(this.centerX, this.centerY);
    ctx.rotate(this.rotation);
    this._drawSegments();
    ctx.restore();

    // Center hub
    this._drawCenter();

    // Prompt text
    if (!this.isSpinning && this.entries.length >= 2 && !this.promptDismissed) {
      this._drawPrompt();
    }

    // Pointer
    this._drawPointer();

    ctx.restore();
  }

  /* ── Private Drawing Methods ────────────────────── */

  _drawPrompt() {
    const ctx = this.ctx;
    ctx.save();
    ctx.translate(this.centerX, this.centerY);
    
    const text1 = 'CLICK TO SPIN!';
    const text2 = 'or press ctrl+enter';
    
    // Position text close to the center hub
    const r1 = this.radius * 0.45;
    const r2 = this.radius * 0.40;

    ctx.fillStyle = '#ffffff';
    ctx.shadowColor = 'rgba(0,0,0,0.6)';
    ctx.shadowBlur = 6;
    ctx.shadowOffsetX = 0;
    ctx.shadowOffsetY = 2;
    ctx.textAlign = 'center';

    // Draw main text at the top
    ctx.font = `800 ${Math.max(16, this.radius * 0.10)}px 'Outfit', 'Inter', sans-serif`;
    this._drawTextTop(ctx, text1, r1);

    // Draw subtitle at the bottom
    ctx.font = `600 ${Math.max(10, this.radius * 0.07)}px 'Outfit', 'Inter', sans-serif`;
    this._drawTextBottom(ctx, text2, r2);
    
    ctx.restore();
  }

  _drawTextTop(ctx, text, radius) {
    const chars = text.split('');
    let totalAngle = 0;
    const charAngles = [];
    
    for (let i = 0; i < chars.length; i++) {
      const w = ctx.measureText(chars[i]).width;
      const angle = (w + 2) / radius;
      charAngles.push(angle);
      totalAngle += angle;
    }
    
    let currentAngle = -(totalAngle / 2);
    
    ctx.save();
    ctx.textBaseline = 'bottom';
    for (let i = 0; i < chars.length; i++) {
      currentAngle += charAngles[i] / 2;
      ctx.save();
      ctx.rotate(currentAngle);
      ctx.translate(0, -radius);
      ctx.fillText(chars[i], 0, 0);
      ctx.restore();
      currentAngle += charAngles[i] / 2;
    }
    ctx.restore();
  }

  _drawTextBottom(ctx, text, radius) {
    const chars = text.split('');
    let totalAngle = 0;
    const charAngles = [];
    
    for (let i = 0; i < chars.length; i++) {
      const w = ctx.measureText(chars[i]).width;
      const angle = (w + 2) / radius;
      charAngles.push(angle);
      totalAngle += angle;
    }
    
    let currentAngle = (totalAngle / 2);
    
    ctx.save();
    ctx.textBaseline = 'top';
    for (let i = 0; i < chars.length; i++) {
      currentAngle -= charAngles[i] / 2;
      ctx.save();
      ctx.rotate(currentAngle);
      ctx.translate(0, radius);
      ctx.fillText(chars[i], 0, 0);
      ctx.restore();
      currentAngle -= charAngles[i] / 2;
    }
    ctx.restore();
  }

  _drawEmpty() {
    const ctx = this.ctx;
    ctx.beginPath();
    ctx.arc(this.centerX, this.centerY, this.radius, 0, Math.PI * 2);
    ctx.fillStyle = 'rgba(14, 165, 233, 0.08)';
    ctx.fill();
    ctx.strokeStyle = 'rgba(14, 165, 233, 0.2)';
    ctx.lineWidth = 2;
    ctx.stroke();

    ctx.fillStyle = 'rgba(14, 165, 233, 0.5)';
    ctx.font = `600 ${Math.max(14, this.radius * 0.08)}px 'Inter', sans-serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('Add entries to begin →', this.centerX, this.centerY);
  }

  /** Draw weighted segments — arc angles proportional to weight */
  _drawSegments() {
    const ctx = this.ctx;
    const n = this.entries.length;
    const totalWeight = this._totalWeight();

    let currentAngle = 0;
    for (let i = 0; i < n; i++) {
      const weight = this.entries[i].weight || 1;
      const segAngle = (weight / totalWeight) * Math.PI * 2;
      const startA = currentAngle;
      const endA = currentAngle + segAngle;
      const midA = startA + segAngle / 2;
      const color = this._colorMap[i] || this.colors[i % this.colors.length];

      // Fill
      ctx.beginPath();
      ctx.moveTo(0, 0);
      ctx.arc(0, 0, this.radius, startA, endA);
      ctx.closePath();
      ctx.fillStyle = color;
      ctx.fill();

      // Segment border
      ctx.save();
      ctx.beginPath();
      ctx.moveTo(0, 0);
      ctx.lineTo(Math.cos(startA) * this.radius, Math.sin(startA) * this.radius);
      ctx.strokeStyle = 'rgba(0,0,0,0.2)';
      ctx.lineWidth = 1;
      ctx.stroke();
      ctx.restore();

      // Text
      ctx.save();
      ctx.rotate(midA);

      const textRadius = this.radius * 0.95;
      const maxWidth = this.radius * 0.75;

      // Calculate a scale factor based on a typical large wheel radius (~228px)
      // This ensures text scales down proportionally when multiple wheels are shown
      const scale = this.radius / 228;

      // Font size modes
      const fontMultipliers = [0.7, 1, 1.4];
      const mult = fontMultipliers[this.fontSizeMode] || 1;

      // Calculate font size using segAngle, bounded proportionally to the wheel's radius
      let fontSize = Math.min(
        Math.max(12 * scale, segAngle * this.radius * 0.35),
        36 * scale
      ) * mult;

      ctx.font = `400 ${fontSize}px 'Outfit', 'Inter', sans-serif`;
      ctx.textAlign = 'right';
      ctx.textBaseline = 'middle';

      const textColor = this._textColor(color);
      ctx.shadowColor = textColor === '#ffffff' ? 'rgba(0,0,0,0.2)' : 'rgba(255,255,255,0.2)';
      ctx.shadowBlur = 2;
      ctx.shadowOffsetX = 0;
      ctx.shadowOffsetY = 1;
      ctx.fillStyle = textColor;

      let text = this.entries[i].name;
      if (ctx.measureText(text).width > maxWidth) {
        while (text.length > 1 && ctx.measureText(text + '…').width > maxWidth) {
          text = text.slice(0, -1);
        }
        text += '…';
      }

      ctx.fillText(text, textRadius, 0);
      ctx.shadowColor = 'transparent';
      ctx.shadowBlur = 0;
      ctx.restore();

      currentAngle = endA;
    }

    // Outer rim
    ctx.beginPath();
    ctx.arc(0, 0, this.radius, 0, Math.PI * 2);
    ctx.strokeStyle = 'rgba(0,0,0,0.2)';
    ctx.lineWidth = 1;
    ctx.stroke();
  }

  _drawCenter() {
    const ctx = this.ctx;
    const r = Math.max(10, this.radius * 0.08);
    ctx.beginPath();
    ctx.arc(this.centerX, this.centerY, r, 0, Math.PI * 2);
    ctx.fillStyle = '#ffffff';
    ctx.fill();
    ctx.strokeStyle = 'rgba(0,0,0,0.1)';
    ctx.lineWidth = 1;
    ctx.stroke();
  }

  _drawPointer() {
    const ctx = this.ctx;
    const size = Math.max(26, this.radius * 0.12);

    const segIdx = this._getSegmentAtPointer();
    const segColor = (segIdx >= 0 && this.entries.length > 0)
      ? (this._colorMap[segIdx] || this.colors[segIdx % this.colors.length])
      : '#3369E8';

    const tipX = this.centerX + this.radius - size * 0.6;
    const tipY = this.centerY;
    const baseX = this.centerX + this.radius + size * 0.5;

    ctx.beginPath();
    ctx.moveTo(tipX, tipY);
    ctx.lineTo(baseX, tipY - size * 0.75);
    ctx.lineTo(baseX, tipY + size * 0.75);
    ctx.closePath();
    ctx.fillStyle = segColor;
    ctx.shadowColor = 'rgba(0,0,0,0.3)';
    ctx.shadowBlur = 4;
    ctx.shadowOffsetX = -1;
    ctx.shadowOffsetY = 2;
    ctx.fill();
    ctx.shadowColor = 'transparent';
    ctx.shadowBlur = 0;
    ctx.strokeStyle = 'rgba(0,0,0,0.2)';
    ctx.lineWidth = 1;
    ctx.stroke();
  }

  /* ── Helpers ───────────────────────────────────────── */

  /** Determine which segment is at the pointer — WEIGHTED version */
  _getSegmentAtPointer() {
    const n = this.entries.length;
    if (n === 0) return -1;

    const totalWeight = this._totalWeight();
    let angle = ((-this.rotation % (Math.PI * 2)) + Math.PI * 2) % (Math.PI * 2);

    let cumAngle = 0;
    for (let i = 0; i < n; i++) {
      const weight = this.entries[i].weight || 1;
      cumAngle += (weight / totalWeight) * Math.PI * 2;
      if (angle < cumAngle) return i;
    }
    return n - 1;
  }

  /** Alias for consistency */
  _getWeightedSegmentAtPointer() {
    return this._getSegmentAtPointer();
  }

  _textColor(hex) {
    const c = hex.replace('#', '');
    const r = parseInt(c.substring(0, 2), 16) / 255;
    const g = parseInt(c.substring(2, 4), 16) / 255;
    const b = parseInt(c.substring(4, 6), 16) / 255;
    const lum = 0.299 * r + 0.587 * g + 0.114 * b;
    return lum > 0.55 ? '#1e293b' : '#ffffff';
  }

  /** Cleanup */
  destroy() {
    this._stopIdleAnimation();
    if (this._resizeObserver) this._resizeObserver.disconnect();
  }
}

// Export
window.SpinWheel = SpinWheel;
