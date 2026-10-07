// Caption boundaries include closing punctuation. Speech caching remains separate.
export function captionPhrases(text) {
  const parts =
    text.match(/[^.!?。！？]+(?:[.!?。！？]+[”’」』»"]*|$)/gu) ?? [];
  const pairs = { "“": "”", "‘": "’", "「": "」", "『": "』" };
  const stack = [];
  return parts
    .map((part) => {
      part = part.trim();
      const prefix = stack.join("");
      for (const char of part) {
        if (pairs[char]) stack.push(char);
        else if (stack.length && pairs[stack.at(-1)] === char) stack.pop();
      }
      const suffix = [...stack]
        .reverse()
        .map((char) => pairs[char])
        .join("");
      return prefix + part + suffix;
    })
    .filter((part) => /[\p{L}\p{N}]/u.test(part));
}

export function captionTextForSpeech(narration, speechParts) {
  const captions = captionPhrases(narration);
  const spoken = (text) => text.replace(/[“”‘’「」『』»"\s]/gu, "");
  if (
    captions.length !== speechParts.length ||
    captions.some((text, i) => spoken(text) !== spoken(speechParts[i]))
  )
    throw new Error("Caption and speech phrase boundaries differ");
  return captions;
}
