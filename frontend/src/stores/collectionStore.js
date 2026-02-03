import { create } from 'zustand';
import { supabase } from '../utils/supabase';

/**
 * Collection Store - Zustand store for managing binders and cards
 * 
 * State:
 * - binders: Array of binder objects with stats
 * - cards: Array of card objects for the selected binder
 * - selectedBinder: Currently selected binder
 * - loading: Loading states object
 * - errors: Error states object
 * - sortOptions: Current sort preferences
 */
const useCollectionStore = create((set, get) => ({
  // State
  binders: [],
  cards: [],
  selectedBinder: null,
  loading: {
    binders: false,
    cards: false,
    action: false
  },
  errors: {
    binders: null,
    cards: null,
    action: null
  },
  sortOptions: {
    binders: 'newest',
    cards: 'newest'
  },

  // Actions
  
  /**
   * Set loading state
   */
  setLoading: (key, value) => set((state) => ({
    loading: { ...state.loading, [key]: value }
  })),

  /**
   * Set error state
   */
  setError: (key, value) => set((state) => ({
    errors: { ...state.errors, [key]: value }
  })),

  /**
   * Clear all errors
   */
  clearErrors: () => set({
    errors: { binders: null, cards: null, action: null }
  }),

  /**
   * Set sort option
   */
  setSortOption: (key, value) => {
    set((state) => ({
      sortOptions: { ...state.sortOptions, [key]: value }
    }));
    localStorage.setItem(`${key}Sort`, value);
  },

  /**
   * Fetch all binders for the current user with card counts and stats
   */
  fetchBinders: async (userId) => {
    const { setLoading, setError } = get();
    setLoading('binders', true);
    setError('binders', null);

    try {
      // Fetch binders
      const { data: binders, error: bindersError } = await supabase
        .from('binders')
        .select('*')
        .eq('user_id', userId)
        .order('created_at', { ascending: false });

      if (bindersError) {
        throw bindersError;
      }

      // Fetch cards for each binder to calculate stats
      const bindersWithStats = await Promise.all(
        (binders || []).map(async (binder) => {
          const { data: cards, error: cardsError } = await supabase
            .from('cards')
            .select('*')
            .eq('binder_id', binder.id);

          if (cardsError) {
            console.error('[collectionStore] Error loading cards for binder', binder.id, cardsError);
            return { ...binder, cards: [], stats: null };
          }

          // Calculate stats
          const totalCards = cards?.length || 0;
          const totalCost = (cards || []).reduce((sum, card) => sum + (parseFloat(card.purchase_price) || 0), 0);
          const totalFMV = (cards || []).reduce((sum, card) => sum + (parseFloat(card.current_fmv) || 0), 0);
          const roi = totalCost > 0 ? ((totalFMV - totalCost) / totalCost * 100) : 0;

          return {
            ...binder,
            cards,
            stats: {
              totalCards,
              totalCost,
              totalFMV,
              roi
            }
          };
        })
      );

      // Apply sorting
      const sortOption = get().sortOptions.binders;
      const sortedBinders = sortBinders(bindersWithStats, sortOption);

      set({ binders: sortedBinders });
      console.log('[collectionStore] Loaded', sortedBinders.length, 'binders');
      
      return { data: sortedBinders, error: null };
    } catch (error) {
      console.error('[collectionStore] Error fetching binders:', error);
      setError('binders', error.message);
      return { data: null, error };
    } finally {
      setLoading('binders', false);
    }
  },

  /**
   * Create a new binder
   */
  createBinder: async (userId, name) => {
    const { setLoading, setError, fetchBinders } = get();
    setLoading('action', true);
    setError('action', null);

    try {
      const { data, error } = await supabase
        .from('binders')
        .insert([{ user_id: userId, name }])
        .select()
        .single();

      if (error) {
        throw error;
      }

      console.log('[collectionStore] Created binder:', data);
      
      // Refresh binders list
      await fetchBinders(userId);
      
      return { data, error: null };
    } catch (error) {
      console.error('[collectionStore] Error creating binder:', error);
      setError('action', error.message);
      return { data: null, error };
    } finally {
      setLoading('action', false);
    }
  },

  /**
   * Update a binder's name
   */
  updateBinder: async (binderId, userId, name) => {
    const { setLoading, setError, fetchBinders } = get();
    setLoading('action', true);
    setError('action', null);

    try {
      const { error } = await supabase
        .from('binders')
        .update({ name })
        .eq('id', binderId)
        .eq('user_id', userId);

      if (error) {
        throw error;
      }

      console.log('[collectionStore] Updated binder:', binderId);
      
      // Refresh binders list
      await fetchBinders(userId);
      
      return { error: null };
    } catch (error) {
      console.error('[collectionStore] Error updating binder:', error);
      setError('action', error.message);
      return { error };
    } finally {
      setLoading('action', false);
    }
  },

  /**
   * Delete a binder and all its cards
   */
  deleteBinder: async (binderId, userId) => {
    const { setLoading, setError, fetchBinders } = get();
    setLoading('action', true);
    setError('action', null);

    try {
      const { error } = await supabase
        .from('binders')
        .delete()
        .eq('id', binderId)
        .eq('user_id', userId);

      if (error) {
        throw error;
      }

      console.log('[collectionStore] Deleted binder:', binderId);
      
      // Clear selected binder if it was deleted
      if (get().selectedBinder?.id === binderId) {
        set({ selectedBinder: null, cards: [] });
      }
      
      // Refresh binders list
      await fetchBinders(userId);
      
      return { error: null };
    } catch (error) {
      console.error('[collectionStore] Error deleting binder:', error);
      setError('action', error.message);
      return { error };
    } finally {
      setLoading('action', false);
    }
  },

  /**
   * Select a binder and fetch its cards
   */
  selectBinder: async (binderId) => {
    const { setLoading, setError, binders } = get();
    
    if (!binderId) {
      set({ selectedBinder: null, cards: [] });
      return;
    }

    setLoading('cards', true);
    setError('cards', null);

    try {
      // Find the binder in state
      const binder = binders.find(b => b.id === binderId);
      
      if (!binder) {
        throw new Error('Binder not found');
      }

      // Fetch cards for this binder
      const { data: cards, error: cardsError } = await supabase
        .from('cards')
        .select('*')
        .eq('binder_id', binderId)
        .order('created_at', { ascending: false });

      if (cardsError) {
        throw cardsError;
      }

      // Apply sorting
      const sortOption = get().sortOptions.cards;
      const sortedCards = sortCards(cards || [], sortOption);

      set({ selectedBinder: binder, cards: sortedCards });
      console.log('[collectionStore] Selected binder:', binder.name, 'with', sortedCards.length, 'cards');
      
      return { data: { binder, cards: sortedCards }, error: null };
    } catch (error) {
      console.error('[collectionStore] Error selecting binder:', error);
      setError('cards', error.message);
      return { data: null, error };
    } finally {
      setLoading('cards', false);
    }
  },

  /**
   * Clear selected binder (go back to binder grid)
   */
  clearSelectedBinder: () => {
    set({ selectedBinder: null, cards: [] });
  },

  /**
   * Add a new card to a binder
   */
  addCard: async (userId, cardData) => {
    const { setLoading, setError, selectedBinder, fetchBinders, selectBinder } = get();
    setLoading('action', true);
    setError('action', null);

    try {
      // Ensure required fields
      if (!cardData.athlete) {
        throw new Error('Athlete name is required');
      }

      if (!cardData.binder_id) {
        throw new Error('Please select a binder');
      }

      // Prepare card data
      const card = {
        binder_id: cardData.binder_id,
        user_id: userId,
        year: cardData.year || null,
        set_name: cardData.set_name || null,
        athlete: cardData.athlete,
        card_number: cardData.card_number || null,
        variation: cardData.variation || null,
        grading_company: cardData.grading_company || null,
        grade: cardData.grade || null,
        purchase_price: cardData.purchase_price || null,
        purchase_date: cardData.purchase_date || null,
        current_fmv: cardData.current_fmv || null,
        search_query_string: cardData.search_query_string || '',
        auto_update: cardData.auto_update !== false,
        tags: cardData.tags || []
      };

      const { data, error } = await supabase
        .from('cards')
        .insert([card])
        .select()
        .single();

      if (error) {
        throw error;
      }

      console.log('[collectionStore] Added card:', data);

      // Create initial price history entry if FMV was provided
      if (card.current_fmv && card.current_fmv > 0) {
        const { error: historyError } = await supabase
          .from('price_history')
          .insert([{
            card_id: data.id,
            value: card.current_fmv,
            num_sales: null,
            confidence: 'user_provided'
          }]);

        if (historyError) {
          console.error('[collectionStore] Error creating price history:', historyError);
        }
      }

      // Refresh data
      await fetchBinders(userId);
      if (selectedBinder?.id === cardData.binder_id) {
        await selectBinder(cardData.binder_id);
      }
      
      return { data, error: null };
    } catch (error) {
      console.error('[collectionStore] Error adding card:', error);
      setError('action', error.message);
      return { data: null, error };
    } finally {
      setLoading('action', false);
    }
  },

  /**
   * Update an existing card
   */
  updateCard: async (cardId, userId, cardData) => {
    const { setLoading, setError, selectedBinder, fetchBinders, selectBinder } = get();
    setLoading('action', true);
    setError('action', null);

    try {
      // Fetch old card data to check if FMV changed
      const { data: oldCard } = await supabase
        .from('cards')
        .select('current_fmv')
        .eq('id', cardId)
        .single();

      const { error } = await supabase
        .from('cards')
        .update(cardData)
        .eq('id', cardId);

      if (error) {
        throw error;
      }

      console.log('[collectionStore] Updated card:', cardId);

      // Create price history entry if FMV changed
      const oldFmv = oldCard ? parseFloat(oldCard.current_fmv) : null;
      const newFmv = cardData.current_fmv ? parseFloat(cardData.current_fmv) : null;

      if (newFmv && newFmv > 0 && oldFmv !== newFmv) {
        const { error: historyError } = await supabase
          .from('price_history')
          .insert([{
            card_id: cardId,
            value: newFmv,
            num_sales: null,
            confidence: 'user_provided'
          }]);

        if (historyError) {
          console.error('[collectionStore] Error creating price history:', historyError);
        }
      }

      // Refresh data
      await fetchBinders(userId);
      if (selectedBinder) {
        await selectBinder(selectedBinder.id);
      }
      
      return { error: null };
    } catch (error) {
      console.error('[collectionStore] Error updating card:', error);
      setError('action', error.message);
      return { error };
    } finally {
      setLoading('action', false);
    }
  },

  /**
   * Delete a card
   */
  deleteCard: async (cardId, userId) => {
    const { setLoading, setError, selectedBinder, fetchBinders, selectBinder } = get();
    setLoading('action', true);
    setError('action', null);

    try {
      const { error } = await supabase
        .from('cards')
        .delete()
        .eq('id', cardId);

      if (error) {
        throw error;
      }

      console.log('[collectionStore] Deleted card:', cardId);

      // Refresh data
      await fetchBinders(userId);
      if (selectedBinder) {
        await selectBinder(selectedBinder.id);
      }
      
      return { error: null };
    } catch (error) {
      console.error('[collectionStore] Error deleting card:', error);
      setError('action', error.message);
      return { error };
    } finally {
      setLoading('action', false);
    }
  },

  /**
   * Move a card to a different binder
   */
  moveCard: async (cardId, newBinderId, userId) => {
    const { setLoading, setError, selectedBinder, fetchBinders, selectBinder } = get();
    setLoading('action', true);
    setError('action', null);

    try {
      const { error } = await supabase
        .from('cards')
        .update({ binder_id: newBinderId })
        .eq('id', cardId);

      if (error) {
        throw error;
      }

      console.log('[collectionStore] Moved card:', cardId, 'to binder:', newBinderId);

      // Refresh data
      await fetchBinders(userId);
      if (selectedBinder) {
        await selectBinder(selectedBinder.id);
      }
      
      return { error: null };
    } catch (error) {
      console.error('[collectionStore] Error moving card:', error);
      setError('action', error.message);
      return { error };
    } finally {
      setLoading('action', false);
    }
  },

  /**
   * Get a single card by ID
   */
  getCard: async (cardId) => {
    try {
      const { data, error } = await supabase
        .from('cards')
        .select('*')
        .eq('id', cardId)
        .single();

      if (error) {
        throw error;
      }

      return { data, error: null };
    } catch (error) {
      console.error('[collectionStore] Error fetching card:', error);
      return { data: null, error };
    }
  },

  /**
   * Re-sort binders with current sort option
   */
  resortBinders: () => {
    const { binders, sortOptions } = get();
    const sorted = sortBinders(binders, sortOptions.binders);
    set({ binders: sorted });
  },

  /**
   * Re-sort cards with current sort option
   */
  resortCards: () => {
    const { cards, sortOptions } = get();
    const sorted = sortCards(cards, sortOptions.cards);
    set({ cards: sorted });
  }
}));

