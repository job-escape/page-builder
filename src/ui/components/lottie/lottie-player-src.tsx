"use client";

import { IPlayerProps, Player, PlayerEvent } from "@lottiefiles/react-lottie-player";

function LottiePlayerSrc({
  onError,
  onEvent,
  onComplete,
  ...props
}: IPlayerProps & { onError: () => void; onComplete?: () => void }) {
  return (
    <Player
      {...props}
      onEvent={(event) => {
        onEvent?.(event);
        if (event === PlayerEvent.Error) {
          onError();
        }
        if (event === PlayerEvent.Complete) {
          onComplete?.();
        }
      }}
    />
  );
}

export default LottiePlayerSrc;
