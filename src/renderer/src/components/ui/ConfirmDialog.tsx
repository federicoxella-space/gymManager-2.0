import React from 'react'
import { useTranslation } from 'react-i18next'
import Modal from './Modal'

interface ConfirmDialogProps {
  isOpen: boolean
  onClose: () => void
  onConfirm: () => void
  title: string
  message: string
  confirmLabel?: string
  cancelLabel?: string
  /** Usa variante danger per azioni distruttive */
  variant?: 'default' | 'danger'
  isLoading?: boolean
}

export default function ConfirmDialog({
  isOpen,
  onClose,
  onConfirm,
  title,
  message,
  confirmLabel,
  cancelLabel,
  variant = 'default',
  isLoading = false,
}: ConfirmDialogProps): React.JSX.Element | null {
  const { t } = useTranslation()

  return (
    <Modal isOpen={isOpen} onClose={onClose} title={title} maxWidth="max-w-md">
      <div className="space-y-5">
        <p className="text-sm text-gray-600 dark:text-gray-300">{message}</p>

        <div className="flex justify-end gap-3">
          <button
            type="button"
            onClick={onClose}
            disabled={isLoading}
            className={[
              'px-4 py-2 text-sm font-medium rounded-lg border transition-colors',
              'border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-200',
              'bg-white dark:bg-gray-800 hover:bg-gray-50 dark:hover:bg-gray-700',
              'disabled:opacity-50 disabled:cursor-not-allowed',
            ].join(' ')}
          >
            {cancelLabel ?? t('common.cancel')}
          </button>

          <button
            type="button"
            onClick={onConfirm}
            disabled={isLoading}
            className={[
              'px-4 py-2 text-sm font-medium rounded-lg transition-colors',
              'disabled:opacity-50 disabled:cursor-not-allowed',
              variant === 'danger'
                ? 'bg-red-600 hover:bg-red-700 text-white'
                : 'bg-primary-600 hover:bg-primary-700 text-white',
            ].join(' ')}
          >
            {isLoading ? t('common.loading') : (confirmLabel ?? t('common.confirm'))}
          </button>
        </div>
      </div>
    </Modal>
  )
}
