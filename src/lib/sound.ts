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

export function chime() {
  if (typeof AudioContext === 'undefined') return
  const audio = new AudioContext()
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
}
