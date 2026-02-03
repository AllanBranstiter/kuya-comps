import { useState, useEffect } from 'react';
import PropTypes from 'prop-types';
import { Modal, Button, Input } from '../ui';

/**
 * AddCardModal - Modal for adding a new card to a binder
 * 
 * @param {Object} props
 * @param {boolean} props.isOpen - Whether the modal is open
 * @param {function} props.onClose - Handler for closing the modal
 * @param {function} props.onAdd - Handler for adding the card
 * @param {Array} props.binders - Available binders
 * @param {string} props.defaultBinderId - Default binder ID to select
 * @param {boolean} props.loading - Loading state
 * @param {string} props.error - Error message
 */
function AddCardModal({
  isOpen,
  onClose,
  onAdd,
  binders = [],
  defaultBinderId = null,
  loading = false,
  error = null
}) {
  const getInitialFormState = (binderId = null) => ({
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
    binder_id: binderId || '',
    tags: '',
    auto_update: true,
    search_query_string: ''
  });

  const [formData, setFormData] = useState(() => getInitialFormState(defaultBinderId));
  const [touched, setTouched] = useState({});
  const [showValidation, setShowValidation] = useState(false);

  // Reset form when modal opens
  useEffect(() => {
    if (isOpen) {
      setFormData(getInitialFormState(
        defaultBinderId || (binders.length > 0 ? binders[0].id : '')
      ));
      setTouched({});
      setShowValidation(false);
    }
  }, [isOpen, defaultBinderId, binders]);

  // Validation helpers
  const getValidationErrors = () => {
    const errors = {};
    if (!formData.year.trim()) {
      errors.year = 'Year is required';
    }
    if (!formData.set_name.trim()) {
      errors.set_name = 'Set name is required';
    }
    if (!formData.athlete.trim()) {
      errors.athlete = 'Athlete name is required';
    }
    if (!formData.binder_id) {
      errors.binder_id = 'Please select a binder';
    }
    return errors;
  };

  const validationErrors = getValidationErrors();
  const isValid = Object.keys(validationErrors).length === 0;

  // Format date for display (MM-DD-YYYY)
  const formatDateForDisplay = (dateStr) => {
    if (!dateStr) return '';
    // If already in MM-DD-YYYY format, return as-is
    if (/^\d{2}-\d{2}-\d{4}$/.test(dateStr)) return dateStr;
    // If in ISO format (YYYY-MM-DD), convert
    if (/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) {
      const [year, month, day] = dateStr.split('-');
      return `${month}-${day}-${year}`;
    }
    return dateStr;
  };

  // Format date for database (YYYY-MM-DD)
  const formatDateForDB = (dateStr) => {
    if (!dateStr) return null;
    // If in MM-DD-YYYY format, convert to ISO
    if (/^\d{2}-\d{2}-\d{4}$/.test(dateStr)) {
      const [month, day, year] = dateStr.split('-');
      return `${year}-${month}-${day}`;
    }
    // If in MM/DD/YYYY format, convert to ISO
    if (/^\d{2}\/\d{2}\/\d{4}$/.test(dateStr)) {
      const [month, day, year] = dateStr.split('/');
      return `${year}-${month}-${day}`;
    }
    return dateStr;
  };

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
    // Mark field as touched
    setTouched(prev => ({ ...prev, [field]: true }));
  };

  const handleBlur = (field) => {
    setTouched(prev => ({ ...prev, [field]: true }));
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    
    // Show validation if trying to submit with errors
    if (!isValid) {
      setShowValidation(true);
      return;
    }
    
    // Prepare data with date formatting for DB
    const cardData = {
      ...formData,
      tags: formData.tags
        ? formData.tags.split(',').map(t => t.trim()).filter(Boolean)
        : [],
      purchase_price: formData.purchase_price ? parseFloat(formData.purchase_price) : null,
      purchase_date: formatDateForDB(formData.purchase_date),
      current_fmv: formData.current_fmv ? parseFloat(formData.current_fmv) : null,
      search_query_string: formData.search_query_string || buildSearchQuery(formData)
    };

    onAdd?.(cardData);
  };

  // Check if field should show error
  const shouldShowError = (field) => {
    return (showValidation || touched[field]) && validationErrors[field];
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
    setFormData(getInitialFormState());
    onClose?.();
  };

  // isValid is now defined earlier with proper validation

  return (
    <Modal
      isOpen={isOpen}
      onClose={handleClose}
      title="Add Card to Collection"
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
            Add Card
          </Button>
        </>
      }
    >
      <form onSubmit={handleSubmit} className="add-card-form">
        {error && (
          <div className="modal-error-message" role="alert">
            <span>⚠️</span>
            {error}
          </div>
        )}

        {/* Validation Summary - show when trying to submit invalid form */}
        {showValidation && !isValid && (
          <div className="modal-error-message" role="alert">
            <span>⚠️</span>
            <div>
              <strong>Please fix the following:</strong>
              <ul style={{ margin: '0.5rem 0 0 1rem', padding: 0 }}>
                {Object.values(validationErrors).map((err, idx) => (
                  <li key={idx}>{err}</li>
                ))}
              </ul>
            </div>
          </div>
        )}

        {/* Card Identity Section */}
        <div className="form-section">
          <h4 className="form-section-title">Card Identity</h4>
          
          <div className="form-row form-row-2">
            <Input
              label="Year *"
              placeholder="e.g., 2024"
              value={formData.year}
              onChange={(e) => handleChange('year', e.target.value)}
              onBlur={() => handleBlur('year')}
              disabled={loading}
              required
              error={shouldShowError('year') ? validationErrors.year : null}
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
            label="Set Name *"
            placeholder="e.g., Topps Chrome, Bowman 1st"
            value={formData.set_name}
            onChange={(e) => handleChange('set_name', e.target.value)}
            onBlur={() => handleBlur('set_name')}
            disabled={loading}
            required
            error={shouldShowError('set_name') ? validationErrors.set_name : null}
          />

          <Input
            label="Athlete *"
            placeholder="e.g., Shohei Ohtani"
            value={formData.athlete}
            onChange={(e) => handleChange('athlete', e.target.value)}
            onBlur={() => handleBlur('athlete')}
            required
            disabled={loading}
            error={shouldShowError('athlete') ? validationErrors.athlete : null}
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
              <label htmlFor="grading-company" className="input-label">Grading Company</label>
              <select
                id="grading-company"
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
              placeholder="MM-DD-YYYY"
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
            <label htmlFor="binder-select" className="input-label">Binder *</label>
            <select
              id="binder-select"
              className={`input-field ${shouldShowError('binder_id') ? 'input-error' : ''}`}
              value={formData.binder_id}
              onChange={(e) => handleChange('binder_id', e.target.value)}
              onBlur={() => handleBlur('binder_id')}
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
            {shouldShowError('binder_id') && (
              <span className="input-error-message">{validationErrors.binder_id}</span>
            )}
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
      </form>
    </Modal>
  );
}

AddCardModal.propTypes = {
  isOpen: PropTypes.bool.isRequired,
  onClose: PropTypes.func.isRequired,
  onAdd: PropTypes.func.isRequired,
  binders: PropTypes.arrayOf(
    PropTypes.shape({
      id: PropTypes.oneOfType([PropTypes.string, PropTypes.number]).isRequired,
      name: PropTypes.string.isRequired
    })
  ),
  defaultBinderId: PropTypes.oneOfType([PropTypes.string, PropTypes.number]),
  loading: PropTypes.bool,
  error: PropTypes.string
};

export default AddCardModal;
