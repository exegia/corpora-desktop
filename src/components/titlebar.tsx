import {
  isMacOS,
  minimizeWindow,
  toggleMaximizeWindow,
  closeWindow,
} from '@/lib/tauri'
import { useShortcuts } from '@/lib/shortcuts'

/**
 * Transparent title bar overlaying the full window width: its contents
 * never move — opening a sidebar just slides a new background
 * underneath them. It's a single row — left cluster, the tab strip, and
 * the right cluster — and doubles as the drag region. On macOS the left
 * cluster starts past the inset traffic lights; on Windows/Linux custom
 * window controls render on the right.
 */
export function TitleBar() {
  const mac = isMacOS()
  const { binding } = useShortcuts()

  return (
    <header className="titlebar" data-tauri-drag-region data-mac={mac}>
      {/* Empty strip stays draggable; tab buttons opt out via CSS. */}
      <div className="titlebar-tabs" data-tauri-drag-region></div>
    </header>
  )
}
