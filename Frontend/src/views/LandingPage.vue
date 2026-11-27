<template>
  <main class="landing">
    <header class="nav">
      <router-link class="brand" to="/" aria-label="Kadiwa Mart home">
        <span class="brand-mark">K</span>
      </router-link>
      <nav class="nav-links" aria-label="Account">
        <router-link class="link-login" to="/customer/login">Login</router-link>
        <router-link class="link-signup" to="/customer/register">Sign up</router-link>
      </nav>
    </header>

    <section class="hero" aria-label="Kadiwa Mart">
      <div class="hero-bg" aria-hidden="true">
        <div class="sky"></div>
        <div class="sun"></div>
        <div class="hills"></div>
        <div class="crops"></div>
        <div class="mist"></div>
      </div>

      <div class="hero-copy">
        <p class="brand-title">Kadiwa Mart</p>
        <h1>Fresh from local stores to your table.</h1>
        <p class="lede">
          Shop Calapan Kadiwa stores for pickup or delivery—all in one place.
        </p>
        <div class="cta-row">
          <router-link class="cta-primary" to="/customer/register">Get started</router-link>
          <router-link class="cta-ghost" to="/customer/login">Login</router-link>
        </div>
      </div>
    </section>
  </main>
</template>

<script>
export default {
  name: 'LandingPage'
}
</script>

<style scoped>
@import url('https://fonts.googleapis.com/css2?family=Fraunces:opsz,wght@9..144,650;9..144,750&family=Manrope:wght@500;600;700&display=swap');

.landing {
  --ink: #173016;
  --foam: #f4f7ee;
  --leaf: #3d7a2b;
  --leaf-deep: #2a5a1c;
  --muted: rgba(244, 247, 238, 0.86);
  min-height: 100vh;
  min-height: 100dvh;
  font-family: Manrope, 'Segoe UI', sans-serif;
  color: var(--foam);
  background: #1a2f16;
}

.nav {
  position: absolute;
  top: 0;
  left: 0;
  right: 0;
  z-index: 5;
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 22px clamp(18px, 4vw, 40px);
}

.brand {
  text-decoration: none;
}

