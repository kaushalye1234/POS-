import { FormEvent, useState } from 'react';
import { Boxes, LockKeyhole, Server } from 'lucide-react';
import type { AuthUser } from '../types';
import { getErrorMessage } from '../utils';
import { getApiOrigin, loginUser, registerUser, setApiOrigin } from '../api';
import { Button, TextInput } from './Ui';

interface AuthScreenProps {
  onAuthenticated: (user: AuthUser) => Promise<void>;
}

export function AuthScreen({ onAuthenticated }: AuthScreenProps): JSX.Element {
  const [mode, setMode] = useState<'login' | 'register'>('login');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [apiOrigin, setApiOriginInput] = useState(getApiOrigin());
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  async function handleSubmit(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    setError('');
    setLoading(true);
    try {
      setApiOrigin(apiOrigin);
      const session =
        mode === 'register'
          ? await registerUser(username.trim(), password, 'admin')
          : await loginUser(username.trim(), password);

      if (!['admin', 'manager'].includes(session.user.role)) {
        throw new Error('Admin or manager access is required.');
      }

      await onAuthenticated(session.user);
    } catch (submitError) {
      setError(getErrorMessage(submitError));
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="auth-shell">
      <section className="auth-panel">
        <div className="brand-stack">
          <div className="brand-mark">
            <Boxes aria-hidden="true" size={28} />
          </div>
          <div>
            <h1>Fashion Shaa</h1>
            <p>Stock Management</p>
          </div>
        </div>

        <div className="auth-tabs" role="tablist">
          <button aria-selected={mode === 'login'} onClick={() => setMode('login')} type="button">
            Sign In
          </button>
          <button aria-selected={mode === 'register'} onClick={() => setMode('register')} type="button">
            First Admin
          </button>
        </div>

        <form className="auth-form" onSubmit={handleSubmit}>
          <TextInput
            autoComplete="username"
            label="Username"
            onChange={(event) => setUsername(event.target.value)}
            required
            value={username}
          />
          <TextInput
            autoComplete={mode === 'register' ? 'new-password' : 'current-password'}
            label="Password"
            minLength={6}
            onChange={(event) => setPassword(event.target.value)}
            required
            type="password"
            value={password}
          />
          <TextInput
            label="API Origin"
            onChange={(event) => setApiOriginInput(event.target.value)}
            required
            value={apiOrigin}
          />

          {error ? (
            <div className="notice danger">
              <LockKeyhole aria-hidden="true" size={16} />
              <span>{error}</span>
            </div>
          ) : null}

          <Button loading={loading} type="submit" variant="primary">
            <Server aria-hidden="true" size={16} />
            {mode === 'register' ? 'Create Admin' : 'Enter Console'}
          </Button>
        </form>
      </section>
    </main>
  );
}
