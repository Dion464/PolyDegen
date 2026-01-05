import toast from 'react-hot-toast';
import { BLOCK_EXPLORER_URL } from '../contracts/eth-config';

const normalizeExplorerBase = (base) => {
  if (!base) return '';
  return base.endsWith('/') ? base : `${base}/`;
};

const explorerBase = normalizeExplorerBase(BLOCK_EXPLORER_URL);

/**
 * Render a glass toast with optional explorer link
 */
export const showTransactionToast = ({
  title,
  description,
  txHash,
  duration = 6000,
}) => {
  const explorerLink = txHash && explorerBase ? `${explorerBase}tx/${txHash}` : null;

  toast.custom(
    (t) => (
      <div
        className={`glass-toast-card ${t.visible ? 'glass-toast-card--enter' : 'glass-toast-card--exit'}`}
      >
        <div className="glass-toast-card__header">
          <span className="glass-toast-card__badge" />
          <span className="glass-toast-card__title">
            {title}
          </span>
          <button
            type="button"
            aria-label="Dismiss notification"
            className="glass-toast-card__close"
            onClick={() => toast.dismiss(t.id)}
          >
            ×
          </button>
        </div>
        {description && (
          <div className="glass-toast-card__description">
            {description}
          </div>
        )}
        {explorerLink && (
          <a
            className="glass-toast-card__link"
            href={explorerLink}
            target="_blank"
            rel="noopener noreferrer"
          >
            View on Explorer
          </a>
        )}
      </div>
    ),
    { duration }
  );
};

export const showGlassToast = ({
  title,
  description,
  duration = 5000,
}) => {
  toast.custom(
    (t) => (
      <div
        className={`glass-toast-card ${t.visible ? 'glass-toast-card--enter' : 'glass-toast-card--exit'}`}
      >
        <div className="glass-toast-card__header">
          <span className="glass-toast-card__badge" />
          <span className="glass-toast-card__title">
            {title}
          </span>
          <button
            type="button"
            aria-label="Dismiss notification"
            className="glass-toast-card__close"
            onClick={() => toast.dismiss(t.id)}
          >
            ×
          </button>
        </div>
        {description && (
          <div className="glass-toast-card__description">
            {description}
          </div>
        )}
      </div>
    ),
    { duration }
  );
};

