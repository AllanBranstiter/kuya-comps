import { createContext, useContext, useReducer, useEffect, useCallback } from 'react';
import PropTypes from 'prop-types';
import { supabase, isSupabaseConfigured } from '../utils/supabase';

// Action types
const AUTH_ACTIONS = {
  SET_LOADING: 'SET_LOADING',
  SET_USER: 'SET_USER',
  SET_SESSION: 'SET_SESSION',
  SET_ERROR: 'SET_ERROR',
  CLEAR_ERROR: 'CLEAR_ERROR',
  LOGOUT: 'LOGOUT'
};

// Initial state
const initialState = {
  user: null,
  session: null,
  loading: true,
  error: null,
  isAuthenticated: false,
  isConfigured: isSupabaseConfigured()
};

// Reducer
function authReducer(state, action) {
  switch (action.type) {
    case AUTH_ACTIONS.SET_LOADING:
      return {
        ...state,
        loading: action.payload
      };
    case AUTH_ACTIONS.SET_USER:
      return {
        ...state,
        user: action.payload,
        isAuthenticated: !!action.payload,
        loading: false
      };
    case AUTH_ACTIONS.SET_SESSION:
      return {
        ...state,
        session: action.payload,
        user: action.payload?.user || null,
        isAuthenticated: !!action.payload?.user,
        loading: false
      };
    case AUTH_ACTIONS.SET_ERROR:
      return {
        ...state,
        error: action.payload,
        loading: false
      };
    case AUTH_ACTIONS.CLEAR_ERROR:
      return {
        ...state,
        error: null
      };
    case AUTH_ACTIONS.LOGOUT:
      return {
        ...state,
        user: null,
        session: null,
        isAuthenticated: false,
        loading: false
      };
    default:
      return state;
  }
}

// Create context
const AuthContext = createContext(null);

/**
 * Auth Provider component
 * Manages authentication state using Supabase
 */