/**
 * Sort binders by the given option
 */
function sortBinders(binders, sortOption) {
  return [...binders].sort((a, b) => {
    switch (sortOption) {
      case 'oldest':
        return new Date(a.created_at) - new Date(b.created_at);
      case 'az':
        return a.name.localeCompare(b.name);
      case 'za':
        return b.name.localeCompare(a.name);
      case 'value_high':
        return (b.stats?.totalFMV || 0) - (a.stats?.totalFMV || 0);
      case 'value_low':
        return (a.stats?.totalFMV || 0) - (b.stats?.totalFMV || 0);
      case 'newest':
      default:
        return new Date(b.created_at) - new Date(a.created_at);
    }
  });
}

/**
 * Sort cards by the given option
 */
function sortCards(cards, sortOption) {
  return [...cards].sort((a, b) => {
    switch (sortOption) {
      case 'oldest':
        return new Date(a.created_at) - new Date(b.created_at);
      case 'az':
        return (a.athlete || '').localeCompare(b.athlete || '');
      case 'za':
        return (b.athlete || '').localeCompare(a.athlete || '');
      case 'value_high':
        return (parseFloat(b.current_fmv) || 0) - (parseFloat(a.current_fmv) || 0);
      case 'value_low':
        return (parseFloat(a.current_fmv) || 0) - (parseFloat(b.current_fmv) || 0);
      case 'newest':
      default:
        return new Date(b.created_at) - new Date(a.created_at);
    }
  });
}

export default useCollectionStore;
