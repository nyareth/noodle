"use client";
import Link from "next/link";
import { useState } from "react";
import { ApiClientError, api, safeNext } from "@/lib/api-client";

export function LoginForm({ next, canRegister, siteName }: { next?: string; canRegister: boolean; siteName: string }) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await api("/api/auth/login", { body: { email, password } });
      window.location.assign(safeNext(next));
    } catch (err) {
      setBusy(false);
      setError(err instanceof ApiClientError ? err.message : "Could not log in.");
    }
  }

  return (
    <div className="login-wrap">
      <div className="card">
        <div className="card-body">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img className="login-logo" src="/noodle-logo.svg" alt="" width={88} height={88} />
          <h2>Log in to {siteName}</h2>
          {error && <div className="alert alert-danger" role="alert">{error}</div>}
          <form onSubmit={submit}>
            <div className="mb-3">
              <label className="form-label" htmlFor="email">E-mail address</label>
              <input id="email" className="form-control" type="email" autoComplete="username" required autoFocus value={email} onChange={(e) => setEmail(e.target.value)} />
            </div>
            <div className="mb-3">
              <label className="form-label" htmlFor="password">Password</label>
              <input id="password" className="form-control" type="password" autoComplete="current-password" required value={password} onChange={(e) => setPassword(e.target.value)} />
            </div>
            <button className="btn btn-primary w-100" type="submit" disabled={busy}>{busy ? "Logging in…" : "Log in"}</button>
          </form>
          {canRegister && (
            <>
              <hr className="login-divider" />
              <h6>Is this your first time here?</h6>
              <p className="text-muted">Create an account with your campus e-mail address to start practising.</p>
              <Link className="btn btn-secondary" href="/register">Create new account</Link>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

export function RegisterForm({ domains, siteName }: { domains: string[]; siteName: string }) {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await api("/api/auth/register", { body: { name, email, password } });
      window.location.assign("/");
    } catch (err) {
      setBusy(false);
      if (err instanceof ApiClientError && Array.isArray(err.data?.issues)) {
        setError((err.data.issues as { message: string }[]).map((i) => i.message).join(" "));
      } else setError(err instanceof ApiClientError ? err.message : "Could not create the account.");
    }
  }

  return (
    <div className="login-wrap">
      <div className="card">
        <div className="card-body">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img className="login-logo" src="/noodle-logo.svg" alt="" width={88} height={88} />
          <h2>New account on {siteName}</h2>
          {error && <div className="alert alert-danger" role="alert">{error}</div>}
          <form onSubmit={submit}>
            <div className="mb-3">
              <label className="form-label" htmlFor="name">Full name</label>
              <input id="name" className="form-control" required autoComplete="name" value={name} onChange={(e) => setName(e.target.value)} />
            </div>
            <div className="mb-3">
              <label className="form-label" htmlFor="email">E-mail address</label>
              <input id="email" className="form-control" type="email" required autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} />
              {domains.length > 0 && <div className="form-text">Use your campus address ({domains.map((d) => `@${d}`).join(", ")}).</div>}
            </div>
            <div className="mb-3">
              <label className="form-label" htmlFor="password">Password</label>
              <input id="password" className="form-control" type="password" required minLength={8} autoComplete="new-password" value={password} onChange={(e) => setPassword(e.target.value)} />
              <div className="form-text">At least 8 characters.</div>
            </div>
            <div className="d-flex gap-2">
              <button className="btn btn-primary" type="submit" disabled={busy}>{busy ? "Creating…" : "Create my new account"}</button>
              <Link className="btn btn-secondary" href="/login">Cancel</Link>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
}
