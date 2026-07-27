"use client";

import { useEffect, useRef, useState, type KeyboardEvent } from "react";

import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

const GEOAPIFY_API_KEY = process.env.NEXT_PUBLIC_GEOAPIFY_API_KEY;
const MIN_QUERY_LENGTH = 3;
const DEBOUNCE_MS = 300;

/** Normalized shape this component exposes — decoupled from Geoapify's own response so a future provider swap (this is the second one) only touches parseGeoapifyResponse below, not any call site. */
export interface AddressSuggestion {
  formattedAddress?: string;
  street1?: string;
  city?: string;
  state?: string;
  postalCode?: string;
  country?: string;
}

// https://apidocs.geoapify.com/docs/geocoding/address-autocomplete/ — only
// the fields this app reads.
interface GeoapifyFeature {
  properties: {
    formatted?: string;
    address_line1?: string;
    housenumber?: string;
    street?: string;
    city?: string;
    state?: string;
    state_code?: string;
    postcode?: string;
    country?: string;
    country_code?: string;
  };
}

function parseGeoapifyResponse(feature: GeoapifyFeature): AddressSuggestion {
  const p = feature.properties;
  return {
    formattedAddress: p.formatted,
    street1: p.address_line1 || [p.housenumber, p.street].filter(Boolean).join(" ") || p.formatted,
    city: p.city,
    // state_code (e.g. "CA") is what a shipping form wants — full state
    // name is the fallback for addresses where Geoapify doesn't resolve one.
    state: p.state_code || p.state,
    postalCode: p.postcode,
    // Geoapify's country_code is lowercase ISO2 ("us") — shipping APIs
    // expect uppercase.
    country: p.country_code?.toUpperCase() || p.country,
  };
}

interface AddressAutocompleteInputProps {
  id: string;
  placeholder?: string;
  value: string;
  onValueChange: (value: string) => void;
  onSelectAddress: (address: AddressSuggestion) => void;
}

/**
 * Free-text input with a debounced Geoapify autocomplete dropdown. Selecting
 * a suggestion fires onSelectAddress with the full parsed address (caller
 * decides what to do with city/state/zip/country) while onValueChange keeps
 * driving the raw text, same as any other controlled text field — so
 * whatever the user typed is never lost even without a selection.
 *
 * Degrades to a plain text input (no fetching, no dropdown) if
 * NEXT_PUBLIC_GEOAPIFY_API_KEY isn't configured — this is a UX enhancement,
 * not a requirement to fill the form out manually.
 */
export function AddressAutocompleteInput({
  id,
  placeholder,
  value,
  onValueChange,
  onSelectAddress,
}: AddressAutocompleteInputProps) {
  const [suggestions, setSuggestions] = useState<AddressSuggestion[]>([]);
  const [isOpen, setIsOpen] = useState(false);
  const [highlightedIndex, setHighlightedIndex] = useState(0);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const abortRef = useRef<AbortController | undefined>(undefined);

  useEffect(() => {
    return () => {
      clearTimeout(debounceRef.current);
      abortRef.current?.abort();
    };
  }, []);

  function handleChange(text: string) {
    onValueChange(text);

    clearTimeout(debounceRef.current);

    if (!GEOAPIFY_API_KEY || text.trim().length < MIN_QUERY_LENGTH) {
      setSuggestions([]);
      setIsOpen(false);
      return;
    }

    debounceRef.current = setTimeout(async () => {
      abortRef.current?.abort();

      const controller = new AbortController();
      abortRef.current = controller;

      try {
        const res = await fetch(
          `https://api.geoapify.com/v1/geocode/autocomplete?text=${encodeURIComponent(text)}&limit=5&apiKey=${GEOAPIFY_API_KEY}`,
          { signal: controller.signal },
        );

        if (!res.ok) throw new Error(`Geoapify autocomplete failed: ${res.status}`);

        const data: { features?: GeoapifyFeature[] } = await res.json();

        setSuggestions((data.features ?? []).map(parseGeoapifyResponse));
        setHighlightedIndex(0);
        setIsOpen(true);
      } catch (err) {
        if (err instanceof DOMException && err.name === "AbortError") return;

        // Best-effort UX enhancement — a failed lookup just means no
        // suggestions this keystroke, not a form error.
        setSuggestions([]);
      }
    }, DEBOUNCE_MS);
  }

  function selectAddress(address: AddressSuggestion) {
    onValueChange(address.street1 || address.formattedAddress || value);
    onSelectAddress(address);
    setIsOpen(false);
    setSuggestions([]);
  }

  function handleKeyDown(e: KeyboardEvent<HTMLInputElement>) {
    if (!isOpen || suggestions.length === 0) return;

    if (e.key === "ArrowDown") {
      e.preventDefault();
      setHighlightedIndex((i) => (i + 1) % suggestions.length);
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setHighlightedIndex((i) => (i - 1 + suggestions.length) % suggestions.length);
    } else if (e.key === "Enter" && suggestions[highlightedIndex]) {
      e.preventDefault();
      selectAddress(suggestions[highlightedIndex]);
    } else if (e.key === "Escape") {
      setIsOpen(false);
    }
  }

  return (
    <div className="relative">
      <Input
        id={id}
        placeholder={placeholder}
        autoComplete="off"
        value={value}
        onChange={(e) => handleChange(e.target.value)}
        onKeyDown={handleKeyDown}
        onFocus={() => suggestions.length > 0 && setIsOpen(true)}
        onBlur={() => setIsOpen(false)}
      />
      {isOpen && suggestions.length > 0 && (
        <ul className="absolute z-10 mt-1 w-full overflow-hidden rounded-md border bg-popover text-sm text-popover-foreground shadow-md">
          {suggestions.map((address, i) => (
            <li key={address.formattedAddress ?? i}>
              <button
                type="button"
                // Fires before the input's onBlur closes the dropdown.
                onMouseDown={(e) => {
                  e.preventDefault();
                  selectAddress(address);
                }}
                className={cn(
                  "w-full px-3 py-2 text-left hover:bg-muted",
                  i === highlightedIndex && "bg-muted",
                )}
              >
                {address.formattedAddress}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
