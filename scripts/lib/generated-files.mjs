export function sameGeneratedText(left, right) {
  const normalize = (value) => String(value).replace(/\r\n?/g, "\n");
  return normalize(left) === normalize(right);
}
