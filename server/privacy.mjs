import { homedir } from 'node:os';
const sensitiveKey = /token|secret|password|passwd|authorization|api[-_]?key|credential|cookie/i;
export function collectSecrets(value, output = new Set(), parent = '') {
  if (!value || typeof value !== 'object') return output;
  for (const [key, child] of Object.entries(value)) {
    if (typeof child === 'string' && (parent === 'env' || sensitiveKey.test(key)) && child.length > 2) output.add(child);
    if (Array.isArray(child) && key === 'args') {
      child.forEach((arg, i) => {
        if (typeof arg === 'string' && /^--?(?:token|api[-_]?key|secret|password)$/i.test(arg) && typeof child[i + 1] === 'string') output.add(child[i + 1]);
      });
    }
    if (child && typeof child === 'object') collectSecrets(child, output, key);
  }
  return output;
}
export function redactText(value, secrets = [], hidePaths = false) {
  let result = String(value);
  for (const secret of [...secrets].filter(Boolean).sort((a, b) => b.length - a.length)) result = result.split(secret).join('[REDACTED]');
  result = result
    .replace(/(?:sk|ghp|github_pat|gho|glpat)[-_][A-Za-z0-9_-]{8,}/g, '[REDACTED]')
    .replace(/(Bearer\s+)[^\s"'<>]+/gi, '$1[REDACTED]')
    .replace(/((?:api[-_]?key|access[-_]?token|password|secret)=)[^&\s"']+/gi, '$1[REDACTED]')
    .replace(/(https?:\/\/)[^\s/@]+:[^\s/@]+@/gi, '$1[REDACTED]@')
    .replace(/[\x00-\x08\x0b\x0c\x0e-\x1f\x7f]/g, '');
  if (hidePaths) {
    const home = homedir();
    result = result.split(home).join('~').split(home.replaceAll('\\', '/')).join('~');
    result = result.replace(/\b[A-Z]:[\\/](?:Users|Documents and Settings)[\\/][^\\/\s"']+/gi, '~');
    result = result.replace(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi, '[EMAIL]');
  }
  return result;
}
export function redactObject(value, secrets = [], hidePaths = false, parent = '') {
  if (typeof value === 'string') return redactText(value, secrets, hidePaths);
  if (Array.isArray(value)) return value.map(v => redactObject(v, secrets, hidePaths, parent));
  if (!value || typeof value !== 'object') return value;
  return Object.fromEntries(Object.entries(value).map(([key, child]) => [
    key,
    sensitiveKey.test(key) && typeof child === 'string' ? '[REDACTED]' :
    parent === 'env' && typeof child === 'string' ? '[REDACTED]' : redactObject(child, secrets, hidePaths, key),
  ]));
}
