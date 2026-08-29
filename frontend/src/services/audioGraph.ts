/**
 * One Web Audio graph shared by every media element the app plays through.
 *
 * The visualizer has to tap whatever is actually audible, and that moves
 * around: normally the video, but the stem player mutes the video and swaps
 * in hidden <audio> elements for the instrumental / six-stem mix. So every
 * element that can be heard registers here, and the analyser sits on the sum.
 *
 * Routing an element into Web Audio is one-way — createMediaElementSource()
 * can only be called once per element and permanently re-routes that element's
 * output through the graph. So the graph stays dormant until something asks
 * for the analyser: with the visualizer off, the audio path is untouched.
 *
 * Element volume/muted still apply ahead of the tap (Chromium and Firefox both
 * do this), so the media bar's volume and the mixer's per-stem mutes keep
 * working exactly as before — a muted stem simply contributes nothing to the
 * picture, which is what you'd want anyway.
 *
 * Elements must be CORS-clean (crossOrigin="anonymous") or the tap yields
 * silence; the backend sends permissive CORS headers for that reason.
 */

let ctx: AudioContext | null = null;
let analyser: AnalyserNode | null = null;

const registered = new Set<HTMLMediaElement>();
// One source node per element, for the element's lifetime: a second
// createMediaElementSource() on the same element throws, and StrictMode
// re-runs every effect, so registrations have to be repeatable.
const sources = new WeakMap<HTMLMediaElement, MediaElementAudioSourceNode>();

function connect(el: HTMLMediaElement) {
  if (!ctx || !analyser) return;
  let source = sources.get(el);
  if (!source) {
    try {
      source = ctx.createMediaElementSource(el);
      sources.set(el, source);
    } catch {
      // An element the browser won't hand us — leave it playing normally
      // rather than risk losing its audio.
      return;
    }
  }
  // Reconnecting an existing pair is a no-op, so this is safe to repeat.
  source.connect(analyser);
}

/**
 * Track a media element so it feeds the analyser. Safe to call whether or not
 * the graph is running; returns a disposer to call when the element goes away.
 */
export function registerMedia(el: HTMLMediaElement): () => void {
  registered.add(el);
  connect(el);
  return () => {
    registered.delete(el);
    try {
      sources.get(el)?.disconnect();
    } catch {
      /* already torn down */
    }
  };
}

/** Spin the graph up (idempotent) and return the shared analyser. */
export function activateAnalyser(): AnalyserNode | null {
  if (!analyser) {
    const Ctor =
      window.AudioContext ??
      (window as unknown as { webkitAudioContext?: typeof AudioContext })
        .webkitAudioContext;
    if (!Ctor) return null;
    try {
      ctx = new Ctor();
    } catch {
      return null;
    }
    analyser = ctx.createAnalyser();
    analyser.fftSize = 2048;
    analyser.smoothingTimeConstant = 0.72;
    analyser.minDecibels = -95;
    analyser.maxDecibels = -25;
    // The analyser is a pass-through, so the graph stays audible.
    analyser.connect(ctx.destination);
    // Autoplay policy can leave the context suspended; any click un-sticks it.
    document.addEventListener("pointerdown", resumeAudio);
  }
  registered.forEach(connect);
  resumeAudio();
  return analyser;
}

/** Resume the context after the autoplay policy suspended it. */
export function resumeAudio() {
  if (ctx?.state === "suspended") void ctx.resume().catch(() => {});
}
