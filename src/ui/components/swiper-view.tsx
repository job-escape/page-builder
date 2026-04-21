"use client";

import { useUnit } from "effector-react";
import { Swiper as SwiperInstance } from "swiper";
import { Autoplay } from "swiper/modules";
import { Swiper as ReactSwiper, SwiperSlide as ReactSwiperSlide } from "swiper/react";

import { ReactNode, useEffect, useRef } from "react";

import { $swiperCommands, clearSwiperCommand } from "../../model/swiper-store";

import "swiper/css";

type SwiperViewProps = {
  id: string;
  autoplay: boolean;
  centeredSlides: boolean;
  className: string;
  loop: boolean;
  slides: ReactNode[];
  slidesPerView: number;
  spaceBetween: number;
};

export default function SwiperView({
  id,
  autoplay,
  centeredSlides,
  className,
  loop,
  slides,
  slidesPerView,
  spaceBetween,
}: SwiperViewProps) {
  const [swiperCommands] = useUnit([$swiperCommands]);
  const handleClearSwiperCommand = useUnit(clearSwiperCommand);

  const swiperRef = useRef<SwiperInstance | null>(null);

  useEffect(() => {
    if (!swiperRef.current || !(id in swiperCommands)) return;

    const command = swiperCommands[id];

    switch (command.type) {
      case "slide_to":
        if (loop) {
          swiperRef.current.slideToLoop(command.index);
        } else {
          swiperRef.current.slideTo(command.index);
        }
        break;
      case "slide_next":
        swiperRef.current.slideNext();
        break;
      case "slide_prev":
        swiperRef.current.slidePrev();
        break;
      default:
        break;
    }

    handleClearSwiperCommand(id);
  }, [swiperCommands, id, loop, handleClearSwiperCommand]);

  return (
    <ReactSwiper
      autoplay={autoplay}
      centeredSlides={centeredSlides}
      className={className}
      loop={loop}
      modules={autoplay ? [Autoplay] : []}
      slidesPerView={slidesPerView}
      spaceBetween={spaceBetween}
      onSwiper={(swiper) => {
        swiperRef.current = swiper;
      }}
    >
      {slides.map((slide, index) => (
        <ReactSwiperSlide key={index}>{slide}</ReactSwiperSlide>
      ))}
    </ReactSwiper>
  );
}
