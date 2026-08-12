import { useCallback, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  login as loginApi,
  logout as logoutApi,
  getToken,
  setToken,
  type LoginResponse,
} from '../services/auth';
import type { User } from '../types';

interface UseAuth {
  user: User | null;
  isAuthenticated: boolean;
  login: (username: string, password: string) => Promise<void>;
  logout: () => void;
  isLoading: boolean;
  error: string | null;
}

export function useAuth(): UseAuth {
  const navigate = useNavigate();
  const [user, setUser] = useState<User | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const restoreSession = useCallback(() => {
    const token = getToken();
    if (token) {
      // Minimal user derived from token; replace with /auth/me when backend adds it.
      setUser({ id: 1, username: 'admin' });
    }
  }, []);

  useEffect(() => {
    restoreSession();
  }, [restoreSession]);

  const login = useCallback(
    async (username: string, password: string) => {
      setIsLoading(true);
      setError(null);
      try {
        let response: LoginResponse;

        // Demo fallback until the backend auth endpoint is implemented.
        if (username === 'admin' && password === 'admin') {
          response = { access_token: 'demo-token', token_type: 'bearer' };
        } else {
          response = await loginApi(username, password);
        }

        setToken(response.access_token);
        setUser({ id: 1, username });
        navigate('/dashboard/vehicles', { replace: true });
      } catch (err) {
        const message =
          err instanceof Error
            ? err.message
            : 'Login failed. Please try again.';
        setError(message);
      } finally {
        setIsLoading(false);
      }
    },
    [navigate]
  );

  const logout = useCallback(() => {
    logoutApi();
    setUser(null);
    navigate('/login', { replace: true });
  }, [navigate]);

  return {
    user,
    isAuthenticated: user !== null,
    login,
    logout,
    isLoading,
    error,
  };
}
