let audioContext: AudioContext | null = null;
let notificationAudio: HTMLAudioElement | null = null;

function getAudioContext() {
  if (typeof window === "undefined") {
    return null;
  }

  if (!audioContext) {
    audioContext = new AudioContext();
  }

  return audioContext;
}

function playFallbackTone() {
  const context = getAudioContext();
  if (!context) {
    return;
  }

  const oscillator = context.createOscillator();
  const gain = context.createGain();

  oscillator.type = "sine";
  oscillator.frequency.value = 880;
  gain.gain.value = 0.04;

  oscillator.connect(gain);
  gain.connect(context.destination);

  oscillator.start();
  oscillator.stop(context.currentTime + 0.12);
}

export async function playNotificationSound() {
  if (typeof window === "undefined") {
    return;
  }

  try {
    if (!notificationAudio) {
      notificationAudio = new Audio("/sounds/notification.mp3");
      notificationAudio.preload = "auto";
    }

    notificationAudio.currentTime = 0;
    await notificationAudio.play();
  } catch {
    playFallbackTone();
  }
}