.brand-mark {
  width: 44px;
  height: 44px;
  border-radius: 14px;
  display: grid;
  place-items: center;
  font-weight: 700;
  color: #fff;
  background: linear-gradient(145deg, #6aa84f, #2f5c1d);
  box-shadow: 0 10px 24px rgba(0, 0, 0, 0.25);
}

.nav-links {
  display: flex;
  gap: 10px;
  align-items: center;
}

.link-login,
.link-signup {
  text-decoration: none;
  font-weight: 700;
  font-size: 0.95rem;
  padding: 10px 16px;
  border-radius: 999px;
}

.link-login {
  color: var(--foam);
}

.link-signup {
  color: var(--ink);
  background: rgba(244, 247, 238, 0.94);
}

.hero {
  position: relative;
  min-height: 100vh;
  min-height: 100dvh;
  display: grid;
  align-items: end;
  overflow: hidden;
}

.hero-bg {
  position: absolute;
  inset: 0;
  z-index: 0;
}

.sky {
  position: absolute;
  inset: 0;
  background:
    radial-gradient(ellipse 70% 50% at 78% 18%, rgba(255, 210, 110, 0.55), transparent 55%),
    linear-gradient(180deg, #6f9d4f 0%, #4e7d32 42%, #355e2a 72%, #243f1c 100%);
  animation: skyDrift 14s ease-in-out infinite alternate;
}

.sun {
  position: absolute;
  top: 12%;
  right: 14%;
  width: min(22vw, 180px);
  height: min(22vw, 180px);
  border-radius: 50%;
  background: radial-gradient(circle at 35% 35%, #ffe08a, #f0b43a 58%, rgba(240, 180, 58, 0));
  animation: sunPulse 6s ease-in-out infinite;
}

.hills {
  position: absolute;
  left: -8%;
  right: -8%;
  bottom: -4%;
  height: 48%;
  background:
    radial-gradient(ellipse 55% 90% at 18% 100%, #2f5a22 0%, transparent 70%),
    radial-gradient(ellipse 60% 100% at 55% 110%, #3a6b2a 0%, transparent 72%),
    radial-gradient(ellipse 50% 90% at 88% 100%, #274d1c 0%, transparent 70%);
}

.crops {
  position: absolute;
  inset: auto 0 0 0;
  height: 28%;
  background:
    repeating-linear-gradient(
      95deg,
      rgba(124, 179, 66, 0.0) 0 10px,
      rgba(168, 208, 96, 0.18) 10px 14px,
      rgba(124, 179, 66, 0.0) 14px 24px
    );
  mask-image: linear-gradient(180deg, transparent, #000 40%);
  animation: cropSway 8s ease-in-out infinite alternate;
}

.mist {
  position: absolute;
  inset: 0;
  background: linear-gradient(180deg, rgba(20, 35, 16, 0.15) 0%, rgba(20, 35, 16, 0.55) 72%, rgba(20, 35, 16, 0.78) 100%);
}

.hero-copy {
  position: relative;
  z-index: 2;
  width: min(720px, 100%);
  padding: 0 clamp(18px, 5vw, 56px) clamp(48px, 10vh, 96px);
  animation: riseIn 0.9s cubic-bezier(0.2, 0.8, 0.2, 1) both;
}

.brand-title {
  margin: 0;
  font-family: Fraunces, Georgia, serif;
  font-weight: 750;
  font-size: clamp(3.2rem, 10vw, 6.4rem);
  line-height: 0.92;
  letter-spacing: -0.04em;
  color: #f7fbe9;
  text-shadow: 0 10px 30px rgba(0, 0, 0, 0.28);
}

.hero-copy h1 {
  margin: 18px 0 0;
  max-width: 16ch;
  font-family: Fraunces, Georgia, serif;
  font-weight: 650;
  font-size: clamp(1.35rem, 3.2vw, 2rem);
  line-height: 1.2;
  color: rgba(247, 251, 233, 0.96);
}

.lede {
  margin: 16px 0 0;
  max-width: 34ch;
  font-size: clamp(1rem, 2.2vw, 1.15rem);
  line-height: 1.55;
  color: var(--muted);
  font-weight: 500;
}

.cta-row {
  display: flex;
  flex-wrap: wrap;
  gap: 12px;
  margin-top: 28px;
}

.cta-primary,
.cta-ghost {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-height: 50px;
  padding: 0 22px;
  border-radius: 14px;
  text-decoration: none;
  font-weight: 700;
  font-size: 1rem;
}

.cta-primary {
  color: var(--ink);
  background: #f4f7ee;
  box-shadow: 0 14px 28px rgba(0, 0, 0, 0.22);
}

.cta-ghost {
  color: #f4f7ee;
  border: 1.5px solid rgba(244, 247, 238, 0.45);
  background: rgba(255, 255, 255, 0.08);
  backdrop-filter: blur(6px);
}

@keyframes skyDrift {
  from { filter: saturate(1) brightness(1); }
  to { filter: saturate(1.08) brightness(1.05); }
}

@keyframes sunPulse {
  0%, 100% { transform: scale(1); opacity: 0.9; }
  50% { transform: scale(1.06); opacity: 1; }
}

@keyframes cropSway {
  from { transform: translateX(0); }
  to { transform: translateX(18px); }
}

@keyframes riseIn {
  from { opacity: 0; transform: translateY(24px); }
  to { opacity: 1; transform: translateY(0); }
}

@media (max-width: 720px) {
  .nav {
    padding: 14px 16px;
    padding-top: calc(14px + env(safe-area-inset-top, 0px));
  }
  .brand-mark {
    width: 40px;
    height: 40px;
  }
  .hero {
    align-items: end;
    min-height: 100dvh;
  }
  .hero-copy {
    padding: 0 16px calc(28px + env(safe-area-inset-bottom, 0px));
    max-width: 100%;
  }
  .brand-title {
    font-size: clamp(2.6rem, 14vw, 3.4rem);
  }
  .hero-copy h1 {
    font-size: clamp(1.35rem, 5.5vw, 1.75rem);
    line-height: 1.25;
  }
  .lede {
    font-size: 0.95rem;
    max-width: 34ch;
  }
  .cta-row {
    flex-direction: column;
    gap: 10px;
  }
  .cta-primary,
  .cta-ghost {
    width: 100%;
    min-height: 48px;
    display: inline-flex;
    align-items: center;
    justify-content: center;
  }
  .link-login,
  .link-signup {
    min-height: 40px;
    display: inline-flex;
    align-items: center;
    padding: 0 12px;
  }
  .sun {
    top: 10%;
    right: 8%;
    width: 120px;
    height: 120px;
  }
}
</style>
