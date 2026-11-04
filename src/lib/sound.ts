// An optional two-note chime, off unless you turn it on. Web Audio, so there's no file to load.

const KEY = 'anki-analytics:sound'

export function soundOn() {
  try {
    return localStorage.getItem(KEY) === 'on'
  } catch {
    return false
  }
}

export function setSoundOn(on: boolean) {
  try {
    localStorage.setItem(KEY, on ? 'on' : 'off')
  } catch {
    // storage unavailable: the choice lasts until the page closes
  }
}

/** False if the browser wouldn't let it play: sound needs a click on the page first. */
export function chime(): boolean {
  if (typeof AudioContext === 'undefined') return false
  const audio = new AudioContext()
  if (audio.state !== 'running') {
    void audio.close()
    return false
  }
  ;[659, 880].forEach((hz, i) => {
    const start = audio.currentTime + i * 0.14
    const tone = audio.createOscillator()
    const gain = audio.createGain()
    tone.type = 'sine'
    tone.frequency.value = hz
    gain.gain.setValueAtTime(0.12, start)
    gain.gain.exponentialRampToValueAtTime(0.001, start + 0.35)
    tone.connect(gain).connect(audio.destination)
    tone.start(start)
    tone.stop(start + 0.35)
  })
  setTimeout(() => void audio.close(), 1_000)
  return true
}
