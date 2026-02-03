import { useState, useEffect } from 'react';
import PropTypes from 'prop-types';
import { Modal, Button, Input } from '../ui';

/**
 * EditCardModal - Modal for editing an existing card
 * 
 * @param {Object} props
 * @param {boolean} props.isOpen - Whether the modal is open
 * @param {function} props.onClose - Handler for closing the modal
 * @param {function} props.onSave - Handler for saving the card
 * @param {Object} props.card - Card object to edit
 * @param {Array} props.binders - Available binders
 * @param {boolean} props.loading - Loading state
 * @param {string} props.error - Error message
 */
function EditCardModal({
  isOpen,
  onClose,
  onSave,
  card = null,
  binders = [],
  loading = false,
  error = null
}) {
  const [formData, setFormData] = useState({
    // Card Identity
    year: '',
    card_number: '',
    set_name: '',
    athlete: '',
    variation: '',
    
    // Condition
    grading_company: '',
    grade: '',
    
    // Financial
    purchase_price: '',
    purchase_date: '',
    current_fmv: '',
    
    // Organization
    binder_id: '',
    tags: '',
    auto_update: true,
    search_query_string: ''
  });

  // Populate form when card changes
  useEffect(() => {
    if (card && isOpen) {
      setFormData({
        year: card.year || '',
        card_number: card.card_number || '',
        set_name: card.set_name || '',
        athlete: card.athlete || '',
        variation: card.variation || '',
        grading_company: card.grading_company || '',
        grade: card.grade || '',
        purchase_price: card.purchase_price ? String(card.purchase_price) : '',
        purchase_date: card.purchase_date || '',
        current_fmv: card.current_fmv ? String(card.current_fmv) : '',
        binder_id: card.binder_id || '',
        tags: Array.isArray(card.tags) ? card.tags.join(', ') : '',
        auto_update: card.auto_update !== false,
        search_query_string: card.search_query_string || ''
      });
    }
  }, [card, isOpen]);

  const gradingCompanies = [
    { value: '', label: 'Raw (Ungraded)' },
    { value: 'PSA', label: 'PSA' },
    { value: 'BGS', label: 'BGS (Beckett)' },
    { value: 'SGC', label: 'SGC' },
    { value: 'CGC', label: 'CGC' },
    { value: 'CSG', label: 'CSG' },
    { value: 'Other', label: 'Other' }
  ];

  const handleChange = (field, value) => {
    setFormData(prev => ({
      ...prev,
      [field]: value
    }));
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    
    // Prepare data
    const updatedData = {
      year: formData.year || null,
      card_number: formData.card_number || null,
      set_name: formData.set_name || null,
      athlete: formData.athlete,
      variation: formData.variation || null,
      grading_company: formData.grading_company || null,
      grade: formData.grade || null,
      purchase_price: formData.purchase_price ? parseFloat(formData.purchase_price) : null,
      purchase_date: formData.purchase_date || null,
      current_fmv: formData.current_fmv ? parseFloat(formData.current_fmv) : null,
      binder_id: formData.binder_id,
      tags: formData.tags 
        ? formData.tags.split(',').map(t => t.trim()).filter(Boolean) 
        : [],
      auto_update: formData.auto_update,
      search_query_string: formData.search_query_string || buildSearchQuery(formData)
    };

    onSave?.(card.id, updatedData);
  };

  // Build search query from card data
  const buildSearchQuery = (data) => {
    const parts = [];
    if (data.year) parts.push(data.year);
    if (data.set_name) parts.push(data.set_name);
    if (data.athlete) parts.push(data.athlete);
    if (data.card_number) parts.push(`#${data.card_number}`);
    if (data.variation) parts.push(data.variation);
    if (data.grading_company && data.grade) {
      parts.push(`${data.grading_company} ${data.grade}`);
    }
    return parts.join(' ');
  };

  const handleClose = () => {
    onClose?.();
  };

  const isValid = formData.athlete && formData.binder_id;

  // Format card display name for title
  const cardDisplayName = card 
    ? [card.year, card.athlete, card.card_number ? `#${card.card_number}` : '']
        .filter(Boolean).join(' ') || 'Card'
    : 'Card';

  return (
    <Modal
      isOpen={isOpen}
      onClose={handleClose}
      title={`Edit ${cardDisplayName}`}
      size="lg"
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
            disabled={!isValid}
          >
            Save Changes
          </Button>
        </>
      }
    >
      <form onSubmit={handleSubmit} className="edit-card-form">
        {error && (
          <div className="modal-error-message" role="alert">
            <span>⚠️</span>
            {error}
          </div>
        )}

        {/* Review Warning */}
        {card?.review_required && (
          <div className="modal-warning-message" role="alert">
            <span>⚠️</span>
            <div>
              <strong>Review Required:</strong> {card.review_reason || 'This card needs manual review.'}
            </div>
          </div>
        )}

        {/* Card Identity Section */}
        <div className="form-section">
          <h4 className="form-section-title">Card Identity</h4>
          
          <div className="form-row form-row-2">
            <Input
              label="Year"
              placeholder="e.g., 2024"
              value={formData.year}
              onChange={(e) => handleChange('year', e.target.value)}
              disabled={loading}
            />
            <Input
              label="Card Number"
              placeholder="e.g., 150"
              value={formData.card_number}
              onChange={(e) => handleChange('card_number', e.target.value)}
              disabled={loading}
            />
          </div>

          <Input
            label="Set Name"
            placeholder="e.g., Topps Chrome, Bowman 1st"
            value={formData.set_name}
            onChange={(e) => handleChange('set_name', e.target.value)}
            disabled={loading}
          />

          <Input
            label="Athlete *"
            placeholder="e.g., Shohei Ohtani"
            value={formData.athlete}
            onChange={(e) => handleChange('athlete', e.target.value)}
            required
            disabled={loading}
          />

          <Input
            label="Variation/Parallel"
            placeholder="e.g., Refractor, Gold /50, Auto"
            value={formData.variation}
            onChange={(e) => handleChange('variation', e.target.value)}
            disabled={loading}
          />
        </div>

        {/* Condition Section */}
        <div className="form-section">
          <h4 className="form-section-title">Condition</h4>
          
          <div className="form-row form-row-2">
            <div className="input-wrapper">
              <label htmlFor="edit-grading-company" className="input-label">Grading Company</label>
              <select
                id="edit-grading-company"
                className="input-field"
                value={formData.grading_company}
                onChange={(e) => handleChange('grading_company', e.target.value)}
                disabled={loading}
              >
                {gradingCompanies.map(option => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </div>

            <Input
              label="Grade"
              placeholder="e.g., 10, 9.5"
              value={formData.grade}
              onChange={(e) => handleChange('grade', e.target.value)}
              disabled={loading || !formData.grading_company}
            />
          </div>
        </div>

        {/* Financial Section */}
        <div className="form-section">
          <h4 className="form-section-title">Financial</h4>
          
          <div className="form-row form-row-3">
            <Input
              label="Purchase Price"
              type="number"
              placeholder="0.00"
              value={formData.purchase_price}
              onChange={(e) => handleChange('purchase_price', e.target.value)}
              iconLeft={<span>$</span>}
              disabled={loading}
            />

            <Input
              label="Purchase Date"
              type="text"
              placeholder="MM/DD/YYYY"
              value={formData.purchase_date}
              onChange={(e) => handleChange('purchase_date', e.target.value)}
              disabled={loading}
            />

            <Input
              label="Current FMV"
              type="number"
              placeholder="0.00"
              value={formData.current_fmv}
              onChange={(e) => handleChange('current_fmv', e.target.value)}
              iconLeft={<span>$</span>}
              disabled={loading}
            />
          </div>
        </div>

        {/* Organization Section */}
        <div className="form-section">
          <h4 className="form-section-title">Organization</h4>

          <div className="input-wrapper">
            <label htmlFor="edit-binder-select" className="input-label">Binder *</label>
            <select
              id="edit-binder-select"
              className="input-field"
              value={formData.binder_id}
              onChange={(e) => handleChange('binder_id', e.target.value)}
              required
              disabled={loading}
            >
              <option value="">Select a binder...</option>
              {binders.map(binder => (
                <option key={binder.id} value={binder.id}>
                  {binder.name}
                </option>
              ))}
            </select>
          </div>

          <Input
            label="Tags"
            placeholder="e.g., rookie, investment, pc (comma-separated)"
            value={formData.tags}
            onChange={(e) => handleChange('tags', e.target.value)}
            disabled={loading}
          />

          <div className="checkbox-wrapper">
            <label className="checkbox-label">
              <input
                type="checkbox"
                checked={formData.auto_update}
                onChange={(e) => handleChange('auto_update', e.target.checked)}
                disabled={loading}
              />
              <span className="checkbox-text">
                Enable automatic FMV updates
                <span className="checkbox-hint">
                  (Premium feature - updates every 90 days)
                </span>
              </span>
            </label>
          </div>
        </div>

        {/* Search Query Section */}
        <div className="form-section">
          <h4 className="form-section-title">Automation Settings</h4>
          
          <Input
            label="Search Query"
            placeholder="Custom search query for FMV updates"
            value={formData.search_query_string}
            onChange={(e) => handleChange('search_query_string', e.target.value)}
            disabled={loading}
          />
          <p className="form-hint">
            This query is used for automatic FMV updates. Leave blank to auto-generate from card details.
          </p>
        </div>

        {/* Card Metadata */}
        {card && (
          <div className="form-section form-section-meta">
            <div className="card-meta-info">
              <span>Added: {new Date(card.created_at).toLocaleDateString()}</span>
              {card.last_updated_at && (
                <span>Last Updated: {new Date(card.last_updated_at).toLocaleDateString()}</span>
              )}
            </div>
          </div>
        )}
      </form>
    </Modal>
  );
}

EditCardModal.propTypes = {
  isOpen: PropTypes.bool.isRequired,
  onClose: PropTypes.func.isRequired,
  onSave: PropTypes.func.isRequired,
  card: PropTypes.shape({
    id: PropTypes.oneOfType([PropTypes.string, PropTypes.number]).isRequired,
    year: PropTypes.string,
    set_name: PropTypes.string,
    athlete: PropTypes.string,
    card_number: PropTypes.string,
    variation: PropTypes.string,
    grading_company: PropTypes.string,
    grade: PropTypes.string,
    purchase_price: PropTypes.oneOfType([PropTypes.string, PropTypes.number]),
    purchase_date: PropTypes.string,
    current_fmv: PropTypes.oneOfType([PropTypes.string, PropTypes.number]),
    binder_id: PropTypes.oneOfType([PropTypes.string, PropTypes.number]),
    tags: PropTypes.oneOfType([
      PropTypes.arrayOf(PropTypes.string),
      PropTypes.string
    ]),
    auto_update: PropTypes.bool,
    search_query_string: PropTypes.string,
    review_required: PropTypes.bool,
    review_reason: PropTypes.string,
    created_at: PropTypes.string,
    last_updated_at: PropTypes.string
  }),
  binders: PropTypes.arrayOf(
    PropTypes.shape({
      id: PropTypes.oneOfType([PropTypes.string, PropTypes.number]).isRequired,
      name: PropTypes.string.isRequired
    })
  ),
  loading: PropTypes.bool,
  error: PropTypes.string
};

export default EditCardModal;
