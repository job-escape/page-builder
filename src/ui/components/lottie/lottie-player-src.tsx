"use client";

import { IPlayerProps, Player, PlayerEvent } from "@lottiefiles/react-lottie-player";

function LottiePlayerSrc({
  onError,
  onEvent,
  ...props
}: IPlayerProps & { onError: () => void }) {
  return (
    <Player
      {...props}
      onEvent={(event) => {
        onEvent?.(event);
        if (event === PlayerEvent.Error) {
          onError();
        }
      }}
    />
  );
}

export default LottiePlayerSrc;
