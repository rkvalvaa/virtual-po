type Fields = Record<string, unknown>;
type Level = 'info' | 'warn' | 'error';

/** Errors don't survive JSON.stringify — flatten them to a readable object. */
function serialize(fields: Fields): Fields {
  const out: Fields = {};
  for (const [key, value] of Object.entries(fields)) {
    out[key] =
      value instanceof Error
        ? { name: value.name, message: value.message, stack: value.stack }
        : value;
  }
  return out;
}

function emit(level: Level, event: string, fields?: Fields): void {
  const line = JSON.stringify({
    level,
    event,
    ts: new Date().toISOString(),
    ...(fields ? serialize(fields) : {}),
  });
  // ponytail: JSON lines on stdout/stderr. Vercel and every log drain index
  // these natively — no transport, no logger dependency.
  if (level === 'error') console.error(line);
  else if (level === 'warn') console.warn(line);
  else console.log(line);
}

export const log = {
  info: (event: string, fields?: Fields) => emit('info', event, fields),
  warn: (event: string, fields?: Fields) => emit('warn', event, fields),
  error: (event: string, fields?: Fields) => emit('error', event, fields),
};