export function AuthProvider({ children }) {
  const [state, dispatch] = useReducer(authReducer, initialState);

  // Initialize auth state on mount
  useEffect(() => {
    if (!state.isConfigured) {
      console.warn('[AuthContext] Supabase not configured');
      dispatch({ type: AUTH_ACTIONS.SET_LOADING, payload: false });
      return;
    }

    // Check for existing session
    const initializeAuth = async () => {
      try {
        const { data: { session }, error } = await supabase.auth.getSession();
        
        if (error) {
          console.error('[AuthContext] Error getting session:', error);
          dispatch({ type: AUTH_ACTIONS.SET_ERROR, payload: error.message });
          return;
        }

        if (session) {
          console.log('[AuthContext] Existing session found:', session.user.email);
          dispatch({ type: AUTH_ACTIONS.SET_SESSION, payload: session });
        } else {
          console.log('[AuthContext] No existing session');
          dispatch({ type: AUTH_ACTIONS.SET_LOADING, payload: false });
        }
      } catch (err) {
        console.error('[AuthContext] Init error:', err);
        dispatch({ type: AUTH_ACTIONS.SET_LOADING, payload: false });
      }
    };

    initializeAuth();

    // Set up auth state listener
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      (event, session) => {
        console.log('[AuthContext] Auth state changed:', event);
        
        if (session) {
          dispatch({ type: AUTH_ACTIONS.SET_SESSION, payload: session });
        } else {
          dispatch({ type: AUTH_ACTIONS.LOGOUT });
        }
      }
    );

    return () => {
      subscription?.unsubscribe();
    };
  }, [state.isConfigured]);

  // Sign in with email and password
  const signIn = useCallback(async (email, password) => {
    if (!state.isConfigured) {
      return { error: { message: 'Supabase not configured' } };
    }

    dispatch({ type: AUTH_ACTIONS.SET_LOADING, payload: true });
    dispatch({ type: AUTH_ACTIONS.CLEAR_ERROR });

    try {
      const { data, error } = await supabase.auth.signInWithPassword({
        email,
        password
      });

      if (error) {
        console.error('[AuthContext] Sign in error:', error);
        dispatch({ type: AUTH_ACTIONS.SET_ERROR, payload: error.message });
        return { error };
      }

      console.log('[AuthContext] Sign in successful:', data.user.email);
      dispatch({ type: AUTH_ACTIONS.SET_SESSION, payload: data.session });
      return { data };
    } catch (err) {
      console.error('[AuthContext] Sign in exception:', err);
      dispatch({ type: AUTH_ACTIONS.SET_ERROR, payload: err.message });
      return { error: err };
    }
  }, [state.isConfigured]);

  // Sign up with email and password
  const signUp = useCallback(async (email, password, metadata = {}) => {
    if (!state.isConfigured) {
      return { error: { message: 'Supabase not configured' } };
    }

    dispatch({ type: AUTH_ACTIONS.SET_LOADING, payload: true });
    dispatch({ type: AUTH_ACTIONS.CLEAR_ERROR });

    try {
      const { data, error } = await supabase.auth.signUp({
        email,
        password,
        options: {
          data: metadata
        }
      });

      if (error) {
        console.error('[AuthContext] Sign up error:', error);
        dispatch({ type: AUTH_ACTIONS.SET_ERROR, payload: error.message });
        return { error };
      }

      console.log('[AuthContext] Sign up successful:', data.user?.email);
      dispatch({ type: AUTH_ACTIONS.SET_LOADING, payload: false });
      return { data };
    } catch (err) {
      console.error('[AuthContext] Sign up exception:', err);
      dispatch({ type: AUTH_ACTIONS.SET_ERROR, payload: err.message });
      return { error: err };
    }
  }, [state.isConfigured]);

  // Sign out
  const signOut = useCallback(async () => {
    if (!state.isConfigured) {
      return { error: { message: 'Supabase not configured' } };
    }

    dispatch({ type: AUTH_ACTIONS.SET_LOADING, payload: true });

    try {
      const { error } = await supabase.auth.signOut();

      if (error) {
        console.error('[AuthContext] Sign out error:', error);
        dispatch({ type: AUTH_ACTIONS.SET_ERROR, payload: error.message });
        return { error };
      }

      console.log('[AuthContext] Sign out successful');
      dispatch({ type: AUTH_ACTIONS.LOGOUT });
      return { error: null };
    } catch (err) {
      console.error('[AuthContext] Sign out exception:', err);
      dispatch({ type: AUTH_ACTIONS.SET_ERROR, payload: err.message });
      return { error: err };
    }
  }, [state.isConfigured]);

  // Reset password
  const resetPassword = useCallback(async (email) => {
    if (!state.isConfigured) {
      return { error: { message: 'Supabase not configured' } };
    }

    dispatch({ type: AUTH_ACTIONS.SET_LOADING, payload: true });
    dispatch({ type: AUTH_ACTIONS.CLEAR_ERROR });

    try {
      const { data, error } = await supabase.auth.resetPasswordForEmail(email, {
        redirectTo: `${window.location.origin}/reset-password`
      });

      if (error) {
        console.error('[AuthContext] Reset password error:', error);
        dispatch({ type: AUTH_ACTIONS.SET_ERROR, payload: error.message });
        return { error };
      }

      console.log('[AuthContext] Reset password email sent to:', email);
      dispatch({ type: AUTH_ACTIONS.SET_LOADING, payload: false });
      return { data };
    } catch (err) {
      console.error('[AuthContext] Reset password exception:', err);
      dispatch({ type: AUTH_ACTIONS.SET_ERROR, payload: err.message });
      return { error: err };
    }
  }, [state.isConfigured]);

  // Clear error
  const clearError = useCallback(() => {
    dispatch({ type: AUTH_ACTIONS.CLEAR_ERROR });
  }, []);

  // Context value
  const value = {
    ...state,
    signIn,
    signUp,
    signOut,
    resetPassword,
    clearError
  };

  return (
    <AuthContext.Provider value={value}>
      {children}
    </AuthContext.Provider>
  );
}

AuthProvider.propTypes = {
  children: PropTypes.node.isRequired
};

/**
 * Custom hook to use auth context
 * @returns {Object} Auth context value
 */
export function useAuth() {
  const context = useContext(AuthContext);
  
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  
  return context;
}

export default AuthContext;
