const patterns = Object.freeze([
  { id: "absolute-user-path", pattern: /\/(?:Users|home)\/[^/\s"']+\//gi, legalExempt: false },
  { id: "absolute-posix-path", pattern: /(?:^|[\s"'`(=:\[])\/(?:private|var|Volumes|tmp|opt|etc|workspace|srv|usr\/local)\/[^\s"'`<>\])}]*/g, legalExempt: false },
  { id: "windows-drive-path", pattern: /\b[A-Za-z]:\\(?:[^\\\r\n:*?"<>|]+\\)+[^\\\r\n:*?"<>|]*/g, legalExempt: false },
  { id: "unc-path", pattern: /\\\\[A-Za-z0-9._$ -]+\\[^\s"'<>|]+/g, legalExempt: false },
  { id: "file-url", pattern: /file:\/\/(?:\/|localhost\/)/gi, legalExempt: true },
  { id: "email-address", pattern: /\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/gi, legalExempt: true },
  { id: "phone-number-kr", pattern: /(?<!\d)(?:(?:\+?82)[ .-]?)?0?1[016789][ .-]?\d{3,4}[ .-]?\d{4}(?!\d)/g, legalExempt: true },
  { id: "phone-number-e164", pattern: /(?<![\d+])\+[1-9]\d{7,14}(?!\d)/g, legalExempt: true },
  { id: "phone-number-nanp", pattern: /(?<!\d)(?:\([2-9]\d{2}\)|[2-9]\d{2})[ .-][2-9]\d{2}[ .-]\d{4}(?!\d)/g, legalExempt: true },
  { id: "ipv4-address", pattern: /(?<![\d.])(?:(?:25[0-5]|2[0-4]\d|1?\d?\d)\.){3}(?:25[0-5]|2[0-4]\d|1?\d?\d)(?![\d.])/g, legalExempt: true },
  { id: "ipv6-address", pattern: /(?<![A-Za-z0-9])(?:(?:[A-F0-9]{1,4}:){7}[A-F0-9]{1,4}|(?:[A-F0-9]{1,4}:){1,7}:|(?:[A-F0-9]{1,4}:){1,6}:[A-F0-9]{1,4}|(?:[A-F0-9]{1,4}:){1,5}(?::[A-F0-9]{1,4}){1,2}|(?:[A-F0-9]{1,4}:){1,4}(?::[A-F0-9]{1,4}){1,3}|(?:[A-F0-9]{1,4}:){1,3}(?::[A-F0-9]{1,4}){1,4}|(?:[A-F0-9]{1,4}:){1,2}(?::[A-F0-9]{1,4}){1,5}|[A-F0-9]{1,4}:(?:(?::[A-F0-9]{1,4}){1,6})|:(?:(?::[A-F0-9]{1,4}){1,7}|:))(?![A-Za-z0-9])/gi, legalExempt: true },
  { id: "jwt", pattern: /\beyJ[A-Za-z0-9_-]{5,}\.[A-Za-z0-9_-]{5,}\.[A-Za-z0-9_-]{5,}\b/g, legalExempt: false },
  { id: "bearer-token", pattern: /\bBearer\s+[A-Za-z0-9._~+/=-]{12,}\b/gi, legalExempt: false },
  { id: "github-token", pattern: /\bgh[pousr]_[A-Za-z0-9]{20,}\b/g, legalExempt: false },
  { id: "openai-style-secret", pattern: /\bsk-[A-Za-z0-9_-]{16,}\b/g, legalExempt: false },
  { id: "slack-token", pattern: /\bxox[baprs]-[A-Za-z0-9-]{10,}\b/g, legalExempt: false },
  { id: "aws-access-key", pattern: /\bAKIA[0-9A-Z]{16}\b/g, legalExempt: false },
  { id: "assigned-secret", pattern: /\b(?:api[_-]?key|access[_-]?token|client[_-]?secret|private[_-]?key|secret|token)\b\s*[:=]\s*["']?[A-Za-z0-9_./+=-]{8,}/gi, legalExempt: false },
  { id: "private-key-pem", pattern: /-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/g, legalExempt: false },
]);

const operatingPatterns = Object.freeze([
  { id: "operating-session-identifier", pattern: /\b(?:(?:session|thread|task)(?:[-_ ]?(?:id|name))?|model(?:[-_ ]?name)?|internal[-_ ]?(?:id|number))\b["']?\s*[:=#]\s*["']?[A-Za-z0-9][A-Za-z0-9._:-]*(?:\s+[A-Za-z0-9][A-Za-z0-9._:-]*)?|(?:모델명|내부\s*번호|(?:세션|스레드|태스크|작업)\s*ID)["']?\s*[:=#]\s*["']?[^\s"',}\]]+/gi, legalExempt: false },
  { id: "operating-control-identifier", pattern: /\b(?:batch|cursor|high[-_ ]?watermark|owner[-_ ]?lease|work[-_ ]?order)\b\s*[:=#]?\s*[A-Za-z0-9._:-]+/gi, legalExempt: false },
  { id: "operating-event-identifier", pattern: /\b(?:(?:run|release|event)[-_ ]?id|pull request|pr)\b["']?\s*[:=#]\s*["']?[A-Za-z0-9._:-]+|\b(?:REL|EVT)-[A-Z0-9-]{6,}\b/gi, legalExempt: false },
  { id: "operating-receipt-reference", pattern: /\b(?:receipt|source[-_ ]?hash)\b|영수증|소스\s*해시/gi, legalExempt: false },
  { id: "operating-process-metric", pattern: /\b(?:pid|port)\b\s*[:=#]?\s*\d{2,6}\b|(?:포트|프로세스\s*ID)\s*[:=#]?\s*\d{2,6}/gi, legalExempt: false },
  { id: "operating-performance-metric", pattern: /\b(?:cost|latency|success[-_ ]?rate|agent[-_ ]?score|agent[-_ ]?rank)\b\s*[:=#]?\s*[\d.]+%?/gi, legalExempt: false },
  { id: "operating-private-state", pattern: /\b(?:current[-_ ]?(?:work|status)|online[-_ ]?status|thought[-_ ]?trace|command[-_ ]?history)\b|현재\s*작업|온라인\s*상태|사고\s*추적|명령\s*이력/gi, legalExempt: false },
]);

export const publicPrivacyPatternIds = Object.freeze(patterns.map(({ id }) => id));
export const publicOperatingPatternIds = Object.freeze(operatingPatterns.map(({ id }) => id));

function isAllowedToolingLiteral(id, value) {
  if (id === "absolute-posix-path" || id.startsWith("operating-")) return true;
  if (id === "file-url") return true;
  if (id === "ipv4-address") return value === "127.0.0.1";
  if (id === "ipv6-address") return value.toLowerCase() === "::1";
  return false;
}

function isInsideCanonicalDigest(body, offset, length) {
  let start = offset;
  let end = offset + length;
  while (start > 0 && /[a-f0-9]/i.test(body[start - 1])) start -= 1;
  while (end < body.length && /[a-f0-9]/i.test(body[end])) end += 1;
  return end - start === 64;
}

function scanDefinitions(definitions, text, { path = "unknown", legalText = false, toolingText = false } = {}) {
  const body = String(text);
  const findings = [];
  for (const definition of definitions) {
    if (legalText && definition.legalExempt) continue;
    definition.pattern.lastIndex = 0;
    let match;
    while ((match = definition.pattern.exec(body))) {
      if (toolingText && isAllowedToolingLiteral(definition.id, match[0])) continue;
      if (definition.id === "phone-number-kr"
        && isInsideCanonicalDigest(body, match.index, match[0].length)) continue;
      findings.push({
        id: definition.id,
        path,
        offset: match.index,
      });
      break;
    }
  }
  return findings;
}

export function scanPrivacyText(text, options = {}) {
  return scanDefinitions(patterns, text, options);
}

export function scanOperatingExposure(text, options = {}) {
  return scanDefinitions(operatingPatterns, text, options);
}
