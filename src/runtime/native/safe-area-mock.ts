/**
 * Fixed insets, standing in for a device.
 *
 * The real `react-native-safe-area-context` measures a phone, which jsdom is
 * not. Feeding constants is not a compromise here — it is exactly what the
 * console preview does to show a chosen device, so a test and a preview disagree
 * about nothing.
 *
 * The numbers are an iPhone 17 Pro, which is the artboard every design in this
 * system is drawn against.
 */
export const IPHONE_INSETS = { top: 59, bottom: 34, left: 0, right: 0 };
