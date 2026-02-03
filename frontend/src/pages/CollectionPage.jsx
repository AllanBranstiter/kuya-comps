import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { LoadingSpinner } from '../components/ui';
import useCollectionStore from '../stores/collectionStore';
import {
  BinderGrid,
  BinderDetailView,
  CreateBinderModal,
  AddCardModal,
  EditCardModal
} from '../components/collection';

/**
 * Collection Page - Portfolio/Collection management
 * Requires authentication
 */
function CollectionPage() {
  const { isAuthenticated, loading: authLoading, user } = useAuth();
  const navigate = useNavigate();

  // Zustand store
  const {
    binders,
    cards,
    selectedBinder,
    loading,
    errors,
    sortOptions,
    fetchBinders,
    createBinder,
    updateBinder,
    deleteBinder,
    selectBinder,
    clearSelectedBinder,
    addCard,
    updateCard,
    deleteCard,
    moveCard,
    setSortOption,
    resortBinders,
    resortCards
  } = useCollectionStore();

  // Modal states
  const [showCreateBinderModal, setShowCreateBinderModal] = useState(false);
  const [showAddCardModal, setShowAddCardModal] = useState(false);
  const [showEditCardModal, setShowEditCardModal] = useState(false);
  const [editingCard, setEditingCard] = useState(null);

  // Redirect to home if not authenticated
  useEffect(() => {
    if (!authLoading && !isAuthenticated) {
      navigate('/');
    }
  }, [isAuthenticated, authLoading, navigate]);

  // Fetch binders on mount when authenticated
  useEffect(() => {
    if (isAuthenticated && user?.id) {
      fetchBinders(user.id);
    }
  }, [isAuthenticated, user?.id, fetchBinders]);

  // Show loading while checking auth
  if (authLoading) {
    return (
      <div className="page-container animate-fade-in">
        <LoadingSpinner size="lg" text="Loading..." />
      </div>
    );
  }

  // Don't render if not authenticated
  if (!isAuthenticated) {
    return null;
  }

  // Handler for clicking a binder
  const handleBinderClick = async (binder) => {
    await selectBinder(binder.id);
  };

  // Handler for editing a binder
  const handleEditBinder = (binder) => {
    const newName = prompt('Enter new binder name:', binder.name);
    if (newName && newName.trim() && newName !== binder.name) {
      updateBinder(binder.id, user.id, newName.trim());
    }
  };

  // Handler for deleting a binder
  const handleDeleteBinder = async (binder) => {
    const confirmed = confirm(
      `Are you sure you want to delete "${binder.name}"?\n\nThis will also delete all ${binder.stats?.totalCards || 0} cards in this binder. This action cannot be undone.`
    );
    if (confirmed) {
      await deleteBinder(binder.id, user.id);
    }
  };

  // Handler for creating a new binder
  const handleCreateBinder = async (name) => {
    const result = await createBinder(user.id, name);
    if (!result.error) {
      setShowCreateBinderModal(false);
    }
  };

  // Handler for going back to binder grid
  const handleBack = () => {
    clearSelectedBinder();
  };

  // Handler for adding a card
  const handleAddCard = async (cardData) => {
    const result = await addCard(user.id, cardData);
    if (!result.error) {
      setShowAddCardModal(false);
    }
  };

  // Handler for editing a card
  const handleEditCard = (card) => {
    setEditingCard(card);
    setShowEditCardModal(true);
  };

  // Handler for saving edited card
  const handleSaveCard = async (cardId, cardData) => {
    const result = await updateCard(cardId, user.id, cardData);
    if (!result.error) {
      setShowEditCardModal(false);
      setEditingCard(null);
    }
  };

  // Handler for deleting a card
  const handleDeleteCard = async (card) => {
    const cardName = [card.year, card.athlete, card.card_number ? `#${card.card_number}` : '']
      .filter(Boolean).join(' ') || 'this card';
    
    const confirmed = confirm(`Are you sure you want to delete ${cardName}?`);
    if (confirmed) {
      await deleteCard(card.id, user.id);
    }
  };

  // Handler for moving a card
  const handleMoveCard = async (card, targetBinderId) => {
    await moveCard(card.id, targetBinderId, user.id);
  };

  // Handler for binder sort change
  const handleBinderSortChange = (sortOption) => {
    setSortOption('binders', sortOption);
    resortBinders();
  };

  // Handler for card sort change
  const handleCardSortChange = (sortOption) => {
    setSortOption('cards', sortOption);
    resortCards();
  };

  return (
    <div className="page-container animate-fade-in-up">
      {/* Loading state */}
      {loading.binders && binders.length === 0 ? (
        <div className="collection-loading">
          <LoadingSpinner size="lg" text="Loading your collection..." />
        </div>
      ) : selectedBinder ? (
        /* Binder Detail View */
        <BinderDetailView
          binder={selectedBinder}
          cards={cards}
          onBack={handleBack}
          onAddCard={() => setShowAddCardModal(true)}
          onEditCard={handleEditCard}
          onDeleteCard={handleDeleteCard}
          onMoveCard={handleMoveCard}
          sortOption={sortOptions.cards}
          onSortChange={handleCardSortChange}
          loading={loading.cards || loading.action}
          allBinders={binders}
        />
      ) : (
        /* Binder Grid View */
        <BinderGrid
          binders={binders}
          onBinderClick={handleBinderClick}
          onEditBinder={handleEditBinder}
          onDeleteBinder={handleDeleteBinder}
          onCreateBinder={() => setShowCreateBinderModal(true)}
          sortOption={sortOptions.binders}
          onSortChange={handleBinderSortChange}
          loading={loading.binders || loading.action}
        />
      )}

      {/* Create Binder Modal */}
      <CreateBinderModal
        isOpen={showCreateBinderModal}
        onClose={() => setShowCreateBinderModal(false)}
        onCreate={handleCreateBinder}
        loading={loading.action}
        error={errors.action}
      />

      {/* Add Card Modal */}
      <AddCardModal
        isOpen={showAddCardModal}
        onClose={() => setShowAddCardModal(false)}
        onAdd={handleAddCard}
        binders={binders}
        defaultBinderId={selectedBinder?.id}
        loading={loading.action}
        error={errors.action}
      />

      {/* Edit Card Modal */}
      <EditCardModal
        isOpen={showEditCardModal}
        onClose={() => {
          setShowEditCardModal(false);
          setEditingCard(null);
        }}
        onSave={handleSaveCard}
        card={editingCard}
        binders={binders}
        loading={loading.action}
        error={errors.action}
      />
    </div>
  );
}

export default CollectionPage;
