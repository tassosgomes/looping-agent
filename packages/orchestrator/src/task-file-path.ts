export function formatTaskFileNumber(number: number): string {
  return number < 10 ? String(number).padStart(2, "0") : String(number);
}

export function getTaskFileName(number: number): string {
  return `${formatTaskFileNumber(number)}_task.md`;
}

export function getLegacyTaskFileName(number: number): string {
  return `${String(number)}_task.md`;
}
