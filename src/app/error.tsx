"use client";

export default function ErrorPage({ reset }: { error: Error; reset: () => void }) {
  return (
    <div className="moodle" style={{ maxWidth: 560, margin: "6rem auto", padding: "0 1rem" }}>
      <div className="alert alert-danger" role="alert">
        <h4>Something went wrong</h4>
        <p>The page could not be loaded. Your saved answers are safe.</p>
        <button className="btn btn-primary" onClick={reset}>Try again</button>
      </div>
    </div>
  );
}
