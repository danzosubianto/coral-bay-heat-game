// Every sound in Coral Bay is synthesized with WebAudio at the moment it is
// needed: the engine's growl follows the car's speed, the CBPD siren is a
// two-tone square wave, crashes are filtered noise, and the little cash blip
// is two sine notes. Nothing is loaded, so nothing can fail to load; the
// whole rig stays silent (and harmless) until the player's first input
// unlocks the AudioContext, as browsers require.

export function createAudio() {
  let ctx = null;
  let master = null;
  let engineOsc = null;
  let engineGain = null;
  let sirenOsc = null;
  let sirenGain = null;
  let sirenFlip = null;

  function unlock() {
    if (ctx) {
      if (ctx.state === 'suspended') ctx.resume().catch(() => {});
      return;
    }
    try {
      ctx = new (window.AudioContext || window.webkitAudioContext)();
      master = ctx.createGain();
      master.gain.value = 0.5;
      master.connect(ctx.destination);
    } catch {
      ctx = null;
    }
  }

  function noiseBuffer(seconds) {
    const buffer = ctx.createBuffer(1, Math.floor(ctx.sampleRate * seconds), ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < data.length; i += 1) data[i] = Math.random() * 2 - 1;
    return buffer;
  }

  function burst({ seconds = 0.2, type = 'lowpass', freq = 800, gain = 0.4 }) {
    if (!ctx) return;
    const src = ctx.createBufferSource();
    src.buffer = noiseBuffer(seconds);
    const filter = ctx.createBiquadFilter();
    filter.type = type;
    filter.frequency.value = freq;
    const g = ctx.createGain();
    g.gain.setValueAtTime(gain, ctx.currentTime);
    g.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + seconds);
    src.connect(filter).connect(g).connect(master);
    src.start();
    src.stop(ctx.currentTime + seconds);
  }

  function blip(freqA, freqB, seconds = 0.12, gain = 0.25, type = 'sine') {
    if (!ctx) return;
    const osc = ctx.createOscillator();
    osc.type = type;
    osc.frequency.setValueAtTime(freqA, ctx.currentTime);
    osc.frequency.setValueAtTime(freqB, ctx.currentTime + seconds * 0.55);
    const g = ctx.createGain();
    g.gain.setValueAtTime(gain, ctx.currentTime);
    g.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + seconds);
    osc.connect(g).connect(master);
    osc.start();
    osc.stop(ctx.currentTime + seconds);
  }

  return {
    unlock,

    /** Continuous engine note; call every frame with speed 0..1 (0 = parked). */
    engine(level, running) {
      if (!ctx) return;
      if (running && !engineOsc) {
        engineOsc = ctx.createOscillator();
        engineOsc.type = 'sawtooth';
        engineGain = ctx.createGain();
        engineGain.gain.value = 0;
        const soft = ctx.createBiquadFilter();
        soft.type = 'lowpass';
        soft.frequency.value = 420;
        engineOsc.connect(soft).connect(engineGain).connect(master);
        engineOsc.start();
      }
      if (!running && engineOsc) {
        engineOsc.stop();
        engineOsc = null;
        engineGain = null;
        return;
      }
      if (engineOsc) {
        engineOsc.frequency.value = 55 + level * 165;
        engineGain.gain.value = 0.03 + level * 0.075;
      }
    },

    /** Continuous two-tone siren while the CBPD is close and hunting. */
    siren(active) {
      if (!ctx) return;
      if (active && !sirenOsc) {
        sirenOsc = ctx.createOscillator();
        sirenOsc.type = 'square';
        sirenOsc.frequency.value = 720;
        sirenGain = ctx.createGain();
        sirenGain.gain.value = 0.016;
        sirenOsc.connect(sirenGain).connect(master);
        sirenOsc.start();
        let high = false;
        sirenFlip = setInterval(() => {
          if (!sirenOsc) return;
          high = !high;
          sirenOsc.frequency.value = high ? 960 : 720;
        }, 380);
      }
      if (!active && sirenOsc) {
        sirenOsc.stop();
        sirenOsc = null;
        sirenGain = null;
        clearInterval(sirenFlip);
        sirenFlip = null;
      }
    },

    crash(strength = 1) {
      burst({ seconds: 0.16 + strength * 0.14, freq: 300 + strength * 300, gain: 0.22 + strength * 0.25 });
    },
    scrape() {
      burst({ seconds: 0.1, type: 'bandpass', freq: 1800, gain: 0.1 });
    },
    shot() {
      burst({ seconds: 0.09, type: 'highpass', freq: 1200, gain: 0.3 });
    },
    cash() {
      blip(880, 1320, 0.14, 0.22);
    },
    door() {
      blip(190, 120, 0.09, 0.18, 'triangle');
    },
    click() {
      blip(660, 660, 0.05, 0.12, 'triangle');
    },
    busted() {
      blip(392, 311, 0.4, 0.25, 'triangle');
      setTimeout(() => blip(311, 233, 0.55, 0.25, 'triangle'), 160);
    },
    fanfare() {
      if (!ctx) return;
      [523, 659, 784, 1046].forEach((f, i) => setTimeout(() => blip(f, f, 0.16, 0.2, 'triangle'), i * 95));
    },
  };
}
