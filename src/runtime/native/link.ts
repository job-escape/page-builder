/**
 * The Open link step on a phone, when the host says nothing about it.
 *
 * `openLink`'s own default is the browser's `window.open`, which React Native
 * does not have — so a design's link button did nothing in an app that had not
 * called `configureLinks({ open })`. This hands both `tab` and `sheet` to
 * `Linking.openURL`: the system browser, or the app an address belongs to. A
 * host that wants `sheet` presented in-app still passes its own `open`, which
 * wins over this.
 *
 * Not on react-native-web: there the browser's own default, with its fallback
 * for a tab the gesture no longer owns, is the better answer.
 */
import { Linking, Platform } from "react-native";

import { configureDefaultOpener } from "../link";

if (Platform.OS !== "web") {
  configureDefaultOpener((url) => {
    Linking.openURL(url).catch((cause: unknown) => {
      console.error("pb.link.failed", { url, cause });
    });
  });
}
