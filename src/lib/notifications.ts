/**
 * Simple notification system supporting both in-app toasts and native system notifications
 */

import { logger } from './logger'
import { commands } from './tauri-bindings'

type NotificationType = 'success' | 'error' | 'info' | 'warning'

interface NotificationOptions {
  /** Type of notification (affects styling) */
  type?: NotificationType
  /** Send as native system notification instead of toast */
  native?: boolean
  /** Duration in milliseconds for toasts (0 = no auto-dismiss) */
  duration?: number
}

/**
 * Send a notification - either as an in-app toast or native system notification
 *
 * @param title - Main notification title
 * @param message - Optional message body
 * @param options - Notification configuration
 *
 * @example
 * // Native system notification
 * notify('Update Available', 'A new version is ready to install', { native: true })
 * ```
 */
export async function notify(
  title: string,
  message?: string,
  options: NotificationOptions = {}
): Promise<void> {
  const { type = 'info', native = false, duration } = options

  try {
    if (native) {
      // Send native system notification via Tauri
      logger.debug('Sending native notification', { title, message, type })
      const result = await commands.sendNativeNotification(
        title,
        message ?? null
      )
      if (result.status === 'error') {
        throw new Error(result.error)
      }
    }
  } catch (error) {
    logger.error('Failed to send notification', { title, message, error })
  }
}

/**
 * Convenience functions for common notification types
 */
export const notifications = {
  /** Show success notification */
  success: (title: string, message?: string, native?: boolean) =>
    notify(title, message, { type: 'success', native }),

  /** Show error notification */
  error: (title: string, message?: string, native?: boolean) =>
    notify(title, message, { type: 'error', native }),

  /** Show info notification */
  info: (title: string, message?: string, native?: boolean) =>
    notify(title, message, { type: 'info', native }),

  /** Show warning notification */
  warning: (title: string, message?: string, native?: boolean) =>
    notify(title, message, { type: 'warning', native }),
}

// Export individual convenience functions
export const { success, error, info, warning } = notifications
