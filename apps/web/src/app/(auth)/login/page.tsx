"use client";

import { FormEvent, useState } from "react";
import { useRouter } from "next/navigation";

const LoginPage = () => {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError(null);
    setPending(true);

    try {
      const response = await fetch("/api/v1/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ email, password }),
      });

      if (!response.ok) {
        setError("Invalid email or password");
        return;
      }

      router.push("/");
      router.refresh();
    } catch {
      setError("Unable to reach the API");
    } finally {
      setPending(false);
    }
  };

  return (
    <main
      style={{
        minHeight: "100vh",
        display: "grid",
        placeItems: "center",
        fontFamily: "system-ui, sans-serif",
        padding: "1.5rem",
      }}
    >
      <form
        onSubmit={handleSubmit}
        aria-label="Studio login"
        style={{
          width: "100%",
          maxWidth: "22rem",
          display: "grid",
          gap: "0.75rem",
        }}
      >
        <h1 style={{ margin: 0, fontSize: "1.5rem" }}>Studio login</h1>
        <label style={{ display: "grid", gap: "0.25rem" }}>
          <span>Email</span>
          <input
            type="email"
            name="email"
            autoComplete="username"
            required
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            aria-label="Email"
          />
        </label>
        <label style={{ display: "grid", gap: "0.25rem" }}>
          <span>Password</span>
          <input
            type="password"
            name="password"
            autoComplete="current-password"
            required
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            aria-label="Password"
          />
        </label>
        {error ? (
          <p role="alert" style={{ color: "#b00020", margin: 0 }}>
            {error}
          </p>
        ) : null}
        <button type="submit" disabled={pending} aria-label="Sign in">
          {pending ? "Signing in…" : "Sign in"}
        </button>
      </form>
    </main>
  );
};

export default LoginPage;
