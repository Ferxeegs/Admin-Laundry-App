import { useState, useEffect, useRef, useMemo } from "react";

interface Option {
  id: string;
  label: string;
  sublabel?: string;
}

interface SearchableSelectProps {
  options: Option[];
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  isLoading?: boolean;
  disabled?: boolean;
  className?: string;
}

export default function SearchableSelect({
  options,
  value,
  onChange,
  placeholder = "Select an option",
  isLoading = false,
  disabled = false,
  className = "",
}: SearchableSelectProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [search, setSearch] = useState("");
  const [focusedIndex, setFocusedIndex] = useState(-1);
  const containerRef = useRef<HTMLDivElement>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);

  // Selected option label
  const selectedOption = useMemo(
    () => options.find((opt) => opt.id === value),
    [options, value]
  );

  // Filtered options based on search
  const filteredOptions = useMemo(() => {
    if (!search.trim()) return options;
    const lowerSearch = search.toLowerCase();
    return options.filter(
      (opt) =>
        opt.label.toLowerCase().includes(lowerSearch) ||
        (opt.sublabel && opt.sublabel.toLowerCase().includes(lowerSearch))
    );
  }, [options, search]);

  // Handle clicks outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };

    if (isOpen) {
      document.addEventListener("mousedown", handleClickOutside);
    } else {
      document.removeEventListener("mousedown", handleClickOutside);
      setSearch(""); // Clear search when closed
      setFocusedIndex(-1);
    }

    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [isOpen]);

  // Focus search input when opened
  useEffect(() => {
    if (isOpen && searchInputRef.current) {
      searchInputRef.current.focus();
    }
  }, [isOpen]);

  const handleToggle = () => {
    if (!disabled && !isLoading) {
      setIsOpen(!isOpen);
    }
  };

  const handleSelect = (optionId: string) => {
    onChange(optionId);
    setIsOpen(false);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (disabled || isLoading) return;

    if (!isOpen) {
      if (e.key === "Enter" || e.key === "ArrowDown" || e.key === "ArrowUp") {
        setIsOpen(true);
      }
      return;
    }

    switch (e.key) {
      case "Enter":
        if (focusedIndex >= 0 && filteredOptions[focusedIndex]) {
          handleSelect(filteredOptions[focusedIndex].id);
        }
        break;
      case "Escape":
        setIsOpen(false);
        break;
      case "ArrowDown":
        e.preventDefault();
        setFocusedIndex((prev) => (prev < filteredOptions.length - 1 ? prev + 1 : 0));
        break;
      case "ArrowUp":
        e.preventDefault();
        setFocusedIndex((prev) => (prev > 0 ? prev - 1 : filteredOptions.length - 1));
        break;
      case "Tab":
        setIsOpen(false);
        break;
    }
  };

  return (
    <div className={`relative ${className}`} ref={containerRef}>
      {/* Trigger Button */}
      <div
        onClick={handleToggle}
        onKeyDown={handleKeyDown}
        tabIndex={disabled || isLoading ? -1 : 0}
        className={`flex h-11 w-full cursor-pointer items-center justify-between rounded-lg border px-4 py-2.5 text-sm transition-all focus:outline-none focus:ring-3 focus:ring-brand-500/10 ${
          disabled || isLoading
            ? "cursor-not-allowed bg-gray-50 border-gray-200 text-gray-400 dark:bg-gray-800 dark:border-gray-700 dark:text-gray-500"
            : isOpen
            ? "border-brand-300 bg-white ring-3 ring-brand-500/10 dark:border-brand-800 dark:bg-gray-900"
            : "border-gray-300 bg-transparent text-gray-800 dark:border-gray-700 dark:bg-gray-900 dark:text-white/90"
        }`}
      >
        <span className={`block truncate ${!selectedOption && "text-gray-400 dark:text-white/30"}`}>
          {isLoading ? "Loading..." : selectedOption ? selectedOption.label : placeholder}
        </span>
        <span className="pointer-events-none flex items-center pr-1">
          <svg
            className={`h-5 w-5 text-gray-400 transition-transform ${isOpen ? "rotate-180" : ""}`}
            xmlns="http://www.w3.org/2000/svg"
            viewBox="0 0 20 20"
            fill="currentColor"
            aria-hidden="true"
          >
            <path
              fillRule="evenodd"
              d="M5.293 7.293a1 1 0 011.414 0L10 10.586l3.293-3.293a1 1 0 111.414 1.414l-4 4a1 1 0 01-1.414 0l-4-4a1 1 0 010-1.414z"
              clipRule="evenodd"
            />
          </svg>
        </span>
      </div>

      {/* Dropdown Menu */}
      {isOpen && (
        <div className="absolute z-50 mt-1 w-full overflow-hidden rounded-lg border border-gray-200 bg-white shadow-lg dark:border-gray-700 dark:bg-gray-900">
          {/* Search Input */}
          <div className="sticky top-0 z-10 border-b border-gray-100 bg-gray-50 p-2 dark:border-gray-800 dark:bg-gray-800/50">
            <div className="relative">
              <span className="absolute inset-y-0 left-0 flex items-center pl-3">
                <svg className="h-4 w-4 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                </svg>
              </span>
              <input
                ref={searchInputRef}
                type="text"
                className="block w-full rounded-md border-gray-200 bg-white py-2 pl-10 pr-3 text-sm placeholder-gray-400 focus:border-brand-300 focus:outline-none focus:ring-1 focus:ring-brand-500/10 dark:border-gray-700 dark:bg-gray-900 dark:text-white"
                placeholder="Search..."
                value={search}
                onChange={(e) => {
                  setSearch(e.target.value);
                  setFocusedIndex(0);
                }}
                onKeyDown={(e) => {
                  if (e.key === "ArrowDown" || e.key === "ArrowUp" || e.key === "Enter" || e.key === "Escape") {
                    handleKeyDown(e);
                  }
                }}
              />
            </div>
          </div>

          {/* Options List */}
          <ul className="max-h-60 overflow-auto py-1 custom-scrollbar">
            {filteredOptions.length > 0 ? (
              filteredOptions.map((option, index) => {
                const isSelected = option.id === value;
                const isFocused = index === focusedIndex;

                return (
                  <li
                    key={option.id}
                    className={`relative cursor-pointer select-none px-4 py-2.5 outline-none ${
                      isFocused ? "bg-brand-50 dark:bg-brand-500/10" : ""
                    } ${
                      isSelected
                        ? "bg-brand-500 text-white dark:bg-brand-600"
                        : "text-gray-900 hover:bg-gray-50 dark:text-white/90 dark:hover:bg-gray-800"
                    }`}
                    onClick={() => handleSelect(option.id)}
                    onMouseEnter={() => setFocusedIndex(index)}
                  >
                    <div className="flex flex-col">
                      <span className={`block truncate font-medium ${isSelected ? "text-white" : ""}`}>
                        {option.label}
                      </span>
                      {option.sublabel && (
                        <span className={`block truncate text-xs ${isSelected ? "text-brand-100" : "text-gray-500"}`}>
                          {option.sublabel}
                        </span>
                      )}
                    </div>
                    {isSelected && (
                      <span className="absolute inset-y-0 right-0 flex items-center pr-4">
                        <svg className="h-5 w-5" fill="currentColor" viewBox="0 0 20 20">
                          <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                        </svg>
                      </span>
                    )}
                  </li>
                );
              })
            ) : (
              <li className="px-4 py-3 text-center text-sm text-gray-500 dark:text-gray-400">
                No results found
              </li>
            )}
          </ul>
        </div>
      )}
    </div>
  );
}
