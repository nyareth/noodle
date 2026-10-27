export function FlagIcon({ on }: { on: boolean }) {
  return (
    <svg className="questionflagimage" viewBox="0 0 16 16" width="16" height="16" aria-hidden="true">
      <path d="M3.5 14.5v-13" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" fill="none" />
      <path d="M3.5 2.2h8.6l-2 3.2 2 3.2H3.5z" stroke="currentColor" strokeWidth="1.3" strokeLinejoin="round" fill={on ? "currentColor" : "none"} />
    </svg>
  );
}

export function CheckIcon() {
  return (
    <svg viewBox="0 0 16 16" width="16" height="16" role="img" aria-label="Correct">
      <title>Correct</title>
      <path d="M3 8.6l3.1 3.1L13 4.8" fill="none" stroke="#357a32" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

export function CrossIcon() {
  return (
    <svg viewBox="0 0 16 16" width="16" height="16" role="img" aria-label="Incorrect">
      <title>Incorrect</title>
      <path d="M4 4l8 8M12 4l-8 8" fill="none" stroke="#ca3120" strokeWidth="2.2" strokeLinecap="round" />
    </svg>
  );
}
