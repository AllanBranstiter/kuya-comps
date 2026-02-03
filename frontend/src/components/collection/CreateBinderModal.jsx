import { useState } from 'react';
import PropTypes from 'prop-types';
import { Modal, Button, Input } from '../ui';

/**
 * CreateBinderModal - Modal for creating a new binder
 * 
 * @param {Object} props
 * @param {boolean} props.isOpen - Whether the modal is open
 * @param {function} props.onClose - Handler for closing the modal
 * @param {function} props.onCreate - Handler for creating the binder
 * @param {boolean} props.loading - Loading state
 * @param {string} props.error - Error message
 */
function CreateBinderModal({
  isOpen,
  onClose,
  onCreate,
  loading = false,
  error = null
}) {
  const [name, setName] = useState('');

  const handleSubmit = (e) => {
    e.preventDefault();
    if (name.trim()) {
      onCreate?.(name.trim());
    }
  };

  const handleClose = () => {
    setName('');
    onClose?.();
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={handleClose}
      title="Create New Binder"
      size="sm"
      footer={
        <>
          <Button
            variant="secondary"
            size="md"
            onClick={handleClose}
            disabled={loading}
          >
            Cancel
          </Button>
          <Button
            variant="primary"
            size="md"
            onClick={handleSubmit}
            loading={loading}
            disabled={!name.trim()}
          >
            Create Binder
          </Button>
        </>
      }
    >
      <form onSubmit={handleSubmit}>
        {error && (
          <div className="modal-error-message" role="alert">
            <span>⚠️</span>
            {error}
          </div>
        )}

        <Input
          label="Binder Name"
          placeholder="e.g., Rookies 2024, PSA 10s, Investment Cards"
          value={name}
          onChange={(e) => setName(e.target.value)}
          autoFocus
          required
          disabled={loading}
          maxLength={100}
        />

        <p className="modal-helper-text">
          Binders help you organize your collection. You can move cards between binders at any time.
        </p>
      </form>
    </Modal>
  );
}

CreateBinderModal.propTypes = {
  isOpen: PropTypes.bool.isRequired,
  onClose: PropTypes.func.isRequired,
  onCreate: PropTypes.func.isRequired,
  loading: PropTypes.bool,
  error: PropTypes.string
};

export default CreateBinderModal;
