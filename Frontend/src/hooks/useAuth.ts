import { useState, useEffect } from 'react';
import { User, Session } from '@supabase/supabase-js';
import { supabase } from '@/integrations/supabase/client';

export const useAuth = () => {
  const [user, setUser] = useState<User | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);

  // Use demo mode if the placeholder URL is present
  const isDemoMode = import.meta.env.VITE_SUPABASE_URL === undefined || String(import.meta.env.VITE_SUPABASE_URL).includes('placeholder');

  useEffect(() => {
    if (isDemoMode) {
      const demoUserStr = localStorage.getItem('demo_user_auth');
      if (demoUserStr) {
        try {
          const demoUser = JSON.parse(demoUserStr);
          setUser(demoUser);
          setSession({ user: demoUser } as Session);
        } catch (e) {}
      }
      setLoading(false);
      return;
    }

    // Set up auth state listener FIRST
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      (event, session) => {
        setSession(session);
        setUser(session?.user ?? null);
        setLoading(false);
      }
    );

    // THEN check for existing session
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session);
      setUser(session?.user ?? null);
      setLoading(false);
    });

    return () => {
      if (subscription) {
        subscription.unsubscribe();
      }
    };
  }, [isDemoMode]);

  const signUp = async (email: string, password: string) => {
    if (isDemoMode) {
      return signIn(email, password);
    }
    const redirectUrl = `${window.location.origin}/`;
    
    const { error } = await supabase.auth.signUp({
      email,
      password,
      options: {
        emailRedirectTo: redirectUrl
      }
    });
    return { error };
  };

  const signIn = async (email: string, password: string) => {
    if (isDemoMode) {
      const mockUser = { id: 'demo123', email } as User;
      localStorage.setItem('demo_user_auth', JSON.stringify(mockUser));
      setUser(mockUser);
      setSession({ user: mockUser } as Session);
      return { error: null };
    }
    const { error } = await supabase.auth.signInWithPassword({
      email,
      password,
    });
    return { error };
  };

  const signOut = async () => {
    if (isDemoMode) {
      localStorage.removeItem('demo_user_auth');
      setUser(null);
      setSession(null);
      return { error: null };
    }
    const { error } = await supabase.auth.signOut();
    return { error };
  };

  return {
    user,
    session,
    loading,
    signUp,
    signIn,
    signOut,
  };
};
