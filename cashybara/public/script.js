document.addEventListener('DOMContentLoaded', () => {
    const sections = document.querySelectorAll('section');
    const footer = document.querySelector('footer');
    const header = document.querySelector('header');
    let current = 0;

    sections[current].classList.add('visible');
    footer.classList.remove('visible');

    let scrolling = false;
    let lastScrollDirection = 0;

    window.addEventListener('wheel', (e) => {
        if (scrolling) return;
        scrolling = true;

        const direction = e.deltaY > 0 ? 1 : -1;

        if (direction > 0) {
            header.classList.add('hidden');
        } else {
            header.classList.remove('hidden');
        }

        sections[current].classList.remove('visible');

        if (e.deltaY > 0) {
            current = (current + 1) % sections.length;
        } else if (e.deltaY < 0) {
            current = (current - 1 + sections.length) % sections.length;
        }

        sections[current].classList.add('visible');

        if (current === sections.length - 1) {
            footer.classList.add('visible');
        } else {
            footer.classList.remove('visible');
        }

        setTimeout(() => {
            scrolling = false;
        }, 500);
    });
});