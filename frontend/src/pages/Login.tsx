import { FormEvent, useState } from 'react';
import {
  Activity,
  ArrowRight,
  Eye,
  EyeOff,
  LockKeyhole,
  MapPinned,
  RadioTower,
  ShieldCheck,
  Truck,
  UserRound,
} from 'lucide-react';
import { useAuth } from '../hooks/useAuth';

const inputClass =
  'h-12 w-full rounded-lg border border-slate-300 bg-white text-sm font-medium text-slate-950 shadow-sm outline-none transition placeholder:text-slate-400 focus:border-cyan-500 focus:ring-4 focus:ring-cyan-100';

export default function Login() {
  const { login, isLoading, error } = useAuth();
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    void login(username, password);
  };

  return (
    <main className="min-h-screen bg-[#eef4f7] text-slate-950">
      <div className="grid min-h-screen lg:grid-cols-[minmax(0,1fr)_520px]">
        <section className="relative hidden overflow-hidden bg-[#10212a] px-10 py-10 text-white lg:flex lg:flex-col lg:justify-between">
          <div
            className="absolute inset-0 opacity-35"
            style={{
              backgroundImage:
                'linear-gradient(rgba(125, 211, 252, 0.16) 1px, transparent 1px), linear-gradient(90deg, rgba(125, 211, 252, 0.16) 1px, transparent 1px)',
              backgroundSize: '44px 44px',
            }}
          />
          <div className="relative z-10 flex items-center gap-3">
            <div className="flex h-11 w-11 items-center justify-center rounded-lg bg-cyan-300 text-slate-950 shadow-lg shadow-cyan-950/30">
              <Truck className="h-6 w-6" />
            </div>
            <div>
              <p className="text-sm font-semibold uppercase tracking-[0.22em] text-cyan-100">
                Fleet Command
              </p>
              <p className="text-sm text-slate-300">Live operations dashboard</p>
            </div>
          </div>

          <div className="relative z-10 flex min-h-[470px] max-w-3xl items-center justify-center py-8">
            <div className="relative z-10 mx-auto flex max-w-[560px] flex-col items-center px-10 text-center">
              <div className="mb-5 inline-flex items-center gap-2 rounded-full border border-cyan-100/20 bg-white/10 px-4 py-2 text-sm text-cyan-50">
                <RadioTower className="h-4 w-4" />
                Secure dispatcher access
              </div>
              <h1 className="text-4xl font-black leading-[1.04] tracking-normal xl:text-5xl">
                Control room access for live fleet movement.
              </h1>
              <p className="mx-auto mt-5 max-w-lg text-base leading-7 text-slate-300">
                Sign in to manage vehicles, GPS feeds, locations, and video
                operations from one focused console.
              </p>
            </div>
          </div>

          <div className="relative z-10 grid max-w-2xl grid-cols-3 gap-3">
            <div className="rounded-lg border border-white/10 bg-white/10 p-4">
              <Activity className="mb-4 h-5 w-5 text-emerald-200" />
              <p className="text-xs uppercase tracking-[0.16em] text-slate-400">Status</p>
              <p className="mt-1 text-lg font-bold text-white">Active</p>
            </div>
            <div className="rounded-lg border border-white/10 bg-white/10 p-4">
              <MapPinned className="mb-4 h-5 w-5 text-cyan-200" />
              <p className="text-xs uppercase tracking-[0.16em] text-slate-400">Map</p>
              <p className="mt-1 text-lg font-bold text-white">Live</p>
            </div>
            <div className="rounded-lg border border-white/10 bg-white/10 p-4">
              <ShieldCheck className="mb-4 h-5 w-5 text-amber-200" />
              <p className="text-xs uppercase tracking-[0.16em] text-slate-400">Access</p>
              <p className="mt-1 text-lg font-bold text-white">Private</p>
            </div>
          </div>
        </section>

        <section className="flex min-h-screen items-center justify-center px-5 py-8 sm:px-8">
          <div className="w-full max-w-md">
            <div className="mb-8 flex items-center gap-3 lg:hidden">
              <div className="flex h-11 w-11 items-center justify-center rounded-lg bg-slate-950 text-cyan-200">
                <Truck className="h-6 w-6" />
              </div>
              <div>
                <p className="text-sm font-semibold uppercase tracking-[0.18em] text-slate-500">
                  Fleet Command
                </p>
                <p className="font-bold text-slate-950">Operations dashboard</p>
              </div>
            </div>

            <div className="rounded-lg border border-slate-200 bg-white p-6 shadow-2xl shadow-slate-300/60 sm:p-8">
              <div className="mb-7">
                <div className="mb-5 flex h-12 w-12 items-center justify-center rounded-lg bg-slate-950 text-cyan-200">
                  <LockKeyhole className="h-6 w-6" />
                </div>
                <p className="text-sm font-semibold uppercase tracking-[0.18em] text-cyan-700">
                  Authorized access
                </p>
                <h2 className="mt-2 text-3xl font-black tracking-normal text-slate-950">
                  Sign in to Fleet Dashboard
                </h2>
                <p className="mt-3 text-sm leading-6 text-slate-500">
                  Use the credentials configured for this deployment.
                </p>
              </div>

              <form onSubmit={handleSubmit} className="space-y-5">
                <div>
                  <label
                    htmlFor="username"
                    className="mb-2 block text-sm font-semibold text-slate-700"
                  >
                    Username
                  </label>
                  <div className="relative">
                    <UserRound className="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                    <input
                      id="username"
                      type="text"
                      value={username}
                      onChange={(event) => setUsername(event.target.value)}
                      className={inputClass}
                      style={{ paddingLeft: '3rem', paddingRight: '1rem' }}
                      autoComplete="username"
                      placeholder="Enter username"
                      required
                    />
                  </div>
                </div>

                <div>
                  <label
                    htmlFor="password"
                    className="mb-2 block text-sm font-semibold text-slate-700"
                  >
                    Password
                  </label>
                  <div className="relative">
                    <LockKeyhole className="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                    <input
                      id="password"
                      type={showPassword ? 'text' : 'password'}
                      value={password}
                      onChange={(event) => setPassword(event.target.value)}
                      className={inputClass}
                      style={{ paddingLeft: '3rem', paddingRight: '4rem' }}
                      autoComplete="current-password"
                      placeholder="Enter password"
                      required
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassword((value) => !value)}
                      className="absolute right-2.5 top-1/2 flex h-8 w-8 -translate-y-1/2 items-center justify-center rounded-md text-slate-500 transition hover:bg-slate-100 hover:text-slate-900 focus:outline-none focus:ring-2 focus:ring-cyan-500 focus:ring-offset-2"
                      aria-label={showPassword ? 'Hide password' : 'Show password'}
                    >
                      {showPassword ? (
                        <EyeOff className="h-4 w-4" />
                      ) : (
                        <Eye className="h-4 w-4" />
                      )}
                    </button>
                  </div>
                </div>

                {error && (
                  <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm font-medium text-red-700">
                    {error}
                  </div>
                )}

                <button
                  type="submit"
                  disabled={isLoading}
                  className="flex h-12 w-full items-center justify-center gap-2 rounded-lg bg-slate-950 px-4 text-sm font-bold text-white transition hover:bg-slate-800 focus:outline-none focus:ring-2 focus:ring-cyan-500 focus:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {isLoading ? 'Signing in...' : 'Sign in'}
                  {!isLoading && <ArrowRight className="h-4 w-4" />}
                </button>
              </form>
            </div>
          </div>
        </section>
      </div>
    </main>
  );
}
