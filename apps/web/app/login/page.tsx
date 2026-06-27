"use client";
import { useState } from "react";
import { login } from "../../lib/api";

export default function LoginPage() {
  const [email, setEmail] = useState("owner@demo.test");
  const [password, setPassword] = useState("");
  const [msg, setMsg] = useState<string | null>(null);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setMsg(null);
    try {
      const { token, user } = await login(email, password);
      localStorage.setItem("ofp_token", token);
      setMsg(`Signed in as ${user.name} (${user.role}). Token stored.`);
    } catch (err) {
      setMsg(`Error: ${(err as Error).message}`);
    }
  }

  const input: React.CSSProperties = {
    display: "block",
    width: "100%",
    maxWidth: 320,
    padding: 10,
    margin: "8px 0",
    background: "#0e1530",
    border: "1px solid #1d2440",
    borderRadius: 6,
    color: "#e6e9f0",
  };

  return (
    <div>
      <h1>Sign in</h1>
      <form onSubmit={onSubmit}>
        <input style={input} type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="email" />
        <input
          style={input}
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          placeholder="password"
        />
        <button
          type="submit"
          style={{ padding: "10px 18px", background: "#3b56b0", color: "#fff", border: 0, borderRadius: 6, cursor: "pointer" }}
        >
          Sign in
        </button>
      </form>
      {msg && <p style={{ marginTop: 12, color: msg.startsWith("Error") ? "#ff8080" : "#86e29a" }}>{msg}</p>}
      <p style={{ color: "#8a97c2", fontSize: 13, marginTop: 16 }}>
        New shop? Register via <code>POST /api/auth/register</code> (orgName, name, email, password).
      </p>
    </div>
  );
}
