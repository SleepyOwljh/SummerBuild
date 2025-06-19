// 1. Mobile nav toggle
const navToggle = document.querySelector('.nav-toggle');
const nav = document.querySelector('.site-nav');
navToggle.addEventListener('click', () => {
  nav.classList.toggle('open');
});

// 2. Reveal-on-scroll for team cards
const cards = document.querySelectorAll('.team-card');
const observer = new IntersectionObserver((entries) => {
  entries.forEach(entry => {
    if (entry.isIntersecting) {
      entry.target.classList.add('visible');
      observer.unobserve(entry.target);
    }
  });
}, { threshold: 0.2 });

cards.forEach(card => observer.observe(card));