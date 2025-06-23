import { Swiper, SwiperSlide } from 'swiper/react';
import { Navigation, Pagination, Scrollbar, A11y } from 'swiper/modules';
import 'swiper/css';


const slideStyle = {
    position: 'relative',
    width: '100%',
    paddingTop: '56.25%', // 16:9 aspect ratio (9/16 = 0.5625)
    overflow: 'hidden',
    borderRadius: '1.5rem',
};

const imgStyle = {
    position: 'absolute',
    top: 0,
    left: 0,
    width: '100%',
    height: '100%',
    objectFit: 'cover',
    borderRadius: '1.5rem',
};

export default function MySwiper() {
    return (
        <Swiper
            modules={[Navigation, Pagination, Scrollbar, A11y]}
            spaceBetween={15}
            slidesPerView={1}
            navigation
            pagination={{ clickable: true }}
            scrollbar={{ draggable: true }}
            loop={true}
            onSwiper={(swiper) => console.log(swiper)}
            onSlideChange={() => console.log('slide change')}
        >
            <SwiperSlide>
                <div style={slideStyle}>
                    <img src="https://piwigo.darkishlocket10.me/_data/i/upload/2025/03/01/20250301202330-2d6bec2d-la.jpg" alt="Slide 1" style={imgStyle} />
                </div>
            </SwiperSlide>
            <SwiperSlide>
                <div style={slideStyle}>
                    <img src="https://piwigo.darkishlocket10.me/_data/i/upload/2025/03/29/20250329031845-add54cca-la.jpg" alt="Slide 2" style={imgStyle} />
                </div>
            </SwiperSlide>
            <SwiperSlide>
                <div style={slideStyle}>
                    <img src="https://piwigo.darkishlocket10.me/_data/i/upload/2025/02/19/20250219181031-65d3f3e1-la.jpg" alt="Slide 3" style={imgStyle} />
                </div>
            </SwiperSlide>
            <SwiperSlide>
                <div style={slideStyle}>
                    <img src="https://piwigo.darkishlocket10.me/_data/i/upload/2025/02/18/20250218213833-079c74d3-la.jpg" alt="Slide 4" style={imgStyle} />
                </div>
            </SwiperSlide>
            <SwiperSlide>
                <div style={slideStyle}>
                    <img src="https://piwigo.darkishlocket10.me/_data/i/upload/2025/06/11/20250611191605-5bc508af-xl.jpg" alt="Slide 5" style={imgStyle} />
                </div>
            </SwiperSlide>
            <SwiperSlide>
                <div style={slideStyle}>
                    <img src="https://piwigo.darkishlocket10.me/i.php?/upload/2025/06/11/20250611184555-6c2aa0d7-la.jpg" alt="Slide 6" style={imgStyle} />
                </div>
            </SwiperSlide>
        </Swiper>
    );
}
