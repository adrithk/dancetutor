// The teacher's voice, using the browser's built-in speech for now.
// `say` resolves when the sentence has finished (or was cancelled), so the
// lesson can wait for the teacher before the music starts again.

export class Voice {
  enabled = true;
  private cancelCurrent: (() => void) | null = null;

  private get synth(): SpeechSynthesis | null {
    return typeof window !== 'undefined' && 'speechSynthesis' in window ? window.speechSynthesis : null;
  }

  private canSpeak() {
    const s = this.synth;
    return this.enabled && !!s && s.getVoices().length > 0;
  }

  say(text: string): Promise<void> {
    this.cancel();
    return new Promise((resolve) => {
      let done = false;
      const finish = () => {
        if (done) return;
        done = true;
        window.clearTimeout(timer);
        this.cancelCurrent = null;
        resolve();
      };
      this.cancelCurrent = finish;
      // With no voice available, leave the caption up long enough to read.
      const readMs = Math.max(1200, text.length * 55);
      let timer = window.setTimeout(finish, readMs);
      if (this.canSpeak()) {
        window.clearTimeout(timer);
        timer = window.setTimeout(finish, 2500 + text.length * 110);
        const u = new SpeechSynthesisUtterance(text);
        u.rate = 1.05;
        u.onend = finish;
        u.onerror = finish;
        this.synth!.speak(u);
      }
    });
  }

  /** Short utterance that nothing waits for, such as a count. */
  quick(text: string, rate = 1.3) {
    if (!this.canSpeak()) return;
    const u = new SpeechSynthesisUtterance(text);
    u.rate = rate;
    this.synth!.speak(u);
  }

  cancel() {
    this.synth?.cancel();
    this.cancelCurrent?.();
  }
}
