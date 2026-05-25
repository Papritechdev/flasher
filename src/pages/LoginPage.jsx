import { useState } from 'react';
import { signInWithEmailAndPassword } from 'firebase/auth';
import { auth } from '../firebase';

export default function LoginPage() {
  const [email,    setEmail]    = useState('');
  const [password, setPassword] = useState('');
  const [error,    setError]    = useState(null);
  const [loading,  setLoading]  = useState(false);

  async function handleSubmit(e) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      await signInWithEmailAndPassword(auth, email, password);
      // AuthProvider will detect the new user and redirect via PrivateRoute
    } catch (err) {
      // Map Firebase error codes to human-readable messages
      switch (err.code) {
        case 'auth/user-not-found':
        case 'auth/wrong-password':
        case 'auth/invalid-credential':
          setError('Invalid email or password.');
          break;
        case 'auth/too-many-requests':
          setError('Too many failed attempts. Try again later.');
          break;
        default:
          setError(err.message);
      }
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-slate-950 px-4">
      <div className="w-full max-w-sm">
        {/* Logo */}
        <div className="text-center mb-8">
          <p className="text-4xl font-bold text-red-700 tracking-tight">⬡ Papritech Flasher</p>
          <p className="text-slate-500 text-sm mt-1">Factory Testing Station</p>
        </div>

        {/* Form */}
        <form
          onSubmit={handleSubmit}
          className="card border-slate-700 space-y-4"
          autoComplete="on"
        >
          <h2 className="text-sm font-semibold text-slate-300 uppercase tracking-wider">
            Tester Login
          </h2>

          {error && (
            <div className="bg-red-950 border border-red-700 rounded p-3 text-red-300 text-xs">
              {error}
            </div>
          )}

          <div>
            <label className="label" htmlFor="email">Email</label>
            <input
              id="email"
              className="input"
              type="email"
              autoComplete="username"
              placeholder="you@example.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
            />
          </div>

          <div>
            <label className="label" htmlFor="password">Password</label>
            <input
              id="password"
              className="input"
              type="password"
              autoComplete="current-password"
              placeholder="••••••••"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
            />
          </div>

          <button
            type="submit"
            className="btn-primary w-full"
            disabled={loading}
          >
            {loading ? 'Signing in…' : 'Sign In'}
          </button>
        </form>

        <p className="text-center text-xs text-slate-600 mt-4">
          Contact your administrator to create an account.
        </p>
      </div>
    </div>
  );
}
