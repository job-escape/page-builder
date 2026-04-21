import { ComponentRegisry } from "../types";
import AnimatedContainerRegistry from "../ui/components/animated-container";
import AnimatedPercentageRegistry from "../ui/components/animated-percentage";
import Condition from "../ui/components/condition";
import InlineDataRegistry from "../ui/components/inline-data";
import LightLoaderRegistry from "../ui/components/light-loader";
import LoaderRegistry from "../ui/components/loader";
import LottieRegistry from "../ui/components/lottie";
import SwiperRegistry from "../ui/components/swiper";

export const DEFAULT_REGISTRY: ComponentRegisry = {
  "animated-container": AnimatedContainerRegistry,
  condition: Condition,
  "inline-data": InlineDataRegistry,
  loader: LoaderRegistry,
  "light-loader": LightLoaderRegistry,
  lottie: LottieRegistry,
  "percentage-animation": AnimatedPercentageRegistry,
  swiper: SwiperRegistry,
};
