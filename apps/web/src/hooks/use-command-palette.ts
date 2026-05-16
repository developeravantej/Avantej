/**
 * Platform Admin ⌘K command palette — open/close state + hotkey (Plan F.1, Agent S).
 *
 * Module-level subscribe store wired through React.useSyncExternalStore — repo
 * has no Zustand, so we keep the dependency surface minimal. The hotkey hook
 * registers a single global keydown listener (⌘K / Ctrl+K) and toggles state.
 */

import { useCallback, useEffect, useSyncExternalStore } from "react";

let isOpen = false;
const listeners = new Set<() => void>();

function emit() {
	for (const l of listeners) l();
}

function subscribe(cb: () => void) {
	listeners.add(cb);
	return () => {
		listeners.delete(cb);
	};
}

function getSnapshot() {
	return isOpen;
}

function getServerSnapshot() {
	return false;
}

export function openCommandPalette() {
	if (!isOpen) {
		isOpen = true;
		emit();
	}
}

export function closeCommandPalette() {
	if (isOpen) {
		isOpen = false;
		emit();
	}
}

export function toggleCommandPalette() {
	isOpen = !isOpen;
	emit();
}

export function useCommandPaletteState() {
	const open = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
	const setOpen = useCallback((next: boolean) => {
		if (next === isOpen) return;
		isOpen = next;
		emit();
	}, []);
	return { open, setOpen } as const;
}

/**
 * Register the ⌘K / Ctrl+K toggle on the document. Idempotent — multiple
 * mounts only attach one listener thanks to refcount in module scope.
 */
let hotkeyRefCount = 0;
let hotkeyHandler: ((e: KeyboardEvent) => void) | null = null;

export function useCommandPaletteHotkey() {
	useEffect(() => {
		if (hotkeyRefCount === 0) {
			hotkeyHandler = (e: KeyboardEvent) => {
				const isK = e.key === "k" || e.key === "K";
				if (!isK) return;
				if (!(e.metaKey || e.ctrlKey)) return;
				e.preventDefault();
				toggleCommandPalette();
			};
			document.addEventListener("keydown", hotkeyHandler);
		}
		hotkeyRefCount += 1;
		return () => {
			hotkeyRefCount -= 1;
			if (hotkeyRefCount === 0 && hotkeyHandler) {
				document.removeEventListener("keydown", hotkeyHandler);
				hotkeyHandler = null;
			}
		};
	}, []);
}
