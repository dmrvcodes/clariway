export interface VoiceOption {
  voiceName: string;
  lang: string;
  remote: boolean;
}

export type SpeechEventHandler = (event: chrome.tts.TtsEvent) => void;

export const getEnglishVoices = async (): Promise<VoiceOption[]> => {
  const voices = await chrome.tts.getVoices();

  return voices
    .filter(
      (voice): voice is chrome.tts.TtsVoice & {
        voiceName: string;
        lang: string;
      } =>
        typeof voice.voiceName === "string" &&
        typeof voice.lang === "string" &&
        voice.lang.toLowerCase().startsWith("en"),
    )
    .map((voice) => ({
      voiceName: voice.voiceName,
      lang: voice.lang,
      remote: Boolean(voice.remote),
    }))
    // Local voices first, so the default never sends page text to a network voice.
    .sort((first, second) => Number(first.remote) - Number(second.remote));
};

export const speakEnglish = async (
  text: string,
  voiceName?: string,
  onEvent?: SpeechEventHandler,
): Promise<void> => {
  await chrome.tts.stop();
  await chrome.tts.speak(text, {
    lang: "en-US",
    rate: 1,
    voiceName,
    onEvent,
  });
};

export const stopSpeaking = async (): Promise<void> => {
  await chrome.tts.stop();
};
