import React from 'react'
import { useTranslation } from 'react-i18next'

interface SearchInputProps {
  value: string
  onChange: (value: string) => void
  placeholder?: string
  className?: string
}

export default function SearchInput({
  value,
  onChange,
  placeholder,
  className = '',
}: SearchInputProps): React.JSX.Element {
  const { t } = useTranslation()

  return (
    <div className={['relative', className].join(' ')}>
      <span className="absolute inset-y-0 left-3 flex items-center pointer-events-none text-gray-400">
        <svg
          className="w-4 h-4"
          fill="none"
          viewBox="0 0 24 24"
          strokeWidth={1.5}
          stroke="currentColor"
          aria-hidden="true"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            d="M21 21l-5.197-5.197m0 0A7.5 7.5 0 105.196 5.196a7.5 7.5 0 0010.607 10.607z"
          />
        </svg>
      </span>
      <input
        type="search"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder ?? t('clienti.cerca')}
        className={[
          'w-full pl-9 pr-3 py-2 text-sm rounded-lg border',
          'border-gray-300 dark:border-gray-600',
          'bg-white dark:bg-gray-800',
          'text-gray-900 dark:text-gray-100',
          'placeholder-gray-500 dark:placeholder-gray-500',
          'focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-transparent',
        ].join(' ')}
      />
    </div>
  )
}
